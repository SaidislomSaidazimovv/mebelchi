// E11 — addInstance now places doors (facade) and dividers (structural split) too, and a `doubled`
// option makes a 32mm build (L1). Before E11 only "shelf" worked; door/divider were no-ops and there
// was no way to pass the doubling flag. rail/drawer stay no-ops (hardware out of scope).

import { describe, expect, it } from "vitest";

import { addInstance } from "../engine/structure/operations.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

function base(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "add",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: [], purpose: null } }],
        components: [],
        instances: [],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const block = (m: StructuralModel) => m.blocks[0]!;
const root = (m: StructuralModel) => block(m).zones[0]!.root;

describe("E11 — addInstance door / divider / doubled", () => {
  it("adds a facade door instance", () => {
    const out = addInstance(base(), "sec", "door");
    const facade = block(out).components.find((c) => c.role === "facade")!;
    expect(facade).toBeDefined();
    expect(facade.doubled).toBeUndefined();
    const inst = block(out).instances.find((i) => i.componentId === facade.id)!;
    expect(inst).toBeDefined();
    expect(root(out).instanceIds).toContain(inst.id);
  });

  it("makes a 32mm build when doubled is set (shelf and door)", () => {
    const shelf = block(addInstance(base(), "sec", "shelf", { doubled: true })).components.find((c) => c.role === "internal_shelf")!;
    expect(shelf.doubled).toBe(true);
    const door = block(addInstance(base(), "sec", "door", { doubled: true })).components.find((c) => c.role === "facade")!;
    expect(door.doubled).toBe(true);
  });

  it("a plain shelf and a doubled shelf use separate components", () => {
    let m = addInstance(base(), "sec", "shelf");
    m = addInstance(m, "sec", "shelf", { doubled: true });
    const shelves = block(m).components.filter((c) => c.role === "internal_shelf");
    expect(shelves).toHaveLength(2); // plain + doubled, not merged onto one type
  });

  it("a divider splits the section", () => {
    const out = addInstance(base(), "sec", "divider");
    expect(root(out).children).toHaveLength(2);
  });

  it("creates a glazed-grid door when opts.glazedGrid is given (Piece 2)", () => {
    const out = addInstance(base(), "sec", "door", { glazedGrid: { lights: 3 } });
    const grid = block(out).components.find((c) => c.role === "facade" && c.glazedGrid);
    expect(grid).toBeDefined();
    expect(grid!.glazedGrid!.lights).toBe(3);
    // a plain door and a glazed-grid door are separate components
    let m = addInstance(base(), "sec", "door");
    m = addInstance(m, "sec", "door", { glazedGrid: { lights: 2 } });
    expect(block(m).components.filter((c) => c.role === "facade")).toHaveLength(2);
  });

  it("rail and drawer stay no-ops (out-of-scope hardware)", () => {
    const m = base();
    expect(addInstance(m, "sec", "rail")).toBe(m);
    expect(addInstance(m, "sec", "drawer")).toBe(m);
  });
});
