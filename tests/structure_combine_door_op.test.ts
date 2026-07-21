// Phase 2.2b — the combine/split ops. `moveInstanceToSection` moves a door instance between sections
// (updating BOTH sections' instanceIds + inst.sectionId in ONE tree pass, so a leaf→parent move — where the
// leaf is nested inside the parent — stays consistent). `parentSectionOf` finds where a combine moves to.
// combine (leaf→parent) then split (parent→first leaf) round-trips, keeping the door's other props.

import { describe, it, expect } from "vitest";

import { addInstance, divideSection, moveInstanceToSection, parentSectionOf } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel, Section } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

/** A 2-column carcass with a door on the LEFT column; returns the model + the ids we need. */
function leafDoor(): { m: StructuralModel; rootId: string; leafId: string; doorId: string } {
  let m = buildCarcassModel(600, 720, 560);
  const rootId = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, rootId, { kind: "equal", axis: "x", count: 2 });
  const leaf = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x)[0]!;
  m = addInstance(m, leaf.id, "door");
  const doorId = m.blocks[0]!.instances.find((i) => m.blocks[0]!.components.find((c) => c.id === i.componentId)?.role === "facade")!.id;
  return { m, rootId, leafId: leaf.id, doorId };
}

const sectionsOf = (m: StructuralModel): Section[] => {
  const out: Section[] = []; const stack = [...m.blocks[0]!.zones.map((z) => z.root)];
  while (stack.length) { const s = stack.pop()!; out.push(s); for (const c of s.children) stack.push(c); }
  return out;
};
const sec = (m: StructuralModel, id: string) => sectionsOf(m).find((s) => s.id === id)!;
const facadeWidth = (m: StructuralModel) => solveStructure(m, tk).find((p) => p.role === "facade" && p.id.includes("__inst_"))!.width_mm10;

describe("Phase 2.2b — parentSectionOf", () => {
  it("finds the parent of a leaf, and null for the root", () => {
    const { m, rootId, leafId } = leafDoor();
    expect(parentSectionOf(m.blocks[0]!, leafId)!.id).toBe(rootId);
    expect(parentSectionOf(m.blocks[0]!, rootId)).toBeNull();
  });
});

describe("Phase 2.2b — moveInstanceToSection (combine)", () => {
  it("moves the door from the leaf to its parent, keeping the tree consistent", () => {
    const { m, rootId, leafId, doorId } = leafDoor();
    const moved = moveInstanceToSection(m, doorId, rootId);
    expect(moved.blocks[0]!.instances.find((i) => i.id === doorId)!.sectionId).toBe(rootId); // instance re-pointed
    expect(sec(moved, leafId).instanceIds).not.toContain(doorId); // dropped from the old leaf
    expect(sec(moved, rootId).instanceIds).toContain(doorId); // added to the parent
  });

  it("the combined door then spans the FULL parent width", () => {
    const { m, rootId, doorId } = leafDoor();
    const combined = moveInstanceToSection(m, doorId, rootId);
    expect(facadeWidth(combined)).toBeGreaterThan(facadeWidth(m) * 1.8); // full width vs one column
  });

  it("is a no-op when the instance is already on the target / the target is missing", () => {
    const { m, leafId, doorId } = leafDoor();
    expect(moveInstanceToSection(m, doorId, leafId)).toBe(m); // already there
    expect(moveInstanceToSection(m, doorId, "nope")).toBe(m); // no such section
  });
});

describe("Phase 2.2b — combine → split round-trips", () => {
  it("splitting a combined door back to the first leaf restores the single-column width", () => {
    const { m, rootId, leafId, doorId } = leafDoor();
    const before = facadeWidth(m);
    const combined = moveInstanceToSection(m, doorId, rootId); // combine
    const firstLeaf = [...leafSections(sec(combined, rootId))][0]!;
    const split = moveInstanceToSection(combined, doorId, firstLeaf.id); // split back
    expect(split.blocks[0]!.instances.find((i) => i.id === doorId)!.sectionId).toBe(firstLeaf.id);
    expect(facadeWidth(split)).toBe(before); // back to one compartment — same as the original leaf door
    void leafId;
  });
});
