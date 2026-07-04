// Phase F2 — per-part material override (Component.material → Part.materialId).
import { describe, it, expect } from "vitest";
import { setComponentMaterial, addInstance } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { DEFAULT_PLAN, boardById, BOARDS } from "../apps/app/src/three/materials.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
const shelfComp = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.components.find((c) => c.role === "internal_shelf")!;

describe("Phase F2 — per-part material", () => {
  it("stamps the override decor key onto the emitted part", () => {
    let m = buildCarcassModel(600, 720, 500);
    m = addInstance(m, firstLeaf(m), "shelf");
    const m2 = setComponentMaterial(m, shelfComp(m).id, "ldsp_sonoma");
    expect(solveStructure(m2).find((p) => p.role === "internal_shelf")!.materialId).toBe("ldsp_sonoma");
  });

  it("carcass parts (no component) stay unstamped", () => {
    const m = buildCarcassModel(600, 720, 500);
    expect(solveStructure(m).find((p) => p.role === "carcass_side")!.materialId).toBeUndefined();
  });

  it("clearing (null) removes the override; no-op when already absent", () => {
    let m = buildCarcassModel(600, 720, 500);
    m = addInstance(m, firstLeaf(m), "shelf");
    const id = shelfComp(m).id;
    expect(setComponentMaterial(m, id, null)).toBe(m); // absent → no-op
    const m2 = setComponentMaterial(m, id, "ldsp_graphite");
    const m3 = setComponentMaterial(m2, id, null);
    expect(solveStructure(m3).find((p) => p.role === "internal_shelf")!.materialId).toBeUndefined();
  });

  it("estimate prices an overridden part by its decor", () => {
    let m = buildCarcassModel(600, 720, 500);
    m = addInstance(m, firstLeaf(m), "shelf");
    m = setComponentMaterial(m, shelfComp(m).id, "ldsp_wenge");
    const e = estimate(solveStructure(m), DEFAULT_PLAN);
    expect(e.byMaterial.some((g) => g.name === boardById("ldsp_wenge")!.name)).toBe(true);
  });

  it("SWJ008 carries the per-part override decor name", () => {
    let m = buildCarcassModel(600, 720, 500);
    m = addInstance(m, firstLeaf(m), "shelf");
    m = setComponentMaterial(m, shelfComp(m).id, "ldsp_wenge");
    const xml = exportModelToSWJ008(m, {}, {}, Object.fromEntries(BOARDS.map((b) => [b.id, b.name])));
    expect(xml).toContain(`Material="${boardById("ldsp_wenge")!.name}"`);
  });
});
