// M3.2 — the material finish contract. A part's finish is its resolved board's `finish` (absent → matte),
// with glass PANES (role "glass") always reading as "glass". partFinishLookup mirrors partColorLookup,
// including the doubled-part base-id registration, so the renderer can pick the right PBR material per board.

import { describe, it, expect } from "vitest";

import { partFinishLookup, boardById, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

describe("M3.2 — partFinishLookup", () => {
  it("a part assigned a gloss board reports finish 'gloss'", () => {
    const f = partFinishLookup([{ id: "p1", role: "facade", materialId: "mdf_white_gloss" }], DEFAULT_PLAN);
    expect(f("p1")).toBe("gloss");
  });

  it("a glass PANE (role 'glass') reports 'glass' even with no material (existing glazed doors upgrade)", () => {
    const f = partFinishLookup([{ id: "g1", role: "glass" }], DEFAULT_PLAN);
    expect(f("g1")).toBe("glass");
  });

  it("a plain matte board reports no finish (undefined → matte)", () => {
    const f = partFinishLookup([{ id: "p2", role: "carcass_side", materialId: "ldsp_white" }], DEFAULT_PLAN);
    expect(f("p2")).toBeUndefined();
  });

  it("a doubled part registers the same finish on its base id", () => {
    const f = partFinishLookup([{ id: "d__a", role: "facade", materialId: "mirror" }], DEFAULT_PLAN);
    expect(f("d__a")).toBe("mirror");
    expect(f("d")).toBe("mirror"); // the single render board
  });
});

describe("M3.2 — finished decors carry the right finish; legacy stays matte", () => {
  it("new decors are tagged", () => {
    expect(boardById("mdf_white_gloss")?.finish).toBe("gloss");
    expect(boardById("glass_clear")?.finish).toBe("glass");
    expect(boardById("glass_frost")?.finish).toBe("frosted");
    expect(boardById("mirror")?.finish).toBe("mirror");
    expect(boardById("metal_gold")?.finish).toBe("metal");
    expect(boardById("metal_bronze")?.finish).toBe("metal");
  });

  it("legacy laminates have no finish (byte-identical matte render)", () => {
    expect(boardById("ldsp_white")?.finish).toBeUndefined();
    expect(boardById("ldsp_sonoma")?.finish).toBeUndefined();
    expect(boardById("worktop_postform_38")?.finish).toBeUndefined();
  });
});
