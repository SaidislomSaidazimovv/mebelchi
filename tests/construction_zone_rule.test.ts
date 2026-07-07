// Step 4 — the ratio pill-row editor's engine core (CONSTRUCTION_FRAME_v4 §4, fixture 04-shelf-ratios):
// setZoneRule retypes ONE zone's division rule and re-solves the section's chain in place, so all the
// zones (and their dividing lines) reflow together — the section's own extent never changes.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, setZoneRule } from "../engine/structure/operations.js";

const rootId = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.zones[0]!.root.id;
const extentsY = (m: ReturnType<typeof buildCarcassModel>) =>
  [...m.blocks[0]!.zones[0]!.root.children].sort((a, b) => a.box.y - b.box.y).map((c) => c.box.h);

describe("Step 4 — setZoneRule (ratio pill-row reflow)", () => {
  it("retyping a zone to Ratio(0.6) gives the founder's 1 : 1 : 0.6 split, tiling exactly", () => {
    let m = buildCarcassModel(600, 720, 560); // 7200 mm10 tall
    m = divideSection(m, rootId(m), { kind: "equal", axis: "y", count: 3 }); // all Ratio(1) → 2400 each
    expect(extentsY(m)).toEqual([2400, 2400, 2400]);

    m = setZoneRule(m, rootId(m), 2, { kind: "ratio", weight: 0.6 }); // 1 : 1 : 0.6 of 7200
    const [a, b, c] = extentsY(m);
    expect(a).toBe(b); // the two weight-1 zones stay equal
    expect(Math.abs(c! - 0.6 * a!)).toBeLessThanOrEqual(2); // third ≈ 0.6 of the others
    expect(a! + b! + c!).toBe(7200); // no gap — always tiles the parent exactly
  });

  it("a Fixed zone holds its mm while the Ratio zones share the remainder", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, rootId(m), { kind: "equal", axis: "y", count: 3 });
    m = setZoneRule(m, rootId(m), 0, { kind: "fixed", mm10: 3000 }); // 3000 held, 4200 shared 1:1
    expect(extentsY(m)).toEqual([3000, 2100, 2100]);
    expect(extentsY(m).reduce((x, y) => x + y, 0)).toBe(7200);
  });

  it("editing the ratio back to 1 : 1 : 1 moves all three shelves to equal again (Gate 4)", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, rootId(m), { kind: "equal", axis: "y", count: 3 });
    m = setZoneRule(m, rootId(m), 2, { kind: "ratio", weight: 0.6 });
    expect(extentsY(m)[2]).toBeLessThan(2000); // shrunk

    m = setZoneRule(m, rootId(m), 2, { kind: "ratio", weight: 1 }); // change the pill 0.6 → 1
    expect(extentsY(m)).toEqual([2400, 2400, 2400]); // all three back to equal
  });

  it("the dividing lines move with the reflow (a shelf row really shifts)", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, rootId(m), { kind: "equal", axis: "y", count: 3 });
    const before = m.blocks[0]!.lines.map((l) => l.position_mm10).sort((x, y) => x - y);
    m = setZoneRule(m, rootId(m), 0, { kind: "ratio", weight: 2 }); // first zone twice as tall
    const after = m.blocks[0]!.lines.map((l) => l.position_mm10).sort((x, y) => x - y);
    expect(after).not.toEqual(before); // the boundaries actually moved
    expect(extentsY(m)[0]).toBeGreaterThan(extentsY(m)[1]!); // and zone 0 is now the tallest
  });

  it("is a no-op (same ref) on an undivided section", () => {
    const m = buildCarcassModel(600, 720, 560);
    expect(setZoneRule(m, rootId(m), 0, { kind: "flex" })).toBe(m);
  });

  it("is a no-op on an out-of-range zone index", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, rootId(m), { kind: "equal", axis: "y", count: 3 });
    expect(setZoneRule(m, rootId(m), 9, { kind: "flex" })).toBe(m);
  });
});
