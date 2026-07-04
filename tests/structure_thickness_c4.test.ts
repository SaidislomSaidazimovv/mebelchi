// Phase C4 — per-part thickness override (imos Part Thickness).
import { describe, it, expect } from "vitest";
import { setComponentThickness, addInstance } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase C4 — per-part thickness", () => {
  it("setComponentThickness overrides a shelf's thickness in the solve", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = addInstance(m, firstLeaf(m), "shelf");
    const shelfComp = m.blocks[0]!.components.find((c) => c.role === "internal_shelf")!;
    const m2 = setComponentThickness(m, shelfComp.id, 180); // 18 mm
    expect(solveStructure(m2).find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180);
  });

  it("clearing (null) an absent override is a no-op (same reference)", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = addInstance(m, firstLeaf(m), "shelf");
    const id = m.blocks[0]!.components.find((c) => c.role === "internal_shelf")!.id;
    expect(setComponentThickness(m, id, null)).toBe(m);
  });

  it("store setThickness changes the selected shelf AND keeps the selection", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().addShelves(1);
    const shelf = useKarkas.getState().parts.find((p) => p.role === "internal_shelf")!;
    useKarkas.getState().tapPart(shelf.id);
    useKarkas.getState().setThickness(18);
    expect(useKarkas.getState().selectedId).toBe(shelf.id); // selection preserved (property edit)
    expect(useKarkas.getState().parts.find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180);
  });
});
