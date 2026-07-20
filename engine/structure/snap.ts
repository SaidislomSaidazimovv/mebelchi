// engine/structure/snap.ts — magnetic snapping for free assembly.
//
// WHY THIS EXISTS AS ITS OWN PURE MODULE. Building furniture from nothing means pushing boards against
// each other by hand, and that is only workable if they CLICK together. The editor already snapped, but
// in two places: a 3-axis rule for the drop, and a 1-axis copy of the same rule for the live gizmo drag —
// two hand-written implementations of one idea, drifting apart, untestable without a browser. Worse,
// both only ever offered the CABINET's compartments as targets, so with no cabinet on screen a board had
// nothing to snap to and free assembly was impractical.
//
// So: one rule, expressed once, as integer arithmetic with no dependency on three.js or the store.
//
// UNITS: mm10 (tenths of a millimetre), like the rest of the engine. No floats.

import type { Box3D } from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";

/**
 * A coordinate a moving board may click onto, along one axis.
 *
 * `kind` keeps the pairing honest: an EDGE only ever snaps to an edge and a CENTRE only to a centre.
 * Letting them cross would mean "put my middle on your left face", which is occasionally what someone
 * wants and usually a surprise — and a snap that surprises is worse than no snap.
 */
export interface SnapCandidate {
  readonly at: mm10;
  readonly kind: "edge" | "centre";
}

export interface SnapResult {
  /** Where the span's low end ends up. Unchanged from the input when nothing was in reach. */
  readonly pos: mm10;
  readonly snapped: boolean;
  /** The coordinate it clicked to, for a readout / highlight. null when it did not snap. */
  readonly to: mm10 | null;
  readonly kind: "edge" | "centre" | null;
}

/** The axis keys of a Box3D: its low coordinate and its extent. */
const AXIS = {
  x: { lo: "x", size: "w" },
  y: { lo: "y", size: "h" },
  z: { lo: "z", size: "d" },
} as const;

export type SnapAxis = keyof typeof AXIS;

/**
 * Every coordinate the given boxes offer along one axis: both faces and the middle.
 *
 * Duplicates are collapsed — a stack of boards flush with one another would otherwise offer the same
 * coordinate many times over, which costs work and can bias a tie.
 */
export function snapCandidates(targets: readonly Box3D[], axis: SnapAxis): SnapCandidate[] {
  const { lo, size } = AXIS[axis];
  const edges = new Set<mm10>();
  const centres = new Set<mm10>();
  for (const t of targets) {
    const a = t[lo], len = t[size];
    edges.add(a);
    edges.add(a + len);
    centres.add(a + Math.round(len / 2));
  }
  const out: SnapCandidate[] = [];
  for (const at of edges) out.push({ at, kind: "edge" });
  for (const at of centres) out.push({ at, kind: "centre" });
  return out;
}

/**
 * Snap the span `[pos, pos+size]` to the nearest candidate within `threshold`, along ONE axis.
 *
 * Either of the span's own faces may do the clicking (so a board can be pushed against a surface from
 * either side), and its middle may align to another middle. Ties go to an EDGE: flush contact is the
 * common intent, and centring is the refinement.
 */
export function snapSpan(
  pos: mm10,
  size: mm10,
  cands: readonly SnapCandidate[],
  threshold: mm10,
): SnapResult {
  // what on the moving board can do the clicking: its low face, its high face, its middle
  const movers = [
    { offset: 0, kind: "edge" as const },
    { offset: size, kind: "edge" as const },
    { offset: Math.round(size / 2), kind: "centre" as const },
  ];
  let best: SnapResult & { d: number } | null = null;
  for (const c of cands) {
    for (const m of movers) {
      if (m.kind !== c.kind) continue; // edges click to edges, middles to middles
      const d = Math.abs(c.at - (pos + m.offset));
      if (d > threshold) continue;
      if (best && (d > best.d || (d === best.d && !(best.kind === "centre" && c.kind === "edge")))) continue;
      best = { pos: c.at - m.offset, snapped: true, to: c.at, kind: c.kind, d };
    }
  }
  return best ? { pos: best.pos, snapped: best.snapped, to: best.to, kind: best.kind } : { pos, snapped: false, to: null, kind: null };
}

/** Where a box lands after snapping, plus which axes actually clicked. */
export interface BoxSnapResult {
  readonly x: mm10;
  readonly y: mm10;
  readonly z: mm10;
  readonly snapped: { readonly x: boolean; readonly y: boolean; readonly z: boolean };
}

/**
 * Snap a box against a set of target boxes, each axis judged independently — so a board can click flush
 * on one axis while staying free on the others, which is what dragging one board along another feels
 * like. `self` (by identity) is excluded so a board never snaps to itself.
 */
export function snapBox(
  box: Box3D,
  targets: readonly Box3D[],
  threshold: mm10,
): BoxSnapResult {
  const others = targets.filter((t) => t !== box);
  const out = {} as { x: mm10; y: mm10; z: mm10 };
  const hit = {} as { x: boolean; y: boolean; z: boolean };
  for (const axis of ["x", "y", "z"] as const) {
    const { lo, size } = AXIS[axis];
    const r = snapSpan(box[lo], box[size], snapCandidates(others, axis), threshold);
    out[axis] = r.pos;
    hit[axis] = r.snapped;
  }
  return { x: out.x, y: out.y, z: out.z, snapped: hit };
}
