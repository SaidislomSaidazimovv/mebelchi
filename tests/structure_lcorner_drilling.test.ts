// L-corner drilling adjacency — a shelf's pins drill only the side panels that actually bound it
// (matched by depth). The L-block's deep leg-A shelf (600mm) must drill leg-A's 600mm sides and
// NOT over-drill leg-B's 400mm sides. Closes the "section adjacency" gap for the L case.

import { describe, expect, it } from "vitest";

import { buildLCornerModel } from "../engine/structure/demoModel.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Part } from "../engine/contracts/types.js";

const hasPins = (p: Part | undefined): boolean =>
  !!p && p.operations.some((o) => o.op === "drill" && o.diameter_mm10 === 50);

describe("L-corner drilling adjacency", () => {
  it("drills leg-A's sides for the leg-A shelf (matching depth)", () => {
    const parts = solveModelToParts(buildLCornerModel());
    expect(hasPins(parts.find((p) => p.id === "blk_l__legA__side_l"))).toBe(true);
    expect(hasPins(parts.find((p) => p.id === "blk_l__legA__side_r"))).toBe(true);
  });

  it("does NOT over-drill leg-B's shallower sides (depth mismatch)", () => {
    const parts = solveModelToParts(buildLCornerModel());
    const legBSide = parts.find((p) => p.id === "blk_l__legB__side_l");
    expect(legBSide).toBeDefined();
    expect(hasPins(legBSide)).toBe(false); // leg-A shelf (600mm) must not drill leg-B (400mm)
  });
});
