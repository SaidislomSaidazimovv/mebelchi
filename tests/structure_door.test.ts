// Facade/door role + hinge-cup drilling.
// GROUNDED against the golden door SHKOF_ORTA_CHAP_ESHIK_7_1.XML: a door is banded on all four
// edges (1/1/1/1) and carries Ø35 hinge cups on the y0 edge (cups at Y=21.5mm). The hinge SPACING
// is a Layer-2 (solver) rule; the primitive itself is verified against that door.

import { describe, expect, it } from "vitest";

import { solveStructure, EDGE_BAND_MM10 } from "../engine/structure/solve.js";
import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

/** One block, one section, fronted by a single tall facade/door (2170mm = 21700 mm10). */
function doorModel(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 4050, h: 21700, d: 5600 };
  return {
    id: "t",
    name: "door test",
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

const door = (parts: Part[]): Part => parts.find((p) => p.id === "blk__inst_i1")!;

describe("facade/door role + hinge drilling", () => {
  it("emits a facade panel sized from the section, banded on all 4 edges", () => {
    const d = door(solveStructure(doorModel()));
    expect(d.length_mm10).toBe(21700); // section height (X = hinge axis)
    expect(d.width_mm10).toBe(4050); // section width (Y)
    expect(d.edges).toEqual([EDGE_BAND_MM10, EDGE_BAND_MM10, EDGE_BAND_MM10, EDGE_BAND_MM10]);
    expect(d.operations).toHaveLength(0); // bare until the drilling pass
  });

  it("drills hinge cups on the door via the manufacturing path (y0 edge, Ø35, Face A)", () => {
    const d = door(solveModelToParts(doorModel()));
    const cups = d.operations.filter((o) => o.op === "drill" && o.diameter_mm10 === 350);
    expect(cups).toHaveLength(4); // 2170mm door → 4 hinges (100mm insets, ≤700mm gaps)
    expect(cups.every((o) => o.face === "A")).toBe(true);
    expect(cups.every((o) => o.op === "drill" && o.y_mm10 === 215)).toBe(true); // 21.5mm from y0
    expect(d.operations).toHaveLength(4 * 3); // 1 cup + 2 satellite marks per hinge
  });

  it("the drilled door passes the machining safety gate (all ops in bounds)", () => {
    expect(validateParts(solveModelToParts(doorModel())).ok).toBe(true);
  });
});
