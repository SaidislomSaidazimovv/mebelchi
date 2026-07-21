// Phase 7b — a material carries a thickness (ЛДСП 16 / МДФ 18 / ХДФ 3); choosing it sets the panel.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { planThickness, boardThicknessMm10 } from "../apps/app/src/three/materials.js";

const S = () => useKarkas.getState();

describe("Phase 7b — material thickness", () => {
  it("planThickness maps each role's decor to its thickness (mm10)", () => {
    const t = planThickness({ carcass: "ldsp_white", back: "hdf_white", shelf: "ldsp_white", facade: "mdf_white_matt", worktop: "worktop_postform_38", edge: "pvc_white_2" });
    expect(t.carcass).toBe(160); // 16mm ЛДСП
    expect(t.back).toBe(30); // 3mm ХДФ
    expect(t.facade).toBe(180); // 18mm МДФ
    expect(boardThicknessMm10("mdf_white_matt")).toBe(180);
  });

  it("changing the facade decor to МДФ makes facade parts 18mm", () => {
    S().setModel(buildCarcassModel(600, 720, 500));
    S().add("door");
    expect(S().parts.find((p) => p.role === "facade")!.thickness_mm10).toBe(160); // ЛДСП 16
    S().setPlanMaterial("facade", "mdf_white_matt");
    expect(S().parts.find((p) => p.role === "facade")!.thickness_mm10).toBe(180); // МДФ 18
  });

  it("a per-part material override also sets that part's thickness", () => {
    S().setModel(buildCarcassModel(600, 720, 500));
    S().add("shelf");
    const shelf = S().parts.find((p) => p.role === "internal_shelf")!;
    S().tapPart(shelf.id);
    S().setMaterial("mdf_white_matt"); // 18mm
    expect(S().parts.find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180);
  });

  it("the default plan makes the back a thin 3mm ХДФ", () => {
    S().setModel(buildCarcassModel(600, 720, 500));
    expect(S().parts.find((p) => p.role === "carcass_back")!.thickness_mm10).toBe(30);
  });
});
