// Phase K.1 — buildCarcassModel: a blank, arbitrary-size carcass to start a from-scratch block.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";

describe("Phase K.1 — buildCarcassModel", () => {
  it("is a single empty block at the requested size (mm → mm10)", () => {
    const m = buildCarcassModel(800, 2000, 500);
    expect(m.blocks.length).toBe(1);
    expect(m.blocks[0]!.box).toMatchObject({ w: 8000, h: 20000, d: 5000 });
    expect(m.blocks[0]!.instances.length).toBe(0); // blank — nothing inside yet
    expect(leafSections(m.blocks[0]!.zones[0]!.root).length).toBe(1); // one empty leaf to fill
  });

  it("solves to just the carcass box (2 sides + top + bottom + back)", () => {
    const parts = solveStructure(buildCarcassModel(600, 720, 560));
    expect(parts.length).toBe(5);
    expect(parts.map((p) => p.role).sort()).toEqual(
      ["carcass_back", "carcass_bottom", "carcass_side", "carcass_side", "carcass_top"].sort(),
    );
  });

  it("its empty leaf accepts content (add a shelf)", () => {
    const m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    const m2 = addInstance(m, leaf, "shelf");
    expect(solveStructure(m2).length).toBe(6); // carcass 5 + 1 shelf
  });

  it("guards degenerate sizes (no zero/negative box)", () => {
    const m = buildCarcassModel(0, -5, 10);
    expect(m.blocks[0]!.box.w).toBeGreaterThan(0);
    expect(m.blocks[0]!.box.h).toBeGreaterThan(0);
  });
});
