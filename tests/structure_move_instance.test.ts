// moveInstanceAnchor — slide a placed part inside its own section.
//
// A shelf spans its bay, so its X and Z are decided by the section; `anchor.y` is the only coordinate
// that belongs to the shelf itself. That makes vertical nudging the one honest drag gesture for a shelf,
// and the clamp is what stops a drag pushing it out through the carcass.

import { describe, expect, it } from "vitest";

import { moveInstanceAnchor } from "../engine/structure/operations.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { Instance, StructuralModel } from "../engine/contracts/structure.js";

const secBox = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

function model(anchorY = 2000): StructuralModel {
  const inst: Instance = {
    id: "i1",
    componentId: "c",
    sectionId: "sec",
    anchor: { x: 0, y: anchorY, z: 0 },
    link: "linked",
  };
  return {
    id: "t",
    name: "move",
    blocks: [
      {
        id: "blk",
        name: "B",
        box: { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 },
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: secBox, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Полка", partIds: ["p"], role: "internal_shelf" }],
        instances: [inst],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const anchorOf = (m: StructuralModel) => m.blocks[0]!.instances[0]!.anchor;

describe("moveInstanceAnchor", () => {
  it("moves the anchor to the requested height", () => {
    expect(anchorOf(moveInstanceAnchor(model(), "i1", "y", 3500)).y).toBe(3500);
  });

  it("leaves the other axes alone", () => {
    const a = anchorOf(moveInstanceAnchor(model(), "i1", "y", 3500));
    expect(a.x).toBe(0);
    expect(a.z).toBe(0);
  });

  it("clamps to the TOP of the section — a drag can't push a shelf through the roof", () => {
    expect(anchorOf(moveInstanceAnchor(model(), "i1", "y", 99999)).y).toBe(secBox.y + secBox.h);
  });

  it("clamps to the BOTTOM of the section", () => {
    expect(anchorOf(moveInstanceAnchor(model(), "i1", "y", -5000)).y).toBe(secBox.y);
  });

  it("rounds a fractional target (anchors are whole mm10)", () => {
    expect(anchorOf(moveInstanceAnchor(model(), "i1", "y", 1234.6)).y).toBe(1235);
  });

  it("is a no-op (same reference) when nothing changes", () => {
    const m = model(2000);
    expect(moveInstanceAnchor(m, "i1", "y", 2000)).toBe(m);
  });

  it("is a no-op for an unknown instance", () => {
    const m = model();
    expect(moveInstanceAnchor(m, "nope", "y", 3000)).toBe(m);
  });

  it("does not mutate the input model", () => {
    const m = model(2000);
    const snap = JSON.parse(JSON.stringify(m));
    moveInstanceAnchor(m, "i1", "y", 4000);
    expect(m).toEqual(snap);
  });

  it("actually moves the SOLVED shelf, not just the anchor field", () => {
    const before = solveLayout(model(2000), { carcass: 160, shelf: 160, back: 30, facade: 160 });
    const after = solveLayout(moveInstanceAnchor(model(2000), "i1", "y", 4000), { carcass: 160, shelf: 160, back: 30, facade: 160 });
    const y = (ps: ReturnType<typeof solveLayout>) => ps.find((p) => p.id.includes("inst_i1"))!.y_mm10;
    expect(y(after) - y(before)).toBe(2000);
  });
});
