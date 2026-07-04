// E3 — per-member glazed-grid rebate. Each glazed-grid frame member (stile / rail, outer __a board)
// and each muntin now carries a pane-seat rebate groove (L8 #38 "cut, not implied"); glass panes and
// the inner __b board carry none. Before E3 only single-pane `glazed` doors got a rebate.

import { describe, expect, it } from "vitest";

import { solveModelToParts } from "../engine/cnc.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

function gridModel(lights: number): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 8000, h: 20000, d: 6000 };
  return {
    id: "t",
    name: "grid",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Витрина", partIds: [], role: "facade", glazedGrid: { lights } }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const bySuffix = (parts: Part[], suffix: string) => parts.find((p) => p.id.endsWith(suffix))!;
const grooves = (p: Part) => p.operations.filter((o) => o.op === "saw_groove");

describe("E3 — glazed-grid per-member rebate", () => {
  const parts = solveModelToParts(gridModel(3));

  it("grooves every outer frame member (stiles + rails)", () => {
    for (const m of ["__stile_l__a", "__stile_r__a", "__rail_b__a", "__rail_t__a"]) {
      const g = grooves(bySuffix(parts, m));
      expect(g.length).toBeGreaterThanOrEqual(1);
      expect(g[0]!.face).toBe("B"); // back-face pane seat
    }
  });

  it("grooves every muntin (a pane each side)", () => {
    expect(grooves(bySuffix(parts, "__muntin_0")).length).toBeGreaterThanOrEqual(1);
    expect(grooves(bySuffix(parts, "__muntin_1")).length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT groove the glass pane or the inner __b board", () => {
    expect(grooves(bySuffix(parts, "__glass_0"))).toHaveLength(0);
    expect(grooves(bySuffix(parts, "__stile_l__b"))).toHaveLength(0);
  });

  it("the groove stays within the member and has positive depth", () => {
    const p = bySuffix(parts, "__rail_b__a");
    const g = grooves(p)[0]!;
    expect(g.depth_mm10).toBeGreaterThan(0);
    expect(g.endX_mm10).toBeLessThanOrEqual(p.length_mm10);
    expect(g.y_mm10).toBeLessThanOrEqual(p.width_mm10);
  });
});
