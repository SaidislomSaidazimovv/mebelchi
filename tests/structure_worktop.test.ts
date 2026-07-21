// Phase 1.2b — worktop / stoleshnitsa geometry. A board on TOP of the carcass, added by an OPTIONAL
// `Block.worktop`, overhanging the front. box.h stays the carcass height; the worktop is an extra part
// above it, so every existing model (no worktop) is byte-identical, and a worktop-bearing model grows
// upward (maxY) and forward (the overhang). Its thickness comes from the worktop material slot, not a
// dimension field.

import { describe, it, expect } from "vitest";

import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure, WORKTOP_OVERHANG_MM10 } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

// worktop stock 38mm; the rest at the 16mm default
const TK = { carcass: 160, back: 30, shelf: 160, divider: 160, facade: 160, worktop: 380 };

const withWorktop = (m: StructuralModel, on = true): StructuralModel => ({
  ...m,
  blocks: m.blocks.map((b, i) => (i === 0 ? { ...b, worktop: on } : b)),
});

describe("Phase 1.2b — worktop / stoleshnitsa", () => {
  it("is ABSENT by default — a plain carcass is unchanged (5 parts, no worktop)", () => {
    const parts = solveStructure(buildCarcassModel(600, 720, 560), TK);
    expect(parts).toHaveLength(5);
    expect(parts.some((p) => p.id.endsWith("__worktop"))).toBe(false);
  });

  it("without the field the part list is byte-identical", () => {
    const base = buildCarcassModel(600, 720, 560);
    expect(JSON.stringify(solveStructure({ ...base }, TK))).toBe(JSON.stringify(solveStructure(base, TK)));
  });

  it("adds exactly ONE worktop part when the field is set", () => {
    const parts = solveStructure(withWorktop(buildCarcassModel(600, 720, 560)), TK);
    expect(parts).toHaveLength(6);
    const wt = parts.find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.role).toBe("carcass_worktop");
  });

  it("spans the full width, depth grown by the overhang, at the worktop thickness", () => {
    const wt = solveStructure(withWorktop(buildCarcassModel(600, 720, 560)), TK).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.length_mm10).toBe(6000); // full block width (not inner — a worktop covers the sides too)
    expect(wt.width_mm10).toBe(5600 + WORKTOP_OVERHANG_MM10); // depth + front overhang
    expect(wt.thickness_mm10).toBe(380); // from the worktop material slot, not the carcass
  });

  it("is unbanded — postforming has an integral edge, no PVC band", () => {
    const wt = solveStructure(withWorktop(buildCarcassModel(600, 720, 560)), TK).find((p) => p.id.endsWith("__worktop"))!;
    expect([...wt.edges]).toEqual([0, 0, 0, 0]);
  });

  it("takes NO drilling", () => {
    const wt = solveStructure(withWorktop(buildCarcassModel(600, 720, 560)), TK).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.operations).toEqual([]);
  });

  it("box.h stays the carcass height — the worktop does not grow the sides", () => {
    const m = withWorktop(buildCarcassModel(600, 720, 560));
    expect(m.blocks[0]!.box.h).toBe(7200);
    const side = solveStructure(m, TK).find((p) => p.id.endsWith("__side_l"))!;
    expect(side.length_mm10).toBe(7200); // still the carcass height, not 720+38
  });

  it("its thickness FOLLOWS the material — a thinner worktop stock yields a thinner part", () => {
    const wt = solveStructure(withWorktop(buildCarcassModel(600, 720, 560)), { ...TK, worktop: 280 }).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.thickness_mm10).toBe(280);
  });

  it("the carcass panels keep their EXACT placement — only a new part is added on top", () => {
    const base = buildCarcassModel(600, 720, 560);
    const flat = solveLayout(base, TK);
    const withP = solveLayout(withWorktop(base), TK);
    for (const p of flat) {
      const same = withP.find((q) => q.id === p.id)!;
      expect({ x: same.x_mm10, y: same.y_mm10, z: same.z_mm10 }).toEqual({ x: p.x_mm10, y: p.y_mm10, z: p.z_mm10 });
    }
  });

  it("sits ON TOP — its bottom meets the carcass top, growing the model's maxY by the worktop", () => {
    const base = buildCarcassModel(600, 720, 560);
    const maxY = (ps: ReturnType<typeof solveLayout>) => Math.max(...ps.map((p) => p.y_mm10 + p.h_mm10));
    const flatMax = maxY(solveLayout(base, TK));
    const wtLayout = solveLayout(withWorktop(base), TK);
    const wt = wtLayout.find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.y_mm10).toBe(flatMax); // its bottom sits on the carcass top
    expect(maxY(wtLayout)).toBe(flatMax + 380); // total height grows by the worktop thickness
  });

  it("overhangs the FRONT — its front edge is forward of the carcass front (z < box.z)", () => {
    const base = buildCarcassModel(600, 720, 560);
    const carcassFront = Math.min(...solveLayout(base, TK).map((p) => p.z_mm10));
    const wt = solveLayout(withWorktop(base), TK).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.z_mm10).toBe(carcassFront - WORKTOP_OVERHANG_MM10);
  });

  it("a worktop AND a plinth coexist — 7 parts, one below and one above", () => {
    const m = { ...withWorktop(buildCarcassModel(600, 720, 560)), blocks: [{ ...withWorktop(buildCarcassModel(600, 720, 560)).blocks[0]!, plinth_mm10: 1000 }] };
    const parts = solveStructure(m, TK);
    expect(parts).toHaveLength(7);
    expect(parts.some((p) => p.id.endsWith("__plinth"))).toBe(true);
    expect(parts.some((p) => p.id.endsWith("__worktop"))).toBe(true);
  });

  it("round-trips through JSON (save/load keeps the flag)", () => {
    const back = JSON.parse(JSON.stringify(withWorktop(buildCarcassModel(600, 720, 560)))) as StructuralModel;
    expect(back.blocks[0]!.worktop).toBe(true);
    expect(solveStructure(back, TK)).toHaveLength(6);
  });
});
