// E8 — structure-level depth/width resize (blocker #3, CONSTRUCTION_FRAME_v3 Piece 1 step 1:
// "set depth at block/leg level, not panel"). resizeBlockDepth/Width scale the whole block and the
// solver reflows every panel — the fix for the stubbed store `resize`.

import { describe, expect, it } from "vitest";

import { resizeBlockDepth, resizeBlockWidth, divideSection } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import type { StructuralModel, Section } from "../engine/contracts/structure.js";

const BOX = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

function baseModel(): StructuralModel {
  const root: Section = { id: "sec", box: BOX, dividers: [], children: [], instanceIds: [], purpose: null };
  return {
    id: "t",
    name: "resize",
    blocks: [
      {
        id: "blk",
        name: "B",
        box: BOX,
        zones: [{ id: "z", name: "Z", rule: "manual", root }],
        components: [],
        instances: [],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const leaf = (m: StructuralModel): Section => m.blocks[0]!.zones[0]!.root;

describe("E8 — structure-level resize (blocker #3)", () => {
  it("depth edit sets the block box AND the section subtree", () => {
    const r = resizeBlockDepth(baseModel(), "blk", 4000);
    expect(r.blocks[0]!.box.d).toBe(4000);
    expect(leaf(r).box.d).toBe(4000); // section spans full depth → scaled to match
    expect(r.blocks[0]!.box.w).toBe(6000); // other axes untouched
    expect(r.blocks[0]!.box.h).toBe(7200);
  });

  it("depth edit reflows the solved panels (carcass Width = depth)", () => {
    const before = solveStructure(baseModel());
    const after = solveStructure(resizeBlockDepth(baseModel(), "blk", 4000));
    expect(before.some((p) => p.width_mm10 === 5600)).toBe(true); // was 560mm deep
    expect(after.some((p) => p.width_mm10 === 4000)).toBe(true); // now 400mm deep
    expect(after.some((p) => p.width_mm10 === 5600)).toBe(false); // nothing left at old depth
  });

  it("width edit scales the block box and its x-axis dividers proportionally", () => {
    const divided = divideSection(baseModel(), "sec", { kind: "equal", axis: "x", count: 2 });
    const lineBefore = divided.blocks[0]!.lines[0]!;
    expect(lineBefore.position_mm10).toBe(3000); // centre of a 6000-wide block

    const r = resizeBlockWidth(divided, "blk", 8000);
    expect(r.blocks[0]!.box.w).toBe(8000);
    expect(r.blocks[0]!.lines[0]!.position_mm10).toBe(4000); // 3000 × 8000/6000, still centred
  });

  it("an unchanged extent is a no-op (same model reference)", () => {
    const m = baseModel();
    expect(resizeBlockDepth(m, "blk", 5600)).toBe(m);
  });

  it("rejects an invalid extent and an unknown block", () => {
    expect(() => resizeBlockDepth(baseModel(), "blk", 0)).toThrow("RESIZE_INVALID_EXTENT");
    expect(() => resizeBlockDepth(baseModel(), "blk", -10)).toThrow("RESIZE_INVALID_EXTENT");
    expect(() => resizeBlockDepth(baseModel(), "nope", 4000)).toThrow("RESIZE_BLOCK_NOT_FOUND");
  });
});
