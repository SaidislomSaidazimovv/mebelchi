// Phase 5 / 5.C — estimate.ts (cut list + sheet/edge totals + material-plan price over solved parts).
import { describe, it, expect } from "vitest";
import { estimate } from "../apps/app/src/three/estimate.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { DEFAULT_PLAN, boardById, edgeById, boardForRole } from "../apps/app/src/three/materials.js";
import type { Part } from "../engine/contracts/types.js";

// a bare 600×400 facade panel, 16mm, banded on faces 1 & 2 only
const onePart: Part = {
  id: "p1",
  name: "test",
  width_mm10: 6000, // 600 mm
  length_mm10: 4000, // 400 mm
  thickness_mm10: 160, // 16 mm
  grain: "NONE",
  edges: [20, 20, 0, 0], // faces 1 (width) & 2 (length) banded
  operations: [],
  role: "facade",
};

describe("Phase 5 / 5.C — estimate", () => {
  it("computes area, mm dims and material-plan price for a single panel", () => {
    const e = estimate([onePart]);
    expect(e.count).toBe(1);
    const p0 = e.parts[0]!;
    expect(p0.w_mm).toBe(600);
    expect(p0.l_mm).toBe(400);
    expect(p0.t_mm).toBe(16);
    expect(e.areaM2).toBeCloseTo(0.24, 6); // 0.6 × 0.4
    // banded edges: face1 (width 0.6) + face2 (length 0.4) = 1.0 m
    expect(e.edgeM).toBeCloseTo(1.0, 6);
    expect(p0.bands).toEqual([true, true, false, false]);
    // role facade → the plan's facade decor; price = area·facadeRate + edge·edgeRate
    const facadeRate = boardById(DEFAULT_PLAN.facade)!.pricePerM2;
    const edgeRate = edgeById(DEFAULT_PLAN.edge)!.pricePerM;
    expect(p0.materialName).toBe(boardForRole(DEFAULT_PLAN, "facade")!.name);
    expect(e.priceRub).toBe(Math.round(0.24 * facadeRate + 1.0 * edgeRate));
  });

  it("prices each part by its role's decor and groups by material", () => {
    const parts = solveStructure(buildDemoModel());
    const e = estimate(parts);
    // per-material counts + prices sum back to the totals
    expect(e.byMaterial.reduce((a, g) => a + g.count, 0)).toBe(e.count);
    expect(Math.round(e.byMaterial.reduce((a, g) => a + g.priceRub, 0))).toBe(e.priceRub);
    expect(e.byMaterial).toEqual([...e.byMaterial].sort((a, b) => b.priceRub - a.priceRub)); // dearest first
    // a thin ХДФ back priced cheaper per m² than the carcass proves role→decor is applied
    expect(e.byMaterial.some((g) => g.name === boardById(DEFAULT_PLAN.back)!.name)).toBe(true);
  });

  it("groups the demo model by thickness and totals consistently", () => {
    const parts = solveStructure(buildDemoModel());
    const e = estimate(parts);
    expect(e.count).toBe(parts.length);
    expect(e.byThickness.reduce((a, g) => a + g.count, 0)).toBe(e.count);
    expect(e.byThickness.reduce((a, g) => a + g.areaM2, 0)).toBeCloseTo(e.areaM2, 6);
    expect(e.byThickness).toEqual([...e.byThickness].sort((a, b) => b.t_mm - a.t_mm)); // thickest first
    expect(e.areaM2).toBeGreaterThan(0);
    expect(e.priceRub).toBeGreaterThan(0);
  });

  it("empty parts → zeroed estimate, no crash", () => {
    const e = estimate([]);
    expect(e).toMatchObject({ count: 0, areaM2: 0, edgeM: 0, priceRub: 0 });
    expect(e.byThickness).toEqual([]);
    expect(e.byMaterial).toEqual([]);
  });
});
