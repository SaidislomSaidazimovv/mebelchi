// L-corner content — a shelf inside an L-block leg (v3 §7 Piece 1: the L-wardrobe's legs carry
// shelves). The shelf's section is sized to leg-A, so it solves + positions inside that leg and
// its pins drill leg-A's sides.

import { describe, expect, it } from "vitest";

import { buildLCornerModel } from "../engine/structure/demoModel.js";
import { solveStructure, BOARD_MM10 } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";

const SHELF_ID = "blk_l__inst_inst_l_shelf";

describe("L-corner content (shelf inside a leg)", () => {
  it("solves a shelf sized to leg-A (its section)", () => {
    const shelf = solveStructure(buildLCornerModel()).find((p) => p.id === SHELF_ID);
    expect(shelf).toBeDefined();
    expect(shelf!.width_mm10).toBe(6000); // leg-A depth
    expect(shelf!.length_mm10).toBe(10000 - 2 * BOARD_MM10); // span between leg-A's sides
  });

  it("positions the shelf inside leg-A (within its depth, at the anchor height)", () => {
    const shelf = solveLayout(buildLCornerModel()).find((p) => p.id === SHELF_ID);
    expect(shelf).toBeDefined();
    expect(shelf!.z_mm10).toBeGreaterThanOrEqual(0);
    expect(shelf!.z_mm10 + shelf!.d_mm10).toBeLessThanOrEqual(6000); // within leg-A depth
    expect(shelf!.y_mm10).toBe(3600); // anchor height
  });

  it("drills shelf-pins on leg-A's side panel for the shelf", () => {
    const legASide = solveModelToParts(buildLCornerModel()).find((p) => p.id === "blk_l__legA__side_l");
    expect(legASide).toBeDefined();
    expect(legASide!.operations.some((o) => o.op === "drill" && o.diameter_mm10 === 50)).toBe(true);
  });
});
