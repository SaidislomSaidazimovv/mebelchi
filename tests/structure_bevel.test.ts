// M9E.1 — the soft edge. Every board's edges are eased at render time (the single biggest reason
// furniture reads as furniture, not a CAD box); a free part may override the global radius. Like every
// finish detail before it, the bevel is RENDER-ONLY: a rounded edge is a sanding pass, not a cut, so the
// panel size, the drilling, the kromka and the price are untouched. These tests pin that invariant.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const ID = "blk_main__free_top";

function cabinet(bevel_mm?: number): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const fp: FreePart = {
    id: "top", name: "Stoleshnitsa", role: "top", thicknessAxis: "y",
    box: { x: 0, y: 7200, z: 0, w: 6000, h: 300, d: 5600 },
    ...(bevel_mm !== undefined ? { bevel_mm } : {}),
  };
  return { ...m, blocks: [{ ...b, freeParts: [fp] }] };
}

describe("M9E.1 — the bevel rides to the viewport", () => {
  it("a per-part radius reaches the placement and the Board", () => {
    expect(solveLayout(cabinet(3), tk).find((p) => p.id === ID)!.bevel_mm).toBe(3);
    const board = layoutToScene(solveLayout(cabinet(3), tk)).boards.find((b) => b.id === ID)!;
    expect(board.bevel_mm).toBe(3);
  });

  it("0 is carried (a deliberately sharp edge is not the same as «unset»)", () => {
    expect(solveLayout(cabinet(0), tk).find((p) => p.id === ID)!.bevel_mm).toBe(0);
  });

  it("absent → no marker; the renderer falls back to its global default", () => {
    expect(solveLayout(cabinet(), tk).find((p) => p.id === ID)!.bevel_mm).toBeUndefined();
    expect(layoutToScene(solveLayout(cabinet(), tk)).boards.find((b) => b.id === ID)!.bevel_mm).toBeUndefined();
  });
});

describe("M9E.1 — a rounded edge changes nothing that is cut, drilled or priced", () => {
  it("the solved part is identical with and without a bevel", () => {
    const p = (bevel?: number) => JSON.stringify(solveStructure(cabinet(bevel), tk).find((x) => x.id === ID));
    expect(p(3)).toBe(p());
  });

  it("the SWJ008 file is byte-identical", () => {
    expect(exportModelToSWJ008(cabinet(3))).toBe(exportModelToSWJ008(cabinet()));
  });

  it("holes are untouched", () => {
    const ops = (m: StructuralModel) => JSON.stringify(solveModelToParts(m).find((p) => p.id === ID)!.operations);
    expect(ops(cabinet(3))).toBe(ops(cabinet()));
  });

  it("the price and panel count do not move", () => {
    const a = estimate(solveStructure(cabinet(2), tk), DEFAULT_PLAN);
    const b = estimate(solveStructure(cabinet(), tk), DEFAULT_PLAN);
    expect(a.priceUzs).toBe(b.priceUzs);
    expect(a.count).toBe(b.count);
  });

  it("the whole layout is byte-identical except the bevel marker itself", () => {
    const strip = (m: StructuralModel) => JSON.stringify(solveLayout(m, tk).map(({ bevel_mm: _b, ...p }) => p));
    expect(strip(cabinet(3))).toBe(strip(cabinet()));
  });
});
