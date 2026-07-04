// Phase 5.C.5 — SWJ008 Material attribute from a caller-supplied role→decor map.
import { describe, it, expect } from "vitest";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";

describe("Phase 5.C.5 — SWJ008 material naming", () => {
  it("default export leaves Material empty (golden-safe, no decor leaks)", () => {
    const s = exportModelToSWJ008(buildDemoModel());
    expect(s).toContain('Material=""');
    expect(s).not.toContain("ЛДСП");
    expect(s).not.toContain("ХДФ");
  });

  it("with a role→decor map, panels carry the chosen material names", () => {
    const map = {
      carcass_side: "ЛДСП Белый",
      carcass_top: "ЛДСП Белый",
      carcass_bottom: "ЛДСП Белый",
      carcass_back: "ХДФ Белый (задняя)",
      internal_shelf: "ЛДСП Белый",
      facade: "МДФ Белый мат",
    };
    const s = exportModelToSWJ008(buildDemoModel(), {}, map);
    expect(s).toContain('Material="ЛДСП Белый"'); // carcass sides
    expect(s).toContain('Material="ХДФ Белый (задняя)"'); // the thin back
    expect(s).not.toContain('Material=""'); // every part in the demo is role-tagged → all named
  });
});
