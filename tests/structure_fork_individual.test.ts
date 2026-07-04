// forkComponentForInstance — imos treats each placed part individually. Shelves/doors dedupe to one
// shared component on ADD, but editing one must fork it so siblings are untouched.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { addInstance, forkComponentForInstance, setComponentMaterial } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const twoShelves = (): StructuralModel => {
  let m = buildCarcassModel(600, 720, 560);
  const sec = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  m = addInstance(m, sec, "shelf");
  m = addInstance(m, sec, "shelf");
  return m;
};
const shelfInsts = (m: StructuralModel) => {
  const b = m.blocks[0]!;
  return b.instances.filter((i) => b.components.find((c) => c.id === i.componentId)?.role === "internal_shelf");
};

describe("forkComponentForInstance — individual (imos) parts", () => {
  it("two added shelves share one component (dedup on add)", () => {
    const insts = shelfInsts(twoShelves());
    expect(insts.length).toBe(2);
    expect(insts[0]!.componentId).toBe(insts[1]!.componentId);
  });

  it("forking one shelf gives it a private component; the sibling keeps the shared one", () => {
    const m = twoShelves();
    const [a, b] = shelfInsts(m);
    const f = forkComponentForInstance(m, b!.id);
    const fi = shelfInsts(f);
    expect(fi.find((i) => i.id === b!.id)!.componentId).not.toBe(a!.componentId);
    expect(fi.find((i) => i.id === a!.id)!.componentId).toBe(a!.componentId);
  });

  it("editing the forked component changes ONLY that shelf's component, not its sibling", () => {
    const m = twoShelves();
    const [a, b] = shelfInsts(m);
    const f = forkComponentForInstance(m, b!.id);
    const bCompId = shelfInsts(f).find((i) => i.id === b!.id)!.componentId;
    const aCompId = shelfInsts(f).find((i) => i.id === a!.id)!.componentId;
    const edited = setComponentMaterial(f, bCompId, "ldsp_graphite");
    const comps = edited.blocks[0]!.components;
    expect(comps.find((c) => c.id === bCompId)!.material).toBe("ldsp_graphite");
    expect(comps.find((c) => c.id === aCompId)!.material ?? null).not.toBe("ldsp_graphite");
  });

  it("forking a single (already-private) instance is a no-op — same reference", () => {
    let m = buildCarcassModel(600, 720, 560);
    const sec = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, sec, "shelf");
    expect(forkComponentForInstance(m, shelfInsts(m)[0]!.id)).toBe(m);
  });
});
