#!/usr/bin/env python3
"""
swj008_inventory.py — batch analyzer for factory SWJ008 XML exports.

Purpose (doc 16 §2 Source A): turn a folder of Bazis SWJ008 exports into
the raw joint-decision dataset. Run it on hundreds of files at once.

Usage:
    python3 tools/swj008_inventory.py <folder-with-xmls> [out-prefix]

Outputs (next to out-prefix, default ./mined):
    mined_panels.csv        one row per panel (dims, edge banding, op counts)
    mined_operations.csv    one row per machining operation (the full dataset)
    mined_holeclasses.csv   aggregate: every (type, face-kind, Ø, depth) class,
                            its count, and which panels use it
    mined_report.txt        human summary + UNKNOWN-feature flags

Read-only. Never writes into the engine. Handles machining Types 1 (edge
drill), 2 (face drill), 3 (contour mill), 4 (saw groove); flags anything else.
"""
import sys, os, csv, glob, re
import xml.etree.ElementTree as ET
from collections import defaultdict

def facekind(face: str) -> str:
    return "face" if face in ("5", "6") else "edge"

def parse_file(path, panels, ops, unknowns):
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        unknowns.append(f"{os.path.basename(path)}: XML PARSE ERROR {e}")
        return
    root = tree.getroot()
    for proj in root.iter("Project"):
        flag = proj.get("Flag", "")
        if flag != "SWJ008":
            unknowns.append(f"{os.path.basename(path)}: unexpected Flag={flag!r}")
        for panel in proj.iter("Panel"):
            pid = panel.get("ID", "?")
            rec = {
                "file": os.path.basename(path),
                "panel": pid,
                "length": panel.get("Length"),
                "width": panel.get("Width"),
                "thickness": panel.get("Thickness"),
                "grain": panel.get("Grain"),
                "edges": "/".join(
                    e.get("Thickness", "?").rstrip("0").rstrip(".") or "0"
                    for e in panel.iter("Edge")),
                "n_type1": 0, "n_type2": 0, "n_type3": 0, "n_type4": 0, "n_other": 0,
            }
            for m in panel.iter("Machining"):
                t = m.get("Type", "?")
                key = "n_type%s" % t if t in "1234" else "n_other"
                rec[key] += 1
                if t not in "1234":
                    unknowns.append(f"{os.path.basename(path)} {pid}: UNKNOWN Machining Type={t}")
                op = {
                    "file": rec["file"], "panel": pid,
                    "panel_len": rec["length"], "panel_wid": rec["width"],
                    "type": t, "face": m.get("Face"), "facekind": facekind(m.get("Face", "")),
                    "x": m.get("X"), "y": m.get("Y"), "z": m.get("Z", ""),
                    "endx": m.get("EndX", ""), "endy": m.get("EndY", ""),
                    "diameter": m.get("Diameter", ""), "depth": m.get("Depth", ""),
                    "groove_width": m.get("Width", ""),
                    "tool_offset": m.get("ToolOffset", ""),
                    "n_contour_lines": len(list(m.iter("Line"))) if t == "3" else "",
                }
                ops.append(op)
            panels.append(rec)

def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    prefix = sys.argv[2] if len(sys.argv) > 2 else "mined"
    files = sorted(glob.glob(os.path.join(folder, "**", "*.XML"), recursive=True)
                   + glob.glob(os.path.join(folder, "**", "*.xml"), recursive=True))
    if not files:
        sys.exit(f"No XML files under {folder}")
    panels, ops, unknowns = [], [], []
    for f in files:
        parse_file(f, panels, ops, unknowns)

    # hole classes: drilling ops only (types 1,2)
    classes = defaultdict(lambda: {"count": 0, "panels": set(), "zs": set()})
    for o in ops:
        if o["type"] in ("1", "2"):
            k = (o["type"], o["facekind"], o["diameter"], o["depth"])
            c = classes[k]
            c["count"] += 1
            c["panels"].add(f'{o["file"]}:{o["panel"]}')
            if o["z"]: c["zs"].add(o["z"])

    with open(prefix + "_panels.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(panels[0].keys())); w.writeheader(); w.writerows(panels)
    with open(prefix + "_operations.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(ops[0].keys())); w.writeheader(); w.writerows(ops)
    with open(prefix + "_holeclasses.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["drill_kind", "facekind", "diameter_mm", "depth_mm", "count", "n_panels", "z_values", "example_panels"])
        for (t, fk, dia, dep), c in sorted(classes.items(), key=lambda kv: -kv[1]["count"]):
            kind = "edge-drill" if t == "1" else "face-drill"
            w.writerow([kind, fk, dia, dep, c["count"], len(c["panels"]),
                        ";".join(sorted(c["zs"])), ";".join(sorted(c["panels"])[:3])])

    with open(prefix + "_report.txt", "w") as fh:
        fh.write(f"Files: {len(files)}   Panels: {len(panels)}   Operations: {len(ops)}\n\n")
        fh.write("Hole classes (the constructor's vocabulary):\n")
        for (t, fk, dia, dep), c in sorted(classes.items(), key=lambda kv: -kv[1]["count"]):
            kind = "edge" if t == "1" else "face"
            fh.write(f'  Ø{dia} × {dep}mm  {kind:4}  ×{c["count"]:5}  in {len(c["panels"])} panels\n')
        n3 = sum(p["n_type3"] for p in panels); n4 = sum(p["n_type4"] for p in panels)
        fh.write(f"\nContour mills (Type 3): {n3}   Saw grooves (Type 4): {n4}\n")
        if unknowns:
            fh.write("\n!! FLAGS (must review — never guess):\n")
            for u in sorted(set(unknowns)): fh.write("  " + u + "\n")
        else:
            fh.write("\nNo unknown features. All machining within Types 1–4.\n")
    print(f"OK: {len(files)} files, {len(panels)} panels, {len(ops)} ops, "
          f"{len(classes)} hole classes -> {prefix}_*.csv, {prefix}_report.txt")
    if unknowns:
        print(f"!! {len(set(unknowns))} flags — read {prefix}_report.txt")

if __name__ == "__main__":
    main()
