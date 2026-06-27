// Sub-area detection: an interior wall drawn from one point on the room boundary
// to another (a "chord") splits the room into two faces; a closed loop drawn
// inside the room carves out its own enclosed surface. Applied sequentially.
import type { Pt } from "./room";

function pointInPoly(poly: Pt[], p: Pt): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

export interface SubArea {
  polygon: Pt[];
  areaM2: number;
  centroid: Pt;
}

function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const q = poly[(i + 1) % poly.length];
    a += poly[i].x * q.y - q.x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function centroidOf(poly: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-6) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function locateOnBoundary(poly: Pt[], p: Pt, tol: number): number | null {
  let bestEdge: number | null = null;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
    if (d < bestD) {
      bestD = d;
      bestEdge = i;
    }
  }
  return bestD < tol ? bestEdge : null;
}

function splitByChord(poly: Pt[], chord: Pt[], tol: number): Pt[][] | null {
  const n = poly.length;
  const A = chord[0];
  const B = chord[chord.length - 1];
  const eA = locateOnBoundary(poly, A, tol);
  const eB = locateOnBoundary(poly, B, tol);
  if (eA == null || eB == null || eA === eB) return null;
  const interiorRev = chord.slice(1, -1).reverse();

  const fwd: Pt[] = [A];
  let i = (eA + 1) % n;
  for (let g = 0; g < n; g++) {
    fwd.push(poly[i]);
    if (i === eB) break;
    i = (i + 1) % n;
  }
  fwd.push(B);

  const bwd: Pt[] = [A];
  let j = eA;
  for (let g = 0; g < n; g++) {
    bwd.push(poly[j]);
    if (j === (eB + 1) % n) break;
    j = (j - 1 + n) % n;
  }
  bwd.push(B);

  return [
    [...fwd, ...interiorRev],
    [...bwd, ...interiorRev],
  ];
}

/** Sub-areas of the room given interior walls. Empty array = no split (one area). */
export function subAreas(outline: Pt[], interiorWalls: Pt[][], tol = 280): SubArea[] {
  // split closed loops (separate enclosed surfaces) from boundary-to-boundary chords
  const chords: Pt[][] = [];
  const loops: Pt[][] = [];
  for (const wall of interiorWalls) {
    if (wall.length < 2) continue;
    const last = wall[wall.length - 1];
    const closed = wall.length >= 4 && Math.hypot(wall[0].x - last.x, wall[0].y - last.y) < tol;
    if (closed) loops.push(Math.hypot(wall[0].x - last.x, wall[0].y - last.y) < 1 ? wall.slice(0, -1) : wall.slice());
    else chords.push(wall);
  }

  let polys: Pt[][] = [outline];
  for (const wall of chords) {
    const out: Pt[][] = [];
    for (const poly of polys) {
      const split = splitByChord(poly, wall, tol);
      if (split && split[0].length >= 3 && split[1].length >= 3) out.push(...split);
      else out.push(poly);
    }
    polys = out;
  }

  // each face's raw area; closed loops carve their area out of the face containing them
  const faces = polys.map((p) => ({ polygon: p, raw: polyArea(p), centroid: centroidOf(p) }));
  const loopAreas: { polygon: Pt[]; raw: number; centroid: Pt }[] = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const lc = centroidOf(loop);
    const fi = faces.findIndex((f) => pointInPoly(f.polygon, lc));
    if (fi < 0) continue;
    const la = polyArea(loop);
    faces[fi].raw -= la;
    loopAreas.push({ polygon: loop, raw: la, centroid: lc });
  }

  const all = [...faces, ...loopAreas];
  if (all.length <= 1) return [];
  return all.map((f) => ({
    polygon: f.polygon,
    areaM2: Math.round((Math.max(0, f.raw) / 1e6) * 10) / 10,
    centroid: f.centroid,
  }));
}
