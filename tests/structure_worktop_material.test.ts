// Phase 1.2a — worktop material infrastructure (no geometry yet).
//
// The worktop is a NEW MaterialPlan slot with its own decor. Because MaterialPlan is saved in a
// project, an OLD plan (five slots, no worktop) must migrate on load — `withPlanDefaults` fills the
// missing slot from DEFAULT_PLAN. These tests pin the decor, the slot, and the migration.

import { describe, it, expect } from "vitest";

import { BOARDS, DEFAULT_PLAN, boardById, boardThicknessMm10, withPlanDefaults, type MaterialPlan } from "../apps/app/src/three/materials.js";

describe("Phase 1.2a — worktop material", () => {
  const worktop = BOARDS.find((b) => b.id === "worktop_postform_38");

  it("the worktop decor exists in BOARDS", () => {
    expect(worktop).toBeDefined();
    expect(worktop!.name).toBe("Столешница постформинг 38мм");
  });

  it("is 38 mm — the real product thickness, not the kitchen's visual 40", () => {
    expect(worktop!.thickness_mm).toBe(38);
    expect(boardThicknessMm10("worktop_postform_38")).toBe(380);
  });

  it("carries the area-equivalent price (185000/m ÷ 0.6 m ≈ 308333/m²)", () => {
    expect(worktop!.pricePerM2).toBe(308333);
  });

  it("DEFAULT_PLAN has a worktop slot resolving to a real board", () => {
    expect(DEFAULT_PLAN.worktop).toBe("worktop_postform_38");
    expect(boardById(DEFAULT_PLAN.worktop)).toBeDefined();
  });
});

describe("withPlanDefaults — the load migration", () => {
  it("fills a missing worktop slot from DEFAULT_PLAN (an old v1 plan)", () => {
    const oldPlan = { carcass: "ldsp_white", back: "hdf_white", shelf: "ldsp_white", facade: "ldsp_white", edge: "pvc_white_2" };
    const migrated = withPlanDefaults(oldPlan as Partial<MaterialPlan>);
    expect(migrated.worktop).toBe("worktop_postform_38");
    // the caller's chosen slots survive — only the missing one is filled
    expect(migrated.carcass).toBe("ldsp_white");
    expect(migrated.edge).toBe("pvc_white_2");
  });

  it("keeps a caller's explicit worktop choice, not the default", () => {
    const migrated = withPlanDefaults({ ...DEFAULT_PLAN, worktop: "ldsp_graphite" });
    expect(migrated.worktop).toBe("ldsp_graphite");
  });

  it("returns DEFAULT_PLAN for null/undefined", () => {
    expect(withPlanDefaults(null)).toEqual(DEFAULT_PLAN);
    expect(withPlanDefaults(undefined)).toEqual(DEFAULT_PLAN);
  });

  it("round-trips a full plan through JSON with the worktop slot intact", () => {
    const back = JSON.parse(JSON.stringify(DEFAULT_PLAN)) as MaterialPlan;
    expect(back.worktop).toBe("worktop_postform_38");
    expect(withPlanDefaults(back)).toEqual(DEFAULT_PLAN);
  });
});
