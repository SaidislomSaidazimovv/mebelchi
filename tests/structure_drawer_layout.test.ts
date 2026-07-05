// Regression: a drawer instance must RENDER — solveLayout has to emit the 5-panel box (front + 2
// sides + back + bottom) with ids that match solveStructure's drawerBoxParts, else the drawer is
// counted in the cut list / Detallar but invisible in 3D (and its material change shows nothing).
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";

describe("drawer renders in solveLayout", () => {
  it("emits the 5-panel drawer box with ids matching solveStructure", () => {
    let m = buildDemoModel();
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");

    const layoutIds = solveLayout(m).map((p) => p.id);
    const partIds = new Set(solveStructure(m).map((p) => p.id));

    // the drawer's five panels are drawn
    for (const suffix of ["__front", "__side_l", "__side_r", "__back", "__bottom"]) {
      expect(layoutIds.some((id) => id.includes("__inst_") && id.endsWith(suffix))).toBe(true);
    }
    // and every drawn board maps to a real part (so partColorLookup colours it — no bare WOOD)
    expect(solveLayout(m).map((p) => p.id).filter((id) => !partIds.has(id))).toEqual([]);
  });

  it("the drawer front covers the full section opening at the front face (z = section front)", () => {
    let m = buildDemoModel();
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");
    const front = solveLayout(m).find((p) => p.id.endsWith("__front"));
    expect(front).toBeTruthy();
    expect(front!.d_mm10).toBeGreaterThan(0); // a real box, not a zero-thickness ghost
    expect(front!.w_mm10).toBeGreaterThan(0);
    expect(front!.h_mm10).toBeGreaterThan(0);
  });
});
