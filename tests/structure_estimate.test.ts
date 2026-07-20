// Phase 5 / 5.C — estimate.ts (cut list + sheet/edge totals + material-plan price over solved parts).
import { describe, it, expect } from "vitest";
import { estimate } from "../apps/app/src/three/estimate.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { DEFAULT_PLAN, boardById, edgeById, boardForRole } from "../apps/app/src/three/materials.js";
import { edgeLengths } from "../engine/structure/features.js";
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
    // Banded edges follow the engine's SWJ008 order [front, back, side, side] (edgeLengths): faces 1 & 2
    // are the front/back edges and BOTH run along the LENGTH. So 0.4 + 0.4 = 0.8 m.
    // (Was 1.0 here while estimate.ts kept a mirrored copy of the rule that mapped face 1 to the WIDTH —
    // that under-counted kromka, and kromka feeds the price. Grounded by solve.ts's factory face map:
    // Face1 drills at Y=Width, POL_3_1.XML Face1 @ Y=503, i.e. the top edge, which spans the length.)
    expect(e.edgeM).toBeCloseTo(0.8, 6);
    expect(p0.bands).toEqual([true, true, false, false]);
    // role facade → the plan's facade decor; price = area·facadeRate + edge·edgeRate
    const facadeRate = boardById(DEFAULT_PLAN.facade)!.pricePerM2;
    const edgeRate = edgeById(DEFAULT_PLAN.edge)!.pricePerM;
    expect(p0.materialName).toBe(boardForRole(DEFAULT_PLAN, "facade")!.name);
    expect(e.priceUzs).toBe(Math.round(0.24 * facadeRate + 0.8 * edgeRate));
  });

  it("prices each part by its role's decor and groups by material", () => {
    const parts = solveStructure(buildDemoModel());
    const e = estimate(parts);
    // per-material counts + prices sum back to the totals
    expect(e.byMaterial.reduce((a, g) => a + g.count, 0)).toBe(e.count);
    expect(Math.round(e.byMaterial.reduce((a, g) => a + g.priceUzs, 0))).toBe(e.priceUzs);
    expect(e.byMaterial).toEqual([...e.byMaterial].sort((a, b) => b.priceUzs - a.priceUzs)); // dearest first
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
    expect(e.priceUzs).toBeGreaterThan(0);
  });

  // Regression lock: estimate must NOT carry its own copy of the SWJ008 face→edge rule. It used to,
  // mirrored, which under-counted kromka on every front-banded panel — and kromka feeds the price.
  it("edge metres match the engine's edgeLengths for EVERY face", () => {
    const el = edgeLengths(onePart.length_mm10, onePart.width_mm10); // [len, len, wid, wid] mm10
    for (let i = 0; i < 4; i++) {
      const edges = [0, 0, 0, 0].map((_, j) => (j === i ? 20 : 0)) as Part["edges"];
      const one = estimate([{ ...onePart, edges }]);
      expect(one.edgeM).toBeCloseTo(el[i]! / 10000, 6);
    }
  });

  it("a front-banded panel counts its LENGTH (solve's frontBand case)", () => {
    const frontOnly: Part = { ...onePart, edges: [20, 0, 0, 0] };
    expect(estimate([frontOnly]).edgeM).toBeCloseTo(0.4, 6); // 400mm length — not the 600mm width
  });

  it("empty parts → zeroed estimate, no crash", () => {
    const e = estimate([]);
    expect(e).toMatchObject({ count: 0, areaM2: 0, edgeM: 0, priceUzs: 0 });
    expect(e.byThickness).toEqual([]);
    expect(e.byMaterial).toEqual([]);
  });
});
