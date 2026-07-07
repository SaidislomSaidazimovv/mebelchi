// A4 — a sliding accessory (motion component, role null) was RENDERED but never emitted in the cut
// list; it must now appear as a board, and render↔cut must agree on its size.
// B4 — resizing a block must keep child boxes tiling the parent EXACTLY. The old scale rounded each
// box's origin and extent independently, so a shared edge could drift up to 1 mm10 (0.1mm) — a gap.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, resizeBlockWidth } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const T = 160;

function motionModel(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 20000, d: 5600 };
  return {
    id: "t", name: "motion",
    blocks: [{
      id: "blk", name: "B", box,
      zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
      components: [{ id: "cm", name: "Брючница", partIds: [], role: null, motion: { axis: "y", travel_mm10: 500 } }],
      instances: [{ id: "i1", componentId: "cm", sectionId: "sec", anchor: { x: 0, y: 5000, z: 0 }, link: "linked" }],
      lines: [], rows: [],
    }],
    parts: [],
  };
}

describe("A4 — a motion accessory is in the cut list AND matches the render", () => {
  it("solveStructure emits the sliding board (was missing)", () => {
    const parts = solveStructure(motionModel());
    const board = parts.find((p) => p.id === "blk__inst_i1");
    expect(board).toBeDefined();
    expect(board!.length_mm10).toBe(6000 - 2 * T); // spans between the carcass sides
    expect(board!.width_mm10).toBe(5600); // section depth
    expect(board!.thickness_mm10).toBe(T); // shelf-stock board
  });

  it("render thickness equals the cut-list thickness (parity)", () => {
    const board = solveStructure(motionModel()).find((p) => p.id === "blk__inst_i1")!;
    const place = solveLayout(motionModel()).find((p) => p.id === "blk__inst_i1")!;
    const thin = Math.min(place.w_mm10, place.h_mm10, place.d_mm10);
    expect(thin).toBe(board.thickness_mm10);
  });
});

describe("B4 — resize keeps child boxes tiling the parent exactly (no 0.1mm drift)", () => {
  for (const target of [8001, 8003, 8007, 12345]) {
    it(`3 columns stay flush + span the block after resize → ${target}`, () => {
      let m = buildCarcassModel(800, 720, 500);
      const blockId = m.blocks[0]!.id;
      const root = m.blocks[0]!.zones[0]!.root.id;
      m = divideSection(m, root, { kind: "equal", axis: "x", count: 3 });
      m = resizeBlockWidth(m, blockId, target);

      const blk = m.blocks[0]!;
      expect(blk.box.w).toBe(target); // block hits the exact requested width
      const cols = [...leafSections(blk.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
      expect(cols.length).toBe(3);
      expect(cols[0]!.box.x).toBe(blk.box.x); // first flush with the left face
      for (let i = 0; i < cols.length - 1; i++) {
        expect(cols[i]!.box.x + cols[i]!.box.w).toBe(cols[i + 1]!.box.x); // no gap/overlap between columns
      }
      const last = cols[cols.length - 1]!;
      expect(last.box.x + last.box.w).toBe(blk.box.x + blk.box.w); // last flush with the right face
    });
  }
});
