// FreePart.edgeBands — per-board kromka for the free primitive.
//
// Free parts used to be banded on ALL FOUR edges unconditionally. That is right for a visible board
// like a table top, and wrong for a solid post: the demo table's four 50×50 legs were being charged
// ~6 m of banding they never receive — about a third of that table's price. The field is additive, so
// a board that says nothing still gets every edge, and every existing model is unchanged.

import { describe, expect, it } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { buildTable } from "../engine/structure/demoModel.js";
import { edgeLengths } from "../engine/structure/features.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const box = { x: 0, y: 0, z: 0, w: 12000, h: 7000, d: 6000 };

function model(freeParts: FreePart[]): StructuralModel {
  return {
    id: "t",
    name: "banding",
    blocks: [
      {
        id: "b",
        name: "B",
        box,
        bare: true,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null } }],
        components: [], instances: [], lines: [], rows: [],
        freeParts,
      },
    ],
    parts: [],
  };
}

const board = (id: string, extra: Partial<FreePart> = {}): FreePart => ({
  id,
  name: "Доска",
  role: "panel",
  thicknessAxis: "y",
  box: { x: 0, y: 0, z: 0, w: 8000, h: 160, d: 4000 },
  ...extra,
});

/** Running metres of kromka a part actually carries, using the engine's own face→edge rule. */
const kromkaM = (edges: readonly number[], L: number, W: number): number =>
  edgeLengths(L, W).reduce((sum, len, i) => sum + (edges[i] ? len / 10000 : 0), 0);

describe("FreePart.edgeBands", () => {
  it("defaults to every edge banded — a board that says nothing is unchanged", () => {
    const p = solveStructure(model([board("a")]))[0]!;
    expect(p.edges.every((e) => e > 0)).toBe(true);
  });

  it("honours a bare declaration — no edge banded", () => {
    const p = solveStructure(model([board("a", { edgeBands: [0, 0, 0, 0] })]))[0]!;
    expect([...p.edges]).toEqual([0, 0, 0, 0]);
  });

  it("honours a PARTIAL declaration — front only, the way a shelf is banded", () => {
    const p = solveStructure(model([board("a", { edgeBands: [10, 0, 0, 0] })]))[0]!;
    expect([...p.edges]).toEqual([10, 0, 0, 0]);
  });

  it("does not disturb the part's dimensions or material", () => {
    const bare = solveStructure(model([board("a", { edgeBands: [0, 0, 0, 0], material: "OAK" })]))[0]!;
    const full = solveStructure(model([board("a", { material: "OAK" })]))[0]!;
    expect([bare.length_mm10, bare.width_mm10, bare.thickness_mm10]).toEqual([full.length_mm10, full.width_mm10, full.thickness_mm10]);
    expect(bare.materialId).toBe("OAK");
  });
});

describe("the demo table stops paying for kromka it never gets", () => {
  const parts = solveStructure(buildTable(1200, 750, 700));
  const top = parts.find((p) => p.id.endsWith("__free_top"))!;
  const legs = parts.filter((p) => p.id.includes("__free_leg_"));

  it("still solves to 5 parts", () => {
    expect(parts).toHaveLength(5);
    expect(legs).toHaveLength(4);
  });

  it("the TOP keeps every edge — it is the visible board", () => {
    expect(top.edges.every((e) => e > 0)).toBe(true);
  });

  it("the LEGS are bare posts", () => {
    for (const l of legs) expect([...l.edges]).toEqual([0, 0, 0, 0]);
  });

  it("total kromka is now just the top's perimeter, not the legs' too", () => {
    const total = parts.reduce((a, p) => a + kromkaM(p.edges, p.length_mm10, p.width_mm10), 0);
    const topOnly = kromkaM(top.edges, top.length_mm10, top.width_mm10);
    expect(total).toBeCloseTo(topOnly, 4);
    // 1200×700 top → 2×(1.2 + 0.7) = 3.8 m. The four legs previously added ~6.08 m on top of that.
    expect(total).toBeCloseTo(3.8, 2);
  });
});
