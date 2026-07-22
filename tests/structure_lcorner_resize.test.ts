// Phase 4.b — resizing an L-corner block scales the CORRECT leg params per axis, keeping box + legs
// consistent (box.w = legA.length; box.d = legA.depth + legB.length). Before the fix, width was a no-op on
// the carcass and depth scaled the wrong leg (legB.depth, an X-dim) → corruption. Rectangular resize is
// untouched.

import { describe, it, expect } from "vitest";

import { setBlockFootprint, resizeBlockWidth, resizeBlockDepth, resizeBlockHeight } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import type { StructuralModel, LCornerFootprint } from "../engine/contracts/structure.js";

const LEGB: LCornerFootprint["legB"] = { length_mm10: 4000, depth_mm10: 4000 };
/** A 600×720×560 carcass converted to an L (legA = the box, legB 400×400). */
function lModel(): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  return setBlockFootprint(m, m.blocks[0]!.id, { legA: { length_mm10: 6000, depth_mm10: 5600 }, legB: LEGB });
}
const blk = (m: StructuralModel) => m.blocks[0]!;
const fp = (m: StructuralModel) => blk(m).footprint!;

describe("Phase 4.b — width resize scales legA.length + legB.depth", () => {
  it("doubling the width scales legA.length + legB.depth ×2; box.w stays = legA.length", () => {
    const m = lModel();
    const wide = resizeBlockWidth(m, blk(m).id, blk(m).box.w * 2); // 6000 → 12000
    expect(fp(wide).legA.length_mm10).toBe(12000); // was a no-op before the fix
    expect(fp(wide).legB.depth_mm10).toBe(8000);   // leg-B's X-width scales with width
    expect(blk(wide).box.w).toBe(12000);
    expect(blk(wide).box.w).toBe(fp(wide).legA.length_mm10); // consistent
    // Z params (depth) are untouched by a width edit
    expect(fp(wide).legA.depth_mm10).toBe(5600);
    expect(fp(wide).legB.length_mm10).toBe(4000);
  });
});

describe("Phase 4.b — depth resize scales legA.depth + legB.length (box.d = the sum)", () => {
  it("doubling the depth scales legA.depth + legB.length ×2; box.d stays = legA.depth + legB.length", () => {
    const m = lModel();
    const d0 = blk(m).box.d; // 5600 + 4000 = 9600
    const deep = resizeBlockDepth(m, blk(m).id, d0 * 2); // 9600 → 19200
    expect(fp(deep).legA.depth_mm10).toBe(11200); // 5600 ×2
    expect(fp(deep).legB.length_mm10).toBe(8000); // 4000 ×2 — the CORRECT leg (was legB.depth before)
    expect(fp(deep).legB.depth_mm10).toBe(4000);  // leg-B's X-width UNCHANGED by a depth edit
    expect(blk(deep).box.d).toBe(fp(deep).legA.depth_mm10 + fp(deep).legB.length_mm10); // exact, no drift
    expect(blk(deep).box.d).toBe(19200);
    expect(fp(deep).legA.length_mm10).toBe(6000); // X untouched
  });
});

describe("Phase 4.b — height + rectangular are unaffected", () => {
  it("height resize scales box.h but leaves the footprint byte-identical", () => {
    const m = lModel();
    const tall = resizeBlockHeight(m, blk(m).id, blk(m).box.h * 2);
    expect(blk(tall).box.h).toBe(blk(m).box.h * 2);
    expect(fp(tall)).toEqual(fp(m)); // legs unchanged by a height edit
  });

  it("a rectangular block's resize is unchanged (footprint branch never runs)", () => {
    const r = buildCarcassModel(600, 720, 560);
    const wide = resizeBlockWidth(r, r.blocks[0]!.id, 12000);
    expect(wide.blocks[0]!.footprint).toBeUndefined();
    expect(wide.blocks[0]!.box.w).toBe(12000);
  });
});
