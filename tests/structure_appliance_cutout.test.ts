// Phase 3.c — a hob/sink auto-punches a real cutout in the worktop above it. `withApplianceCutouts` derives
// a `PanelCutout` on the `__worktop` part (size = appliance − 2×20mm lip, centred on the section), which the
// existing cutout pipeline (applyFeatures → a contour pocket; the renderer → a board hole) then machines.
// Only hob/sink, only on a worktop block; nothing applies → the SAME model ref (byte-identical).

import { describe, it, expect } from "vitest";

import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveModelToParts } from "../engine/cnc.js";
import { planThickness, DEFAULT_PLAN, APPLIANCE } from "../apps/app/src/three/materials.js";
import { withApplianceCutouts } from "../apps/app/src/three/appliances.js";
import type { StructuralModel, ApplianceKind } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

/** A one-bay carcass; optionally a worktop, optionally an appliance in the root section. */
function model(opts: { worktop?: boolean; kind?: ApplianceKind }): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const block = m.blocks[0]!;
  const root = block.zones[0]!.root;
  const comp = { id: "ap_c", name: "Техника", partIds: [], role: null as null, appliance: opts.kind };
  const inst = { id: "ap_i", componentId: "ap_c", sectionId: root.id, anchor: { x: 0, y: 0, z: 0 }, link: "linked" as const };
  return {
    ...m,
    blocks: [{
      ...block,
      ...(opts.worktop ? { worktop: true } : {}),
      components: opts.kind ? [...block.components, comp] : block.components,
      instances: opts.kind ? [...block.instances, inst] : block.instances,
      zones: opts.kind ? [{ ...block.zones[0]!, root: { ...root, instanceIds: [...root.instanceIds, inst.id] } }] : block.zones,
    }],
  };
}

const worktopCuts = (m: StructuralModel) => m.features?.[`${m.blocks[0]!.id}__worktop`]?.cutouts ?? [];

describe("Phase 3.c — withApplianceCutouts", () => {
  it("a hob on a worktop block adds ONE cutout to the worktop, sized appliance − 2×20mm", () => {
    const m = withApplianceCutouts(model({ worktop: true, kind: "hob" }));
    const cuts = worktopCuts(m);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.id).toBe("appliance_ap_i");
    expect(cuts[0]!.w_mm10).toBe((APPLIANCE.hob.w_mm - 40) * 10);
    expect(cuts[0]!.h_mm10).toBe((APPLIANCE.hob.d_mm - 40) * 10);
  });

  it("a sink is cut too; an oven / dishwasher is NOT (they fill a cabinet, not the worktop)", () => {
    expect(worktopCuts(withApplianceCutouts(model({ worktop: true, kind: "sink" })))).toHaveLength(1);
    expect(worktopCuts(withApplianceCutouts(model({ worktop: true, kind: "oven" })))).toHaveLength(0);
    expect(worktopCuts(withApplianceCutouts(model({ worktop: true, kind: "dishwasher" })))).toHaveLength(0);
  });

  it("a hob with NO worktop punches nothing", () => {
    expect(worktopCuts(withApplianceCutouts(model({ kind: "hob" })))).toHaveLength(0);
  });

  it("returns the SAME model ref when nothing applies (byte-identical)", () => {
    const plain = model({ worktop: true });
    expect(withApplianceCutouts(plain)).toBe(plain); // no appliance → same ref
    const oven = model({ worktop: true, kind: "oven" });
    expect(withApplianceCutouts(oven)).toBe(oven); // oven doesn't cut → same ref
  });

  it("the cutout is centred within the worktop bounds (never off the board)", () => {
    const m = withApplianceCutouts(model({ worktop: true, kind: "hob" }));
    const cut = worktopCuts(m)[0]!;
    const [left, , , bottom] = cut.offset;
    const b = m.blocks[0]!;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + cut.w_mm10).toBeLessThanOrEqual(b.box.w); // within the length
    expect(bottom).toBeGreaterThanOrEqual(0);
  });
});

describe("Phase 3.c — the cutout flows to the machined worktop (applyFeatures)", () => {
  it("solving the augmented model gives the worktop part a contour (pocket) op", () => {
    const m = withApplianceCutouts(model({ worktop: true, kind: "hob" }));
    const wt = solveModelToParts(m, tk).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt).toBeDefined();
    expect(wt.operations.some((o) => o.op === "contour" && o.id.includes("__cut_appliance_ap_i"))).toBe(true);
  });

  it("without an appliance the worktop has NO cutout contour (byte-identical machining)", () => {
    const wt = solveModelToParts(model({ worktop: true }), tk).find((p) => p.id.endsWith("__worktop"))!;
    expect(wt.operations.some((o) => o.op === "contour")).toBe(false);
  });
});
