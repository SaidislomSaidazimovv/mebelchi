// Step 5 — the materials-view helpers: the legend of distinct decors in use, and the render-board →
// material lookup that drives the isolate filter. Pure functions over a part list + material plan.
import { describe, it, expect } from "vitest";
import { projectMaterials, materialIdLookup, DEFAULT_PLAN } from "../apps/app/src/three/materials";

describe("Step 5 — materials view helpers", () => {
  it("projectMaterials lists distinct decors with a panel count (glass excluded)", () => {
    const parts = [
      { id: "a", role: "carcass_side" }, // → carcass decor (ldsp_white)
      { id: "b", role: "carcass_top" }, // → ldsp_white
      { id: "c", role: "facade", materialId: "ldsp_wenge" }, // per-part override
      { id: "d", role: "glass" }, // not a board decor → excluded
    ];
    const mats = projectMaterials(parts, DEFAULT_PLAN);
    expect(mats.find((m) => m.id === "ldsp_white")?.count).toBe(2);
    expect(mats.find((m) => m.id === "ldsp_wenge")?.count).toBe(1);
    expect(mats.reduce((s, m) => s + m.count, 0)).toBe(3); // glass added nothing
  });

  it("materialIdLookup maps a render board id (and its layout base) to its material id", () => {
    const look = materialIdLookup([{ id: "x__a", role: "facade", materialId: "ldsp_wenge" }], DEFAULT_PLAN);
    expect(look("x__a")).toBe("ldsp_wenge"); // exact manufacturing id
    expect(look("x")).toBe("ldsp_wenge"); // layout base id (doubled → single render board)
    expect(look("nope")).toBeUndefined();
  });
});
