// three/blockDrawing.ts — 2D orthographic drawing views of a karkas block (imos "Drawing Views":
// Plan / Front / Section A-A). PURE + framework-free: turns a solveLayout() PanelPlacement[] into
// projected rectangles in millimetres for three standard views. The SVG renderer (drawingSvg.ts)
// consumes what this produces; nothing here touches three or the DOM.
//
// Views (standard drafting — each shows what's relevant, no view double-draws the tilt):
//   • FRONT (elevation, looking along −Z): project to the X–Y plane → the face layout.
//   • PLAN  (top, looking down −Y):        project to the X–Z plane → the footprint / depth.
//   • SIDE  (Section A-A, looking along −X): project to the Z–Y plane → the interior profile; a
//     tilted shelf (rotX_deg) shows its incline HERE, and a front lip stands at the front edge.
// All millimetre, Y-up. The renderer flips Y for screen space.

import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { blockHoles } from "./blockHoles.js";

/** A projected panel in a view: min-corner + size (mm), optional tilt (deg, side view only). `kind`
 *  drives line weight / hatch in the renderer. */
export interface DrawRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** incline about the view's horizontal axis (side view only); pivots the FRONT-TOP edge like 3D. */
  readonly rotDeg?: number;
  readonly kind: "carcass" | "shelf" | "divider" | "facade" | "drawer" | "lip" | "other";
}

/** A projected drill hole in a view: centre + radius (mm, view-local). */
export interface DrawHole {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** One orthographic view: its rects + drill holes + the view's own bounds (mm). */
export interface DrawView {
  readonly title: string;
  readonly rects: readonly DrawRect[];
  readonly holes: readonly DrawHole[];
  readonly w: number; // view extent along its horizontal axis (mm)
  readonly h: number; // view extent along its vertical axis (mm)
}

export interface BlockDrawing {
  readonly front: DrawView;
  readonly plan: DrawView;
  readonly side: DrawView;
  /** overall block size (mm) for the title block / dimension strings. */
  readonly overall: { readonly w: number; readonly h: number; readonly d: number };
  /** Y grid lines (mm, 0..H, ascending) for the height dimension chain: floor, each shelf, ceiling. */
  readonly heights: readonly number[];
  /** X grid lines (mm, 0..W, ascending) for the width dimension chain: left, each divider, right. */
  readonly widths: readonly number[];
}

const MM = (mm10: number): number => mm10 / 10; // mm10 (tenths) → mm

/** Classify a placement by its id/name so the renderer can weight / hatch it. */
function kindOf(p: PanelPlacement): DrawRect["kind"] {
  const id = p.id;
  if (id.endsWith("__lip")) return "lip";
  if (/__(side_l|side_r|top|bottom|back)$/.test(id)) return "carcass";
  if (id.includes("__div") || id.includes("divider")) return "divider";
  if (id.includes("__front") || id.includes("__side_l") || id.includes("__side_r") || id.includes("__back") || id.includes("__bottom")) return "drawer";
  if (id.includes("__inst_")) return "shelf"; // a plain shelf instance
  return "other";
}

/**
 * Build the three orthographic views from a solved layout. Recentres each view to its own min-corner
 * so the renderer can place it in a frame. A tilted shelf carries its `rotX_deg` into the SIDE view
 * only (that's the plane the tilt lives in); FRONT/PLAN draw it axis-aligned (standard drafting).
 */
export function buildBlockDrawing(placements: readonly PanelPlacement[], parts: readonly Part[] = []): BlockDrawing {
  if (placements.length === 0) {
    const empty = { title: "", rects: [], holes: [], w: 0, h: 0 };
    return { front: { ...empty, title: "OLDINDAN" }, plan: { ...empty, title: "USTDAN" }, side: { ...empty, title: "KESIM A-A" }, overall: { w: 0, h: 0, d: 0 }, heights: [], widths: [] };
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of placements) {
    minX = Math.min(minX, MM(p.x_mm10)); maxX = Math.max(maxX, MM(p.x_mm10 + p.w_mm10));
    minY = Math.min(minY, MM(p.y_mm10)); maxY = Math.max(maxY, MM(p.y_mm10 + p.h_mm10));
    minZ = Math.min(minZ, MM(p.z_mm10)); maxZ = Math.max(maxZ, MM(p.z_mm10 + p.d_mm10));
  }
  const W = maxX - minX, H = maxY - minY, D = maxZ - minZ;

  const front: DrawRect[] = placements.map((p) => ({
    id: p.id, kind: kindOf(p),
    x: MM(p.x_mm10) - minX, y: MM(p.y_mm10) - minY, w: MM(p.w_mm10), h: MM(p.h_mm10),
  }));
  const plan: DrawRect[] = placements.map((p) => ({
    id: p.id, kind: kindOf(p),
    x: MM(p.x_mm10) - minX, y: MM(p.z_mm10) - minZ, w: MM(p.w_mm10), h: MM(p.d_mm10),
  }));
  const side: DrawRect[] = placements.map((p) => ({
    id: p.id, kind: kindOf(p),
    x: MM(p.z_mm10) - minZ, y: MM(p.y_mm10) - minY, w: MM(p.d_mm10), h: MM(p.h_mm10),
    ...(p.rotX_deg ? { rotDeg: p.rotX_deg } : {}),
  }));

  // Dimension grids: the floor/ceiling + each internal shelf (height chain) and left/right + each
  // divider (width chain). Centre-of-panel positions, deduped to the mm so near-equal lines merge.
  const uniqSorted = (a: number[]): number[] => {
    a.sort((x, y) => x - y);
    const r: number[] = [];
    // merge grid lines within 12mm — near-coincident shelf/divider lines are drawing noise, not real
    // compartments, and a chain of tiny 8mm gaps is unreadable.
    for (const v of a) if (r.length === 0 || v - r[r.length - 1]! > 12) r.push(Math.round(v));
    return r;
  };
  const shelfYs: number[] = [];
  const dividerXs: number[] = [];
  for (const p of placements) {
    const k = kindOf(p);
    if (k === "shelf") shelfYs.push(MM(p.y_mm10) - minY + MM(p.h_mm10) / 2);
    if (k === "divider") dividerXs.push(MM(p.x_mm10) - minX + MM(p.w_mm10) / 2);
  }

  // Drill holes → the view that looks along their normal (front = normal Z, plan = normal Y, section
  // = normal X), recentred to each view's min-corner (mm).
  const holes = blockHoles(parts, placements);
  const frontHoles: DrawHole[] = [], planHoles: DrawHole[] = [], sideHoles: DrawHole[] = [];
  for (const h of holes) {
    if (h.normal === "z") frontHoles.push({ x: h.x - minX, y: h.y - minY, r: h.r });
    else if (h.normal === "y") planHoles.push({ x: h.x - minX, y: h.z - minZ, r: h.r });
    else sideHoles.push({ x: h.z - minZ, y: h.y - minY, r: h.r });
  }

  return {
    front: { title: "OLDINDAN", rects: front, holes: frontHoles, w: W, h: H },
    plan: { title: "USTDAN", rects: plan, holes: planHoles, w: W, h: D },
    side: { title: "KESIM A-A", rects: side, holes: sideHoles, w: D, h: H },
    overall: { w: Math.round(W), h: Math.round(H), d: Math.round(D) },
    heights: uniqSorted([0, ...shelfYs, H]),
    widths: uniqSorted([0, ...dividerXs, W]),
  };
}
