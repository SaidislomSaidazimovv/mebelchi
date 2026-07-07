// engine/structure/holeOverride.ts — Step 7c (§8.2). The master may move an individual auto-placed drill
// off the profile grid (a real workshop override). Overrides are a model-level map keyed by
// `${partId}::${opId}` so they survive re-solve; this pure pass rewrites the matching FACE drills to the
// user position and re-stamps them source:"user" (the solver then leaves them alone). Additive.
import type { Part, mm10 } from "../contracts/types.js";

export type HoleOverrides = Record<string, { x_mm10: mm10; y_mm10: mm10 }>;

/** The stable key of one drilled hole: its part id + the operation id applyDrilling assigned. */
export const holeKey = (partId: string, opId: string): string => `${partId}::${opId}`;

/** Move individual face (A/B) drills to their overridden positions. No overrides → the list passes
 *  straight through (same reference); parts without a matching hole are untouched by reference. */
export function applyHoleOverrides(parts: readonly Part[], overrides?: HoleOverrides): Part[] {
  if (!overrides || Object.keys(overrides).length === 0) return parts as Part[];
  return parts.map((p) => {
    let changed = false;
    const ops = p.operations.map((op) => {
      if (op.op !== "drill" || (op.face !== "A" && op.face !== "B")) return op;
      const o = overrides[holeKey(p.id, op.id)];
      if (!o) return op;
      changed = true;
      return { ...op, x_mm10: o.x_mm10, y_mm10: o.y_mm10, source: "user" as const };
    });
    return changed ? { ...p, operations: ops } : p;
  });
}
