// Glazed-GRID door assembly (CONSTRUCTION_FRAME_v3 Piece 2): outer frame (32mm doubled) +
// muntins (16mm) + glass panes (3mm). Dimensions are the flagged glazed-grid defaults.

import { describe, expect, it } from "vitest";

import { solveStructure, BOARD_MM10, EDGE_BAND_MM10 } from "../engine/structure/solve.js";
import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

function gridDoorModel(lights: number): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 21700, d: 5600 };
  return {
    id: "t",
    name: "grid",
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
        components: [{ id: "c_door", name: "Витраж", partIds: [], role: "facade", glazedGrid: { lights } }],
        instances: [{ id: "i1", componentId: "c_door", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const own = (parts: Part[]): Part[] => parts.filter((p) => p.id.includes("__inst_i1"));

describe("glazed-grid door assembly", () => {
  it("emits frame (32mm doubled) + muntins (16mm) + glass panes (3mm) for a 3-light door", () => {
    const parts = own(solveStructure(gridDoorModel(3)));
    const glass = parts.filter((p) => p.id.includes("__glass_"));
    const muntins = parts.filter((p) => p.id.includes("__muntin_"));
    const frame = parts.filter((p) => /__(stile|rail)_/.test(p.id));

    expect(glass).toHaveLength(3);
    expect(muntins).toHaveLength(2); // lights − 1
    expect(frame).toHaveLength(8); // 4 members × 2 doubled layers

    // glass: 3mm, no grain, no banding
    expect(glass.every((p) => p.thickness_mm10 === 30 && p.grain === "NONE")).toBe(true);
    expect(glass.every((p) => p.edges.every((e) => e === 0))).toBe(true);
    // muntins: 16mm
    expect(muntins.every((p) => p.thickness_mm10 === BOARD_MM10)).toBe(true);
    // frame boards are 16mm; the outer layer of each member is banded all round
    expect(frame.every((p) => p.thickness_mm10 === BOARD_MM10)).toBe(true);
    const frameOuter = frame.filter((p) => p.id.endsWith("__a"));
    expect(frameOuter).toHaveLength(4);
    expect(frameOuter.every((p) => p.edges.every((e) => e === EDGE_BAND_MM10))).toBe(true);
  });

  it("scales the light count (2 lights → 1 muntin, 2 panes)", () => {
    const parts = own(solveStructure(gridDoorModel(2)));
    expect(parts.filter((p) => p.id.includes("__glass_"))).toHaveLength(2);
    expect(parts.filter((p) => p.id.includes("__muntin_"))).toHaveLength(1);
  });

  it("the assembly passes the machining safety gate", () => {
    expect(validateParts(solveModelToParts(gridDoorModel(3))).ok).toBe(true);
  });
});
