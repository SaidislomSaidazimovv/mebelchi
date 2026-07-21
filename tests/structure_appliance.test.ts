// Phase 3.a — built-in appliances: an optional `Component.appliance` marking an instance as a BOUGHT
// object (oven/hob/sink/…). It emits NO cut part (an appliance isn't cut) and is counted + priced as a
// «Техника» line, mirroring how hardware is counted. Additive: an appliance-less model is byte-identical
// (no appliance parts, no line, no cost).

import { describe, it, expect } from "vitest";

import { applianceCounts, applianceEstimate } from "../apps/app/src/three/estimate.js";
import { APPLIANCE, planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import { solveStructure } from "../engine/structure/solve.js";
import type { Block, Component, Instance, StructuralModel, ApplianceKind } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

/** A block with N instances of one component, optionally an appliance of the given kind. */
function model(opts: { appliance?: ApplianceKind; n?: number }): StructuralModel {
  const n = opts.n ?? 1;
  const comp: Component = { id: "c", name: "X", partIds: [], role: null, ...(opts.appliance ? { appliance: opts.appliance } : {}) };
  const instances: Instance[] = Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" as const,
  }));
  const block: Block = {
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
    components: [comp], instances, lines: [], rows: [],
  };
  return { id: "t", name: "appliance", blocks: [block], parts: [] };
}

const ALL_KINDS: ApplianceKind[] = ["oven", "hob", "sink", "dishwasher", "hood", "microwave", "fridge"];

describe("Phase 3.a — appliance count", () => {
  it("an appliance-less model counts zero of every kind", () => {
    const c = applianceCounts(model({}));
    for (const k of ALL_KINDS) expect(c[k]).toBe(0);
  });

  it("each kind is counted on its own", () => {
    for (const k of ALL_KINDS) {
      expect(applianceCounts(model({ appliance: k }))[k]).toBe(1);
    }
  });

  it("counts PER INSTANCE — three oven instances are three ovens", () => {
    expect(applianceCounts(model({ appliance: "oven", n: 3 })).oven).toBe(3);
  });
});

describe("Phase 3.a — appliance price («Техника»)", () => {
  it("a placed appliance adds one line at the mock unit price", () => {
    const est = applianceEstimate(model({ appliance: "dishwasher" }));
    const line = est.lines.find((l) => l.name === APPLIANCE.dishwasher.name);
    expect(line).toBeDefined();
    expect(line!.qty).toBe(1);
    expect(line!.priceUzs).toBe(APPLIANCE.dishwasher.priceUzs);
    expect(est.priceUzs).toBe(APPLIANCE.dishwasher.priceUzs);
  });

  it("three ovens cost three units", () => {
    const est = applianceEstimate(model({ appliance: "oven", n: 3 }));
    expect(est.lines.find((l) => l.name === APPLIANCE.oven.name)!.priceUzs).toBe(3 * APPLIANCE.oven.priceUzs);
  });

  it("an appliance-less model has NO appliance lines and a zero «Техника» total", () => {
    const est = applianceEstimate(model({}));
    expect(est.lines).toHaveLength(0);
    expect(est.priceUzs).toBe(0);
  });
});

describe("Phase 3.a — an appliance emits NO cut part", () => {
  it("the appliance instance produces zero parts (it is bought, not cut)", () => {
    const m = model({ appliance: "fridge" });
    const parts = solveStructure(m, tk);
    // no part belongs to the appliance instance (i0) — the carcass parts exist, but nothing from __inst_i0
    expect(parts.some((p) => p.id.includes("__inst_i0"))).toBe(false);
  });

  it("adding an appliance does NOT change the cut list (byte-identical parts)", () => {
    const bare = solveStructure(model({}), tk).map((p) => p.id).sort();
    const withAppliance = solveStructure(model({ appliance: "hob" }), tk).map((p) => p.id).sort();
    expect(withAppliance).toEqual(bare); // same parts — the appliance added none
  });
});
