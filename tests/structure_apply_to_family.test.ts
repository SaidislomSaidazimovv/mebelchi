// «Apply to all identical» — the counterpart to the silent per-edit fork.
//
// Every per-part edit in the app calls `forkComponentForInstance` first, so changing one of three
// identical shelves splits that shelf onto its own component and leaves the master to repeat the same
// change on the other two. `applyToFamily` puts the family back on ONE component — the edited one — so
// the change lands on all of them at once. `componentFamily` is what makes that possible after the
// fork: the fork suffix keeps the origin in the id.

import { describe, expect, it } from "vitest";

import {
  applyToFamily,
  componentFamily,
  familyStatus,
  forkComponentForInstance,
  dissolveGroup,
  setComponentThickness,
} from "../engine/structure/operations.js";
import type { Component, Instance, StructuralModel } from "../engine/contracts/structure.js";

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

function model(instances: Instance[], components: Component[]): StructuralModel {
  return {
    id: "t",
    name: "family",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
        components,
        instances,
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const inst = (id: string, componentId = "c", extra: Partial<Instance> = {}): Instance => ({
  id,
  componentId,
  sectionId: "sec",
  anchor: { x: 0, y: 1000, z: 0 },
  link: "linked",
  ...extra,
});

const shelf = (id: string): Component => ({ id, name: "Полка", partIds: ["pA"], role: "internal_shelf" });

/** Three identical shelves sharing one component — the shape the demo cabinet actually has. */
const three = (): StructuralModel => model([inst("i1"), inst("i2"), inst("i3")], [shelf("c")]);

const blk = (m: StructuralModel) => m.blocks[0]!;
const compOf = (m: StructuralModel, instId: string): Component => {
  const b = blk(m);
  const i = b.instances.find((x) => x.id === instId)!;
  return b.components.find((c) => c.id === i.componentId)!;
};

describe("componentFamily", () => {
  it("leaves a plain id alone", () => {
    expect(componentFamily("cmp_shelf")).toBe("cmp_shelf");
  });

  it("strips the per-instance fork suffix", () => {
    expect(componentFamily("cmp_shelf__i_inst_l1")).toBe("cmp_shelf");
  });

  it("strips the dissolve suffix", () => {
    expect(componentFamily("cmp_shelf__each_2")).toBe("cmp_shelf");
  });

  it("strips a fork ON a dissolved clone (the suffixes stack)", () => {
    expect(componentFamily("cmp_shelf__each_0__i_inst_x")).toBe("cmp_shelf");
  });

  it("agrees with what forkComponentForInstance actually produces", () => {
    const forked = forkComponentForInstance(three(), "i1");
    const cid = blk(forked).instances.find((i) => i.id === "i1")!.componentId;
    expect(cid).not.toBe("c"); // it really did fork
    expect(componentFamily(cid)).toBe("c");
  });

  it("agrees with what dissolveGroup actually produces", () => {
    const each = dissolveGroup(three(), "c");
    for (const i of blk(each).instances) expect(componentFamily(i.componentId)).toBe("c");
  });
});

describe("familyStatus", () => {
  it("reports a united group of three", () => {
    expect(familyStatus(three(), "i2")).toEqual({ size: 3, united: true });
  });

  it("still counts a forked member in the family, but no longer united", () => {
    const forked = forkComponentForInstance(three(), "i1");
    expect(familyStatus(forked, "i1")).toEqual({ size: 3, united: false });
    expect(familyStatus(forked, "i2")).toEqual({ size: 3, united: false }); // seen from either side
  });

  it("reports a lone part as a family of one", () => {
    const m = model([inst("i1")], [shelf("c")]);
    expect(familyStatus(m, "i1")).toEqual({ size: 1, united: true });
  });

  it("returns null for an unknown instance", () => {
    expect(familyStatus(three(), "nope")).toBeNull();
  });

  it("does not count an unrelated component as family", () => {
    const m = model([inst("i1"), inst("i2", "other")], [shelf("c"), { ...shelf("other"), name: "Дверь" }]);
    expect(familyStatus(m, "i1")).toEqual({ size: 1, united: true });
  });
});

describe("applyToFamily — «hammasiga qo'llash»", () => {
  it("carries an edited thickness onto every identical sibling", () => {
    // exactly the app's sequence: fork on edit, then ask for it everywhere
    const forked = forkComponentForInstance(three(), "i1");
    const cid = blk(forked).instances.find((i) => i.id === "i1")!.componentId;
    const edited = setComponentThickness(forked, cid, 400);
    expect(compOf(edited, "i1").thickness_mm10).toBe(400);
    expect(compOf(edited, "i2").thickness_mm10).toBeUndefined(); // sibling untouched — the pain

    const applied = applyToFamily(edited, "i1");
    for (const id of ["i1", "i2", "i3"]) expect(compOf(applied, id).thickness_mm10).toBe(400);
  });

  it("puts the whole family back on ONE component", () => {
    const applied = applyToFamily(forkComponentForInstance(three(), "i1"), "i1");
    expect(new Set(blk(applied).instances.map((i) => i.componentId)).size).toBe(1);
    expect(familyStatus(applied, "i1")).toEqual({ size: 3, united: true });
  });

  it("drops the family's orphaned clones instead of leaving junk behind", () => {
    const forked = forkComponentForInstance(three(), "i1");
    expect(blk(forked).components).toHaveLength(2);
    const applied = applyToFamily(forked, "i1");
    expect(blk(applied).components).toHaveLength(1);
  });

  it("applies the SELECTED member's component, not the original shared one", () => {
    // i1 forks and is edited; asking from i1 must push i1's value out, not revert i1 to the old one
    const forked = forkComponentForInstance(three(), "i1");
    const cid = blk(forked).instances.find((i) => i.id === "i1")!.componentId;
    const applied = applyToFamily(setComponentThickness(forked, cid, 250), "i1");
    expect(compOf(applied, "i2").thickness_mm10).toBe(250);
  });

  it("can also pull the family onto an UNEDITED member — the undo direction", () => {
    const forked = forkComponentForInstance(three(), "i1");
    const cid = blk(forked).instances.find((i) => i.id === "i1")!.componentId;
    const edited = setComponentThickness(forked, cid, 400);
    const applied = applyToFamily(edited, "i2"); // ask from the untouched sibling
    for (const id of ["i1", "i2", "i3"]) expect(compOf(applied, id).thickness_mm10).toBeUndefined();
  });

  it("reunites a fully dissolved group", () => {
    const each = dissolveGroup(three(), "c");
    expect(new Set(blk(each).instances.map((i) => i.componentId)).size).toBe(3);
    const applied = applyToFamily(each, "i1");
    expect(new Set(blk(applied).instances.map((i) => i.componentId)).size).toBe(1);
  });

  it("clears a detached override so the applied component actually wins", () => {
    const m = model([inst("i1"), inst("i2", "c", { link: "detached", partIds: ["pOLD"] })], [shelf("c")]);
    const applied = applyToFamily(m, "i1");
    const i2 = blk(applied).instances.find((i) => i.id === "i2")!;
    expect(i2.link).toBe("linked");
    expect(i2.partIds).toBeNull();
  });

  it("never touches components outside the family", () => {
    const door = { ...shelf("door"), name: "Дверь", role: "facade" as const };
    const m = model([inst("i1"), inst("i2"), inst("d1", "door")], [shelf("c"), door]);
    const applied = applyToFamily(forkComponentForInstance(m, "i1"), "i1");
    expect(blk(applied).instances.find((i) => i.id === "d1")!.componentId).toBe("door");
    expect(blk(applied).components.find((c) => c.id === "door")).toEqual(door);
  });

  it("is a no-op (same reference) for a part with no identical siblings", () => {
    const m = model([inst("i1")], [shelf("c")]);
    expect(applyToFamily(m, "i1")).toBe(m);
  });

  it("is a no-op for an unknown instance", () => {
    const m = three();
    expect(applyToFamily(m, "nope")).toBe(m);
  });

  it("is idempotent — applying twice changes nothing further", () => {
    const once = applyToFamily(forkComponentForInstance(three(), "i1"), "i1");
    expect(applyToFamily(once, "i1")).toBe(once);
  });

  it("does not mutate the input model", () => {
    const m = forkComponentForInstance(three(), "i1");
    const snapshot = JSON.parse(JSON.stringify(m));
    applyToFamily(m, "i1");
    expect(m).toEqual(snapshot);
  });
});
