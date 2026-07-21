// Phase 2.1c — the lift-type picker's engine op + fork behaviour. `setComponentLift` sets/clears the
// optional `Component.lift` (mirror of setComponentHandle); the store forks the selected door first so one
// door's lift is independent of its siblings. Proves the op, the null round-trip (byte-identical when
// cleared), sibling independence, and that the picked value flows to the hardware count + the side-cup
// suppression (a lift door counts a lift, not hinges, and drills no Ø35 cups).

import { describe, it, expect } from "vitest";

import { setComponentLift, forkComponentForInstance, addInstance, divideSection } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import { hardwareCounts } from "../apps/app/src/three/estimate.js";
import type { Block, Component, Instance, StructuralModel, LiftType } from "../engine/contracts/structure.js";
import type { DrillOp } from "../engine/contracts/types.js";

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

/** A block with two facade instances SHARING one component (so a fork is meaningful). */
function twoDoorModel(): StructuralModel {
  const comp: Component = { id: "c", name: "Дверь", partIds: ["p"], role: "facade" };
  const instances: Instance[] = [0, 1].map((i) => ({
    id: `i${i}`, componentId: "c", sectionId: "sec", anchor: { x: 0, y: 1000, z: 0 }, link: "linked" as const,
  }));
  const block: Block = {
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
    components: [comp], instances, lines: [], rows: [],
  };
  return { id: "t", name: "lift", blocks: [block], parts: [] };
}

const compById = (m: StructuralModel, id: string) => m.blocks[0]!.components.find((c) => c.id === id);
const compOfInst = (m: StructuralModel, instId: string) => {
  const inst = m.blocks[0]!.instances.find((i) => i.id === instId)!;
  return compById(m, inst.componentId);
};

describe("Phase 2.1c — setComponentLift", () => {
  it("sets a lift type on the component", () => {
    expect(compById(setComponentLift(twoDoorModel(), "c", "swing"), "c")!.lift).toBe("swing");
  });

  it("each type sets its own value", () => {
    for (const t of ["swing", "parallel"] as LiftType[]) {
      expect(compById(setComponentLift(twoDoorModel(), "c", t), "c")!.lift).toBe(t);
    }
  });

  it("null clears the field entirely — byte-identical to a side-hinged door", () => {
    const bare = twoDoorModel();
    const cleared = setComponentLift(setComponentLift(bare, "c", "swing"), "c", null);
    expect("lift" in compById(cleared, "c")!).toBe(false); // the KEY is gone
    expect(cleared).toEqual(bare); // whole model byte-identical to before
  });

  it("is a no-op (same reference) when the lift is already that value", () => {
    const m = setComponentLift(twoDoorModel(), "c", "swing");
    expect(setComponentLift(m, "c", "swing")).toBe(m);
  });

  it("ignores an unknown component id", () => {
    const bare = twoDoorModel();
    expect(setComponentLift(bare, "nope", "swing")).toBe(bare);
  });
});

describe("Phase 2.1c — fork independence (one door's lift ≠ its siblings')", () => {
  it("forking i0 then setting its lift leaves i1's component untouched", () => {
    let m = twoDoorModel();
    m = forkComponentForInstance(m, "i0");
    const forkedId = m.blocks[0]!.instances.find((i) => i.id === "i0")!.componentId;
    expect(forkedId).toBe("c__i_i0");
    m = setComponentLift(m, forkedId, "swing");
    expect(compOfInst(m, "i0")!.lift).toBe("swing"); // the edited door
    expect(compOfInst(m, "i1")!.lift).toBeUndefined(); // its sibling is unchanged
  });
});

describe("Phase 2.1c — the picked value flows to count + drilling", () => {
  const tk = planThickness(DEFAULT_PLAN);
  function oneDoor(lift?: LiftType): StructuralModel {
    let m = buildCarcassModel(600, 720, 560);
    const root = m.blocks[0]!.zones[0]!.root.id;
    m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
    const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
    m = addInstance(m, sec.id, "door");
    if (lift) m = setComponentLift(m, m.blocks[0]!.components.find((c) => c.role === "facade")!.id, lift);
    return m;
  }
  const cups = (m: StructuralModel) => {
    const door = solveModelToParts(m, tk).find((p) => p.role === "facade" && !p.id.endsWith("__front"))!;
    return door.operations.filter((o): o is DrillOp => o.op === "drill" && o.diameter_mm10 === 350);
  };

  it("a picked lift → one lift, zero hinges, and NO Ø35 cups on the door", () => {
    const m = oneDoor("swing");
    expect(hardwareCounts(m).lifts).toBe(1);
    expect(hardwareCounts(m).hinges).toBe(0);
    expect(cups(m)).toHaveLength(0);
  });

  it("no lift picked → zero lifts, hinges as before, cups present (byte-identical)", () => {
    const m = oneDoor();
    expect(hardwareCounts(m).lifts).toBe(0);
    expect(hardwareCounts(m).hinges).toBeGreaterThan(0);
    expect(cups(m).length).toBeGreaterThan(0);
  });
});
