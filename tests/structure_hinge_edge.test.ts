// setHingeEdge — flip a door's hinge side per INSTANCE (not the shared component), and drill the
// chosen edge. Left is the default and must round-trip to the exact original component (no "_hr").
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { addInstance, setHingeEdge } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const facadeInstId = (m: StructuralModel): string => {
  const b = m.blocks[0]!;
  return b.instances.find((i) => b.components.find((c) => c.id === i.componentId)?.role === "facade")!.id;
};
const doorModel = (): StructuralModel => {
  const m = buildCarcassModel(600, 720, 560);
  const sec = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  return addInstance(m, sec, "door");
};
const facadeDrillYs = (m: StructuralModel): number[] => {
  const f = solveModelToParts(m).find((p) => p.role === "facade")!;
  return [...new Set(f.operations.filter((o) => o.op === "drill").map((o) => o.y_mm10))];
};

describe("setHingeEdge", () => {
  it("flips a left door to right: new '_hr' component, hingeEdge set, cups mirror to yMax", () => {
    const left = doorModel();
    const id = facadeInstId(left);
    const leftComp = left.blocks[0]!.components.find((c) => c.role === "facade")!;
    expect(leftComp.id.endsWith("_hr")).toBe(false);
    expect(leftComp.hingeEdge).toBeUndefined(); // left = no field

    const right = setHingeEdge(left, id, "right");
    const rightComp = right.blocks[0]!.components.find((c) => right.blocks[0]!.instances.some((i) => i.componentId === c.id && i.id === id))!;
    expect(rightComp.id.endsWith("_hr")).toBe(true);
    expect(rightComp.hingeEdge).toBe("right");
    // the drilled edge actually moves
    expect(Math.min(...facadeDrillYs(left))).toBeLessThan(1000); // left near y0
    expect(Math.max(...facadeDrillYs(right))).toBeGreaterThan(5000); // right near yMax
  });

  it("right → left round-trips to the original component (no _hr, no hingeEdge field)", () => {
    const left = doorModel();
    const id = facadeInstId(left);
    const back = setHingeEdge(setHingeEdge(left, id, "right"), id, "left");
    const comp = back.blocks[0]!.components.find((c) => back.blocks[0]!.instances.some((i) => i.componentId === c.id && i.id === id))!;
    expect(comp.id.endsWith("_hr")).toBe(false);
    expect(comp.hingeEdge).toBeUndefined();
  });

  it("is a no-op (same reference) when the side is already set", () => {
    const left = doorModel();
    expect(setHingeEdge(left, facadeInstId(left), "left")).toBe(left); // already left → same ref
  });

  it("tolerates an unknown instance id (same reference, no throw)", () => {
    const left = doorModel();
    expect(() => setHingeEdge(left, "no-such-instance", "right")).not.toThrow();
    expect(setHingeEdge(left, "no-such-instance", "right")).toBe(left);
  });
});
