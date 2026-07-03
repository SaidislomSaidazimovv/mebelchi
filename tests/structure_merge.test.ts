// mergeSections — the inverse of divideSection (blocker #2, CONSTRUCTION_FRAME_v3 §9).
// Laws mirrored from divideSection: PURE (input never mutated), mm10 integers conserved.

import { describe, expect, it } from "vitest";

import { buildDemoModel } from "../engine/structure/demoModel.js";
import { divideSection, mergeSections } from "../engine/structure/operations.js";
import type { Section, StructuralModel } from "../engine/contracts/structure.js";

/** Find a section anywhere in the model by id. */
function sec(model: StructuralModel, id: string): Section {
  let hit: Section | null = null;
  const walk = (s: Section): void => {
    if (s.id === id) hit = s;
    s.children.forEach(walk);
  };
  for (const b of model.blocks) b.zones.forEach((z) => walk(z.root));
  if (!hit) throw new Error(`section not found: ${id}`);
  return hit;
}

describe("mergeSections", () => {
  it("merges all children → the parent reverts to a leaf (exact inverse of divide)", () => {
    // The demo root is split into sec_left + sec_right by ln_mid.
    const m = mergeSections(buildDemoModel(), ["sec_left", "sec_right"]);
    const root = sec(m, "sec_root");
    expect(root.children).toHaveLength(0);
    expect(root.dividers).toHaveLength(0);
    expect([...root.instanceIds].sort()).toEqual(["inst_l1", "inst_l2", "inst_r1"].sort());
    // box unchanged (union == parent extent)
    expect(root.box).toEqual({ x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 });
    // the divider line is gone from the block
    expect(m.blocks[0]!.lines.find((l) => l.id === "ln_mid")).toBeUndefined();
    // every instance now points at the surviving section
    expect(m.blocks[0]!.instances.every((i) => i.sectionId === "sec_root")).toBe(true);
  });

  it("does not mutate the input model (purity)", () => {
    const model = buildDemoModel();
    mergeSections(model, ["sec_left", "sec_right"]);
    expect(model.blocks[0]!.zones[0]!.root.children).toHaveLength(2);
    expect(model.blocks[0]!.lines.some((l) => l.id === "ln_mid")).toBe(true);
  });

  it("merges a contiguous SUBSET → one child replaces the range, outer dividers survive", () => {
    // Split the right section into 3, then merge the first two.
    let m = divideSection(buildDemoModel(), "sec_right", { kind: "equal", axis: "x", count: 3 });
    m = mergeSections(m, ["sec_right::s0", "sec_right::s1"]);
    const sr = sec(m, "sec_right");
    expect(sr.children).toHaveLength(2); // merged(s0+s1) + s2
    expect(sr.dividers).toHaveLength(1); // inner divider removed, outer kept
    const mergedChild = sr.children[0]!;
    expect(mergedChild.id).toBe("sec_right::s0");
    expect([...mergedChild.instanceIds]).toEqual(["inst_r1"]); // content preserved
    expect(m.blocks[0]!.lines.find((l) => l.id === "sec_right::d0")).toBeUndefined();
    expect(m.blocks[0]!.lines.find((l) => l.id === "sec_right::d1")).toBeDefined();
    // right section is x∈[3000,6000] split into 3 equal thirds; merging s0+s1 → x=3000, w=2000
    expect(mergedChild.box.x).toBe(3000);
    expect(mergedChild.box.w).toBe(2000);
  });

  it("divide-then-merge round-trips a leaf back to itself", () => {
    let m = divideSection(buildDemoModel(), "sec_left", { kind: "equal", axis: "x", count: 2 });
    m = mergeSections(m, ["sec_left::s0", "sec_left::s1"]);
    const left = sec(m, "sec_left");
    expect(left.children).toHaveLength(0);
    expect(left.dividers).toHaveLength(0);
    expect([...left.instanceIds].sort()).toEqual(["inst_l1", "inst_l2"].sort());
    expect(left.box).toEqual(sec(buildDemoModel(), "sec_left").box);
  });

  it("is a no-op for fewer than 2 distinct ids", () => {
    const model = buildDemoModel();
    expect(mergeSections(model, ["sec_left"])).toBe(model);
    expect(mergeSections(model, ["sec_left", "sec_left"])).toBe(model);
  });

  it("throws when the ids are not direct siblings of one parent", () => {
    expect(() => mergeSections(buildDemoModel(), ["sec_left", "sec_root"])).toThrow("MERGE_NOT_SIBLINGS");
  });

  it("throws when the merged range is not contiguous", () => {
    const m = divideSection(buildDemoModel(), "sec_right", { kind: "equal", axis: "x", count: 3 });
    expect(() => mergeSections(m, ["sec_right::s0", "sec_right::s2"])).toThrow("MERGE_NOT_CONTIGUOUS");
  });
});
