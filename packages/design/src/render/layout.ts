// Phase 0.4a — layout: turn a cut-list into placed boxes for the 3D view.
//
// panelDecomposition returns a flat Part list (dimensions only) + provenance
// (role + orientation per part). It does NOT say where a panel sits — position is
// a VISUALISATION concern, not construction. This file arranges the given parts
// into 3D boxes. It computes NO construction: it never invents a thickness, a
// hole, or a placement rule; it only reads each part's own dimensions (already
// baked by the profile) and stands the boxes up in the cabinet frame.
//
// Frame (matches render-spike): width → +X, height → +Y, depth → +Z. Origin is
// the bottom-left-back corner of Face A. mm units throughout (render scales later).

import type { Part } from "@mebelchi/construction";
import type { DesignNode, PartOrientation } from "@mebelchi/construction/design";
import type { DecomposeResult } from "../core/decompose.ts";

export type Vec3 = [number, number, number];

/**
 * A part placed in the world as an axis-orientable box (render-spike's shape).
 *
 * SELECTION/UNDO must key on `nodeId` — the assigned, stable identity. `index` is
 * positional and `part.id` is derived; both change on re-decomposition, so neither
 * is safe for long-lived state. (Watcher note, Phase 0.4a.)
 */
export interface PlacedPanel {
  index: number;
  nodeId: string;
  role: string;
  origin: Vec3; // bottom-left-back corner of Face A, world mm
  u: Vec3;      // unit, +length direction
  v: Vec3;      // unit, +width direction
  n: Vec3;      // unit, Face-A outward normal
  length: number;
  width: number;
  thickness: number;
  part: Part;
}

/** A physical meaning → its world axis. This is the whole frame trick: the
 *  decomposer already told us what each part's length/width axis MEANS. */
const AXIS: Record<"width" | "height" | "depth", Vec3> = {
  width: [1, 0, 0],
  height: [0, 1, 0],
  depth: [0, 0, 1],
};

/** The axis none of (x,y) uses — the panel's thickness/normal direction. */
function normalAxis(o: PartOrientation): Vec3 {
  const used = new Set([o.xAxis, o.yAxis]);
  const left = (["width", "height", "depth"] as const).find((a) => !used.has(a))!;
  return AXIS[left];
}

/** Board thickness shared by the carcass — read from a real part, not invented. */
function carcassThickness(parts: readonly Part[]): number {
  const side = parts.find((p) => p.name.includes("бок")) ?? parts[0];
  return side ? side.thickness_mm10 : 160;
}

/**
 * Place every part of ONE cabinet node. Position by role, frame by orientation.
 * Positions are sensible-and-legible for the 3D view; exact offsets get eyeballed
 * in 0.4b. Any role we don't special-case still renders (dropped at the origin,
 * visible, never silently discarded).
 */
export function layoutCabinet(
  node: DesignNode, result: DecomposeResult, startIndex = 0,
): PlacedPanel[] {
  const W = node.size?.w_mm10 ?? 6000;
  const H = node.size?.h_mm10 ?? 7200;
  const D = node.size?.d_mm10 ?? 5600;
  // A cabinet's parts include its own (sides, bottom, door…) AND its children's:
  // a shelf/divider part carries its OWN child nodeId in provenance, not the
  // cabinet's. So gather the cabinet id plus every descendant id.
  const own = new Set<string>([node.nodeId]);
  // Also index each descendant node so a placed part can read its OWN design intent
  // (e.g. a divider's Division) back from its provenance nodeId.
  const nodeById = new Map<string, DesignNode>();
  const collect = (n: DesignNode) => { own.add(n.nodeId); nodeById.set(n.nodeId, n); n.children?.forEach(collect); };
  collect(node);
  const mine = result.parts.filter((p) => own.has(result.provenance[p.id]?.nodeId ?? ""));
  const t = carcassThickness(result.parts);

  // Shelves and dividers share their compartment; count them to spread them out.
  const shelves = mine.filter((p) => result.provenance[p.id]!.role === "shelf");
  const dividers = mine.filter((p) => result.provenance[p.id]!.role === "divider");
  let shelfSeen = 0;
  let dividerSeen = 0;

  const panels: PlacedPanel[] = [];
  let index = startIndex;

  for (const part of mine) {
    const prov = result.provenance[part.id]!;
    const role = prov.role;
    const u = AXIS[prov.orientation.xAxis];
    const v = AXIS[prov.orientation.yAxis];
    const n = normalAxis(prov.orientation);
    const L = part.length_mm10;
    const Wd = part.width_mm10;
    const Th = part.thickness_mm10;

    // origin = Face A (the panel's OUTER face); the body extends back from it by Th
    // (scene.panelMatrix: centre = origin + u·L/2 + v·W/2 − n·Th/2). So each origin is
    // placed on the outer skin of the cabinet and the board sits just inside it — that
    // is what makes the six carcass panels tile into a clean, gap-free box.
    let origin: Vec3 = [0, 0, 0];
    switch (role) {
      case "side": { // h×d, stands vertical. Left outer face at x=Th, right at x=W.
        const isFirst = panels.filter((p) => p.role === "side").length === 0;
        origin = [isFirst ? Th : W, 0, 0]; // body → [0,Th] (left) / [W−Th,W] (right)
        break;
      }
      case "bottom": // w×d, flat on the floor; body sits in y∈[0,Th]
        origin = [(W - L) / 2, Th, 0];
        break;
      case "top": // w×d, flat under the ceiling; body sits in y∈[H−Th,H]
      case "stretcher":
        origin = [(W - L) / 2, H, 0];
        break;
      case "worktop": // overhangs; sits on top, centred over the carcass
        origin = [(W - L) / 2, H, -(Wd - D) / 2];
        break;
      case "back": // w×h, vertical plane at the rear; body sits in z∈[0,Th], full height
        origin = [(W - L) / 2, 0, Th];
        break;
      case "door": // h×w, vertical plane at the front (z=D)
        origin = [0, 0, D];
        break;
      case "shelf": { // d×w, flat, spread across the inner height
        const slot = (shelfSeen + 1) / (shelves.length + 1);
        shelfSeen += 1;
        origin = [t, Math.round(H * slot), 0];
        break;
      }
      case "divider": { // h×d, vertical; positioned by the node's Division if it has one
        // The app owns position (see header): a divider node carrying a fixed Division
        // sits at that X; otherwise it's spread evenly as the placeholder default.
        // This is what makes Variant C's seam-drag visible — no engine change needed
        // to MOVE a divider (only its manufactured neighbours' widths await the engine).
        const div = nodeById.get(prov.nodeId)?.division;
        const x = div?.rule === "fixed"
          ? Math.min(Math.max(div.mm, t), W - t) // keep the seam inside the carcass
          : Math.round(W * ((dividerSeen + 1) / (dividers.length + 1)));
        dividerSeen += 1;
        origin = [x, t, 0];
        break;
      }
      case "plinth": // w×h, short strip at the floor, front; body sits in z∈[D−Th,D]
        origin = [(W - L) / 2, 0, D];
        break;
      case "filler":
        origin = [0, 0, 0];
        break;
      default:
        origin = [0, 0, 0];
    }

    // Key on the part's TRUE owner (prov.nodeId), not the cabinet: tapping a shelf
    // panel must select the shelf node, so it can be moved/removed on its own.
    panels.push({
      index: index++, nodeId: prov.nodeId, role,
      origin, u, v, n,
      length: L, width: Wd, thickness: Th, part,
    });
  }
  return panels;
}

/**
 * Lay out every cabinet in a project. Cabinets are spread along +X so a
 * multi-cabinet scene doesn't stack at one origin. Any part whose owning node is
 * not a laid-out cabinet is collected at the far side rather than silently
 * dropped — the header's promise ("never silently discarded") kept honestly.
 *
 * CONTRACT NOTE for the founder (Watcher 0.4a #3, updated Phase 3): a DIVIDER's X is
 * now honoured from its node's fixed Division — placing a divider is a visualisation
 * concern the app owns (see header), so Variant C can move a seam with no engine
 * change. What STILL awaits the engine: a SHELF's true height, and the manufactured
 * WIDTHS of the parts on either side of a moved divider (per-compartment sizing lives
 * in construction, not layout). Those need placement/anchor info in the decompose
 * result. Shelves remain evenly spread until then. Recorded in CONTRACT_NOTES.md.
 */
export function layout(nodes: readonly DesignNode[], result: DecomposeResult): PlacedPanel[] {
  const all: PlacedPanel[] = [];
  const placedNodeIds = new Set<string>();
  let xOffset = 0;

  for (const node of nodes) {
    if (node.kind !== "cabinet") continue;
    const panels = layoutCabinet(node, result, all.length);
    for (const p of panels) {
      p.origin = [p.origin[0] + xOffset, p.origin[1], p.origin[2]];
      placedNodeIds.add(p.nodeId);
    }
    all.push(...panels);
    xOffset += (node.size?.w_mm10 ?? 6000) + 1000; // 100mm gap between cabinets
  }

  // Anything the engine emitted but no laid-out cabinet claimed: park it visibly
  // at the far side so it is never invisible. Should be empty for the current
  // cabinet-root model; a loud smell if it isn't.
  const leftovers = result.parts.filter((p) => !placedNodeIds.has(result.provenance[p.id]?.nodeId ?? ""));
  leftovers.forEach((part, i) => {
    all.push({
      index: all.length, nodeId: result.provenance[part.id]?.nodeId ?? `orphan_${i}`,
      role: result.provenance[part.id]?.role ?? "orphan",
      origin: [xOffset + i * (part.length_mm10 + 200), 0, 0],
      u: AXIS.width, v: AXIS.height, n: AXIS.depth,
      length: part.length_mm10, width: part.width_mm10, thickness: part.thickness_mm10, part,
    });
  });

  return all;
}
