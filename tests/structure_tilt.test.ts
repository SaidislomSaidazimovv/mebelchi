// M8.1 — tilt on all three axes. Until now a free part could only turn about the vertical axis, so
// nothing slanted could be built at all: no A-frame, no ladder shelf, no pitched roof, no reclined back.
// The tilt is RENDER-ONLY — a leaning board is the same cut panel — and a tilted part is deliberately
// kept out of the M5 dowel joinery, because those contacts come from axis-aligned boxes and a 3-axis
// router can only bore perpendicular to a face. These tests pin both halves.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel, buildTable } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const ID = "blk_main__free_rafter";

/** The demo cabinet plus one free board, optionally leaning. */
function cabinet(tilt: Partial<Pick<FreePart, "rotX_deg" | "rotY_deg" | "rotZ_deg">> = {}): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const fp: FreePart = {
    id: "rafter", name: "Qiya taxta", role: "panel", thicknessAxis: "y",
    box: { x: 0, y: 3000, z: 0, w: 12000, h: 180, d: 1000 },
    ...tilt,
  };
  return { ...m, blocks: [{ ...b, freeParts: [fp] }] };
}

describe("M8.1 — a tilt rides to the viewport and nowhere else", () => {
  it("both new axes reach the placement", () => {
    const p = solveLayout(cabinet({ rotX_deg: 30, rotZ_deg: 15 }), tk).find((x) => x.id === ID)!;
    expect(p.rotX_deg).toBe(30);
    expect(p.rotZ_deg).toBe(15);
  });

  it("all three axes can be set at once", () => {
    const p = solveLayout(cabinet({ rotX_deg: 10, rotY_deg: 20, rotZ_deg: 30 }), tk).find((x) => x.id === ID)!;
    expect([p.rotX_deg, p.rotY_deg, p.rotZ_deg]).toEqual([10, 20, 30]);
  });

  it("the scene converts the tilt to radians for the renderer", () => {
    const scene = layoutToScene(solveLayout(cabinet({ rotZ_deg: 90 }), tk));
    const board = scene.boards.find((b) => b.id === ID)!;
    expect(board.rotZ).toBeCloseTo(Math.PI / 2, 6);
  });

  it("the placement BOX is untouched — a leaning board is the same board", () => {
    const box = (t?: Parameters<typeof cabinet>[0]) => {
      const p = solveLayout(cabinet(t), tk).find((x) => x.id === ID)!;
      return [p.x_mm10, p.y_mm10, p.z_mm10, p.w_mm10, p.h_mm10, p.d_mm10];
    };
    expect(box({ rotX_deg: 37, rotZ_deg: 12 })).toEqual(box());
  });
});

describe("M8.1 — the cut list, the price and the CNC file never see a tilt", () => {
  it("the solved part is identical with and without a tilt", () => {
    const parts = (t?: Parameters<typeof cabinet>[0]) => JSON.stringify(solveStructure(cabinet(t), tk).find((p) => p.id === ID));
    expect(parts({ rotX_deg: 45 })).toBe(parts());
  });

  it("the SWJ008 file is byte-identical", () => {
    expect(exportModelToSWJ008(cabinet({ rotX_deg: 45, rotZ_deg: 20 }))).toBe(exportModelToSWJ008(cabinet()));
  });

  it("the price and panel count are unchanged", () => {
    const tilted = estimate(solveStructure(cabinet({ rotZ_deg: 25 }), tk), DEFAULT_PLAN);
    const flat = estimate(solveStructure(cabinet(), tk), DEFAULT_PLAN);
    expect(tilted.priceUzs).toBe(flat.priceUzs);
    expect(tilted.count).toBe(flat.count);
  });

  it("no tilt → the fields are absent, not zero (byte-identical to before M8.1)", () => {
    const p = solveLayout(cabinet(), tk).find((x) => x.id === ID)!;
    expect(p.rotX_deg).toBeUndefined();
    expect(p.rotZ_deg).toBeUndefined();
  });
});

describe("M8.1 — a tilted part is kept out of the dowel joinery (a router bores perpendicular only)", () => {
  /** A table whose legs meet the top: M5 normally dowels every one of them. */
  const table = (tilt?: number): StructuralModel => {
    const m = buildTable(1200, 750, 700);
    const b = m.blocks[0]!;
    return tilt === undefined ? m : {
      ...m,
      blocks: [{ ...b, freeParts: b.freeParts!.map((f) => (f.id === "leg_fl" ? { ...f, rotZ_deg: tilt } : f)) }],
    };
  };
  const dowels = (m: StructuralModel, idEnd: string) =>
    solveModelToParts(m).find((p) => p.id.endsWith(idEnd))!.operations.filter((o) => o.id.startsWith("fdowel_"));

  it("upright, the leg is dowelled as before", () => {
    expect(dowels(table(), "__free_leg_fl").length).toBe(2);
  });

  it("tilted, that leg gets NO dowels — the joint is marked and bored by hand", () => {
    expect(dowels(table(20), "__free_leg_fl").length).toBe(0);
  });

  it("the other three legs are untouched — only the pair containing the tilted part is skipped", () => {
    for (const leg of ["__free_leg_fr", "__free_leg_bl", "__free_leg_br"]) {
      expect(dowels(table(20), leg).length, leg).toBe(2);
    }
  });

  it("the top loses only that leg's two holes (8 → 6), never more", () => {
    expect(dowels(table(), "__free_top").length).toBe(8);
    expect(dowels(table(20), "__free_top").length).toBe(6);
  });
});
