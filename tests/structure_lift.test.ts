// Phase 2.1a — lift hinge (podyomnik): an optional `Component.lift` making a door open UPWARD on a
// mechanism instead of side hinges. A lift door counts ONE lift mechanism (priced as hardware) and NO
// side hinges, and carries no side hinge cups — so the count matches the geometry. Additive: a lift-less
// door is byte-identical (hinges as before, no lift line, no cost, its cups untouched).

import { describe, it, expect } from "vitest";

import { hardwareCounts, hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { HARDWARE, planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import { addInstance, divideSection } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Block, Component, Instance, StructuralModel, LiftType } from "../engine/contracts/structure.js";
import type { DrillOp } from "../engine/contracts/types.js";

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

/** A block with N facade instances of one component, optionally a lift. */
function model(opts: { lift?: LiftType; n?: number }): StructuralModel {
  const n = opts.n ?? 1;
  const comp: Component = { id: "c", name: "Дверь", partIds: ["p"], role: "facade", ...(opts.lift ? { lift: opts.lift } : {}) };
  const instances: Instance[] = Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, componentId: "c", sectionId: "sec", anchor: { x: 0, y: 1000, z: 0 }, link: "linked" as const,
  }));
  const block: Block = {
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
    components: [comp], instances, lines: [], rows: [],
  };
  return { id: "t", name: "lift", blocks: [block], parts: [] };
}

describe("Phase 2.1a — lift count replaces hinges", () => {
  it("a plain door counts side hinges and NO lift (byte-identical)", () => {
    const c = hardwareCounts(model({}));
    expect(c.hinges).toBeGreaterThan(0);
    expect(c.lifts).toBe(0);
  });

  it("a lift door counts ONE lift mechanism and ZERO side hinges", () => {
    const c = hardwareCounts(model({ lift: "swing" }));
    expect(c.lifts).toBe(1);
    expect(c.hinges).toBe(0); // the lift replaced the side hinges
  });

  it("each lift type counts as a lift", () => {
    expect(hardwareCounts(model({ lift: "swing" })).lifts).toBe(1);
    expect(hardwareCounts(model({ lift: "parallel" })).lifts).toBe(1);
  });

  it("counts PER INSTANCE — three lift doors are three mechanisms", () => {
    expect(hardwareCounts(model({ lift: "parallel", n: 3 })).lifts).toBe(3);
  });

  it("leaves the other hardware counts untouched (only hinges↔lifts move)", () => {
    const plain = hardwareCounts(model({}));
    const lift = hardwareCounts(model({ lift: "swing" }));
    expect({ ...lift, lifts: 0, hinges: plain.hinges }).toEqual(plain); // only lifts + hinges differ
  });
});

describe("Phase 2.1a — lift price", () => {
  it("a lift door adds a lift line at the mock price and no hinge line", () => {
    const est = hardwareEstimate(model({ lift: "swing" }));
    const lift = est.lines.find((l) => l.name === HARDWARE.lift.name);
    expect(lift).toBeDefined();
    expect(lift!.qty).toBe(1);
    expect(lift!.priceUzs).toBe(HARDWARE.lift.priceUzs);
    expect(est.lines.some((l) => l.name === HARDWARE.hinge.name)).toBe(false); // no side hinges
  });

  it("a lift-less door has NO lift line", () => {
    expect(hardwareEstimate(model({})).lines.some((l) => l.name === HARDWARE.lift.name)).toBe(false);
  });
});

describe("Phase 2.1a — a lift door drills no side hinge cups", () => {
  const tk = planThickness(DEFAULT_PLAN);
  function realDoor(lift?: LiftType): StructuralModel {
    let m = buildCarcassModel(600, 720, 560);
    const root = m.blocks[0]!.zones[0]!.root.id;
    m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
    const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
    m = addInstance(m, sec.id, "door");
    if (lift) {
      m = { ...m, blocks: m.blocks.map((b) => ({ ...b, components: b.components.map((c) => (c.role === "facade" ? { ...c, lift } : c)) })) };
    }
    return m;
  }
  const cups = (m: StructuralModel) => {
    const door = solveModelToParts(m, tk).find((p) => p.role === "facade" && !p.id.endsWith("__front"))!;
    return door.operations.filter((o): o is DrillOp => o.op === "drill" && o.diameter_mm10 === 350); // Ø35 hinge cups
  };

  it("a plain door HAS Ø35 hinge cups", () => {
    expect(cups(realDoor()).length).toBeGreaterThan(0);
  });

  it("a lift door has NONE (side cups suppressed)", () => {
    expect(cups(realDoor("swing"))).toHaveLength(0);
  });
});
