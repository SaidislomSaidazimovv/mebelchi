// M3.3 — the procedural texture contract. A part's texture is its resolved board's `texture` (absent →
// none); partTextureLookup mirrors partColorLookup / partFinishLookup, base-id registration and all. The
// canvas generation itself is browser-only (structureRenderer), so here we pin the DATA + the lookup.

import { describe, it, expect } from "vitest";

import { partTextureLookup, boardById, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

describe("M3.3 — partTextureLookup", () => {
  it("a part on a wood decor reports texture 'wood'", () => {
    const t = partTextureLookup([{ id: "p1", role: "facade", materialId: "wood_oak" }], DEFAULT_PLAN);
    expect(t("p1")).toBe("wood");
  });

  it("a plain laminate reports no texture (undefined)", () => {
    const t = partTextureLookup([{ id: "p2", role: "carcass_side", materialId: "ldsp_white" }], DEFAULT_PLAN);
    expect(t("p2")).toBeUndefined();
  });

  it("a doubled part registers the same texture on its base id", () => {
    const t = partTextureLookup([{ id: "d__a", role: "facade", materialId: "marble_white" }], DEFAULT_PLAN);
    expect(t("d__a")).toBe("marble");
    expect(t("d")).toBe("marble");
  });
});

describe("M3.3 — decors carry the right texture; laminates stay flat", () => {
  it("wood decors (incl. legacy Сонома/Венге) are tagged 'wood'", () => {
    expect(boardById("ldsp_sonoma")?.texture).toBe("wood");
    expect(boardById("ldsp_wenge")?.texture).toBe("wood");
    expect(boardById("wood_oak")?.texture).toBe("wood");
    expect(boardById("wood_walnut")?.texture).toBe("wood");
  });

  it("marble / leather / fabric decors carry their texture", () => {
    expect(boardById("marble_white")?.texture).toBe("marble");
    expect(boardById("marble_white")?.finish).toBe("gloss"); // marble is glossy stone
    expect(boardById("leather_brown")?.texture).toBe("leather");
    expect(boardById("fabric_grey")?.texture).toBe("fabric");
  });

  it("plain laminates have no texture (flat, byte-identical)", () => {
    expect(boardById("ldsp_white")?.texture).toBeUndefined();
    expect(boardById("mdf_white_gloss")?.texture).toBeUndefined();
  });
});
