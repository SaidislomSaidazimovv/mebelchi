// E13 — drilling refinements. (b) On a DOUBLED door only the outer layer (__a) is machined; the
// hidden inner board (__b) gets no hinge cups. (c) A glazed-grid door hinges on its hinge-side stile
// (left, outer __a) — before, it got no hinge at all. (a) both-face shelf pins / divider drilling,
// (d) exact hinge spacing, (e) rebate dims stay flagged for S3-E7 (need factory data).

import { describe, expect, it } from "vitest";

import { solveModelToParts } from "../engine/cnc.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

const box = { x: 0, y: 0, z: 0, w: 8000, h: 20000, d: 6000 };

function facadeModel(extra: Record<string, unknown>): StructuralModel {
  return {
    id: "t",
    name: "drill",
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

const bySuffix = (parts: Part[], s: string) => parts.find((p) => p.id.endsWith(s))!;
const hasDrill = (p: Part) => p.operations.some((o) => o.op === "drill");

describe("E13 — drilling refinements", () => {
  it("(b) a doubled door drills hinge cups on the outer layer only", () => {
    const parts = solveModelToParts(facadeModel({ doubled: true }));
    expect(hasDrill(bySuffix(parts, "__inst_i1__a"))).toBe(true); // outer board machined
    expect(hasDrill(bySuffix(parts, "__inst_i1__b"))).toBe(false); // inner glued board bare
  });

  it("(c) a glazed-grid door hinges on its left stile, not the right", () => {
    const parts = solveModelToParts(facadeModel({ glazedGrid: { lights: 3 } }));
    expect(hasDrill(bySuffix(parts, "__stile_l__a"))).toBe(true); // hinge side
    expect(hasDrill(bySuffix(parts, "__stile_r__a"))).toBe(false); // rebate only, no hinge
  });

  it("a plain single door still gets its hinges", () => {
    const parts = solveModelToParts(facadeModel({}));
    expect(hasDrill(bySuffix(parts, "__inst_i1"))).toBe(true);
  });
});
