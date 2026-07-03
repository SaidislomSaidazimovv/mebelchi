// Phase 5 — estimate.ts (cut list + sheet/edge totals + rough price over solved parts).
import { describe, it, expect } from "vitest";
import { estimate, DEFAULT_RATES } from "../apps/app/src/three/estimate.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import type { Part } from "../engine/contracts/types.js";

// a bare 600×400 panel, 16mm, banded on faces 1 & 2 only
const onePart: Part = {
  id: "p1",
  name: "test",
  width_mm10: 6000, // 600 mm
  length_mm10: 4000, // 400 mm
  thickness_mm10: 160, // 16 mm
  grain: "NONE",
  edges: [20, 20, 0, 0], // faces 1 (width) & 2 (length) banded
  operations: [],
};

describe("Phase 5 — estimate", () => {
  it("computes area, mm dims and price for a single panel", () => {
    const e = estimate([onePart]);
    expect(e.count).toBe(1);
    expect(e.parts[0].w_mm).toBe(600);
    expect(e.parts[0].l_mm).toBe(400);
    expect(e.parts[0].t_mm).toBe(16);
    expect(e.areaM2).toBeCloseTo(0.24, 6); // 0.6 × 0.4
    // banded edges: face1 (width 0.6) + face2 (length 0.4) = 1.0 m
    expect(e.edgeM).toBeCloseTo(1.0, 6);
    expect(e.parts[0].bands).toEqual([true, true, false, false]);
    // price = 0.24·560 + 1.0·28 = 134.4 + 28 = 162.4 → 162
    expect(e.priceRub).toBe(Math.round(0.24 * DEFAULT_RATES.boardPerM2 + 1.0 * DEFAULT_RATES.edgePerM));
  });

  it("groups the demo model by thickness and totals consistently", () => {
    const parts = solveStructure(buildDemoModel());
    const e = estimate(parts);
    expect(e.count).toBe(parts.length);
    // per-thickness counts + areas sum back to the totals
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
  });
});
