// L-corner block (blocker #1) — CONSTRUCTION_FRAME_v3 §9 #1: "block can be L, not just box; the
// corner object owns the depth-step" + §7 Piece 1: "leg-A depth 600, leg-B depth 400 at block/leg
// level" + #6: "corner object auto-emits fillers." An L-block emits both legs' carcasses (one leg's
// abutting side omitted — the corner join) + a corner filler.

import { describe, expect, it } from "vitest";

import { buildLCornerModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { validateParts } from "../engine/core/validate.js";

describe("L-corner block (blocker #1)", () => {
  it("emits leg-A + leg-B carcasses + a corner filler", () => {
    const parts = solveStructure(buildLCornerModel());
    const legA = parts.filter((p) => p.id.includes("__legA__"));
    const legB = parts.filter((p) => p.id.includes("__legB__"));
    const filler = parts.filter((p) => p.id.endsWith("__corner_filler"));

    expect(legA).toHaveLength(5); // full carcass
    expect(legB).toHaveLength(4); // side_r omitted at the corner join
    expect(filler).toHaveLength(1); // blocker #6 — auto-emitted corner filler
    expect(legB.some((p) => p.id.endsWith("__legB__side_r"))).toBe(false); // the omitted corner side
    expect(legB.some((p) => p.id.endsWith("__legB__side_l"))).toBe(true);
  });

  it("carries per-leg depth (blocker #3): leg-A 600mm, leg-B 400mm", () => {
    const parts = solveStructure(buildLCornerModel());
    const aSide = parts.find((p) => p.id.endsWith("__legA__side_l"))!;
    const bSide = parts.find((p) => p.id.endsWith("__legB__side_l"))!;
    // a side panel is panel(id, h, d) → width_mm10 = leg depth
    expect(aSide.width_mm10).toBe(6000); // 600 mm
    expect(bSide.width_mm10).toBe(4000); // 400 mm
  });

  it("the L-corner part set passes the machining safety gate", () => {
    expect(validateParts(solveStructure(buildLCornerModel())).ok).toBe(true);
  });
});
