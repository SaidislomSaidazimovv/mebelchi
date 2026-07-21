// Phase 1.3c — the handle-type picker's engine op + fork behaviour. `setComponentHandle` sets/clears the
// optional `Component.handle` (mirror of setComponentLip); the store forks the selected instance first
// (forkComponentForInstance) so one door's handle is independent of its siblings. This proves the op, the
// null round-trip (byte-identical when cleared), the sibling independence, and that the picked value flows
// all the way to the hardware count + the Ø4.5 drilling.

import { describe, it, expect } from "vitest";

import { setComponentHandle, forkComponentForInstance, addInstance, divideSection } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { hardwareCounts } from "../apps/app/src/three/estimate.js";
import type { Block, Component, Instance, StructuralModel, HandleType } from "../engine/contracts/structure.js";
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
  return { id: "t", name: "handle", blocks: [block], parts: [] };
}

const compById = (m: StructuralModel, id: string) => m.blocks[0]!.components.find((c) => c.id === id);
const compOfInst = (m: StructuralModel, instId: string) => {
  const inst = m.blocks[0]!.instances.find((i) => i.id === instId)!;
  return compById(m, inst.componentId);
};

describe("Phase 1.3c — setComponentHandle", () => {
  it("sets a handle type on the component", () => {
    const m = setComponentHandle(twoDoorModel(), "c", "bow");
    expect(compById(m, "c")!.handle).toBe("bow");
  });

  it("each type sets its own value", () => {
    for (const t of ["bow", "knob", "profile"] as HandleType[]) {
      expect(compById(setComponentHandle(twoDoorModel(), "c", t), "c")!.handle).toBe(t);
    }
  });

  it("null clears the field entirely — byte-identical to a handle-less door", () => {
    const bare = twoDoorModel();
    const set = setComponentHandle(bare, "c", "bow");
    const cleared = setComponentHandle(set, "c", null);
    expect("handle" in compById(cleared, "c")!).toBe(false); // the KEY is gone, not just undefined
    expect(cleared).toEqual(bare); // whole model byte-identical to before the handle was ever set
  });

  it("is a no-op (same reference) when the handle is already that value", () => {
    const m = setComponentHandle(twoDoorModel(), "c", "bow");
    expect(setComponentHandle(m, "c", "bow")).toBe(m);
  });

  it("ignores an unknown component id", () => {
    const bare = twoDoorModel();
    expect(setComponentHandle(bare, "nope", "bow")).toBe(bare);
  });
});

describe("Phase 1.3c — fork independence (one door's handle ≠ its siblings')", () => {
  it("forking i0 then setting its handle leaves i1's component untouched", () => {
    let m = twoDoorModel();
    m = forkComponentForInstance(m, "i0"); // i0 gets its own component `c__i_i0`; i1 stays on `c`
    const forkedId = m.blocks[0]!.instances.find((i) => i.id === "i0")!.componentId;
    expect(forkedId).toBe("c__i_i0");
    m = setComponentHandle(m, forkedId, "bow");
    expect(compOfInst(m, "i0")!.handle).toBe("bow"); // the edited door
    expect(compOfInst(m, "i1")!.handle).toBeUndefined(); // its sibling is unchanged
  });
});

describe("Phase 1.3c — the picked value flows to count + drilling", () => {
  function oneDoor(handle?: HandleType): StructuralModel {
    let m = buildCarcassModel(600, 720, 560);
    const root = m.blocks[0]!.zones[0]!.root.id;
    m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
    const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
    m = addInstance(m, sec.id, "door");
    if (handle) {
      const doorComp = m.blocks[0]!.components.find((c) => c.role === "facade")!;
      m = setComponentHandle(m, doorComp.id, handle);
    }
    return m;
  }

  it("a picked bow handle → one hardware handle AND two Ø4.5 door holes", () => {
    const m = oneDoor("bow");
    expect(hardwareCounts(m).handles).toBe(1);
    const door = solveModelToParts(m).find((p) => p.role === "facade" && !p.id.endsWith("__front"))!;
    const holes = door.operations.filter((o): o is DrillOp => o.op === "drill" && o.diameter_mm10 === 45);
    expect(holes).toHaveLength(2);
  });

  it("no handle picked → zero handles AND zero Ø4.5 holes (byte-identical)", () => {
    const m = oneDoor();
    expect(hardwareCounts(m).handles).toBe(0);
    const door = solveModelToParts(m).find((p) => p.role === "facade" && !p.id.endsWith("__front"))!;
    expect(door.operations.filter((o): o is DrillOp => o.op === "drill" && o.diameter_mm10 === 45)).toHaveLength(0);
  });
});
