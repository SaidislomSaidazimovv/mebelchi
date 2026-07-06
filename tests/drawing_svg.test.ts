// #3+#4 — the printable drawing sheet SVG. drawingSheetSvg wraps the three views + overall
// dimensions + a title block into one valid A4 <svg>. Assert the structural pieces are present so a
// regression (missing view, empty title block, no dimensions) is caught.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addInstance, setComponentAngle, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";
import { drawingSheetSvg } from "../apps/app/src/three/drawingSvg.js";

function svgOf() {
  let m = buildDemoModel();
  const id = m.blocks[0]!.id;
  m = resizeBlockDepth(resizeBlockHeight(resizeBlockWidth(m, id, 8000), id, 9000), id, 5000);
  const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  m = addInstance(m, leaf, "shelf");
  const inst = m.blocks[0]!.instances.find((i) => i.sectionId === leaf)!;
  m = setComponentAngle(m, inst.componentId, 20);
  return drawingSheetSvg(buildBlockDrawing(solveLayout(m)), { firm: "MEBELCHI", name: "Karkas blok", date: "2026-07-06", materials: "ЛДСП Белый", legend: ["Korpus: ЛДСП Белый", "Kromka: ПВХ 2мм"] });
}

describe("drawingSheetSvg", () => {
  const svg = svgOf();

  it("is a single valid A4 <svg> with the right viewBox", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 297 210"'); // A4 landscape mm
  });

  it("contains all three view titles", () => {
    expect(svg).toContain("OLDINDAN");
    expect(svg).toContain("USTDAN");
    expect(svg).toContain("KESIM A-A");
  });

  it("shows the overall dimensions and the title block with a materials legend", () => {
    expect(svg).toContain(">800<"); // overall width dim
    expect(svg).toContain(">900<"); // overall height dim
    expect(svg).toContain(">500<"); // overall depth dim
    expect(svg).toContain("MEBELCHI");
    expect(svg).toContain("800×900×500 mm");
    expect(svg).toContain("2026-07-06");
    expect(svg).toContain("MATERIALLAR");
    expect(svg).toContain("Korpus: ЛДСП Белый");
  });

  it("draws precise dimension chains — the demo's 400+400 column widths sum to the overall 800", () => {
    expect(svg).toContain(">400<"); // each column width (the divider splits 800 into 400 + 400)
    // more dimension texts than the 3 overalls → chains are present (per-shelf heights + columns)
    const dimTexts = (svg.match(/fill="#c00"/g) ?? []).length;
    expect(dimTexts).toBeGreaterThan(3);
  });

  it("draws panels as polygons (one per part × 3 views)", () => {
    const polys = (svg.match(/<polygon/g) ?? []).length;
    expect(polys).toBeGreaterThanOrEqual(3); // at minimum the carcass in 3 views
  });
});
