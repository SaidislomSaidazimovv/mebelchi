// M8.1b — a tilted part on the PRINTED sheet. The workshop cuts from the drawing, so a part that leans
// in the model must lean on paper too: the front view (X-Y) shows the Z tilt, the plan (X-Z) shows the Y
// turn, the side (Z-Y) keeps the X tilt it always showed.
//
// The trap this file exists for: the sheet's rotation pivot must be the SAME one the 3-D uses. A free
// part spins about its centre; an inclined carcass shelf pivots about its front-top edge (the shelf
// pins). Draw a free part about the edge and the paper quietly disagrees with the model on screen.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { buildCarcassModel, buildDemoModel } from "../engine/structure/demoModel.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const ID = "blk_main__free_slant";

function cabinet(tilt: Partial<Pick<FreePart, "rotX_deg" | "rotY_deg" | "rotZ_deg">> = {}): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const fp: FreePart = {
    id: "slant", name: "Qiya taxta", role: "panel", thicknessAxis: "y",
    box: { x: 0, y: 3000, z: 0, w: 4000, h: 180, d: 2000 },
    ...tilt,
  };
  return { ...m, blocks: [{ ...b, freeParts: [fp] }] };
}
const drawing = (t: Parameters<typeof cabinet>[0] = {}) => buildBlockDrawing(solveLayout(cabinet(t), tk));
const rectIn = (view: "front" | "plan" | "side", t: Parameters<typeof cabinet>[0]) =>
  drawing(t)[view].rects.find((r) => r.id === ID)!;

describe("M8.1b — each view carries the tilt that lies in its own plane", () => {
  it("the front view (X-Y) shows the Z tilt", () => {
    expect(rectIn("front", { rotZ_deg: 25 }).rotDeg).toBe(25);
  });

  it("the plan view (X-Z) shows the Y turn", () => {
    expect(rectIn("plan", { rotY_deg: 40 }).rotDeg).toBe(40);
  });

  it("the side view (Z-Y) still shows the X tilt, as it always did", () => {
    expect(rectIn("side", { rotX_deg: 15 }).rotDeg).toBe(15);
  });

  it("a tilt does NOT leak into a view whose plane it does not lie in", () => {
    expect(rectIn("front", { rotX_deg: 15 }).rotDeg).toBeUndefined();
    expect(rectIn("plan", { rotZ_deg: 15 }).rotDeg).toBeUndefined();
    expect(rectIn("side", { rotY_deg: 15 }).rotDeg).toBeUndefined();
  });

  it("no tilt → no rotDeg anywhere (the sheet is byte-identical to before)", () => {
    for (const v of ["front", "plan", "side"] as const) expect(rectIn(v, {}).rotDeg).toBeUndefined();
  });
});

describe("M8.1b — the sheet pivots exactly where the 3-D pivots", () => {
  // Both drawn through the real SVG renderer, then compared as polygon corner strings.
  it("a free part turns about its CENTRE: the polygon's centroid does not move", async () => {
    const { drawingSheetSvg } = await import("../apps/app/src/three/drawingSvg.js");
    const centroid = (svg: string, nth: number): [number, number] => {
      const polys = [...svg.matchAll(/points="([^"]+)"/g)].map((m) => m[1]!);
      const pts = polys[nth]!.split(" ").map((p) => p.split(",").map(Number) as [number, number]);
      return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    };
    const meta = { firm: "F", name: "N", date: "d" };
    const flat = drawingSheetSvg(drawing({}), meta);
    const tilted = drawingSheetSvg(drawing({ rotZ_deg: 30 }), meta);
    // the free part is the LAST rect of the front view in both sheets — same index, same scale
    const i = drawing({}).front.rects.findIndex((r) => r.id === ID);
    const a = centroid(flat, i), b = centroid(tilted, i);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.05); // paper-mm
  });

  it("an inclined carcass shelf still pivots about its front-top edge (unchanged behaviour)", () => {
    // the demo cabinet's shelf, given an incline through the layout's own rotX_deg path
    const d = buildBlockDrawing(solveLayout(buildDemoModel(), tk).map((p) =>
      (p.id.includes("__inst_") ? { ...p, rotX_deg: 20 } : p)));
    const shelf = d.side.rects.find((r) => r.id.includes("__inst_"))!;
    expect(shelf.rotDeg).toBe(20);
    expect(shelf.id.includes("__free_")).toBe(false); // → the edge pivot, not the centre
  });
});
