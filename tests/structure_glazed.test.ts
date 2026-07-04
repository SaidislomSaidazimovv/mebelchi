// L8 #38 — the glass rebate groove on a glazed facade.
// CONSTRUCTION_FRAME_v3 L8 / #38: "glass needs its rebate groove … emitted, not implied." The
// factory SWJ008 export does not carry the groove (cut off-SWJ008), so the DIMENSIONS here are
// flagged defaults; the requirement to EMIT it is v3-authoritative.

import { describe, expect, it } from "vitest";

import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

function glazedDoorModel(glazed: boolean): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 4050, h: 21700, d: 5600 };
  return {
    id: "t",
    name: "glazed",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [
          {
            id: "z",
            name: "Z",
            rule: "manual",
            root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null },
          },
        ],
        components: [{ id: "c_door", name: "Фасад", partIds: [], role: "facade", glazed }],
        instances: [{ id: "i1", componentId: "c_door", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const door = (parts: Part[]): Part => parts.find((p) => p.id === "blk__inst_i1")!;

describe("L8 #38 glass rebate (glazed facade)", () => {
  it("emits a 4-segment rebate groove on the back face of a glazed door", () => {
    const grooves = door(solveModelToParts(glazedDoorModel(true))).operations.filter((o) => o.op === "saw_groove");
    expect(grooves).toHaveLength(4);
    expect(grooves.every((o) => o.face === "B")).toBe(true);
    expect(grooves.every((o) => o.op === "saw_groove" && o.depth_mm10 > 0 && o.width_mm10 > 0)).toBe(true);
  });

  it("a non-glazed facade emits no rebate groove", () => {
    const grooves = door(solveModelToParts(glazedDoorModel(false))).operations.filter((o) => o.op === "saw_groove");
    expect(grooves).toHaveLength(0);
  });

  it("a glazed door still gets its hinge cups (the rebate is additive)", () => {
    const d = door(solveModelToParts(glazedDoorModel(true)));
    expect(d.operations.some((o) => o.op === "drill" && o.diameter_mm10 === 350)).toBe(true);
  });

  it("the glazed door passes the machining safety gate (groove in bounds)", () => {
    expect(validateParts(solveModelToParts(glazedDoorModel(true))).ok).toBe(true);
  });
});
