// Step 5.2 — the slot-binding engine (CONSTRUCTION_FRAME_v4 §3.2, Gate 5): opening a block whose decors
// aren't in the project's material pool must be reconciled (map-or-create), never silently grow the pool.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { planDecors, modelDecors, foreignDecors, bindBlockMaterials } from "../apps/app/src/three/slotBinding";
import { DEFAULT_PLAN, type MaterialPlan } from "../apps/app/src/three/materials";
import type { StructuralModel } from "../engine/contracts/structure.js";

// a block carrying a per-component decor override the default project pool doesn't have
const withForeign = (): StructuralModel => {
  const base = buildCarcassModel(600, 720, 560);
  return {
    ...base,
    blocks: base.blocks.map((b, i) =>
      i === 0 ? { ...b, components: [...b.components, { id: "c1", name: "Door", partIds: [], role: "facade" as const, material: "mdf_white_matt" }] } : b,
    ),
  };
};

describe("Step 5.2 — slot binding", () => {
  const pool = planDecors(DEFAULT_PLAN); // carcass/back/shelf/facade + worktop (Phase 1.2), edge excluded

  it("planDecors is the project's distinct board variables (edge excluded)", () => {
    // carcass=shelf=facade=ldsp_white, back=hdf_white, worktop=worktop_postform_38 → three distinct
    expect(pool).toEqual(["ldsp_white", "hdf_white", "worktop_postform_38"]);
  });

  it("foreignDecors flags a per-component decor the pool doesn't have (the '5th material')", () => {
    expect(foreignDecors(pool, withForeign(), DEFAULT_PLAN)).toEqual(["mdf_white_matt"]);
  });

  it("mapping a foreign decor to a pool slot leaves the pool unchanged (Gate 5)", () => {
    const bound = bindBlockMaterials(withForeign(), DEFAULT_PLAN, { mdf_white_matt: "ldsp_white" });
    expect(foreignDecors(pool, bound.model, bound.plan)).toEqual([]); // nothing foreign survives
    expect(modelDecors(bound.model, bound.plan).every((d) => pool.includes(d))).toBe(true); // ⊆ pool → no growth
    // the mapped component now cuts from the project decor, so SWJ008 Material follows the bound slot
    expect(bound.model.blocks[0]!.components.find((c) => c.id === "c1")?.material).toBe("ldsp_white");
  });

  it("KEEPING a foreign decor (null) creates a new variable — but only on the explicit choice", () => {
    const bound = bindBlockMaterials(withForeign(), DEFAULT_PLAN, { mdf_white_matt: null });
    expect(foreignDecors(pool, bound.model, bound.plan)).toEqual(["mdf_white_matt"]); // still there — kept on purpose
  });

  it("also rebinds a foreign PLAN slot, not just component overrides", () => {
    const plan: MaterialPlan = { ...DEFAULT_PLAN, facade: "mdf_white_matt" };
    expect(foreignDecors(pool, buildCarcassModel(600, 720, 560), plan)).toEqual(["mdf_white_matt"]);
    const bound = bindBlockMaterials(buildCarcassModel(600, 720, 560), plan, { mdf_white_matt: "ldsp_white" });
    expect(bound.plan.facade).toBe("ldsp_white");
  });
});
