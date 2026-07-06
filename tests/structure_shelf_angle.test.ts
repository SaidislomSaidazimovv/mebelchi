// Feature #1 — inclined shelf (imos AS_O_Angle · "qiya polka"). Setting a shelf's angle must tilt
// its RENDER (a rotX carried through PanelPlacement → Board) WITHOUT changing its cut geometry: the
// board stays the same rectangle so the cut list / pricing / CNC are byte-identical. A flat shelf
// (no angle) must be unchanged from before — the field is purely additive.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance, setComponentAngle, shelfMaxAngleDeg } from "../engine/structure/operations.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { leafSections } from "../engine/contracts/structure.js";

/** Add a shelf and return [model, shelf instance id, its component id]. */
function withShelf() {
  let m = buildDemoModel();
  const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  m = addInstance(m, leaf, "shelf");
  const inst = m.blocks[0]!.instances.find((i) => i.sectionId === leaf)!;
  return { m, instId: inst.id, compId: inst.componentId };
}

describe("inclined shelf (angle_deg)", () => {
  it("a flat shelf carries NO rotX_deg (unchanged from before)", () => {
    const { m, instId } = withShelf();
    const p = solveLayout(m).find((x) => x.id.endsWith(`__inst_${instId}`))!;
    expect(p).toBeTruthy();
    expect(p.rotX_deg).toBeUndefined();
  });

  it("setting an angle carries rotX_deg onto the shelf's placement (clamped to fit)", () => {
    const s = withShelf();
    const m = setComponentAngle(s.m, s.compId, 30);
    const inst = m.blocks[0]!.instances.find((i) => i.id === s.instId)!;
    const expected = Math.min(30, shelfMaxAngleDeg(m.blocks[0]!, inst));
    const p = solveLayout(m).find((x) => x.id.endsWith(`__inst_${s.instId}`))!;
    expect(p.rotX_deg).toBe(expected);
  });

  it("does NOT change the shelf's cut geometry — a tilted board is the same rectangle", () => {
    const s = withShelf();
    const flatPart = solveStructure(s.m).find((p) => p.id.endsWith(`__inst_${s.instId}`))!;
    const tilted = setComponentAngle(s.m, s.compId, 25);
    const tiltPart = solveStructure(tilted).find((p) => p.id.endsWith(`__inst_${s.instId}`))!;
    // same length/width/thickness/role/edges — only the render orientation differs
    expect({ ...tiltPart }).toEqual({ ...flatPart });
  });

  it("clamps to 0..45 and drops the field at 0 (flatten)", () => {
    const s = withShelf();
    const tilted = setComponentAngle(s.m, s.compId, 90); // over-range → clamps to 45
    expect(tilted.blocks[0]!.components.find((c) => c.id === s.compId)!.angle_deg).toBe(45);
    const flat = setComponentAngle(tilted, s.compId, 0); // → field removed
    expect(flat.blocks[0]!.components.find((c) => c.id === s.compId)!.angle_deg).toBeUndefined();
  });

  it("no-op returns the SAME model reference when the angle is unchanged", () => {
    const s = withShelf();
    expect(setComponentAngle(s.m, s.compId, 0)).toBe(s.m); // already flat → identical ref
  });

  it("the scene Board carries the tilt in radians for the renderer", () => {
    const s = withShelf();
    const m = setComponentAngle(s.m, s.compId, 45);
    const scene = layoutToScene(solveLayout(m));
    const board = scene.boards.find((b) => b.id.endsWith(`__inst_${s.instId}`))!;
    // a deep demo shelf can't take a full 45°, so the render is clamped to what fits its bay
    const inst = m.blocks[0]!.instances.find((i) => i.id === s.instId)!;
    const max = shelfMaxAngleDeg(m.blocks[0]!, inst);
    expect(board.rotX).toBeCloseTo((Math.min(45, max) * Math.PI) / 180, 6);
  });
});

describe("containment — a tilted shelf never pokes out of the carcass", () => {
  it("shelfMaxAngleDeg limits a deep shelf below the requested angle", () => {
    const s = withShelf();
    const inst = s.m.blocks[0]!.instances.find((i) => i.id === s.instId)!;
    const max = shelfMaxAngleDeg(s.m.blocks[0]!, inst);
    expect(max).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(45); // full-depth shelf in a normal bay can't reach 45°
  });

  it("the RENDER angle is clamped to the fit even when a larger angle is stored", () => {
    const s = withShelf();
    const m = setComponentAngle(s.m, s.compId, 45); // ask for the max
    const inst = m.blocks[0]!.instances.find((i) => i.id === s.instId)!;
    const max = shelfMaxAngleDeg(m.blocks[0]!, inst);
    const p = solveLayout(m).find((x) => x.id.endsWith(`__inst_${s.instId}`))!;
    expect(p.rotX_deg).toBeLessThanOrEqual(max); // render never exceeds what fits
    expect(p.rotX_deg).toBeLessThanOrEqual(45);
  });

  it("a fully-fitting small angle renders exactly as requested (not over-clamped)", () => {
    const s = withShelf();
    const inst0 = s.m.blocks[0]!.instances.find((i) => i.id === s.instId)!;
    const max = shelfMaxAngleDeg(s.m.blocks[0]!, inst0);
    const ask = Math.max(1, Math.min(5, max)); // a small angle that certainly fits
    const m = setComponentAngle(s.m, s.compId, ask);
    const p = solveLayout(m).find((x) => x.id.endsWith(`__inst_${s.instId}`))!;
    expect(p.rotX_deg).toBe(ask);
  });

  it("a non-shelf component is unconstrained (returns 45)", () => {
    let m = buildDemoModel();
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "door");
    const block = m.blocks[0]!;
    const roleOf = (i: (typeof block.instances)[number]) =>
      block.components.find((c) => c.id === i.componentId)?.role;
    const door = block.instances.find((i) => roleOf(i) === "facade")!;
    expect(shelfMaxAngleDeg(block, door)).toBe(45);
  });
});
