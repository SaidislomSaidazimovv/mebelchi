// E14 — L-corner refinements (grounded). The "later refinement" flagged in lCornerParts resolves to:
//  • leg-side omission — leg-B drops its corner-abutting side, leg-A keeps both (blind-corner Pattern
//    A, -r4:1241-1250) — already correct; this locks it.
//  • back-panel "exclusion" — a NON-issue: leg-B sits behind leg-A, so the two backs are adjacent,
//    not overlapping (the "-h03" citation was a mislabel — it names a fixture, states no rule).
//  • corner filler — the grounded 50mm blind-corner strip (-r3:327, DB/20 GEO-3).
// (Real leg-B interior content needs per-leg sections — a separate blocker-#1 task.)

import { describe, expect, it } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure, CORNER_FILLER_W } from "../engine/structure/solve.js";
import { buildLCornerModel } from "../engine/structure/demoModel.js";

const model = buildLCornerModel();
const parts = solveStructure(model);
const placements = solveLayout(model);
const has = (suffix: string) => parts.some((p) => p.id.endsWith(suffix));

describe("E14 — L-corner corner-join refinements", () => {
  it("leg-B omits its corner-abutting side; leg-A keeps both", () => {
    expect(has("__legB__side_r")).toBe(false); // dropped where it butts leg-A
    expect(has("__legB__side_l")).toBe(true); // far-end side stays
    expect(has("__legA__side_l")).toBe(true);
    expect(has("__legA__side_r")).toBe(true); // leg-A is the through-leg — both sides
  });

  it("the two legs' backs are adjacent, not overlapping", () => {
    const a = placements.find((p) => p.id.endsWith("__legA__back"))!;
    const b = placements.find((p) => p.id.endsWith("__legB__back"))!;
    const overlap =
      a.x_mm10 < b.x_mm10 + b.w_mm10 && b.x_mm10 < a.x_mm10 + a.w_mm10 &&
      a.y_mm10 < b.y_mm10 + b.h_mm10 && b.y_mm10 < a.y_mm10 + a.h_mm10 &&
      a.z_mm10 < b.z_mm10 + b.d_mm10 && b.z_mm10 < a.z_mm10 + a.d_mm10;
    expect(overlap).toBe(false); // perpendicular + adjacent → nothing to "exclude"
  });

  it("the corner filler is the grounded 50mm blind-corner strip", () => {
    const filler = placements.find((p) => p.id.endsWith("__corner_filler"))!;
    expect(filler).toBeDefined();
    expect(filler.d_mm10).toBe(CORNER_FILLER_W);
    expect(CORNER_FILLER_W).toBe(500); // 50mm, default of the grounded 50–100mm range
  });
});
