// E2 — glazed-grid 3D layout. solveLayout now positions the whole glazed-grid door (stiles, rails,
// muntins, panes) in the section's front opening, mirroring the geometry glazedGridParts emits — so
// the viewport renders the door instead of nothing (facadePlacement returned null for grids before).

import { describe, expect, it } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { GLAZED_FRAME_W, GLAZED_MUNTIN_W } from "../engine/structure/solve.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

function gridModel(sectionW: number, lights: number): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: sectionW, h: 20000, d: 6000 };
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

const grid = (m: StructuralModel) => solveLayout(m).filter((p) => p.id.startsWith("blk__inst_i1"));

describe("E2 — glazed-grid door layout", () => {
  it("emits frame + muntins + panes (was: nothing)", () => {
    const parts = grid(gridModel(8000, 3));
    const ids = parts.map((p) => p.id);
    // 2 stiles + 2 rails + 3 panes + 2 muntins = 9 placements
    expect(parts).toHaveLength(9);
    expect(ids).toContain("blk__inst_i1__stile_l");
    expect(ids).toContain("blk__inst_i1__stile_r");
    expect(ids).toContain("blk__inst_i1__rail_b");
    expect(ids).toContain("blk__inst_i1__rail_t");
    expect(ids.filter((id) => id.includes("__glass_"))).toHaveLength(3);
    expect(ids.filter((id) => id.includes("__muntin_"))).toHaveLength(2);
  });

  it("positions the stiles at the two side edges", () => {
    const parts = grid(gridModel(8000, 3));
    const l = parts.find((p) => p.id.endsWith("__stile_l"))!;
    const r = parts.find((p) => p.id.endsWith("__stile_r"))!;
    expect(l.x_mm10).toBe(0);
    expect(l.w_mm10).toBe(GLAZED_FRAME_W);
    expect(r.x_mm10).toBe(8000 - GLAZED_FRAME_W); // right edge
    expect(l.h_mm10).toBe(20000); // full door height
  });

  it("every panel has positive dimensions and stays inside the opening", () => {
    const parts = grid(gridModel(8000, 4));
    for (const p of parts) {
      expect(p.w_mm10).toBeGreaterThan(0);
      expect(p.h_mm10).toBeGreaterThan(0);
      expect(p.x_mm10).toBeGreaterThanOrEqual(0);
      expect(p.y_mm10 + p.h_mm10).toBeLessThanOrEqual(20000); // never past the top
    }
    // panes and muntins span the same interior width (between the stiles)
    const innerW = 8000 - 2 * GLAZED_FRAME_W;
    for (const p of parts.filter((q) => q.id.includes("__glass_") || q.id.includes("__muntin_"))) {
      expect(p.w_mm10).toBe(innerW);
    }
    // a muntin bar is GLAZED_MUNTIN_W tall
    expect(parts.find((p) => p.id.endsWith("__muntin_0"))!.h_mm10).toBe(GLAZED_MUNTIN_W);
  });

  it("falls back to a single panel when the opening is too small for a frame", () => {
    const parts = grid(gridModel(500, 3)); // 500 < 2×400 frame
    expect(parts).toHaveLength(1);
    expect(parts[0]!.id).toBe("blk__inst_i1");
  });
});
