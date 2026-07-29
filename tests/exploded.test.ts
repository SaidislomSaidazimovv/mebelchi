import { describe, it, expect } from "vitest";
import { mk, type Cabinet } from "../apps/app/src/model/cabinet";
import { cellToKarkasBlock } from "../apps/app/src/three/cellToKarkas";
import { planThickness } from "../apps/app/src/three/materials";
import { solveLayout } from "../engine/structure/layout";
import { solveStructure } from "../engine/structure/solve";
import { estimate, groupSpecs } from "../apps/app/src/three/estimate";
import { buildExploded } from "../apps/app/src/three/exploded";

function setup(cab: Cabinet) {
  const { model, plan } = cellToKarkasBlock(cab);
  const t = planThickness(plan);
  const placements = solveLayout(model, t);
  const parts = groupSpecs(estimate(solveStructure(model, t), plan).parts);
  const posOf = new Map<string, number>();
  parts.forEach((g, i) => g.ids.forEach((id) => posOf.set(id, i + 1)));
  return { placements, posOf, parts };
}

describe("buildExploded", () => {
  it("labels every distinct part exactly once", () => {
    for (const cab of [
      mk({ w: 600, h: 720, fill: "shelves", count: 2 }),
      mk({ w: 400, h: 720, fill: "drawers", count: 4 }),
      mk({ kind: "tall", h: 2100, fill: "shelves", count: 5 }),
    ]) {
      const { placements, posOf, parts } = setup(cab);
      const ex = buildExploded(placements, posOf, 680, 1100, 70, 300);
      const nums = ex.labels.map((l) => l.n).sort((a, b) => a - b);
      expect(new Set(nums).size).toBe(nums.length);
      expect(nums.length).toBe(parts.length);
      expect(Math.min(...nums)).toBe(1);
      expect(Math.max(...nums)).toBe(parts.length);
    }
  });

  it("draws three faces per placement and a positive scale", () => {
    const { placements, posOf } = setup(mk({ w: 600, h: 720, fill: "shelves", count: 2 }));
    const ex = buildExploded(placements, posOf, 680, 1100, 70, 300);
    expect(ex.faces.length).toBe(placements.length * 3);
    expect(ex.scale).toBeGreaterThan(0);
  });
});
