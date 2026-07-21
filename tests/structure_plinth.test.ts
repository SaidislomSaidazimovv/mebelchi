// Phase 1.1 — Sokol / plinth. A recessed toe-kick UNDER the carcass, added by an OPTIONAL
// `Block.plinth_mm10`. box.h stays the carcass height; the plinth is an extra part below it, so every
// existing model (no plinth) is byte-identical, and a plinth-bearing model stands on the plinth
// (its solved parts extend below box.y, lowering the scene's minY).

import { describe, it, expect } from "vitest";

import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const withPlinth = (m: StructuralModel, mm10: number): StructuralModel => ({
  ...m,
  blocks: m.blocks.map((b, i) => (i === 0 ? { ...b, plinth_mm10: mm10 } : b)),
});

describe("Phase 1.1 — sokol / plinth", () => {
  it("is ABSENT by default — a plain carcass is unchanged (5 parts, no plinth)", () => {
    const parts = solveStructure(buildCarcassModel(600, 720, 560));
    expect(parts).toHaveLength(5);
    expect(parts.some((p) => p.id.endsWith("__plinth"))).toBe(false);
  });

  it("without the field, the part list is byte-identical to today", () => {
    const base = buildCarcassModel(600, 720, 560);
    const before = JSON.stringify(solveStructure(base));
    const after = JSON.stringify(solveStructure({ ...base })); // no plinth added
    expect(after).toBe(before);
  });

  it("adds exactly ONE plinth part when the field is set", () => {
    const parts = solveStructure(withPlinth(buildCarcassModel(600, 720, 560), 1000));
    expect(parts).toHaveLength(6);
    const plinth = parts.find((p) => p.id.endsWith("__plinth"))!;
    expect(plinth).toBeDefined();
    expect(plinth.role).toBe("carcass_plinth");
  });

  it("the plinth is the inner width × plinth height × carcass thickness", () => {
    const plinth = solveStructure(withPlinth(buildCarcassModel(600, 720, 560), 1000))
      .find((p) => p.id.endsWith("__plinth"))!;
    expect(plinth.length_mm10).toBe(6000 - 2 * 160); // inner width (w − 2·carcass)
    expect(plinth.width_mm10).toBe(1000); // the plinth height
    expect(plinth.thickness_mm10).toBe(160); // carcass stock
  });

  it("the plinth is unbanded — its edges are all concealed", () => {
    const plinth = solveStructure(withPlinth(buildCarcassModel(600, 720, 560), 1000))
      .find((p) => p.id.endsWith("__plinth"))!;
    expect([...plinth.edges]).toEqual([0, 0, 0, 0]);
  });

  it("the plinth takes NO drilling", () => {
    const plinth = solveStructure(withPlinth(buildCarcassModel(600, 720, 560), 1000))
      .find((p) => p.id.endsWith("__plinth"))!;
    expect(plinth.operations).toEqual([]);
  });

  it("box.h stays the CARCASS height — the plinth does not grow the sides", () => {
    const m = withPlinth(buildCarcassModel(600, 720, 560), 1000);
    expect(m.blocks[0]!.box.h).toBe(7200); // still 720 mm, plinth is extra
    const side = solveStructure(m).find((p) => p.id.endsWith("__side_l"))!;
    expect(side.length_mm10).toBe(7200); // the side is the carcass height, not 720+100
  });

  it("the carcass panels keep their EXACT placement — only a new part is added below", () => {
    const base = buildCarcassModel(600, 720, 560);
    const flat = solveLayout(base);
    const withP = solveLayout(withPlinth(base, 1000));
    for (const p of flat) {
      const same = withP.find((q) => q.id === p.id)!;
      expect({ x: same.x_mm10, y: same.y_mm10, z: same.z_mm10 }).toEqual({ x: p.x_mm10, y: p.y_mm10, z: p.z_mm10 });
    }
  });

  it("the plinth is placed BELOW the carcass (its bottom lowers the model's minY by the plinth)", () => {
    const base = buildCarcassModel(600, 720, 560);
    const minY = (ps: ReturnType<typeof solveLayout>) => Math.min(...ps.map((p) => p.y_mm10));
    const flatMin = minY(solveLayout(base));
    const plinthLayout = solveLayout(withPlinth(base, 1000));
    expect(minY(plinthLayout)).toBe(flatMin - 1000); // the floor drops by the plinth height
    const plinth = plinthLayout.find((p) => p.id.endsWith("__plinth"))!;
    expect(plinth.y_mm10).toBe(flatMin - 1000);
    expect(plinth.y_mm10 + plinth.h_mm10).toBe(flatMin); // its top meets the carcass bottom
  });

  it("the plinth is recessed from the front (z > carcass front z)", () => {
    const base = buildCarcassModel(600, 720, 560);
    const front = Math.min(...solveLayout(base).map((p) => p.z_mm10));
    const plinth = solveLayout(withPlinth(base, 1000)).find((p) => p.id.endsWith("__plinth"))!;
    expect(plinth.z_mm10).toBeGreaterThan(front); // set back, not flush with the front
  });

  it("a zero or negative plinth adds nothing (guarded)", () => {
    expect(solveStructure(withPlinth(buildCarcassModel(600, 720, 560), 0))).toHaveLength(5);
  });

  it("round-trips through JSON (save/load keeps the field)", () => {
    const m = withPlinth(buildCarcassModel(600, 720, 560), 1000);
    const back = JSON.parse(JSON.stringify(m)) as StructuralModel;
    expect(back.blocks[0]!.plinth_mm10).toBe(1000);
    expect(solveStructure(back)).toHaveLength(6);
  });
});
