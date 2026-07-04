// Partial doubling (CONSTRUCTION_FRAME_v3 L2 "real partial doubling" / Piece 3 cantilever): a
// front strip of the panel is doubled — emit the base board + a front-strip board (16mm each →
// 32mm at the front, 16mm behind, a step on the underside). This is the concrete, step-CREATING
// half of blocker #7; the step-aware MOUNTING resolution is a follow-up (needs a mounting model).

import { describe, expect, it } from "vitest";

import { partialDoublePanels, solveStructure, BOARD_MM10, EDGE_BAND_MM10 } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import type { Part } from "../engine/contracts/types.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const base: Part = {
  id: "top",
  name: "Столешница",
  length_mm10: 12000,
  width_mm10: 5600,
  thickness_mm10: BOARD_MM10,
  grain: "L",
  edges: [EDGE_BAND_MM10, 0, 0, 0],
  operations: [],
};

/** buildDemoModel with the shelf component partial-doubled (100mm front strip). */
function partialDemo(): StructuralModel {
  const m = buildDemoModel();
  return {
    ...m,
    blocks: m.blocks.map((b) => ({
      ...b,
      components: b.components.map((c) =>
        c.id === "cmp_shelf" ? { ...c, partialDouble: { front_mm10: 1000 } } : c,
      ),
    })),
  };
}

describe("partial doubling", () => {
  it("emits the base board + a front-strip doubling board", () => {
    const [b, strip] = partialDoublePanels(base, 1000);
    expect(b.id).toBe("top");
    expect(strip.id).toBe("top__front");
    expect(b.thickness_mm10).toBe(BOARD_MM10); // 16mm base
    expect(strip.thickness_mm10).toBe(BOARD_MM10); // 16mm strip → 32mm at the front
    expect(strip.length_mm10).toBe(base.length_mm10); // runs the full length
    expect(strip.width_mm10).toBe(1000); // 100mm front-strip depth
    expect(strip.edges).toEqual([0, 0, 0, 0]); // internal glue face — unbanded
  });

  it("a partial-doubled shelf solves to two boards (base + front strip)", () => {
    const parts = solveStructure(partialDemo()).filter((p) => p.id.includes("__inst_"));
    expect(parts.filter((p) => p.id.endsWith("__front"))).toHaveLength(3); // 3 shelves × 1 strip
    expect(parts).toHaveLength(6); // 3 base + 3 strip
  });
});
