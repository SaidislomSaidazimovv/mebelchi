// When many shelves crowd the height chain, the dimension NUMBERS used to overlap into an unreadable
// smudge (all on one side of the line, fixed 3.4 font). Now a dense chain shrinks the font to fit its
// tightest gap AND alternates labels to opposite sides of the line (text-anchor end ↔ start), so even
// 14 shelves stay legible. A sparse chain is unchanged (one side, full font).
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";
import { drawingSheetSvg } from "../apps/app/src/three/drawingSvg.js";

function sheet(shelves: number): string {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 });
  const col = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x)[0]!.id;
  for (let i = 0; i < shelves; i++) m = addInstance(m, col, "shelf");
  return drawingSheetSvg(buildBlockDrawing(solveLayout(m), solveModelToParts(m)), { firm: "M", name: "n", date: "2026-07-07" });
}

const fontSizes = (svg: string) => [...svg.matchAll(/font-size="([\d.]+)"/g)].map((mm) => Number(mm[1]));

describe("dense dimension chains stay legible", () => {
  it("a sparse chain (2 shelves): labels stay on ONE side, full 3.4 font", () => {
    const svg = sheet(2);
    // dimension labels are the red (#c00) texts; none should be flipped to the far side (start-anchored)
    const startAnchored = (svg.match(/text-anchor="start"/g) ?? []).length;
    expect(startAnchored).toBe(0);
  });

  it("a dense chain (14 shelves): labels alternate sides (stagger) AND the font shrinks", () => {
    const svg = sheet(14);
    // stagger flips odd labels to text-anchor="start" (the other side of the line)
    expect((svg.match(/text-anchor="start"/g) ?? []).length).toBeGreaterThan(3);
    // and the tightest gaps force a font below the 3.4 default (but never below the 2.2 floor)
    const dimFonts = fontSizes(svg).filter((f) => f < 3.4);
    expect(dimFonts.length).toBeGreaterThan(0);
    expect(Math.min(...fontSizes(svg))).toBeGreaterThanOrEqual(2.2);
  });
});
