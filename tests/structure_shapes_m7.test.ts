// M7.1 — the shape family widened from 5 to 10: an ARC (a bowed door / rounded worktop fascia), a CONE
// (the tapered leg), a HALF-CYLINDER (a rounded worktop end, a handrail), a HEXAGON post and a TORUS
// ring (a pull). They are shaped by hand or bought ready-made, never nested on a sheet — so they must
// inherit M4's treatment exactly: drawn in 3-D, listed under «Boshqa qismlar», and kept out of the cut
// list, the CNC file, the drilling and the m² price. The danger this file guards is the same one M4
// named: a filter that quietly swallows real PANELS along with the new shapes.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, PrimitiveShape, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
/** Everything M7 added. Kept as one list so a sixth shape cannot be merged without joining these tests. */
const NEW_SHAPES = ["arc", "cone", "halfCylinder", "hexagon", "torus"] as const;
const ID = "blk_main__free_x";

/** A normal 600×720×560 cabinet plus ONE free part of the shape under test. */
function cabinet(shape?: PrimitiveShape): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const part: FreePart = {
    id: "x", name: "Qism", role: "leg", thicknessAxis: "x",
    box: { x: 0, y: 0, z: 0, w: 600, h: 7000, d: 600 },
    ...(shape ? { shape } : {}),
  };
  return { ...m, blocks: [{ ...b, freeParts: [part] }] };
}

describe("M7.1 — each new shape rides through, changing nothing but how it is drawn", () => {
  for (const s of NEW_SHAPES) {
    it(`${s}: reaches the placement and the solved part`, () => {
      expect(solveLayout(cabinet(s), tk).find((p) => p.id === ID)!.shape).toBe(s);
      expect(solveStructure(cabinet(s), tk).find((p) => p.id === ID)!.shape).toBe(s);
    });
  }

  it("the placement BOX is identical whatever the shape — the envelope is what moves and resizes", () => {
    const box = (s?: PrimitiveShape) => {
      const p = solveLayout(cabinet(s), tk).find((x) => x.id === ID)!;
      return [p.x_mm10, p.y_mm10, p.z_mm10, p.w_mm10, p.h_mm10, p.d_mm10];
    };
    const flat = box();
    for (const s of NEW_SHAPES) expect(box(s), s).toEqual(flat);
  });
});

describe("M7.1 — a hand-shaped part never reaches the machine", () => {
  for (const s of NEW_SHAPES) {
    it(`${s}: out of the cut list and into «Boshqa qismlar», with no area, edge or price`, () => {
      const e = estimate(solveStructure(cabinet(s), tk), DEFAULT_PLAN);
      expect(e.parts.some((p) => p.id === ID), "must not be a cut panel").toBe(false);
      expect(e.others.map((o) => o.id)).toEqual([ID]);
      expect(e.others[0]!.areaM2).toBe(0);
      expect(e.others[0]!.edgeM).toBe(0);
      expect(e.others[0]!.priceUzs).toBe(0);
    });

    it(`${s}: no drilling, and nothing in the SWJ008 file`, () => {
      expect(solveModelToParts(cabinet(s)).find((p) => p.id === ID)!.operations).toEqual([]);
      expect(exportModelToSWJ008(cabinet(s))).not.toContain(ID);
    });
  }
});

describe("M7.1 — THE dangerous failure mode: the filter must never swallow a real panel", () => {
  const plain = () => estimate(solveStructure(buildCarcassModel(600, 720, 560), tk), DEFAULT_PLAN);

  for (const s of NEW_SHAPES) {
    it(`${s}: every carcass panel survives, and the price is the cabinet's alone`, () => {
      const e = estimate(solveStructure(cabinet(s), tk), DEFAULT_PLAN);
      expect(e.parts.map((p) => p.id).sort()).toEqual(plain().parts.map((p) => p.id).sort());
      expect(e.priceUzs).toBe(plain().priceUzs);
      expect(exportModelToSWJ008(cabinet(s))).toContain("blk_main__side_l");
    });
  }
});

describe("M7.1 — a shape absent is still byte-identical (the M4 promise holds at 10 shapes)", () => {
  it("no shape → no marker anywhere, and the free part IS cut like any board", () => {
    const p = solveStructure(cabinet(), tk).find((x) => x.id === ID)!;
    expect(p.shape).toBeUndefined();
    expect(exportModelToSWJ008(cabinet())).toContain(ID);
  });

  it("switching a new shape back to \"box\" makes it a cuttable panel again", () => {
    expect(solveLayout(cabinet("box"), tk).find((p) => p.id === ID)!.shape).toBeUndefined();
    expect(exportModelToSWJ008(cabinet("box"))).toContain(ID);
  });
});
