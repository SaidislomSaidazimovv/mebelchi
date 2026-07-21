// Phase 3.d — the add/pick appliance flow. `addInstance(section, "appliance", { appliance })` places a
// built-in appliance (a role-null component with `appliance` set + an instance) — no cut part, counted +
// priced as one appliance. `setComponentAppliance` changes the kind or clears it. Appliances are leaf-only.

import { describe, it, expect } from "vitest";

import { addInstance, divideSection, setComponentAppliance } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure } from "../engine/structure/solve.js";
import { applianceCounts } from "../apps/app/src/three/estimate.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel, ApplianceKind } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

function withAppliance(kind: ApplianceKind): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
  return addInstance(m, sec.id, "appliance", { appliance: kind });
}
const applianceComp = (m: StructuralModel) => m.blocks[0]!.components.find((c) => c.appliance);
const applianceInst = (m: StructuralModel) => m.blocks[0]!.instances.find((i) => m.blocks[0]!.components.find((c) => c.id === i.componentId)?.appliance);

describe("Phase 3.d — addInstance appliance", () => {
  it("adds a role-null component carrying the kind + an instance in the section", () => {
    const m = withAppliance("oven");
    const comp = applianceComp(m)!;
    expect(comp.appliance).toBe("oven");
    expect(comp.role).toBeNull();
    expect(applianceInst(m)).toBeDefined();
  });

  it("emits NO cut part and counts as one appliance of that kind", () => {
    const m = withAppliance("dishwasher");
    const inst = applianceInst(m)!;
    expect(solveStructure(m, tk).some((p) => p.id.includes(`__inst_${inst.id}`))).toBe(false); // no board
    expect(applianceCounts(m).dishwasher).toBe(1);
  });

  it("reuses one component per kind — two ovens share it, a hob makes its own", () => {
    let m = withAppliance("oven");
    const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
    m = addInstance(m, sec.id, "appliance", { appliance: "oven" }); // 2nd oven
    m = addInstance(m, sec.id, "appliance", { appliance: "hob" });  // a hob
    const appComps = m.blocks[0]!.components.filter((c) => c.appliance);
    expect(appComps).toHaveLength(2); // one oven component (shared) + one hob component
    expect(applianceCounts(m).oven).toBe(2);
    expect(applianceCounts(m).hob).toBe(1);
  });

  it("is LEAF-only — adding an appliance to a divided (non-leaf) section throws", () => {
    let m = buildCarcassModel(600, 720, 560);
    const rootId = m.blocks[0]!.zones[0]!.root.id;
    m = divideSection(m, rootId, { kind: "equal", axis: "x", count: 2 });
    expect(() => addInstance(m, rootId, "appliance", { appliance: "oven" })).toThrow(/NOT_LEAF/);
  });
});

describe("Phase 3.d — setComponentAppliance", () => {
  it("changes the kind (oven → hob) and clears it (→ not an appliance)", () => {
    const m = withAppliance("oven");
    const comp = applianceComp(m)!;
    const hobbed = setComponentAppliance(m, comp.id, "hob");
    expect(hobbed.blocks[0]!.components.find((c) => c.id === comp.id)!.appliance).toBe("hob");
    const cleared = setComponentAppliance(m, comp.id, null);
    expect("appliance" in cleared.blocks[0]!.components.find((c) => c.id === comp.id)!).toBe(false);
  });

  it("is a no-op (same ref) when the kind is unchanged / the id is unknown", () => {
    const m = withAppliance("sink");
    const comp = applianceComp(m)!;
    expect(setComponentAppliance(m, comp.id, "sink")).toBe(m);
    expect(setComponentAppliance(m, "nope", "oven")).toBe(m);
  });
});
