// Phase C3 — numeric divide (N equal) + shelf count (imos AS_O_Number).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections, type StructuralModel } from "../engine/contracts/structure.js";

const leaves = (m: StructuralModel) => m.blocks.flatMap((b) => b.zones).reduce((n, z) => n + leafSections(z.root).length, 0);

describe("Phase C3 — numeric divide + shelf count", () => {
  it("divideBy splits the section into N equal leaves", () => {
    useKarkas.getState().setModel(buildCarcassModel(800, 2000, 500));
    const before = leaves(useKarkas.getState().model);
    useKarkas.getState().divideBy("x", 4);
    expect(leaves(useKarkas.getState().model)).toBe(before + 3); // 1 leaf → 4
  });

  it("divideBy clamps a count below 2 up to 2", () => {
    useKarkas.getState().setModel(buildCarcassModel(800, 2000, 500));
    const before = leaves(useKarkas.getState().model);
    useKarkas.getState().divideBy("y", 1);
    expect(leaves(useKarkas.getState().model)).toBe(before + 1); // clamped → 2 leaves
  });

  it("addShelves adds exactly N shelves at once (one undo step)", () => {
    useKarkas.getState().setModel(buildCarcassModel(800, 2000, 500));
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().addShelves(5);
    expect(useKarkas.getState().parts.length).toBe(before + 5);
    expect(useKarkas.getState().canUndo()).toBe(true);
    useKarkas.getState().undo();
    expect(useKarkas.getState().parts.length).toBe(before); // all five revert together
  });
});
