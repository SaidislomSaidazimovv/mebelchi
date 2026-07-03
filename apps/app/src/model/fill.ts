// "Fill empty space" — after a module is deleted/duplicated (the run isn't
// re-flowed), gaps and overlaps appear in a row. This grows the SELECTED module to
// swallow the empty space beside it, stopping at the NEAREST neighbour on each side
// (and never expanding into/over an overlapping module). Pure: the caller supplies
// the run's usable length so this stays free of the run-planning geometry.

import type { Cabinet } from "./cabinet";

// base + tall share the floor row; uppers are their own row
const lane = (c: Cabinet) => (c.kind === "upper" ? "upper" : "floor");

/** A module is in a tiled row only if it has a run-local `x` and hasn't been freed
 *  into a plan transform (px/pz). Fillers never count. */
const inRow = (c: Cabinet) => c.x != null && c.px == null && c.appliance !== "filler";

const rowMates = (cabs: Cabinet[], ref: Cabinet) =>
  cabs.filter((c) => (c.run ?? 0) === (ref.run ?? 0) && lane(c) === lane(ref) && inRow(c));

const TOL = 4;

/** The grown `{ x, w }` for `cab` if it can fill empty space beside it in its row,
 *  else null. Bounds are the NEAREST neighbour on each side (or the run ends); an
 *  OVERLAPPING module blocks growth on its side, so fill never spans over a module. */
export function fillGapSpan(cabs: Cabinet[], cab: Cabinet, runLen: number): { x: number; w: number } | null {
  if (!inRow(cab)) return null;
  const x0 = cab.x as number;
  const x1 = x0 + cab.w;
  let left = 0; // run start
  let right = Number.isFinite(runLen) ? Math.max(runLen, x1) : x1; // run end
  for (const c of rowMates(cabs, cab)) {
    if (c.id === cab.id) continue;
    const cx0 = c.x as number;
    const cx1 = cx0 + c.w;
    if (cx1 <= x0 + TOL) {
      if (cx1 > left) left = cx1; // sibling fully on our left → can't grow past its right edge
    } else if (cx0 >= x1 - TOL) {
      if (cx0 < right) right = cx0; // sibling fully on our right → can't grow past its left edge
    } else {
      // sibling OVERLAPS us — block growth on whichever side it intrudes from
      if (cx0 < x0) left = Math.max(left, x0);
      if (cx1 > x1) right = Math.min(right, x1);
    }
  }
  if (right - left <= cab.w + TOL) return null; // already snug — nothing to fill
  return { x: Math.round(left), w: Math.round(right - left) };
}

/** Where to drop a duplicate of width `w` in `ref`'s row: the first gap big enough
 *  to hold it (so duplicating fills empty space directly), else the end of the row. */
export function parkX(cabs: Cabinet[], ref: Cabinet, w: number): number {
  const mates = rowMates(cabs, ref).sort((a, b) => (a.x as number) - (b.x as number));
  let cursor = 0;
  for (const c of mates) {
    const cx0 = c.x as number;
    if (cx0 - cursor >= w - TOL) break; // a gap before this module fits the copy
    cursor = Math.max(cursor, cx0 + c.w);
  }
  return Math.round(cursor);
}

/** The right edge (mm) of the last tiled module in `run`'s lane (upper vs floor), or 0
 *  when the lane is empty. Used to DOCK a new module in the empty tail of a wall when no
 *  interior gap fits it — so a wall cabinet stays wall-attached instead of floating over
 *  other modules. Ignores free-floated (px) and filler modules, matching firstFitX. */
export function rowEndX(cabs: Cabinet[], run: number, isUpper: boolean): number {
  let end = 0;
  for (const c of cabs) {
    if ((c.run ?? 0) !== run || (c.kind === "upper") !== isUpper) continue;
    if (c.x == null || c.px != null || c.appliance === "filler") continue;
    end = Math.max(end, (c.x as number) + c.w);
  }
  return Math.round(end);
}

/** The left edge for a NEW module of width `w` on wall `run` (lane = upper vs floor),
 *  scanning left→right for the first gap (or the run end) that fits within `runLen`.
 *  Returns null when the run is full — the caller then drops it free-floating. */
export function firstFitX(cabs: Cabinet[], run: number, isUpper: boolean, runLen: number, w: number): number | null {
  const mates = cabs
    .filter((c) => (c.run ?? 0) === run && (c.kind === "upper") === isUpper && c.x != null && c.px == null && c.appliance !== "filler")
    .sort((a, b) => (a.x as number) - (b.x as number));
  let cursor = 0;
  for (const c of mates) {
    const cx0 = c.x as number;
    if (cx0 - cursor >= w - TOL) break; // a gap before this module fits the new one
    cursor = Math.max(cursor, cx0 + c.w);
  }
  return cursor + w <= runLen + TOL ? Math.round(cursor) : null;
}
