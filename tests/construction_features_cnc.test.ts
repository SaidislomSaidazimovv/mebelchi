// Step 4b — corner rounding + cutout become real contour mills (SWJ008 Type 3). Verifies the arc count,
// the kromka arc-perimeter, and that a LOCKED cutout offset survives a panel resize (Gate 4b).
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { roundedOutlineContour, outlinePerimeter, cutoutContour, applyFeatures } from "../engine/structure/features.js";
import type { Part } from "../engine/contracts/types.js";
import type { StructuralModel, PanelCutout } from "../engine/contracts/structure.js";

const mkPart = (id: string, length = 6000, width = 4000, thickness = 160): Part => ({
  id, name: id, width_mm10: width, length_mm10: length, thickness_mm10: thickness,
  grain: "NONE", edges: [0, 0, 0, 0], operations: [],
});

describe("Step 4b — corner rounding contour", () => {
  it("4 equal rounded corners → one outline with 4 arc segments (Gate 4b)", () => {
    const c = roundedOutlineContour("p", 6000, 4000, [150, 150, 150, 150])!;
    expect(c.op).toBe("contour");
    const arcs = c.segments.filter((s) => s.angle_deg10 !== 0);
    expect(arcs.length).toBe(4);
    expect(arcs.every((a) => Math.abs(a.angle_deg10) === 900)).toBe(true);
  });

  it("a square panel emits no outline contour", () => {
    expect(roundedOutlineContour("p", 6000, 4000, [0, 0, 0, 0])).toBeNull();
  });

  it("only the rounded corners produce arcs (mixed panel)", () => {
    const c = roundedOutlineContour("p", 6000, 4000, [150, 0, 150, 0])!;
    expect(c.segments.filter((s) => s.angle_deg10 !== 0).length).toBe(2);
  });

  it("kromka perimeter shrinks by (2r − arc) per rounded corner", () => {
    const square = outlinePerimeter(6000, 4000, [0, 0, 0, 0]);
    expect(square).toBe(2 * (6000 + 4000)); // plain box = 20000
    const r = 150;
    const perCorner = 2 * r - Math.round((Math.PI / 2) * r);
    expect(outlinePerimeter(6000, 4000, [r, r, r, r])).toBe(square - 4 * perCorner);
    expect(outlinePerimeter(6000, 4000, [r, r, r, r])).toBeLessThan(square); // arcs shorten the banded edge
  });
});

describe("Step 4b — cutout contour", () => {
  const cut: PanelCutout = { id: "sink", w_mm10: 3000, h_mm10: 2000, offset: [600, 500, 999, 500], locked: [true, false, false, false] };

  it("a locked LEFT offset survives a panel resize (Gate 4b)", () => {
    expect(cutoutContour("p", 6000, 4000, 160, cut).x_mm10).toBe(600);
    expect(cutoutContour("p", 8000, 4000, 160, cut).x_mm10).toBe(600); // panel +2000 → still 600 from left
  });

  it("a locked RIGHT offset instead tracks the right edge", () => {
    const rc: PanelCutout = { ...cut, offset: [600, 500, 600, 500], locked: [false, false, true, false] };
    expect(cutoutContour("p", 6000, 4000, 160, rc).x_mm10).toBe(6000 - 600 - 3000); // 2400
    expect(cutoutContour("p", 8000, 4000, 160, rc).x_mm10).toBe(8000 - 600 - 3000); // 4400 — holds right clearance
  });

  it("is a through-cut pocket that closes the rectangle", () => {
    const c = cutoutContour("p", 6000, 4000, 160, cut);
    expect(c.pocket).toBe(1);
    expect(c.depth_mm10).toBe(160);
    expect(c.segments.length).toBe(4);
    expect(c.segments[3]).toMatchObject({ endX_mm10: c.x_mm10, endY_mm10: c.y_mm10 }); // back to the start
  });
});

describe("Step 4b — applyFeatures", () => {
  it("appends the outline + cutout only to the featured part", () => {
    const parts = [mkPart("a"), mkPart("b")];
    const base = buildCarcassModel(600, 720, 560);
    const model: StructuralModel = {
      ...base,
      features: { a: { corners: [150, 150, 150, 150], cutouts: [{ id: "s", w_mm10: 3000, h_mm10: 2000, offset: [600, 600, 600, 600], locked: [true, false, false, true] }] } },
    };
    const out = applyFeatures(parts, model);
    expect(out[0]!.operations.length).toBe(2); // outline + one cutout
    expect(out[1]!.operations.length).toBe(0);
    expect(out[1]).toBe(parts[1]); // untouched part is the same reference (additive)
  });

  it("no features overlay → the parts list passes straight through", () => {
    const parts = [mkPart("a")];
    expect(applyFeatures(parts, buildCarcassModel(600, 720, 560))).toBe(parts);
  });
});
