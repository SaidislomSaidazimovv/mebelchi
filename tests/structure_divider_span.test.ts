// A2 — a divider's own span must be boundary-aware, like a shelf. A NESTED divider (one inside a
// section that is itself bounded by another divider) must reach the bounding face — a full board at a
// carcass edge, half at a divider — instead of insetting a fixed 2·board and leaving an 8mm gap. Both
// the cut list (solve) and the render (layout) must agree.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection } from "../engine/structure/operations.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { leafSections } from "../engine/contracts/structure.js";

const B = 160;

describe("divider span is boundary-aware (A2)", () => {
  it("a nested horizontal divider reaches the vertical divider + carcass faces (no gap)", () => {
    let m = buildCarcassModel(800, 720, 500);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 2 });
    const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
    m = divideSection(m, cols[1]!.id, { kind: "equal", axis: "y", count: 2 }); // nested rows in the RIGHT column
    const P = solveLayout(m);
    const vDiv = P.find((p) => p.id.includes("__div") && p.h_mm10 > 2000)!; // tall = vertical divider
    const hDiv = P.find((p) => p.id.includes("__div") && p.w_mm10 > 1000 && p.h_mm10 <= 200)!; // wide+short = horizontal
    const sideR = P.find((p) => p.id.endsWith("__side_r"))!;
    expect(hDiv.x_mm10).toBe(vDiv.x_mm10 + vDiv.w_mm10); // left edge flush with the vertical divider face
    expect(hDiv.x_mm10 + hDiv.w_mm10).toBe(sideR.x_mm10); // right edge flush with the carcass side face
  });

  it("cut list (solve) agrees with the render (layout) on the nested divider width", () => {
    let m = buildCarcassModel(800, 720, 500);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 2 });
    const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
    m = divideSection(m, cols[1]!.id, { kind: "equal", axis: "y", count: 2 });
    const hDivRender = solveLayout(m).find((p) => p.id.includes("__div") && p.w_mm10 > 1000 && p.h_mm10 <= 200)!;
    const hDivPart = solveStructure(m).find((p) => p.id === hDivRender.id)!;
    expect(hDivPart.length_mm10).toBe(hDivRender.w_mm10); // cut length == render width
  });

  it("a TOP-LEVEL divider is unchanged (spans the full interior, 2·board inset)", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 2 });
    const vDiv = solveLayout(m).find((p) => p.id.includes("__div"))!;
    // vertical divider spans the full block height minus the carcass top + bottom
    expect(vDiv.h_mm10).toBe(7200 - 2 * B);
  });
});
