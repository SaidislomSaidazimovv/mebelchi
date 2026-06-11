// Shared helpers for the Layer-1 primitive proofs (15_PRIMITIVES_STEP2.md).
import { it } from "vitest";
import type { Operation } from "../../engine/index.js";

export interface CanonOp {
  face: string;
  x: number;
  y: number;
  z: number;
  dia: number;
  depth: number;
}

/** Normalise drill operations to a sorted, id-free, mm10 canonical form. */
export function canonOps(ops: Operation[]): CanonOp[] {
  return ops
    .filter((o) => o.op === "drill")
    .map((o) => ({
      face: o.face,
      x: o.x_mm10,
      y: o.y_mm10,
      z: o.z_mm10 ?? 0,
      dia: o.diameter_mm10,
      depth: o.depth_mm10,
    }))
    .sort(
      (a, b) =>
        a.face.localeCompare(b.face) ||
        a.x - b.x ||
        a.y - b.y ||
        a.z - b.z ||
        a.dia - b.dia ||
        a.depth - b.depth,
    );
}

/**
 * Ground-truth proof, gated on the spec's `verified` flag.
 *
 *  - verified:false (today)  -> `it.fails`: the test is EXPECTED to mismatch the real
 *    panel on dummy numbers. It stays green while wrong and flips RED the moment the
 *    numbers become correct — the signal to flip `verified:true`. (Commits "failing"
 *    intentionally, per the doc, without breaking the suite gate.)
 *  - verified:true (after factory) -> a normal hard assertion: green only when the
 *    generated geometry matches the factory file to mm10.
 */
export function proof(name: string, verified: boolean, body: () => void): void {
  if (verified) {
    it(name, body);
  } else {
    it.fails(`${name} [UNVERIFIED SPEC — fails on dummy values until factory data lands]`, body);
  }
}

/** Per-field diff between generated and real canonical ops, for the factory checklist. */
export function fieldDiffs(generated: CanonOp[], real: CanonOp[]): string[] {
  const diffs: string[] = [];
  const n = Math.max(generated.length, real.length);
  for (let i = 0; i < n; i++) {
    const g = generated[i];
    const r = real[i];
    if (!g || !r) {
      diffs.push(`op#${i}: count mismatch (generated=${generated.length}, real=${real.length})`);
      continue;
    }
    for (const k of ["face", "x", "y", "z", "dia", "depth"] as const) {
      if (g[k] !== r[k]) diffs.push(`op#${i}.${k}: generated=${g[k]} real=${r[k]}`);
    }
  }
  return diffs;
}
