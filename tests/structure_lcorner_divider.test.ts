// L-corner divider — a divider inside an L-block leg must follow the SECTION it splits (leg-A),
// not the block's bounding box (which spans both legs and is far deeper). Regression guard for the
// leg-aware dividerPart / dividerPlacement.

import { describe, expect, it } from "vitest";

import { buildLCornerModel } from "../engine/structure/demoModel.js";
import { divideSection } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";

/** Split leg-A (sec_l) with one centred divider. */
function dividedL() {
  return divideSection(buildLCornerModel(), "sec_l", { kind: "ratio", axis: "x", ratio: [1, 1] });
}

describe("L-corner divider (leg-aware)", () => {
  it("sizes the divider to leg-A's depth (6000), not the block bounding box (14000)", () => {
    const div = solveStructure(dividedL()).find((p) => p.id.includes("__div_"));
    expect(div).toBeDefined();
    expect(div!.width_mm10).toBe(6000); // panel width = section depth (leg-A), not 14000
  });

  it("positions the divider within leg-A (depth 6000, z origin 0)", () => {
    const div = solveLayout(dividedL()).find((p) => p.id.includes("__div_"));
    expect(div).toBeDefined();
    expect(div!.z_mm10).toBe(0);
    expect(div!.d_mm10).toBe(6000); // spans leg-A depth, not the 14000 bounding box
  });
});
