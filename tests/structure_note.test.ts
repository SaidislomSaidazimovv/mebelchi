// M7.3 — the usta's own words on a part («kromka faqat oldi», «mijozning taxtasi»). Today he writes
// them on paper and they are lost by the time the panel reaches the saw. A note is DOCUMENTATION: it
// must reach the cut list and the printed drawing, and it must change nothing else — not a size, not a
// hole, not a som of the price. These tests pin both halves of that.

import { describe, it, expect } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { setComponentNote } from "../engine/structure/operations.js";
import { buildCarcassModel, buildDemoModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { drawingSheetSvg } from "../apps/app/src/three/drawingSvg.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
/** A REAL drawing of the demo cabinet — a hand-made fixture would not prove the sheet still renders. */
const drawing = () => buildBlockDrawing(solveLayout(buildDemoModel(), tk), solveStructure(buildDemoModel(), tk));
const ID = "blk_main__free_shelf";

/** The demo cabinet plus one free board, optionally carrying a note. */
function cabinet(note?: string): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const fp: FreePart = {
    id: "shelf", name: "Ustki taxta", role: "shelf", thicknessAxis: "y",
    box: { x: 0, y: 3000, z: 0, w: 5000, h: 160, d: 4000 },
    ...(note ? { note } : {}),
  };
  return { ...m, blocks: [{ ...b, freeParts: [fp] }] };
}

describe("M7.3 — a note reaches the part, the cut list and the drawing", () => {
  it("the solved part carries it", () => {
    expect(solveStructure(cabinet("kromka faqat oldi"), tk).find((p) => p.id === ID)!.note).toBe("kromka faqat oldi");
  });

  it("the cut-list row carries it", () => {
    const row = estimate(solveStructure(cabinet("mijozning taxtasi"), tk), DEFAULT_PLAN).parts.find((p) => p.id === ID)!;
    expect(row.note).toBe("mijozning taxtasi");
  });

  it("the printed A4 sheet prints it under «IZOHLAR»", () => {
    const svg = drawingSheetSvg(
      drawing(),
      { firm: "MEBELCHI", name: "Karkas blok", date: "2026-07-23", notes: ["Ustki taxta — kromka faqat oldi"] },
    );
    expect(svg).toContain("IZOHLAR");
    expect(svg).toContain("kromka faqat oldi");
  });

  it("a note with an &lt;svg&gt; in it cannot break the drawing (it is escaped)", () => {
    const svg = drawingSheetSvg(
      drawing(),
      { firm: "F", name: "N", date: "d", notes: ['<script>x</script> & "quoted"'] },
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("M7.3 — a note changes NOTHING else (it is documentation, not geometry)", () => {
  it("sizes, holes and the CNC file are identical with and without a note", () => {
    const strip = (m: StructuralModel) => JSON.stringify(solveModelToParts(m).map(({ note: _n, ...p }) => p));
    expect(strip(cabinet("izoh"))).toBe(strip(cabinet()));
    expect(exportModelToSWJ008(cabinet("izoh"))).toBe(exportModelToSWJ008(cabinet()));
  });

  it("the price and the panel count are untouched", () => {
    const withNote = estimate(solveStructure(cabinet("izoh"), tk), DEFAULT_PLAN);
    const without = estimate(solveStructure(cabinet(), tk), DEFAULT_PLAN);
    expect(withNote.priceUzs).toBe(without.priceUzs);
    expect(withNote.count).toBe(without.count);
  });

  it("no note → the field is absent, not an empty string (byte-identical to before M7.3)", () => {
    expect(solveStructure(cabinet(), tk).find((p) => p.id === ID)!.note).toBeUndefined();
  });
});

describe("M7.3 — setComponentNote behaves like every other component edit", () => {
  // the demo cabinet is the one with a real component (its shelf) — a bare carcass has none
  const model = buildDemoModel();
  const compId = model.blocks[0]!.components[0]!.id;

  it("writes the note onto the component and onto every part it emits", () => {
    const next = setComponentNote(model, compId, "  zavodga aytilsin  ");
    expect(next.blocks[0]!.components[0]!.note).toBe("zavodga aytilsin"); // trimmed
    const emitted = solveStructure(next, tk).filter((p) => p.note === "zavodga aytilsin");
    expect(emitted.length).toBeGreaterThan(0);
  });

  it("clearing removes the field entirely", () => {
    const cleared = setComponentNote(setComponentNote(model, compId, "x"), compId, "");
    expect("note" in cleared.blocks[0]!.components[0]!).toBe(false);
  });

  it("re-writing the same note is a no-op — the SAME object, so no dead undo step is stacked", () => {
    const once = setComponentNote(model, compId, "x");
    expect(setComponentNote(once, compId, "x")).toBe(once);
    expect(setComponentNote(model, compId, "")).toBe(model);
  });
});
