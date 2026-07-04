// Placement/delete — removeInstance + store.remove (delete a placed shelf/door/drawer).
import { describe, it, expect } from "vitest";
import { removeInstance, addInstance } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("delete instance", () => {
  it("removeInstance drops the instance and its section id, and un-emits its part", () => {
    let m = buildCarcassModel(600, 720, 500);
    m = addInstance(m, firstLeaf(m), "shelf");
    const inst = m.blocks[0]!.instances[0]!;
    const before = solveStructure(m).length;
    const m2 = removeInstance(m, inst.id);
    expect(m2.blocks[0]!.instances.length).toBe(0);
    expect(leafSections(m2.blocks[0]!.zones[0]!.root)[0]!.instanceIds).not.toContain(inst.id);
    expect(solveStructure(m2).length).toBe(before - 1);
  });

  it("unknown id is a no-op (same reference blocks)", () => {
    const m = buildCarcassModel(600, 720, 500);
    const m2 = removeInstance(m, "nope");
    expect(m2.blocks[0]).toBe(m.blocks[0]);
  });

  it("store.remove deletes the selected shelf", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 500));
    useKarkas.getState().add("shelf");
    const shelf = useKarkas.getState().parts.find((p) => p.role === "internal_shelf")!;
    useKarkas.getState().tapPart(shelf.id);
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().remove();
    expect(useKarkas.getState().parts.length).toBe(before - 1);
    expect(useKarkas.getState().parts.some((p) => p.role === "internal_shelf")).toBe(false);
  });

  it("store.remove is a no-op when a carcass panel (no instance) is selected", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 500));
    const side = useKarkas.getState().parts.find((p) => p.role === "carcass_side")!;
    useKarkas.getState().tapPart(side.id);
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().remove();
    expect(useKarkas.getState().parts.length).toBe(before); // carcass sides aren't deletable
  });
});
