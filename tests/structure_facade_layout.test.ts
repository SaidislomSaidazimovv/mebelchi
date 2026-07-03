// Facade layout — a door/facade is positioned in the 3D viewport (was previously solved but never
// placed, so it never rendered). It covers its section's front opening. 1:1 with its solved part.

import { describe, expect, it } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

function facadeModel(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 4050, h: 21700, d: 5600 };
  return {
    id: "t",
    name: "facade",
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
        components: [{ id: "c_door", name: "Фасад", partIds: [], role: "facade" }],
        instances: [{ id: "i1", componentId: "c_door", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

describe("facade layout (door positioned in the viewport)", () => {
  it("positions the facade at the section's front opening", () => {
    const door = solveLayout(facadeModel()).find((p) => p.id === "blk__inst_i1");
    expect(door).toBeDefined();
    expect(door!.z_mm10).toBe(0); // front face
    expect(door!.d_mm10).toBe(160); // 16mm door thickness
    expect(door!.w_mm10).toBe(4050); // section width
    expect(door!.h_mm10).toBe(21700); // section height
  });

  it("every solved part now has a placement (no orphan facade)", () => {
    const partIds = new Set(solveStructure(facadeModel()).map((p) => p.id));
    const placeIds = new Set(solveLayout(facadeModel()).map((p) => p.id));
    expect(placeIds).toEqual(partIds);
  });
});
