// E12 — L8 emit-completeness gate. Every feature the model declares must have produced its machining
// in the solved parts: a glazed-grid's frame members their rebate, a doubled component both glued
// layers. A missing emission blocks the SWJ008 export ("not done until emitted", v3 L8).

import { describe, expect, it } from "vitest";

import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { checkEmitCompleteness } from "../engine/structure/emitCheck.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

const box = { x: 0, y: 0, z: 0, w: 8000, h: 20000, d: 6000 };

function facadeModel(extra: Record<string, unknown>): StructuralModel {
  return {
    id: "t",
    name: "emit",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Дверь", partIds: [], role: "facade", ...extra }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const gridModel = () => facadeModel({ glazedGrid: { lights: 3 } });
const doubledModel = () => facadeModel({ doubled: true });

describe("E12 — emit-completeness gate (L8)", () => {
  it("passes when a glazed-grid emitted every member rebate", () => {
    const m = gridModel();
    expect(checkEmitCompleteness(m, solveModelToParts(m))).toHaveLength(0);
  });

  it("flags a glazed-grid whose rebate machining was stripped", () => {
    const m = gridModel();
    const stripped: Part[] = solveModelToParts(m).map((p) => ({ ...p, operations: p.operations.filter((o) => o.op !== "saw_groove") }));
    const f = checkEmitCompleteness(m, stripped);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.code === "EMIT_GRID_REBATE_MISSING")).toBe(true);
  });

  it("passes doubling when both layers are present, flags when one is missing", () => {
    const m = doubledModel();
    const parts = solveModelToParts(m);
    expect(checkEmitCompleteness(m, parts)).toHaveLength(0);
    const noB = parts.filter((p) => !p.id.endsWith("__b"));
    const f = checkEmitCompleteness(m, noB);
    expect(f.some((x) => x.code === "EMIT_DOUBLING_INCOMPLETE")).toBe(true);
  });

  it("the export gate lets a complete glazed-grid model through", () => {
    expect(() => exportModelToSWJ008(gridModel())).not.toThrow();
  });
});
