// lineNeighbours — which two compartments a divider sits between.
//
// Dragging a divider is the one edit where the useful number is not the dragged thing but the two bays
// either side of it. A section lists its `dividers` in the same order as the `children` they split, so
// divider i separates child i from child i+1; these tests pin that pairing (including for a 3-way split,
// where getting the index off by one would silently report the wrong bay).

import { describe, expect, it } from "vitest";

import { divideSection, extentAlong, lineNeighbours } from "../engine/structure/operations.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

function base(): StructuralModel {
  return {
    id: "t",
    name: "neighbours",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "root", box, dividers: [], children: [], instanceIds: [], purpose: null } }],
        components: [],
        instances: [],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const root = (m: StructuralModel) => m.blocks[0]!.zones[0]!.root;

describe("lineNeighbours", () => {
  it("returns null for an unknown line", () => {
    expect(lineNeighbours(base(), "nope")).toBeNull();
  });

  it("returns null when nothing is divided yet", () => {
    const m = base();
    expect(lineNeighbours(m, m.blocks[0]!.lines[0]?.id ?? "x")).toBeNull();
  });

  it("pairs a single vertical divider with the bays left and right of it", () => {
    const m = divideSection(base(), "root", { kind: "equal", axis: "x", count: 2 });
    const lineId = m.blocks[0]!.lines[0]!.id;
    const n = lineNeighbours(m, lineId);
    expect(n).not.toBeNull();
    expect(n!.axis).toBe("x");
    expect(n!.before.id).toBe(root(m).children[0]!.id);
    expect(n!.after.id).toBe(root(m).children[1]!.id);
  });

  it("the two bays' widths add up to the parent (minus the divider board)", () => {
    const m = divideSection(base(), "root", { kind: "equal", axis: "x", count: 2 });
    const n = lineNeighbours(m, m.blocks[0]!.lines[0]!.id)!;
    const sum = extentAlong(n.before.box, "x") + extentAlong(n.after.box, "x");
    expect(sum).toBeLessThanOrEqual(box.w);
    expect(sum).toBeGreaterThan(box.w - 400); // one 16mm board's worth of loss at most
  });

  it("picks the RIGHT pair in a 3-way split (an off-by-one would report the wrong bay)", () => {
    const m = divideSection(base(), "root", { kind: "equal", axis: "x", count: 3 });
    const kids = root(m).children;
    expect(kids).toHaveLength(3);
    const [d0, d1] = root(m).dividers;
    const n0 = lineNeighbours(m, d0!)!;
    const n1 = lineNeighbours(m, d1!)!;
    expect([n0.before.id, n0.after.id]).toEqual([kids[0]!.id, kids[1]!.id]);
    expect([n1.before.id, n1.after.id]).toEqual([kids[1]!.id, kids[2]!.id]);
  });

  it("finds a divider NESTED inside a child section, not just at the root", () => {
    let m = divideSection(base(), "root", { kind: "equal", axis: "x", count: 2 });
    const innerParent = root(m).children[1]!.id;
    m = divideSection(m, innerParent, { kind: "equal", axis: "y", count: 2 });
    const inner = root(m).children[1]!;
    const n = lineNeighbours(m, inner.dividers[0]!)!;
    expect(n).not.toBeNull();
    expect(n.axis).toBe("y"); // the nested split runs the other way
    expect([n.before.id, n.after.id]).toEqual([inner.children[0]!.id, inner.children[1]!.id]);
  });

  it("reports the horizontal axis for a horizontal divider", () => {
    const m = divideSection(base(), "root", { kind: "equal", axis: "y", count: 2 });
    expect(lineNeighbours(m, m.blocks[0]!.lines[0]!.id)!.axis).toBe("y");
  });
});

describe("extentAlong", () => {
  it("reads the side matching the axis", () => {
    expect(extentAlong(box, "x")).toBe(6000);
    expect(extentAlong(box, "y")).toBe(7200);
    expect(extentAlong(box, "z")).toBe(5600);
  });
});
