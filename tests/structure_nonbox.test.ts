// M4.1 — non-box primitives: a free part can be drawn as a cylinder (a round leg, or the hanging RAIL
// every wardrobe needs), a sphere, a tube or a wedge. The shape is RENDER-ONLY, exactly like rotY_deg:
// it rides FreePart → PanelPlacement → (app) Board → geometry, and never changes the box, so anchors,
// moving and resizing are untouched. Absent (or an explicit "box") = the flat board of before.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, PrimitiveShape, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const envelope = { x: 0, y: 0, z: 0, w: 20000, h: 20000, d: 20000 };

/** A bare block whose whole body is one free part — the M4 primitive under test. */
function model(shape?: PrimitiveShape): StructuralModel {
  const fp: FreePart = {
    id: "p", name: "Qism", role: "leg", thicknessAxis: "x",
    box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 },
    ...(shape ? { shape } : {}),
  };
  return {
    id: "t", name: "nonbox",
    blocks: [{
      id: "b", name: "B", box: envelope, bare: true,
      zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...envelope }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [], freeParts: [fp],
    }],
    parts: [],
  };
}
const placement = (shape?: PrimitiveShape) => solveLayout(model(shape), tk).find((p) => p.id.endsWith("__free_p"))!;

describe("M4.1 — the shape rides through to the placement", () => {
  it("every primitive reaches the placement unchanged", () => {
    for (const s of ["cylinder", "sphere", "tube", "wedge"] as const) {
      expect(placement(s).shape, s).toBe(s);
    }
  });

  it("the placement BOX is identical whatever the shape (render-only)", () => {
    const box = (p: { x_mm10: number; y_mm10: number; z_mm10: number; w_mm10: number; h_mm10: number; d_mm10: number }) =>
      [p.x_mm10, p.y_mm10, p.z_mm10, p.w_mm10, p.h_mm10, p.d_mm10];
    const flat = box(placement());
    for (const s of ["cylinder", "sphere", "tube", "wedge"] as const) expect(box(placement(s)), s).toEqual(flat);
  });
});

describe("M4.1 — absent / box shape is byte-identical", () => {
  it("no shape → the placement carries no shape marker", () => {
    expect(placement().shape).toBeUndefined();
  });

  it("an explicit \"box\" also carries no marker (a flat board, as before)", () => {
    expect(placement("box").shape).toBeUndefined();
  });

  it("the whole placement is identical between absent and \"box\"", () => {
    expect(placement("box")).toEqual(placement());
  });
});
