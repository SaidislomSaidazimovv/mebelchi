// Phase 3.b — appliance fittings for the 3D mesh. `applianceFittings` derives each appliance's world-space
// box (position + real size + kind) from the INSTANCE's section box (leafSectionBoxes) + the APPLIANCE real
// dimensions — an appliance has no cut part, so it's placed off its opening, drawn at its real built-in size.

import { describe, it, expect } from "vitest";

import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN, APPLIANCE } from "../apps/app/src/three/materials.js";
import { applianceFittings } from "../apps/app/src/three/appliances.js";
import type { StructuralModel, Component, Instance, ApplianceKind } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

/** A one-bay carcass, optionally with an appliance instance bound to the root leaf section. */
function applianceModel(kind?: ApplianceKind, n = 1): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  if (!kind) return m;
  const block = m.blocks[0]!;
  const root = block.zones[0]!.root;
  const comp: Component = { id: "app_c", name: "Техника", partIds: [], role: null, appliance: kind };
  const insts: Instance[] = Array.from({ length: n }, (_, i) => ({ id: `app_i${i}`, componentId: "app_c", sectionId: root.id, anchor: { x: 0, y: 0, z: 0 }, link: "linked" as const }));
  const newRoot = { ...root, instanceIds: [...root.instanceIds, ...insts.map((i) => i.id)] };
  return { ...m, blocks: [{ ...block, components: [...block.components, comp], instances: [...block.instances, ...insts], zones: [{ ...block.zones[0]!, root: newRoot }] }] };
}

const fittingsOf = (m: StructuralModel) => applianceFittings(m, solveLayout(m, tk));

describe("Phase 3.b — applianceFittings", () => {
  it("a model with no appliance yields no fittings (empty render group)", () => {
    expect(fittingsOf(applianceModel())).toHaveLength(0);
  });

  it("an appliance instance yields one fitting with the right kind + its real built-in size (mm→m)", () => {
    const f = fittingsOf(applianceModel("oven"))[0]!;
    expect(f).toBeDefined();
    expect(f.kind).toBe("oven");
    const a = APPLIANCE.oven;
    expect(f.size[0]).toBeCloseTo(a.w_mm / 1000, 6);
    expect(f.size[1]).toBeCloseTo(a.h_mm / 1000, 6);
    expect(f.size[2]).toBeCloseTo(a.d_mm / 1000, 6);
  });

  it("each kind is sized from its own APPLIANCE row", () => {
    for (const kind of ["hob", "sink", "dishwasher", "hood", "microwave", "fridge"] as ApplianceKind[]) {
      const f = fittingsOf(applianceModel(kind))[0]!;
      expect(f.kind).toBe(kind);
      expect(f.size[1]).toBeCloseTo(APPLIANCE[kind].h_mm / 1000, 6);
    }
  });

  it("the fitting count = the number of appliance instances", () => {
    expect(fittingsOf(applianceModel("microwave", 3))).toHaveLength(3);
  });

  it("hob/sink sit HIGHER than a centred oven (top-aligned to the worktop plane)", () => {
    const oven = fittingsOf(applianceModel("oven"))[0]!;
    const hob = fittingsOf(applianceModel("hob"))[0]!;
    expect(hob.center[1]).toBeGreaterThan(oven.center[1]); // hob pinned to the section top, oven centred
  });
});
