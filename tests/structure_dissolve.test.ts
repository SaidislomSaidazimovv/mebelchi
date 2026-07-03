// E10 — "each differs" group dissolution (L0, v3:67; ledger #14 / surface #36). dissolveGroup gives
// every instance of a shared type its own private Component clone, so an edit to one no longer
// travels to its siblings. No-op for a component that isn't a real group (< 2 members).

import { describe, expect, it } from "vitest";

import { dissolveGroup } from "../engine/structure/operations.js";
import type { Instance, StructuralModel } from "../engine/contracts/structure.js";

function model(instances: Instance[], partIds = ["pA", "pB"]): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "dissolve",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
        components: [{ id: "c", name: "Полка", partIds, role: "internal_shelf" }],
        instances,
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const inst = (id: string, extra: Partial<Instance> = {}): Instance => ({
  id,
  componentId: "c",
  sectionId: "sec",
  anchor: { x: 0, y: 1000, z: 0 },
  link: "linked",
  ...extra,
});

describe("E10 — dissolveGroup (each differs)", () => {
  it("gives every member its own component; the shared type is gone", () => {
    const out = dissolveGroup(model([inst("i1"), inst("i2"), inst("i3")]), "c");
    const block = out.blocks[0]!;
    expect(block.components).toHaveLength(3);
    expect(block.components.some((c) => c.id === "c")).toBe(false);
    const ids = new Set(block.instances.map((i) => i.componentId));
    expect(ids.size).toBe(3); // three distinct private types
    for (const i of block.instances) {
      expect(i.link).toBe("linked");
      expect(i.partIds).toBeNull();
    }
  });

  it("is a no-op for a unique part (single member)", () => {
    const m = model([inst("i1")]);
    expect(dissolveGroup(m, "c")).toBe(m);
  });

  it("preserves a detached member's private snapshot into its clone", () => {
    const out = dissolveGroup(model([inst("i1"), inst("i2", { link: "detached", partIds: ["custom"] })]), "c");
    const block = out.blocks[0]!;
    const i2 = block.instances.find((i) => i.id === "i2")!;
    const clone = block.components.find((c) => c.id === i2.componentId)!;
    expect(clone.partIds).toEqual(["custom"]); // divergence kept
  });

  it("throws for an unknown component", () => {
    expect(() => dissolveGroup(model([inst("i1"), inst("i2")]), "nope")).toThrow("DISSOLVE_COMPONENT_NOT_FOUND");
  });
});
