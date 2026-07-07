#!/usr/bin/env python3
"""
joint_extractor.py — v0 joint-decision miner for SWJ008 exports (doc 16 §1-2).

Read-only sibling of swj008_inventory.py. Input: a folder of SWJ008 XMLs belonging
to ONE project/cabinet (project identity comes from the FOLDER — the files carry
Project Name="" and panel-local coordinates only; there is no assembly placement).

Method (v0): with panel-local coordinates only, joints are matched by
SPACING-SIGNATURE CORRELATION — e.g. a pair of Ø15 face cam seats on panel A whose
spacing along the joint line equals the spacing of a pair of Ø8 edge dowel holes on
panel B -> cam_dowel candidate. This is correlation, not geometry solving;
confidence scores are honest but modest. Flags are the product on day one.

Known-pattern families (anything else goes to UNMATCHED, never guessed):
  cam_dowel, dowel, confirmat, shelf_pin, hinge_cup, slide_row, marking,
  groove_joint, rafix_20

Usage:
    python3 tools/joint_extractor.py <folder> [--out joint_decisions.json] [--project NAME]

Output: joint_decisions.json with rows
    {project, panelA, panelB, family, positions_mm10, depth_class, confidence}
plus an UNMATCHED report (every hole not assigned, grouped by hole class with
counts) and ambiguity flags. Never guesses: ambiguous -> flags, not rows.

All coordinates are mm10 integers (tenths of a millimetre).
"""
import argparse
import glob
import json
import os
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from itertools import combinations

MM10 = lambda s: round(float(s) * 10)
SPACING_TOL = 5          # 0.5mm — spacings are exact in practice; tolerance absorbs rounding
SYSTEM32_PITCH = 320     # 32mm screw-row pitch
MAX_CANDIDATE_MATES = 3  # more than this -> ambiguity flag, no rows
HINGE_SATELLITE_R = 600  # 60mm radius around a Ø35 cup


# ---------------------------------------------------------------- data model

class Hole:
    __slots__ = ("panel", "face", "facekind", "x", "y", "z", "dia", "depth", "assigned")

    def __init__(self, panel, face, x, y, z, dia, depth):
        self.panel, self.face = panel, face
        self.facekind = "face" if face in ("5", "6") else "edge"
        self.x, self.y, self.z = x, y, z
        self.dia, self.depth = dia, depth
        self.assigned = False

    def pos(self):
        return [self.x, self.y]

    def cls(self):
        return (self.facekind, self.dia, self.depth)


def classify(h: Hole) -> str:
    """Hole-class vocabulary (engine/catalogs/hole_classes.json)."""
    if h.dia == 350 and h.facekind == "face":
        return "hinge_cup"
    if h.dia == 200 and h.facekind == "face":
        return "rafix_20"
    if h.dia == 150 and h.facekind == "face":
        return "cam_seat"
    if h.dia == 80 and h.facekind == "edge" and 300 <= h.depth <= 380:
        return "edge_dowel"
    if h.dia == 80 and h.facekind == "face" and h.depth in (110, 140):
        return "bolt_seat"
    if h.dia == 70 and h.facekind == "face" and 150 <= h.depth <= 190:
        return "confirmat_bore"
    if h.dia == 50 and h.facekind == "face" and h.depth == 110:
        return "shelf_pin"
    if h.dia == 45 and h.facekind == "edge" and h.depth <= 150:
        return "screw_pilot"
    if h.dia == 45 and h.facekind == "edge":
        return "deep_pilot"
    if h.dia == 30 and h.depth <= 20:
        return "marking"
    return "other"


# ------------------------------------------------------------------- parsing

def parse_folder(folder):
    """Returns (panels: {id: dims}, holes: [Hole], grooves: [dict], notes: [str])."""
    files = sorted(
        glob.glob(os.path.join(folder, "**", "*.XML"), recursive=True)
        + glob.glob(os.path.join(folder, "**", "*.xml"), recursive=True)
    )
    if not files:
        sys.exit(f"No XML files under {folder}")
    panels, holes, grooves, notes = {}, [], [], []
    for path in files:
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError as e:
            notes.append(f"{os.path.basename(path)}: XML PARSE ERROR {e} — skipped")
            continue
        for panel in root.iter("Panel"):
            pid = panel.get("ID", "?")
            panels[pid] = {
                "length": MM10(panel.get("Length", "0")),
                "width": MM10(panel.get("Width", "0")),
                "thickness": MM10(panel.get("Thickness", "0")),
            }
            for m in panel.iter("Machining"):
                t = m.get("Type")
                if t in ("1", "2"):
                    holes.append(Hole(
                        pid, m.get("Face", "?"),
                        MM10(m.get("X", "0")), MM10(m.get("Y", "0")),
                        MM10(m.get("Z", "0")) if m.get("Z") else None,
                        MM10(m.get("Diameter", "0")), MM10(m.get("Depth", "0")),
                    ))
                elif t == "4":
                    grooves.append({
                        "panel": pid, "face": m.get("Face", "?"),
                        "x": MM10(m.get("X", "0")), "y": MM10(m.get("Y", "0")),
                        "endx": MM10(m.get("EndX", "0")), "endy": MM10(m.get("EndY", "0")),
                        "width": MM10(m.get("Width", "0")), "depth": MM10(m.get("Depth", "0")),
                    })
                elif t == "3":
                    notes.append(f"{pid}: Type 3 contour (not a joint) — ignored by extractor")
                else:
                    notes.append(f"{pid}: UNKNOWN Machining Type={t} — left to inventory tool")
    return panels, holes, grooves, notes


# ------------------------------------------------------- spacing-pair helpers

def line_pairs(holes):
    """All same-line pairs (same x -> spacing along y; same y -> spacing along x)."""
    pairs = []
    for a, b in combinations(holes, 2):
        if a.x == b.x and a.y != b.y:
            pairs.append((abs(a.y - b.y), a, b))
        elif a.y == b.y and a.x != b.x:
            pairs.append((abs(a.x - b.x), a, b))
    return pairs


def edge_along(h: Hole):
    """Coordinate along an edge face (edges 1/2 run along X, edges 3/4 along Y)."""
    return h.x if h.face in ("1", "2") else h.y


def edge_pairs(holes):
    """Same-edge pairs with spacing along that edge."""
    by_edge = defaultdict(list)
    for h in holes:
        by_edge[(h.panel, h.face)].append(h)
    pairs = []
    for group in by_edge.values():
        for a, b in combinations(group, 2):
            s = abs(edge_along(a) - edge_along(b))
            if s:
                pairs.append((s, a, b))
    return pairs


def close(a, b, tol=SPACING_TOL):
    return abs(a - b) <= tol


# ----------------------------------------------------------- piece grouping

def prefix_key(panel_id: str) -> str:
    """
    Piece-grouping key: the first 3 alphabetic characters of the panel ID,
    uppercased. A dump folder mixes several furniture pieces (SHK/TR/TU/KR in
    SP LOREN; SHKOF/TRIMO/CHESTR in prop-2) and the factory's own spelling
    drifts (CHESTR / CHEST / CHETR are one chest) — 3 letters merges the
    variants while keeping the pieces apart. Cross-piece matching is noise.
    """
    letters = []
    for ch in panel_id:
        if ch.isalpha():
            letters.append(ch.upper())
            if len(letters) == 3:
                break
        elif letters:
            break
    return "".join(letters) or "?"


# ------------------------------------------------------------------ families

def match_set(panels, holes, grooves, project, piece, rows, flags):
    """Run the family matchers over ONE piece's panels (or a whole folder when
    piece is None). Appends to rows/flags; marks matched holes assigned."""
    by_class = defaultdict(list)
    for h in holes:
        by_class[classify(h)].append(h)

    def add_row(panelA, panelB, family, positions, depth_class, confidence, evidence):
        row = {
            "project": project, "panelA": panelA, "panelB": panelB, "family": family,
            "positions_mm10": positions, "depth_class": depth_class,
            "confidence": round(confidence, 2), "evidence": evidence,
        }
        if piece is not None:
            row["piece"] = piece
        rows.append(row)

    # --- marking (positional marks, not joints) ---------------------------------
    marks = defaultdict(list)
    for h in by_class["marking"]:
        marks[h.panel].append(h)
        h.assigned = True
    for pid, hs in marks.items():
        add_row(pid, None, "marking", [h.pos() for h in hs], "1", 0.9,
                "Ø3×1mm positional marks")

    # --- shelf_pin: front/back column pairs on one panel ------------------------
    pins = defaultdict(list)
    for h in by_class["shelf_pin"]:
        pins[(h.panel, h.face, h.x)].append(h)
    for (pid, face, _x), hs in sorted(pins.items()):
        if len(hs) >= 2:  # a front + back pair (or full column) at this x
            for h in hs:
                h.assigned = True
            add_row(pid, None, "shelf_pin", [h.pos() for h in hs], "11", 0.8,
                    f"Ø5×11 column on face {face} (front/back rows)")

    # --- hinge_cup: every Ø35 with its full satellite pattern -------------------
    for cup in by_class["hinge_cup"]:
        sats = [h for h in holes
                if h is not cup and h.panel == cup.panel and h.facekind == "face"
                and abs(h.x - cup.x) <= HINGE_SATELLITE_R
                and abs(h.y - cup.y) <= HINGE_SATELLITE_R]
        cup.assigned = True
        for s in sats:
            s.assigned = True
        add_row(cup.panel, None, "hinge_cup",
                [cup.pos()] + [s.pos() for s in sats],
                str(cup.depth / 10), 0.7,
                f"Ø35 cup + {len(sats)} satellites "
                f"({', '.join(sorted(set('Ø%g×%g' % (s.dia/10, s.depth/10) for s in sats)) ) or 'none'})"
                " — doc-15 hinge ground truth, record everything")

    # --- slide_row: Ø4.5 screw rows at 32mm pitch --------------------------------
    pilot_rows = defaultdict(list)
    for h in by_class["screw_pilot"]:
        pilot_rows[(h.panel, h.face)].append(h)
    for (pid, face), hs in sorted(pilot_rows.items()):
        hs.sort(key=edge_along)
        run = [hs[0]]
        for h in hs[1:]:
            if close(edge_along(h) - edge_along(run[-1]), SYSTEM32_PITCH):
                run.append(h)
            else:
                if len(run) >= 2:
                    for r in run:
                        r.assigned = True
                    add_row(pid, None, "slide_row", [r.pos() for r in run], "10", 0.7,
                            f"Ø4.5×10 row at 32mm pitch on face {face}")
                run = [h]
        if len(run) >= 2:
            for r in run:
                r.assigned = True
            add_row(pid, None, "slide_row", [r.pos() for r in run], "10", 0.7,
                    f"Ø4.5×10 row at 32mm pitch on face {face}")

    # --- cam_dowel: spacing-signature correlation --------------------------------
    cam_pairs = line_pairs(by_class["cam_seat"])
    dowel_prs = edge_pairs(by_class["edge_dowel"])
    bolt_prs = line_pairs(by_class["bolt_seat"])

    for spacing, c1, c2 in cam_pairs:
        if c1.depth != c2.depth:
            continue  # a pair mixes depth classes -> not one connector pair
        depth_class = "%g" % (c1.depth / 10)

        # Same-panel bolt channel: edge dowel at the same along-coordinate as the cam,
        # with the cam set in from that edge by ~the cam-to-edge distance.
        channel = [
            (s, d1, d2) for (s, d1, d2) in dowel_prs
            if d1.panel == c1.panel and close(s, spacing)
            and {edge_along(d1), edge_along(d2)} == ({c1.y, c2.y} if c1.x == c2.x else {c1.x, c2.x})
        ]

        # Cross-panel mates: edge-dowel pairs or bolt-seat pairs at the same spacing.
        mates = {}
        for s, d1, d2 in dowel_prs:
            if d1.panel != c1.panel and close(s, spacing):
                mates.setdefault(d1.panel, []).append(("edge dowels Ø8×34", d1, d2))
        for s, b1, b2 in bolt_prs:
            if b1.panel != c1.panel and close(s, spacing):
                mates.setdefault(b1.panel, []).append(("face bolt seats Ø8", b1, b2))

        conf = 0.5 + (0.15 if channel else 0.0)
        if len(mates) > MAX_CANDIDATE_MATES:
            flags.append({
                "type": "AMBIGUOUS_CAM_MATE",
                "panelA": c1.panel, "spacing_mm10": spacing, "depth_class": depth_class,
                "candidates": sorted(mates),
                "note": f"{len(mates)} panels share this spacing — review, not guessed",
            })
            continue
        c1.assigned = c2.assigned = True
        for _, d1, d2 in channel:
            d1.assigned = d2.assigned = True
        if mates:
            for mate_panel, evs in sorted(mates.items()):
                for ev_name, m1, m2 in evs:
                    m1.assigned = m2.assigned = True
                add_row(c1.panel, mate_panel, "cam_dowel", [c1.pos(), c2.pos()],
                        depth_class, conf / max(1, len(mates)) + 0.2,
                        f"Ø15 cam pair spacing {spacing/10:g}mm ↔ "
                        + " + ".join(ev for ev, _, _ in evs)
                        + ("; same-panel bolt channel" if channel else ""))
        else:
            add_row(c1.panel, None, "cam_dowel", [c1.pos(), c2.pos()], depth_class, 0.3,
                    f"Ø15 cam pair spacing {spacing/10:g}mm — no mate found in project"
                    + ("; same-panel bolt channel" if channel else ""))

    # --- dowel: Ø8 edge pairs with no cam counterpart -----------------------------
    for spacing, d1, d2 in dowel_prs:
        if d1.assigned or d2.assigned:
            continue
        mates = {}
        for s, b1, b2 in bolt_prs:
            if b1.panel != d1.panel and close(s, spacing):
                mates.setdefault(b1.panel, []).append((b1, b2))
        if len(mates) > MAX_CANDIDATE_MATES:
            flags.append({
                "type": "AMBIGUOUS_DOWEL_MATE",
                "panelA": d1.panel, "spacing_mm10": spacing,
                "candidates": sorted(mates),
                "note": f"{len(mates)} panels share this spacing — review, not guessed",
            })
            continue
        d1.assigned = d2.assigned = True
        if mates:
            for mate_panel, evs in sorted(mates.items()):
                for b1, b2 in evs:
                    b1.assigned = b2.assigned = True
                add_row(d1.panel, mate_panel, "dowel", [d1.pos(), d2.pos()], "34",
                        0.4 + 0.2 / len(mates),
                        f"Ø8×34 edge pair spacing {spacing/10:g}mm ↔ face seats (no cam)")
        else:
            add_row(d1.panel, None, "dowel", [d1.pos(), d2.pos()], "34", 0.3,
                    f"Ø8×34 edge pair spacing {spacing/10:g}mm — no mate found")

    # --- confirmat: Ø7 face bores + Ø4.5 edge pilot alignment ---------------------
    conf_pairs = line_pairs(by_class["confirmat_bore"])
    pilot_prs = edge_pairs(by_class["deep_pilot"] + [h for h in by_class["screw_pilot"] if not h.assigned])
    for spacing, f1, f2 in conf_pairs:
        if f1.assigned or f2.assigned:
            continue
        mates = {}
        for s, p1, p2 in pilot_prs:
            if p1.panel != f1.panel and close(s, spacing):
                mates.setdefault(p1.panel, []).append((p1, p2))
        f1.assigned = f2.assigned = True
        if mates:
            for mate_panel, evs in sorted(mates.items()):
                for p1, p2 in evs:
                    p1.assigned = p2.assigned = True
                add_row(f1.panel, mate_panel, "confirmat", [f1.pos(), f2.pos()],
                        "%g" % (f1.depth / 10), 0.5 + 0.2 / len(mates),
                        f"Ø7 face bores spacing {spacing/10:g}mm ↔ Ø4.5 edge pilots")
        else:
            add_row(f1.panel, None, "confirmat", [f1.pos(), f2.pos()],
                    "%g" % (f1.depth / 10), 0.3,
                    f"Ø7 face bores spacing {spacing/10:g}mm — no pilot mate found")

    # --- rafix_20 ------------------------------------------------------------------
    for h in by_class["rafix_20"]:
        h.assigned = True
        add_row(h.panel, None, "rafix_20", [h.pos()], "%g" % (h.depth / 10), 0.5,
                "Ø20 face seat (first sighting — none seen before)")

    # --- groove_joint: Type 4 grooves as back-panel joints --------------------------
    for g in grooves:
        matching = sorted(pid for pid, d in panels.items()
                          if pid != g["panel"] and d["thickness"] == g["width"])
        add_row(g["panel"], matching[0] if len(matching) == 1 else None, "groove_joint",
                [[g["x"], g["y"]], [g["endx"], g["endy"]]],
                "%g" % (g["depth"] / 10), 0.6 if len(matching) == 1 else 0.4,
                f"saw groove {g['width']/10:g}mm wide; thickness-matching panels: "
                + (", ".join(matching) or "none in project (back panel likely not exported)"))


def extract(folder, project, group_by_prefix=False):
    panels, holes, grooves, notes = parse_folder(folder)
    rows, flags = [], []

    if group_by_prefix:
        pieces = defaultdict(lambda: {"panels": {}, "holes": [], "grooves": []})
        for pid, dims in panels.items():
            pieces[prefix_key(pid)]["panels"][pid] = dims
        for h in holes:
            pieces[prefix_key(h.panel)]["holes"].append(h)
        for g in grooves:
            pieces[prefix_key(g["panel"])]["grooves"].append(g)
        for key in sorted(pieces):
            p = pieces[key]
            match_set(p["panels"], p["holes"], p["grooves"], project, key, rows, flags)
    else:
        match_set(panels, holes, grooves, project, None, rows, flags)

    # --- UNMATCHED: every hole not assigned, grouped by class with counts -----------
    unmatched = defaultdict(lambda: {"count": 0, "panels": set()})
    for h in holes:
        if not h.assigned:
            label = classify(h)
            key = (label, h.facekind, h.dia, h.depth)
            unmatched[key]["count"] += 1
            unmatched[key]["panels"].add(h.panel)
    unmatched_report = [
        {"class": k[0], "kind": k[1], "diameter_mm": k[2] / 10, "depth_mm": k[3] / 10,
         "count": v["count"], "panels": sorted(v["panels"])}
        for k, v in sorted(unmatched.items(), key=lambda kv: -kv[1]["count"])
    ]

    return {
        "project": project,
        "rows": rows,
        "flags": flags,
        "unmatched": unmatched_report,
        "notes": notes,
        "stats": {
            "panels": len(panels),
            "holes": len(holes),
            "holes_assigned": sum(1 for h in holes if h.assigned),
            "grooves": len(grooves),
            "rows": len(rows),
            "flags": len(flags),
        },
    }


def report(result):
    s = result["stats"]
    print(f"[{result['project']}] {s['panels']} panels, {s['holes']} holes "
          f"({s['holes_assigned']} assigned), {s['grooves']} grooves -> "
          f"{s['rows']} rows, {s['flags']} flags")
    fam = defaultdict(int)
    for r in result["rows"]:
        fam[r["family"]] += 1
    print("  families: " + ", ".join(f"{k}×{v}" for k, v in sorted(fam.items())))
    confs = sorted(r["confidence"] for r in result["rows"])
    if confs:
        print(f"  confidence: min {confs[0]}, median {confs[len(confs)//2]}, max {confs[-1]}")
    if result["unmatched"]:
        print("  UNMATCHED holes by class:")
        for u in result["unmatched"]:
            print(f"    {u['class']:15} {u['kind']:4} Ø{u['diameter_mm']:g}×{u['depth_mm']:g}mm "
                  f"×{u['count']} in {len(u['panels'])} panels")
    if result["flags"]:
        print(f"  !! {len(result['flags'])} ambiguity flags — review them, they are the product")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("folders", nargs="+", help="folder(s); each folder = one project")
    ap.add_argument("--out", default="joint_decisions.json")
    ap.add_argument("--project", default=None,
                    help="project name (single folder only; default: folder name)")
    ap.add_argument("--group-by-prefix", action="store_true",
                    help="group panels into pieces by name prefix (SHK/TR/TU/KR...) "
                         "before matching; cross-piece matching is suppressed")
    args = ap.parse_args()

    results = []
    for folder in args.folders:
        project = (args.project if args.project and len(args.folders) == 1
                   else os.path.basename(os.path.normpath(folder)))
        results.append(extract(folder, project, group_by_prefix=args.group_by_prefix))

    if len(results) == 1:
        payload = results[0]  # back-compat single-project shape
    else:
        payload = {
            "version": "v0",
            "grouping": "prefix3" if args.group_by_prefix else "none",
            "projects": results,
            "totals": {
                "projects": len(results),
                "panels": sum(r["stats"]["panels"] for r in results),
                "holes": sum(r["stats"]["holes"] for r in results),
                "holes_assigned": sum(r["stats"]["holes_assigned"] for r in results),
                "rows": sum(r["stats"]["rows"] for r in results),
                "flags": sum(r["stats"]["flags"] for r in results),
            },
        }

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    for r in results:
        report(r)
    if len(results) > 1:
        t = payload["totals"]
        print(f"\nDATASET: {t['projects']} projects, {t['panels']} panels, "
              f"{t['holes']} holes ({t['holes_assigned']} assigned), "
              f"{t['rows']} rows, {t['flags']} flags -> {args.out}")


if __name__ == "__main__":
    main()
