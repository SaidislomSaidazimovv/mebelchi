// E5 — junction value editor (#40). An instance can carry a Junction3D (oversail X / step-back Y /
// shadow-gap Z). The shadow-gap pushes the placement proud in the 3D view (v3:177 "pushes the door
// proud") — the render-visible reveal; oversail/step-back are carried for the advanced L3 geometry.

import { describe, expect, it } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import type { Junction3D, StructuralModel } from "../engine/contracts/structure.js";

function doorModel(junction?: Junction3D): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "junction",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Дверь", partIds: [], role: "facade" }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked", ...(junction ? { junction } : {}) }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const door = (m: StructuralModel) => solveLayout(m).find((p) => p.id === "blk__inst_i1")!;

describe("E5 — junction offset (#40)", () => {
  it("a flush door sits at the front face (z = 0)", () => {
    expect(door(doorModel()).z_mm10).toBe(0);
  });

  it("the shadow-gap pushes the door proud (z shifts forward by Z)", () => {
    const withGap = door(doorModel({ oversail_x_mm10: 200, stepBack_y_mm10: 100, shadowGap_z_mm10: 500 }));
    expect(withGap.z_mm10).toBe(-500); // proud of the front face by the shadow-gap
  });

  it("a zero shadow-gap leaves the placement where it was", () => {
    const noGap = door(doorModel({ oversail_x_mm10: 300, stepBack_y_mm10: 0, shadowGap_z_mm10: 0 }));
    expect(noGap.z_mm10).toBe(0);
  });
});
