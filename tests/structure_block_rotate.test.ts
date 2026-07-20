// Block.rotY_deg — turning a whole cabinet in the room (gizmo «rotate» on a carcass panel).
// The invariant that makes it safe: a cabinet is MANUFACTURED square-on however it is turned, so the cut
// list must be byte-identical and only the 3D placement moves. The rotation is therefore applied in the
// scene layer (rotateBlockPlacements), never inside solveStructure/solveLayout.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { rotateBlockPlacements } from "../apps/app/src/three/structureScene.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { PanelPlacement } from "../engine/structure/layout.js";

const turned = (deg: number): StructuralModel => {
  const m = buildDemoModel();
  return { ...m, blocks: m.blocks.map((b, i) => (i === 0 ? { ...b, rotY_deg: deg } : b)) };
};
/** Spread of panel CENTRES along one floor axis — the cabinet's footprint as placed. */
const spread = (ps: readonly PanelPlacement[], axis: "x" | "z"): number => {
  const v = ps.map((p) => (axis === "x" ? p.x_mm10 + p.w_mm10 / 2 : p.z_mm10 + p.d_mm10 / 2));
  return Math.round(Math.max(...v) - Math.min(...v));
};

describe("Block.rotY_deg — a turned cabinet is still built square-on", () => {
  it("does NOT change the cut list", () => {
    expect(solveStructure(turned(90))).toEqual(solveStructure(buildDemoModel()));
    expect(solveStructure(turned(37))).toEqual(solveStructure(buildDemoModel()));
  });

  it("does NOT change solveLayout either — the drawing sheet stays square-on", () => {
    expect(solveLayout(turned(90))).toEqual(solveLayout(buildDemoModel()));
  });

  it("an un-turned model passes through the scene rotation untouched", () => {
    const m = buildDemoModel();
    const ps = solveLayout(m);
    expect(rotateBlockPlacements(ps, m.blocks)).toBe(ps); // same reference — no work, no garbage
  });

  it("90° swaps the footprint and stamps the angle on every panel", () => {
    const m = buildDemoModel();
    const flat = solveLayout(m);
    const rot = rotateBlockPlacements(flat, turned(90).blocks);
    expect(rot.every((p) => p.rotY_deg === 90)).toBe(true); // the body turns as one
    // a quarter turn about the vertical axis exchanges the footprint's two floor axes
    expect(spread(rot, "x")).toBe(spread(flat, "z"));
    expect(spread(rot, "z")).toBe(spread(flat, "x"));
  });

  it("orbits panel centres the same way three.js spins them (x,z) → (x·cos+z·sin, −x·sin+z·cos)", () => {
    const m = buildDemoModel();
    const b = m.blocks[0]!;
    const flat = solveLayout(m);
    const deg = 30, th = (deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const rot = rotateBlockPlacements(flat, turned(deg).blocks);
    const cx = b.box.x + b.box.w / 2, cz = b.box.z + b.box.d / 2;
    for (let i = 0; i < flat.length; i++) {
      const f = flat[i]!, r = rot[i]!;
      const dx = f.x_mm10 + f.w_mm10 / 2 - cx, dz = f.z_mm10 + f.d_mm10 / 2 - cz;
      expect(r.x_mm10 + r.w_mm10 / 2).toBeCloseTo(cx + dx * c + dz * s, 0);
      expect(r.z_mm10 + r.d_mm10 / 2).toBeCloseTo(cz - dx * s + dz * c, 0);
      expect([r.w_mm10, r.h_mm10, r.d_mm10]).toEqual([f.w_mm10, f.h_mm10, f.d_mm10]); // rigid — no scaling
    }
  });

  it("a rotated block leaves OTHER blocks alone", () => {
    const m = buildDemoModel();
    const two: StructuralModel = { ...m, blocks: [{ ...m.blocks[0]!, rotY_deg: 90 }, { ...m.blocks[0]!, id: "blk_b", box: { ...m.blocks[0]!.box, x: 99000 } }] };
    const ps = solveLayout(m).concat(solveLayout(m).map((p) => ({ ...p, id: p.id.replace(/^[^_]+/, "blk_b") })));
    const rot = rotateBlockPlacements(ps, two.blocks);
    expect(rot.filter((p) => p.id.startsWith("blk_b")).every((p) => p.rotY_deg === undefined)).toBe(true);
  });
});
