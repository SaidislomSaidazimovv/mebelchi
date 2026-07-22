// Phase 4 polish — an L cabinet now gets cam/dowel carcass joinery on BOTH legs (each leg joined into a rigid
// box), where before `carcassJoineryByPart` skipped footprint blocks entirely (an L had no assembly holes).
// The joinery is part-local, so the same camDowelJoint runs on the legs; the ONE care is that each leg's dowel
// columns use its OWN depth (legA.depth / legB.depth), not block.box.d (the L envelope). A rectangular block's
// joinery is byte-identical (its branch is untouched). leg-A↔leg-B cross-join is a later increment.

import { describe, it, expect } from "vitest";

import { setBlockFootprint } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const BID = "blk_main"; // buildCarcassModel's block id
function lModel(legB = { length_mm10: 4000, depth_mm10: 4000 }): StructuralModel {
  const m = buildCarcassModel(600, 720, 560); // legA becomes 6000 wide × 5600 deep
  return setBlockFootprint(m, m.blocks[0]!.id, { legA: { length_mm10: 6000, depth_mm10: 5600 }, legB });
}
const partOps = (m: StructuralModel, id: string) => solveModelToParts(m).find((p) => p.id === id)?.operations ?? [];
const cams = (ops: ReturnType<typeof partOps>) => ops.filter((o) => o.op === "drill" && (o.id ?? "").startsWith("cam_"));
const dowels = (ops: ReturnType<typeof partOps>) => ops.filter((o) => o.op === "drill" && (o.id ?? "").startsWith("dowel_"));

describe("Phase 4 polish — L-leg cam/dowel joinery", () => {
  it("leg-A gets cams on both sides + dowels into top/bottom", () => {
    const m = lModel();
    expect(cams(partOps(m, `${BID}__legA__side_l`)).length).toBe(4); // 2 ends × 2 columns
    expect(cams(partOps(m, `${BID}__legA__side_r`)).length).toBe(4);
    expect(dowels(partOps(m, `${BID}__legA__top`)).length).toBe(4); // from both sides
    expect(dowels(partOps(m, `${BID}__legA__bottom`)).length).toBe(4);
  });

  it("leg-B gets cams on its ONE side (side_r is omitted) + dowels into top/bottom", () => {
    const m = lModel();
    expect(cams(partOps(m, `${BID}__legB__side_l`)).length).toBe(4);
    expect(dowels(partOps(m, `${BID}__legB__top`)).length).toBe(2); // one side only
    expect(dowels(partOps(m, `${BID}__legB__bottom`)).length).toBe(2);
  });

  it("each leg's dowel columns use its OWN depth (not the L envelope block.box.d)", () => {
    const m = lModel();
    const aY = cams(partOps(m, `${BID}__legA__side_l`)).map((o) => o.y_mm10);
    const bY = cams(partOps(m, `${BID}__legB__side_l`)).map((o) => o.y_mm10);
    expect(Math.max(...aY)).toBeLessThanOrEqual(5600); // within legA.depth
    expect(Math.max(...bY)).toBeLessThanOrEqual(4000); // within legB.depth — block.box.d (9600) would blow past
    expect(new Set(aY)).toEqual(new Set([600, 5000])); // [INSET, legA.depth − INSET]
    expect(new Set(bY)).toEqual(new Set([600, 3400])); // [INSET, legB.depth − INSET]
  });

  it("a leg too shallow for two columns is skipped (guard), the deep leg still joins", () => {
    const m = lModel({ length_mm10: 4000, depth_mm10: 1000 }); // legB.depth 1000 < 2·600
    expect(cams(partOps(m, `${BID}__legB__side_l`)).length).toBe(0);
    expect(cams(partOps(m, `${BID}__legA__side_l`)).length).toBe(4); // legA (5600) still joins
  });
});

describe("Phase 4 polish — a rectangular block's joinery is byte-identical", () => {
  it("a rectangular carcass still gets cams on its sides + dowels into top/bottom (unchanged path)", () => {
    const m = buildCarcassModel(600, 720, 560);
    expect(cams(partOps(m, `${BID}__side_l`)).length).toBe(4);
    expect(cams(partOps(m, `${BID}__side_r`)).length).toBe(4);
    expect(dowels(partOps(m, `${BID}__top`)).length).toBe(4);
    // no leg parts on a rectangular block
    expect(partOps(m, `${BID}__legA__side_l`)).toEqual([]);
  });
});
