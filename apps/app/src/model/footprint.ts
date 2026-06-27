// Footprint geometry for a kitchen run — shared by the 2D plan editor
// (ConstructorPlan) and the 3D editor (VariantScene) so both read identical
// centres/axes for every module. A module's footprint honours its free plan
// transform (px/pz/rot) when present, otherwise the solver's wall-run placement.
// cx/cy are the footprint centre in ABSOLUTE room mm (same space as roomPoints).

import { polygonBoundsMm, type Pt, type Opening } from "./room";
import { planRuns, type KitchenLayout } from "./runPlan";
import type { Cabinet } from "./cabinet";

export const FOOT_DEPTH_MM: Record<Cabinet["kind"], number> = { base: 560, tall: 560, upper: 350 };
const DEG = 180 / Math.PI;

export interface Foot {
  id: string;
  appliance: Cabinet["appliance"];
  cx: number;
  cy: number;
  ux: number;
  uy: number; // width axis (unit)
  ix: number;
  iy: number; // depth axis (unit)
  w: number;
  depth: number;
  rotDeg: number;
  hbx: number; // axis-aligned half-extents (for snapping / overlap)
  hby: number;
  upper: boolean; // wall-mounted (drawn dashed, sits over the base)
}

const SIGNS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

// axis-aligned half-extents of a (possibly rotated) footprint, for snapping
export function halfExtents(ux: number, uy: number, ix: number, iy: number, w: number, depth: number) {
  const hw = w / 2;
  const hd = depth / 2;
  return {
    hbx: Math.max(...SIGNS.map(([su, si]) => Math.abs(ux * su * hw + ix * si * hd))),
    hby: Math.max(...SIGNS.map(([su, si]) => Math.abs(uy * su * hw + iy * si * hd))),
  };
}

// the four corners of an oriented footprint rectangle
export function rectCorners(cx: number, cy: number, ux: number, uy: number, ix: number, iy: number, w: number, depth: number) {
  const hw = w / 2;
  const hd = depth / 2;
  return SIGNS.map(([su, si]) => ({ x: cx + ux * su * hw + ix * si * hd, y: cy + uy * su * hw + iy * si * hd }));
}

// separating-axis test for two oriented footprints (touching shared edges don't count)
export function footsOverlap(a: Foot, b: Foot): boolean {
  const ca = rectCorners(a.cx, a.cy, a.ux, a.uy, a.ix, a.iy, a.w, a.depth);
  const cb = rectCorners(b.cx, b.cy, b.ux, b.uy, b.ix, b.iy, b.w, b.depth);
  const axes = [{ x: a.ux, y: a.uy }, { x: a.ix, y: a.iy }, { x: b.ux, y: b.uy }, { x: b.ix, y: b.iy }];
  const EPS = 12;
  for (const ax of axes) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const d = p.x * ax.x + p.y * ax.y; if (d < amin) amin = d; if (d > amax) amax = d; }
    for (const p of cb) { const d = p.x * ax.x + p.y * ax.y; if (d < bmin) bmin = d; if (d > bmax) bmax = d; }
    if (amax <= bmin + EPS || bmax <= amin + EPS) return false;
  }
  return true;
}

/** ids of modules clashing with another SAME-LAYER module (a wall unit over a base
 *  is fine). Wall clashes are handled separately (the editor pushes back from walls). */
export function objectOverlapIds(foots: Foot[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < foots.length; i++) {
    for (let j = i + 1; j < foots.length; j++) {
      if (foots[i].upper !== foots[j].upper) continue;
      if (footsOverlap(foots[i], foots[j])) {
        set.add(foots[i].id);
        set.add(foots[j].id);
      }
    }
  }
  return set;
}

/** Footprint of every cabinet (skips render-only fillers). Free transforms
 *  (px/pz/rot) win; otherwise the module is laid out left→right along its run. */
export function cabFootprints(
  cabs: Cabinet[],
  points: Pt[],
  waterWall: number | null,
  layout: KitchenLayout,
  openings: Opening[],
): Foot[] {
  const b = polygonBoundsMm(points);
  const placements = planRuns(points, waterWall, layout, openings).runs.map((r) => r.placement);
  const toMm = (mx: number, mz: number): Pt => ({ x: mx * 1000 + b.cx, y: mz * 1000 + b.cy });
  const cursor: Record<string, number> = {};
  const foot: Foot[] = [];
  for (const cab of cabs) {
    if (cab.appliance === "filler") continue;
    const upper = cab.kind === "upper";
    const depth = cab.depth ?? FOOT_DEPTH_MM[cab.kind] ?? 560;
    const key = `${cab.run ?? 0}:${cab.kind}`;
    const x0 = cab.x ?? cursor[key] ?? 0;
    cursor[key] = x0 + cab.w;
    if (cab.px != null && cab.pz != null) {
      const r = (cab.rot ?? 0) / DEG;
      const ux = Math.cos(r), uy = Math.sin(r), ix = -Math.sin(r), iy = Math.cos(r);
      foot.push({ id: cab.id, appliance: cab.appliance, cx: cab.px, cy: cab.pz, ux, uy, ix, iy, w: cab.w, depth, rotDeg: cab.rot ?? 0, upper, ...halfExtents(ux, uy, ix, iy, cab.w, depth) });
      continue;
    }
    const p = placements[cab.run ?? 0] ?? placements[0];
    if (!p) continue;
    const midS = p.startS + (x0 + cab.w / 2) / 1000;
    const dM = depth / 1000;
    const cm = toMm(p.ax + p.ux * midS + p.ix * (dM / 2), p.az + p.uz * midS + p.iz * (dM / 2));
    // capture angle so the free i-axis = the placement's inward normal (keeps the
    // facade facing the room after the module is freed, even on mirrored walls)
    foot.push({ id: cab.id, appliance: cab.appliance, cx: cm.x, cy: cm.y, ux: p.ux, uy: p.uz, ix: p.ix, iy: p.iz, w: cab.w, depth, rotDeg: Math.atan2(-p.ix, p.iz) * DEG, upper, ...halfExtents(p.ux, p.uz, p.ix, p.iz, cab.w, depth) });
  }
  return foot;
}
