// L1 doubling — a 32mm build = two glued 16mm boards. Grounded in CONSTRUCTION_FRAME_v3 §2 L1:
// "32mm = two glued 16mm boards. Doubled edge wears one 32mm kromka; seam hidden under band.
//  Cut list emits two boards + wider kromka run."

import { describe, expect, it } from "vitest";

import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure, doublePanel, BOARD_MM10, EDGE_BAND_MM10 } from "../engine/structure/solve.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

const base: Part = {
  id: "p1",
  name: "Полка",
  length_mm10: 5000,
  width_mm10: 3000,
  thickness_mm10: BOARD_MM10,
  grain: "L",
  edges: [EDGE_BAND_MM10, 0, 0, 0],
  operations: [],
};

/** buildDemoModel with the shelf component marked doubled. */
function doubledDemo(): StructuralModel {
  const m = buildDemoModel();
  return {
    ...m,
    blocks: m.blocks.map((b) => ({
      ...b,
      components: b.components.map((c) => (c.id === "cmp_shelf" ? { ...c, doubled: true } : c)),
    })),
  };
}

describe("L1 doubling", () => {
  it("doublePanel emits two 16mm boards (never one 32mm)", () => {
    const [a, b] = doublePanel(base);
    expect(a.id).toBe("p1__a");
    expect(b.id).toBe("p1__b");
    expect(a.thickness_mm10).toBe(BOARD_MM10); // 16mm
    expect(b.thickness_mm10).toBe(BOARD_MM10); // 16mm — NOT 320
    expect(a.length_mm10).toBe(base.length_mm10);
    expect(a.width_mm10).toBe(base.width_mm10);
    expect(b.length_mm10).toBe(base.length_mm10);
  });

  it("bands the doubled edge once — outer layer keeps the band, inner is bare (seam hidden)", () => {
    const [a, b] = doublePanel(base);
    expect(a.edges).toEqual([EDGE_BAND_MM10, 0, 0, 0]); // one kromka run
    expect(b.edges).toEqual([0, 0, 0, 0]); // seam hidden under the band
  });

  it("does not mutate the base part (purity)", () => {
    doublePanel(base);
    expect(base.id).toBe("p1");
    expect(base.name).toBe("Полка");
  });

  it("a doubled component emits TWO layer parts per placement in the solve", () => {
    const parts = solveStructure(doubledDemo());
    const shelves = parts.filter((p) => p.id.includes("__inst_"));
    // demo has 3 shelf instances → 3 × 2 layers = 6 boards
    expect(shelves).toHaveLength(6);
    expect(shelves.filter((p) => p.id.endsWith("__a"))).toHaveLength(3);
    expect(shelves.filter((p) => p.id.endsWith("__b"))).toHaveLength(3);
    expect(shelves.every((p) => p.thickness_mm10 === BOARD_MM10)).toBe(true);
  });

  it("a normal (non-doubled) component emits one board per placement", () => {
    const shelves = solveStructure(buildDemoModel()).filter((p) => p.id.includes("__inst_"));
    expect(shelves).toHaveLength(3); // 3 shelves, one board each
    expect(shelves.every((p) => !p.id.endsWith("__a") && !p.id.endsWith("__b"))).toBe(true);
  });
});
