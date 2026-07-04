// L-corner layout — the 3D positioning of an L-block (blocker #1). leg-A runs along X; leg-B is a
// Z-return positioned behind it, forming the L; the corner filler sits at the inner corner. Every
// placement id matches a solveStructure part id 1:1.

import { describe, expect, it } from "vitest";

import { buildLCornerModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";

describe("L-corner layout (3D positioning)", () => {
  it("places every solved part 1:1 (placement ids === part ids)", () => {
    const partIds = new Set(solveStructure(buildLCornerModel()).map((p) => p.id));
    const placeIds = new Set(solveLayout(buildLCornerModel()).map((p) => p.id));
    expect(placeIds).toEqual(partIds);
  });

  it("positions leg-B as a Z-return behind leg-A (forms the L)", () => {
    const places = solveLayout(buildLCornerModel());
    const aSideL = places.find((p) => p.id.endsWith("__legA__side_l"))!;
    const bSideL = places.find((p) => p.id.endsWith("__legB__side_l"))!;
    expect(aSideL.z_mm10).toBe(0); // leg-A sits at the corner origin
    expect(bSideL.z_mm10).toBeGreaterThanOrEqual(6000); // leg-B returns behind leg-A (z ≥ legA depth)
  });

  it("emits the corner filler and omits leg-B's corner-side (the join)", () => {
    const places = solveLayout(buildLCornerModel());
    expect(places.some((p) => p.id.endsWith("__corner_filler"))).toBe(true);
    expect(places.some((p) => p.id.endsWith("__legB__side_r"))).toBe(false);
  });
});
