// Step-aware mount wiring (blocker #7): a vertical support (pedestal) under a partially-doubled top
// resolves its HEIGHT to the real underside plane — taller behind the 16mm step, shorter under the
// 32mm front strip. This finishes #7 end-to-end (partial-doubling → undersidePlaneAt → mount height).
// v3-authoritative (the requirement is v3 Piece 3; the mount model design is P's, docs don't spec it).

import { describe, expect, it } from "vitest";

import { solveStructure, BOARD_MM10 } from "../engine/structure/solve.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

/** One block, one section, holding a mount (pedestal) at depth `y_mm10` under a top with a 100mm
 *  doubled front strip. Section: 720mm tall × 560mm deep → the step sits at 5600 − 1000 = 4600. */
function mountModel(y_mm10: number): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "mount",
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
        components: [{ id: "c_ped", name: "Тумба", partIds: [], role: null, mount: { front_mm10: 1000, y_mm10 } }],
        instances: [{ id: "i1", componentId: "c_ped", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const mountHeight = (m: StructuralModel): number =>
  solveStructure(m).find((p) => p.id === "blk__inst_i1")!.length_mm10;

describe("step-aware mount (blocker #7 wiring)", () => {
  it("a mount behind the step is taller (top at the 16mm underside)", () => {
    expect(mountHeight(mountModel(2000))).toBe(7200 - BOARD_MM10); // clear = 7040
  });

  it("a mount under the front strip is shorter (top at the 32mm underside)", () => {
    expect(mountHeight(mountModel(5000))).toBe(7200 - 2 * BOARD_MM10); // clear = 6880
  });

  it("the two resolve exactly one board (16mm) apart — the step", () => {
    expect(mountHeight(mountModel(2000)) - mountHeight(mountModel(5000))).toBe(BOARD_MM10);
  });
});
