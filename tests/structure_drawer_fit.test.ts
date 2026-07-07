// A1 fix — a drawer body must FIT inside the carcass interior with a runner clearance each side, and
// must NOT overlap the carcass sides / dividers. The old code forgot the bounding board, so the box
// came out ~2 boards too wide and collided with the carcass. Assert the corrected geometry, and that
// the cut list (solve) agrees with the render (layout). Boundary-aware: works in a divided column too.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import { leafSections } from "../engine/contracts/structure.js";

const CLEAR = 130; // DRAWER_SLIDE_CLEAR_MM10 — runner gap each side
const B = 160; // board

function box(id: string, P: ReturnType<typeof solveLayout>) {
  const p = P.find((x) => x.id.endsWith(id))!;
  return { l: p.x_mm10, r: p.x_mm10 + p.w_mm10, w: p.w_mm10 };
}

describe("drawer body fits inside the carcass", () => {
  it("undivided: sides sit a runner clearance inside each carcass side (no overlap)", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");
    const P = solveLayout(m);
    const sideL = box("blk_main__side_l", P); // carcass left [0,160]
    const sideR = box("blk_main__side_r", P); // carcass right [5840,6000]
    const dL = box("__side_l", P.filter((p) => p.id.includes("__inst_")));
    const dR = box("__side_r", P.filter((p) => p.id.includes("__inst_")));
    // drawer left starts a clearance past the carcass inner face — no overlap
    expect(dL.l).toBe(sideL.r + CLEAR); // 160 + 130 = 290
    expect(dR.r).toBe(sideR.l - CLEAR); // 5840 - 130 = 5710
    expect(dL.l).toBeGreaterThanOrEqual(sideL.r); // never overlaps the carcass side
  });

  it("divided column: drawer clears the DIVIDER face by a runner gap (boundary-aware)", () => {
    let m = buildCarcassModel(800, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 2 });
    const leaves = leafSections(m.blocks[0]!.zones[0]!.root);
    m = addInstance(m, leaves[1]!.id, "drawer"); // right column, left bound = divider
    const P = solveLayout(m);
    const div = P.find((p) => p.id.includes("__div"))!;
    const divRightFace = div.x_mm10 + div.w_mm10;
    const dL = box("__side_l", P.filter((p) => p.id.includes("__inst_")));
    expect(dL.l).toBe(divRightFace + CLEAR); // clears the divider face, not the box-edge centreline
    expect(dL.l).toBeGreaterThanOrEqual(divRightFace); // never overlaps the divider
  });

  it("cut list (solve) agrees with the render (layout) on the body width", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");
    const back = solveStructure(m).find((p) => p.id.includes("__inst_") && p.id.endsWith("__back"))!; // drawer back innerW
    const P = solveLayout(m).filter((p) => p.id.includes("__inst_"));
    const dL = box("__side_l", P), dR = box("__side_r", P);
    const renderInnerW = dR.l - dL.r; // between the two box sides
    expect(back.length_mm10).toBe(renderInnerW); // cut list == render
  });

  it("cut list agrees with the render on the body DEPTH — sides not over-cut to full section depth", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");
    const sideCut = solveStructure(m).find((p) => p.id.endsWith("__inst_drawer_1__side_l"))!; // depth = its LENGTH
    const bottomCut = solveStructure(m).find((p) => p.id.endsWith("__inst_drawer_1__bottom"))!; // depth = its WIDTH
    const sideRender = solveLayout(m).find((p) => p.id.endsWith("__inst_drawer_1__side_l"))!; // depth = d_mm10
    // the cut side/bottom depth equals the rendered box depth (it sits behind the facade, not full depth)
    expect(sideCut.length_mm10).toBe(sideRender.d_mm10);
    expect(bottomCut.width_mm10).toBe(sideRender.d_mm10);
    // and it is strictly SHORTER than the full section depth (5600) — the old bug cut it at box.d
    expect(sideCut.length_mm10).toBeLessThan(5600);
  });
});

describe("drawer box gets back-corner joinery (C3 — no longer emitted empty)", () => {
  it("the drawer sides carry cams and the back carries dowels; holes stay in bounds", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "drawer");
    const parts = solveModelToParts(m);
    const drills = (id: string) => parts.find((p) => p.id.endsWith(id))!.operations.filter((o) => o.op === "drill");
    // each side: 2 Ø15 cams; back: 4 Ø8 dowels (two ends × two heights)
    expect(drills("__inst_drawer_1__side_l").filter((o) => (o as { diameter_mm10: number }).diameter_mm10 === 150).length).toBe(2);
    expect(drills("__inst_drawer_1__side_r").filter((o) => (o as { diameter_mm10: number }).diameter_mm10 === 150).length).toBe(2);
    expect(drills("__inst_drawer_1__back").filter((o) => (o as { diameter_mm10: number }).diameter_mm10 === 80).length).toBe(4);
    // the box is no longer emitted with zero holes, and everything passes the machining safety gate
    expect(validateParts(parts).ok).toBe(true);
  });
});
