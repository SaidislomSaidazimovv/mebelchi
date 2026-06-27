// Run planning — picks which wall(s)/runs the kitchen sits on for each layout and
// turns them into metre-space placements for the 3D builder. Single source of
// truth (`planRuns`) so the solver (run lengths) and the renderer (placements)
// always agree. Pure: geometry only.
//
// Layouts (kitchen-design guides):
//   i          one wall (water/longest, door-avoiding)
//   galley     two parallel walls (work wall + opposite), aisle between
//   l          two adjacent walls incl. the water wall, blind corner
//   u          three connected walls; sink/hob/fridge spread across the legs
//   peninsula  one wall + a free-standing leg jutting into the room
// Plus an optional ISLAND run for large rooms (filled by some variants).

import { polygonBoundsMm, offsetPolygon, type Pt, type Opening } from "./room";

export type KitchenLayout = "i" | "galley" | "l" | "u" | "peninsula";

export interface Placement {
  ax: number;
  az: number;
  ux: number;
  uz: number; // unit direction A→B
  ix: number;
  iz: number; // inward normal (room side / facing direction)
  startS: number; // metres along the run where modules begin
  lenM: number;
}

export interface RunOpening {
  a: number;
  b: number;
  kind: "door" | "window";
}

export interface PlannedRun {
  kind: "wall" | "peninsula" | "island";
  wall: number; // -1 for synthetic runs
  len: number; // usable length (mm)
  cornerStart: boolean;
  cornerEnd: boolean;
  openings: RunOpening[];
  placement: Placement;
}

export const CORNER_MM = 560;
const AISLE_MM = 1100;
const BASE_DEPTH_MM = 560;
const ISLAND_DEPTH_MM = 600;
const FAR_CLEAR_MM = 450;
const DOOR_PEN = 1e7;

function vlen(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function innerLen(inner: Pt[], w: number): number {
  return vlen(inner[w], inner[(w + 1) % inner.length]);
}
function doorCount(openings: Opening[], w: number): number {
  return openings.filter((o) => o.wall === w && o.kind !== "window").length;
}

interface Geo {
  innerM: { x: number; z: number }[];
  ctr: { x: number; z: number };
}
function geo(points: Pt[]): Geo {
  const b = polygonBoundsMm(points);
  const toM = (p: Pt) => ({ x: (p.x - b.cx) / 1000, z: (p.y - b.cy) / 1000 });
  const innerM = offsetPolygon(points, 100).map(toM);
  const ctr = { x: innerM.reduce((s, p) => s + p.x, 0) / innerM.length, z: innerM.reduce((s, p) => s + p.z, 0) / innerM.length };
  return { innerM, ctr };
}

/** A wall run's placement (metres), with `startS` clearing a corner at A if asked. */
function wallPlacement(g: Geo, w: number, cornerStart: boolean): Placement {
  const n = g.innerM.length;
  const A = g.innerM[w];
  const B = g.innerM[(w + 1) % n];
  let ux = B.x - A.x;
  let uz = B.z - A.z;
  const lenM = Math.hypot(ux, uz) || 1;
  ux /= lenM;
  uz /= lenM;
  let ix = -uz;
  let iz = ux;
  const mx = (A.x + B.x) / 2;
  const mz = (A.z + B.z) / 2;
  if ((g.ctr.x - mx) * ix + (g.ctr.z - mz) * iz < 0) {
    ix = -ix;
    iz = -iz;
  }
  return { ax: A.x, az: A.z, ux, uz, ix, iz, startS: cornerStart ? CORNER_MM / 1000 : 0, lenM };
}

/** Openings on wall `w`, projected into the run's local coords (mm). */
function projectOpenings(inner: Pt[], w: number, startOff: number, usable: number, openings: Opening[]): RunOpening[] {
  const wallLen = innerLen(inner, w);
  const out: RunOpening[] = [];
  for (const o of openings) {
    if (o.wall !== w) continue;
    const center = o.t * wallLen;
    const half = o.width / 2;
    const a = Math.max(0, center - half - startOff);
    const b = Math.min(usable, center + half - startOff);
    if (b - a > 1) out.push({ a, b, kind: o.kind === "window" ? "window" : "door" });
  }
  return out;
}

interface WallRun {
  wall: number;
  cornerStart: boolean;
  cornerEnd: boolean;
}

/** Pick the wall runs for a layout + which run holds the sink (water). */
function pickWalls(points: Pt[], waterWall: number | null, layout: KitchenLayout, openings: Opening[]): { walls: WallRun[]; waterRun: number } {
  const n = points.length;
  const inner = offsetPolygon(points, 100);
  const len = (w: number) => innerLen(inner, w);
  const score = (w: number) => len(w) - DOOR_PEN * doorCount(openings, w);
  const valid = waterWall != null && waterWall >= 0 && waterWall < n;
  const bestWall = () => {
    let best = 0;
    let bs = -Infinity;
    for (let w = 0; w < n; w++) if (score(w) > bs) (bs = score(w)), (best = w);
    return best;
  };

  if (layout === "l" && n >= 4) {
    const pairScore = (a: number, b: number) => score(a) + score(b);
    let best: { walls: WallRun[]; waterRun: number } | null = null;
    let bestScore = -Infinity;
    const consider = (a: number, b: number, waterRun: number) => {
      const sc = pairScore(a, b);
      if (sc > bestScore) {
        bestScore = sc;
        best = { walls: [{ wall: a, cornerStart: false, cornerEnd: true }, { wall: b, cornerStart: true, cornerEnd: false }], waterRun };
      }
    };
    if (valid) {
      consider(waterWall!, (waterWall! + 1) % n, 0);
      consider((waterWall! - 1 + n) % n, waterWall!, 1);
    } else for (let w = 0; w < n; w++) consider(w, (w + 1) % n, 0);
    return best!;
  }

  if (layout === "galley" && n === 4) {
    const primary = valid ? waterWall! : bestWall();
    const opposite = (primary + 2) % 4;
    return { walls: [{ wall: primary, cornerStart: false, cornerEnd: false }, { wall: opposite, cornerStart: false, cornerEnd: false }], waterRun: 0 };
  }

  if (layout === "u" && n === 4) {
    // open the U toward the door (exclude the door wall), else the shortest wall
    let excluded = -1;
    let md = 0;
    for (let w = 0; w < 4; w++) {
      const d = doorCount(openings, w);
      if (d > md) (md = d), (excluded = w);
    }
    if (excluded < 0) {
      let sl = Infinity;
      for (let w = 0; w < 4; w++) if (len(w) < sl) (sl = len(w)), (excluded = w);
    }
    const a = (excluded + 1) % 4;
    const m = (excluded + 2) % 4;
    const b = (excluded + 3) % 4;
    const walls: WallRun[] = [
      { wall: a, cornerStart: false, cornerEnd: true }, // left arm, corner at B
      { wall: m, cornerStart: false, cornerEnd: false }, // middle owns both corners
      { wall: b, cornerStart: true, cornerEnd: false }, // right arm, corner at A
    ];
    const waterRun = valid ? walls.findIndex((r) => r.wall === waterWall) : 1;
    return { walls, waterRun: waterRun >= 0 ? waterRun : 1 };
  }

  // i + peninsula: a single wall run
  const primary = valid ? waterWall! : bestWall();
  return { walls: [{ wall: primary, cornerStart: false, cornerEnd: false }], waterRun: 0 };
}

/** Max room depth perpendicular to a placement's wall (metres). */
function depthFrom(g: Geo, p: Placement): number {
  let d = 0;
  for (const q of g.innerM) {
    const dd = (q.x - p.ax) * p.ix + (q.z - p.az) * p.iz;
    if (dd > d) d = dd;
  }
  return d;
}

function islandPlacement(g: Geo, p0: Placement): { fits: boolean; lenM: number; placement: Placement } {
  const need = (BASE_DEPTH_MM + AISLE_MM + ISLAND_DEPTH_MM + FAR_CLEAR_MM) / 1000;
  const lenM = Math.min(p0.lenM * 0.6, 2.4);
  if (depthFrom(g, p0) < need || lenM < 1.2) return { fits: false, lenM: 0, placement: p0 };
  const off = (BASE_DEPTH_MM + AISLE_MM) / 1000; // island BACK line (modules extend inward)
  const cx = p0.ax + p0.ux * (p0.lenM / 2) + p0.ix * off;
  const cz = p0.az + p0.uz * (p0.lenM / 2) + p0.iz * off;
  return { fits: true, lenM, placement: { ax: cx - p0.ux * (lenM / 2), az: cz - p0.uz * (lenM / 2), ux: p0.ux, uz: p0.uz, ix: p0.ix, iz: p0.iz, startS: 0, lenM } };
}

/** Peninsula leg: perpendicular to the wall, attached at the wall run's far (B) end. */
function peninsulaPlacement(g: Geo, p0: Placement): { fits: boolean; lenM: number; placement: Placement } {
  const depth = depthFrom(g, p0);
  // leg starts at the base-run FRONT, so subtract base depth too
  const lenM = Math.min(depth - (BASE_DEPTH_MM + FAR_CLEAR_MM) / 1000, 2.4);
  if (lenM < 1.2) return { fits: false, lenM: 0, placement: p0 };
  // start at the far end of the wall run, at the front face of the base run
  const ex = p0.ax + p0.ux * p0.lenM + p0.ix * (BASE_DEPTH_MM / 1000);
  const ez = p0.az + p0.uz * p0.lenM + p0.iz * (BASE_DEPTH_MM / 1000);
  // run direction = inward; facing = back along the wall (so it reads as a leg)
  return { fits: true, lenM, placement: { ax: ex - p0.ux * BASE_DEPTH_MM / 1000, az: ez - p0.uz * BASE_DEPTH_MM / 1000, ux: p0.ix, uz: p0.iz, ix: -p0.ux, iz: -p0.uz, startS: 0, lenM } };
}

/** The full run plan for a layout: wall runs + an optional island/peninsula run. */
export function planRuns(points: Pt[], waterWall: number | null, layout: KitchenLayout, openings: Opening[] = []): { runs: PlannedRun[]; waterRun: number } {
  const g = geo(points);
  const inner = offsetPolygon(points, 100);
  const { walls, waterRun } = pickWalls(points, waterWall, layout, openings);

  const runs: PlannedRun[] = walls.map((wr) => {
    const wallLen = innerLen(inner, wr.wall);
    const startOff = wr.cornerStart ? CORNER_MM : 0;
    const endOff = wr.cornerEnd ? CORNER_MM : 0;
    const len = Math.max(300, wallLen - startOff - endOff);
    return {
      kind: "wall" as const,
      wall: wr.wall,
      len,
      cornerStart: wr.cornerStart,
      cornerEnd: wr.cornerEnd,
      openings: projectOpenings(inner, wr.wall, startOff, len, openings),
      placement: wallPlacement(g, wr.wall, wr.cornerStart),
    };
  });

  if (layout === "peninsula") {
    const pen = peninsulaPlacement(g, runs[0].placement);
    if (pen.fits) runs.push({ kind: "peninsula", wall: -1, len: Math.round(pen.lenM * 1000), cornerStart: false, cornerEnd: false, openings: [], placement: pen.placement });
  } else if (layout === "i" || layout === "l") {
    // an island only suits open layouts; galley/U already face an opposite run
    const isl = islandPlacement(g, runs[0].placement);
    if (isl.fits) runs.push({ kind: "island", wall: -1, len: Math.round(isl.lenM * 1000), cornerStart: false, cornerEnd: false, openings: [], placement: isl.placement });
  }

  return { runs, waterRun };
}

/** Just the placements (for the renderer) — same selection as `planRuns`. */
export function computePlacements(points: Pt[], waterWall: number | null, layout: KitchenLayout, openings: Opening[] = []): Placement[] {
  return planRuns(points, waterWall, layout, openings).runs.map((r) => r.placement);
}

/** Diagonal corner unit(s) for L (and later U) — a free transform (px/pz absolute
 *  mm, rot deg) + footprint w×depth, sitting in the cleared corner with its diagonal
 *  door facing the room. Phase 1: L only (one corner). */
export interface CornerSpec {
  px: number;
  pz: number;
  rot: number;
  w: number;
  depth: number;
}
export function cornerUnits(points: Pt[], waterWall: number | null, layout: KitchenLayout, openings: Opening[] = []): CornerSpec[] {
  if (layout !== "l") return [];
  const { runs } = planRuns(points, waterWall, layout, openings);
  const ra = runs.find((r) => r.kind === "wall" && r.cornerEnd);
  const rb = runs.find((r) => r.kind === "wall" && r.cornerStart);
  if (!ra || !rb) return [];
  const b = polygonBoundsMm(points);
  const V = { x: rb.placement.ax, z: rb.placement.az }; // corner vertex (metres)
  // room-facing diagonal = bisector of the two inward normals
  let dx = ra.placement.ix + rb.placement.ix;
  let dz = ra.placement.iz + rb.placement.iz;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl; dz /= dl;
  const off = (CORNER_MM / 1000) / Math.SQRT2; // centre of the corner square, from V along the diagonal
  const cx = V.x + dx * off;
  const cz = V.z + dz * off;
  const rot = (Math.atan2(-dx, dz) * 180) / Math.PI; // local +z (door) faces the diagonal
  return [{
    px: Math.round(cx * 1000 + b.cx),
    pz: Math.round(cz * 1000 + b.cy),
    rot: Math.round(rot * 10) / 10,
    w: CORNER_MM, // footprint = the full corner square (rotated 45° → fits the corner exactly)
    depth: CORNER_MM,
  }];
}
