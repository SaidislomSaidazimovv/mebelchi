// Step 1.1 + 2.1 (CONSTRUCTION_FRAME_v4 §3, §4) — the variable system + per-zone division rule are
// additive model shapes that round-trip through JSON. Nothing here changes existing behaviour: the new
// fields are optional, so a pre-v4 model (no variables, no zone rules) is still valid.
import { describe, it, expect } from "vitest";
import type { StructuralModel, Furniture, Space, Section } from "../engine/contracts/structure.js";
import type { MaterialVar, KromkaVar, JointProfile, DivisionRule } from "../engine/contracts/variables.js";
import { DEFAULT_DIVISION_RULE } from "../engine/contracts/variables.js";

const materialVars: MaterialVar[] = [
  { id: "mv_a", label: "A", role: "fasad", sku: "mdf_white_matt", thickness_mm10: 180, pricePerM2: 120000, color: "#f2efe9" },
  { id: "mv_b", label: "B", role: "korpus", sku: "ldsp_white", thickness_mm10: 160, pricePerM2: 85000, color: "#e7ddc9" },
  { id: "mv_c", label: "C", role: "orqa", sku: "hdf_white", thickness_mm10: 30, color: "#d8d2c4" },
];
const kromkaVars: KromkaVar[] = [
  { id: "kv_1", label: "K1", sku: "pvc_white_2", thickness_mm10: 20, pattern: "solid", color: "#ffffff" },
  { id: "kv_2", label: "K2", sku: "abs_05", thickness_mm10: 5, color: "#eeeeee" },
];
const jointProfile: JointProfile = {
  id: "jp_shop", camSku: "minifix_15", camSeatDepth_mm10: 125, dowelSku: "dowel_8x30",
  system32: { pitch_mm10: 320, frontSetback_mm10: 915, backSetback_mm10: 915 }, minEdgeMargin_mm10: 500,
};

// all four DivisionRule kinds, carried by four child zones
const rules: DivisionRule[] = [
  { kind: "fixed", mm10: 1000 },
  { kind: "ratio", weight: 0.6 },
  { kind: "locked", componentId: "cmp_sled" },
  { kind: "flex" },
];

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
const zone = (i: number, rule: DivisionRule): Section => ({
  id: `z${i}`, box, dividers: [], children: [], instanceIds: [], purpose: null, rule,
});
const root: Section = { id: "root", box, dividers: ["d0", "d1", "d2"], children: rules.map((rule, i) => zone(i, rule)), instanceIds: [], purpose: null };

const model: StructuralModel = {
  id: "m1", name: "Furniture with variables", parts: [], materialVars, kromkaVars, jointProfile,
  blocks: [{
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root }],
    components: [], instances: [], lines: [], rows: [],
  }],
};

describe("Step 1.1/2.1 — variable system + per-zone division rules (v4 §3, §4)", () => {
  it("a Furniture with 3 material vars + 2 kromka vars + all 4 rule types round-trips through JSON", () => {
    const loaded = JSON.parse(JSON.stringify(model)) as StructuralModel;
    expect(loaded).toEqual(model); // deep-equal after save→load
    expect(loaded.materialVars).toHaveLength(3);
    expect(loaded.kromkaVars).toHaveLength(2);
    expect(loaded.jointProfile?.system32.frontSetback_mm10).toBe(915);
    // all four rule kinds survived on the child zones
    expect(loaded.blocks[0]!.zones[0]!.root.children.map((c) => c.rule?.kind)).toEqual(["fixed", "ratio", "locked", "flex"]);
  });

  it("the variable + rule fields are OPTIONAL — a pre-v4 model (no vars, no zone rules) is still valid", () => {
    const legacy: StructuralModel = { id: "m0", name: "legacy", parts: [], blocks: [] };
    const loaded = JSON.parse(JSON.stringify(legacy)) as StructuralModel;
    expect(loaded).toEqual(legacy);
    expect(loaded.materialVars).toBeUndefined();
  });

  it("the default division rule is Flex (leftover-absorbing, never over-constrains)", () => {
    expect(DEFAULT_DIVISION_RULE).toEqual({ kind: "flex" });
  });

  it("v4 terminology aliases resolve: a Space IS a Section, a Furniture IS a StructuralModel", () => {
    const space: Space = root.children[0]!; // Space === Section
    const furniture: Furniture = model; // Furniture === StructuralModel
    expect(space.rule?.kind).toBe("fixed");
    expect(furniture.blocks).toHaveLength(1);
  });
});
