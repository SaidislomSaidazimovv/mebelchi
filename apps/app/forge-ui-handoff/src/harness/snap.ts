export interface SnapBox {
  x: number;y: number;z: number;
  w: number;h: number;d: number;
}

export interface SnapCandidate {
  readonly at: number;
  readonly kind: "edge" | "centre";
}

export interface SnapResult {
  readonly pos: number;
  readonly snapped: boolean;
  readonly to: number | null;
  readonly kind: "edge" | "centre" | null;
}

const AXIS = {
  x: { lo: "x", size: "w" },
  y: { lo: "y", size: "h" },
  z: { lo: "z", size: "d" }
} as const;

export type SnapAxis = keyof typeof AXIS;

export function snapCandidates(targets: readonly SnapBox[], axis: SnapAxis): SnapCandidate[] {
  const { lo, size } = AXIS[axis];
  const edges = new Set<number>();
  const centres = new Set<number>();
  for (const t of targets) {
    const a = t[lo],len = t[size];
    edges.add(a);
    edges.add(a + len);
    centres.add(a + Math.round(len / 2));
  }
  const out: SnapCandidate[] = [];
  for (const at of edges) out.push({ at, kind: "edge" });
  for (const at of centres) out.push({ at, kind: "centre" });
  return out;
}

export function snapSpan(pos: number, size: number, cands: readonly SnapCandidate[], threshold: number): SnapResult {
  const movers = [
  { offset: 0, kind: "edge" as const },
  { offset: size, kind: "edge" as const },
  { offset: Math.round(size / 2), kind: "centre" as const }];

  let best: SnapResult & {d: number;} | null = null;
  for (const c of cands) {
    for (const m of movers) {
      if (m.kind !== c.kind) continue;
      const d = Math.abs(c.at - (pos + m.offset));
      if (d > threshold) continue;
      if (best && (d > best.d || d === best.d && !(best.kind === "centre" && c.kind === "edge"))) continue;
      best = { pos: c.at - m.offset, snapped: true, to: c.at, kind: c.kind, d };
    }
  }
  return best ? { pos: best.pos, snapped: best.snapped, to: best.to, kind: best.kind } : { pos, snapped: false, to: null, kind: null };
}

export interface AxisSnap {
  readonly pos: number;
  readonly snapped: boolean;
  readonly to: number | null;
}

export interface BoxSnapResult {
  readonly x: number;readonly y: number;readonly z: number;
  readonly snapped: {readonly x: boolean;readonly y: boolean;readonly z: boolean;};
  readonly to: {readonly x: number | null;readonly y: number | null;readonly z: number | null;};
}

export function snapBox(box: SnapBox, targets: readonly SnapBox[], threshold: number): BoxSnapResult {
  const others = targets.filter((t) => t !== box);
  const out = {} as {x: number;y: number;z: number;};
  const hit = {} as {x: boolean;y: boolean;z: boolean;};
  const to = {} as {x: number | null;y: number | null;z: number | null;};
  for (const axis of ["x", "y", "z"] as const) {
    const { lo, size } = AXIS[axis];
    const r = snapSpan(box[lo], box[size], snapCandidates(others, axis), threshold);
    out[axis] = r.pos;
    hit[axis] = r.snapped;
    to[axis] = r.to;
  }
  return { x: out.x, y: out.y, z: out.z, snapped: hit, to };
}
