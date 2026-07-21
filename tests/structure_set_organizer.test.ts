// Phase 2.3b — the organizer picker's engine op + fork behaviour. `setComponentOrganizer` sets/clears the
// optional `Component.organizer` (a value-compared mirror of setComponentLift); the store forks the selected
// drawer first so one drawer's dividers are independent of its siblings. Proves the op, the null round-trip
// (byte-identical when cleared), sibling independence, and that a picked count flows to the cut list.

import { describe, it, expect } from "vitest";

import { setComponentOrganizer, forkComponentForInstance, addInstance, divideSection } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { Block, Component, Instance, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

/** A block with two DRAWER instances sharing one component (so a fork is meaningful). */
function twoDrawerModel(): StructuralModel {
  const comp: Component = { id: "c", name: "Ящик", partIds: [], role: null, drawer: true };
  const instances: Instance[] = [0, 1].map((i) => ({
    id: `i${i}`, componentId: "c", sectionId: "sec", anchor: { x: 0, y: 1000, z: 0 }, link: "linked" as const,
  }));
  const block: Block = {
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
    components: [comp], instances, lines: [], rows: [],
  };
  return { id: "t", name: "org", blocks: [block], parts: [] };
}

const compById = (m: StructuralModel, id: string) => m.blocks[0]!.components.find((c) => c.id === id);
const compOfInst = (m: StructuralModel, instId: string) => {
  const inst = m.blocks[0]!.instances.find((i) => i.id === instId)!;
  return compById(m, inst.componentId);
};

describe("Phase 2.3b — setComponentOrganizer", () => {
  it("sets the organizer on the component", () => {
    const m = setComponentOrganizer(twoDrawerModel(), "c", { dividers: 3, axis: "x" });
    expect(compById(m, "c")!.organizer).toEqual({ dividers: 3, axis: "x" });
  });

  it("null clears the field entirely — byte-identical to a plain drawer", () => {
    const bare = twoDrawerModel();
    const cleared = setComponentOrganizer(setComponentOrganizer(bare, "c", { dividers: 2 }), "c", null);
    expect("organizer" in compById(cleared, "c")!).toBe(false); // the KEY is gone
    expect(cleared).toEqual(bare); // whole model byte-identical
  });

  it("is a no-op (same reference) when the organizer is already that value", () => {
    const m = setComponentOrganizer(twoDrawerModel(), "c", { dividers: 2, axis: "x" });
    expect(setComponentOrganizer(m, "c", { dividers: 2, axis: "x" })).toBe(m); // value-compared, not by reference
  });

  it("ignores an unknown component id", () => {
    const bare = twoDrawerModel();
    expect(setComponentOrganizer(bare, "nope", { dividers: 2 })).toBe(bare);
  });
});

describe("Phase 2.3b — fork independence (one drawer's dividers ≠ its siblings')", () => {
  it("forking i0 then setting its organizer leaves i1's component untouched", () => {
    let m = twoDrawerModel();
    m = forkComponentForInstance(m, "i0");
    const forkedId = m.blocks[0]!.instances.find((i) => i.id === "i0")!.componentId;
    expect(forkedId).toBe("c__i_i0");
    m = setComponentOrganizer(m, forkedId, { dividers: 3 });
    expect(compOfInst(m, "i0")!.organizer).toEqual({ dividers: 3 });
    expect(compOfInst(m, "i1")!.organizer).toBeUndefined();
  });
});

describe("Phase 2.3b — the picked count flows to the cut list", () => {
  function oneDrawer(dividers?: number): StructuralModel {
    let m = buildCarcassModel(600, 720, 560);
    const root = m.blocks[0]!.zones[0]!.root.id;
    m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
    const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
    m = addInstance(m, sec.id, "drawer");
    if (dividers) m = setComponentOrganizer(m, m.blocks[0]!.components.find((c) => c.drawer)!.id, { dividers, axis: "x" });
    return m;
  }
  const divParts = (m: StructuralModel) => solveStructure(m, tk).filter((p) => p.id.includes("__org_"));

  it("a picked count of 3 → 3 divider parts in the cut list", () => {
    expect(divParts(oneDrawer(3))).toHaveLength(3);
  });

  it("no count → no divider parts (byte-identical)", () => {
    expect(divParts(oneDrawer())).toHaveLength(0);
  });
});
