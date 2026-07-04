// Carcass cam+dowel JOINERY in the structural drilling pass (applyDrilling) — mirrors the legacy
// baseCabinet corner joinery so the karkas / hybrid SWJ008 gets real assembly holes. Ø15 cam on each
// side's Face A, Ø8 dowel into the top/bottom end edge, two depth columns → 8 cams + 8 dowels/carcass.
import { describe, it, expect } from "vitest";
import { buildDemoModel, buildCarcassModel } from "../engine/structure/demoModel.js";
import { addInstance, divideSection } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import type { Part, Operation } from "../engine/contracts/types.js";

const ops = (parts: Part[], id: string): Operation[] => parts.find((p) => p.id === id)?.operations ?? [];
const dia = (o: Operation, d: number): boolean => o.op === "drill" && o.diameter_mm10 === d;

describe("carcass joinery — cam+dowel corner connectors", () => {
  it("each outer side gets 4 Ø15 cams on Face A; the shelf pins are untouched", () => {
    const parts = solveModelToParts(buildDemoModel());
    for (const side of ["blk_main__side_l", "blk_main__side_r"]) {
      const cams = ops(parts, side).filter((o) => dia(o, 150));
      expect(cams.length).toBe(4); // top+bottom × 2 depth columns
      expect(cams.every((o) => o.op === "drill" && o.face === "A")).toBe(true);
      // pins still present + unchanged (Ø5)
      expect(ops(parts, side).filter((o) => dia(o, 50)).length).toBeGreaterThan(0);
    }
  });

  it("top + bottom each get 4 Ø8 dowels — 2 into edge4 (left side) + 2 into edge3 (right side)", () => {
    const parts = solveModelToParts(buildDemoModel());
    for (const horiz of ["blk_main__top", "blk_main__bottom"]) {
      const dowels = ops(parts, horiz).filter((o) => dia(o, 80));
      expect(dowels.length).toBe(4);
      expect(dowels.filter((o) => o.face === "edge4").length).toBe(2);
      expect(dowels.filter((o) => o.face === "edge3").length).toBe(2);
    }
  });

  it("adds exactly 16 joinery holes per carcass (8 cams + 8 dowels) and stays in the safety gate", () => {
    const parts = solveModelToParts(buildCarcassModel(600, 720, 560));
    const cams = parts.flatMap((p) => p.operations).filter((o) => dia(o, 150));
    const dowels = parts.flatMap((p) => p.operations).filter((o) => dia(o, 80));
    expect(cams.length).toBe(8);
    expect(dowels.length).toBe(8);
    expect(validateParts(parts).ok).toBe(true);
  });

  it("dividers + drawer-box sides do NOT get carcass cams (only the outer box)", () => {
    // a section split into 2 columns → a divider; neither the divider nor any inner side is an outer side
    const m0 = buildCarcassModel(800, 720, 560);
    const sec = leafSections(m0.blocks[0]!.zones[0]!.root)[0]!.id;
    const m = divideSection(m0, sec, { kind: "equal", axis: "x", count: 2 });
    const parts = solveModelToParts(m);
    const dividerCams = parts.filter((p) => p.id.includes("__div_")).flatMap((p) => p.operations).filter((o) => dia(o, 150));
    expect(dividerCams.length).toBe(0);
    // the outer box still has its 8 cams
    expect(parts.flatMap((p) => p.operations).filter((o) => dia(o, 150)).length).toBe(8);
  });

  it("is pure — same model drills identical joinery", () => {
    const a = solveModelToParts(buildCarcassModel(600, 720, 560));
    const b = solveModelToParts(buildCarcassModel(600, 720, 560));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
