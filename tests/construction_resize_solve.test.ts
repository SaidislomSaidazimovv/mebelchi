// Step 2.3 — resize is now RULE-AWARE (CONSTRUCTION_FRAME_v4 §4): resizing a block re-solves each
// division chain by its zone rules, not a single scale factor. Fixed zones keep their mm, Flex absorbs
// the change, Ratio zones share proportionally — and the zones always still tile the block exactly.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, resizeBlockHeight, resizeBlockWidth } from "../engine/structure/operations.js";

const blockId = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.id;
const rootId = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.zones[0]!.root.id;
// child zone extents along an axis, in position order
const extentsY = (m: ReturnType<typeof buildCarcassModel>) =>
  [...m.blocks[0]!.zones[0]!.root.children].sort((a, b) => a.box.y - b.box.y).map((c) => c.box.h);
const extentsX = (m: ReturnType<typeof buildCarcassModel>) =>
  [...m.blocks[0]!.zones[0]!.root.children].sort((a, b) => a.box.x - b.box.x).map((c) => c.box.w);

describe("Step 2.3 — rule-aware resize (the table law)", () => {
  it("FIXED zones stay put and FLEX absorbs the change when the block grows", () => {
    let m = buildCarcassModel(600, 720, 560); // 7200 mm10 tall
    m = divideSection(m, rootId(m), { kind: "fixed", axis: "y", step_mm10: 2000 });
    // → zones fixed(2000) × 3 + flex(remainder 1200)
    expect(extentsY(m)).toEqual([2000, 2000, 2000, 1200]);

    m = resizeBlockHeight(m, blockId(m), 8400); // +1200 mm10
    // the three fixed zones are UNCHANGED; only the flex zone grew (1200 → 2400)
    expect(extentsY(m)).toEqual([2000, 2000, 2000, 2400]);
    expect(extentsY(m).reduce((a, b) => a + b, 0)).toBe(8400); // still tiles exactly — no gap
    expect(m.blocks[0]!.box.h).toBe(8400);
  });

  it("RATIO zones share the change proportionally (equal stays equal)", () => {
    let m = buildCarcassModel(900, 720, 560); // 9000 mm10 wide
    m = divideSection(m, rootId(m), { kind: "equal", axis: "x", count: 3 }); // all Ratio(1)
    m = resizeBlockWidth(m, blockId(m), 12000);
    expect(extentsX(m)).toEqual([4000, 4000, 4000]); // shared equally to the new width
    expect(extentsX(m).reduce((a, b) => a + b, 0)).toBe(12000);
  });

  it("shrinking too — FIXED holds, FLEX gives up the space, never negative", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, rootId(m), { kind: "fixed", axis: "y", step_mm10: 2000 });
    m = resizeBlockHeight(m, blockId(m), 6800); // shrink from 7200: flex 1200 → 800
    expect(extentsY(m)).toEqual([2000, 2000, 2000, 800]);
    expect(extentsY(m).every((e) => e > 0)).toBe(true);
  });
});
