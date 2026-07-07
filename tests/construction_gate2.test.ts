// GATE 2 (HANDOVER_04 Step 2) — the constraint solver end to end:
//   (a) Furniture H 2100→2400 with a Locked sled → sled stays, shelf ratios preserved (<1mm).
//   (b) an all-Fixed column that can't absorb a resize → the amber warning fires; geometry clamps.
//   (c) a healthy (Ratio/Flex) chain never leaves a gap after any resize.
import { describe, it, expect } from "vitest";
import { resizeBlockHeight } from "../engine/structure/operations.js";
import { checkConstraints } from "../engine/structure/constraints.js";
import type { StructuralModel, Section, Line } from "../engine/contracts/structure.js";
import type { DivisionRule } from "../engine/contracts/variables.js";

// Build a one-block Furniture whose root is split along Y into the given zones (each {h, rule}).
function furniture(zones: { h: number; rule: DivisionRule }[]): StructuralModel {
  const W = 6000, D = 5600;
  const hTotal = zones.reduce((a, z) => a + z.h, 0);
  let y = 0;
  const children: Section[] = zones.map((z, i) => {
    const sec: Section = { id: `z${i}`, box: { x: 0, y, z: 0, w: W, h: z.h, d: D }, dividers: [], children: [], instanceIds: [], purpose: null, rule: z.rule };
    y += z.h;
    return sec;
  });
  let acc = 0;
  const lines: Line[] = zones.slice(0, -1).map((z, i) => {
    acc += z.h;
    return { id: `L${i}`, axis: "y", position_mm10: acc, boundsPartIds: [], groupId: null };
  });
  const root: Section = { id: "root", box: { x: 0, y: 0, z: 0, w: W, h: hTotal, d: D }, dividers: lines.map((l) => l.id), children, instanceIds: [], purpose: null };
  return { id: "m", name: "f", parts: [], blocks: [{ id: "blk", name: "B", box: { x: 0, y: 0, z: 0, w: W, h: hTotal, d: D }, zones: [{ id: "z", name: "Z", rule: "manual", root }], components: [], instances: [], lines, rows: [] }] };
}

const zoneHeights = (m: StructuralModel) => [...m.blocks[0]!.zones[0]!.root.children].sort((a, b) => a.box.y - b.box.y).map((c) => c.box.h);
const ratio = (w: number): DivisionRule => ({ kind: "ratio", weight: w });
const fixed = (mm10: number): DivisionRule => ({ kind: "fixed", mm10 });
const locked: DivisionRule = { kind: "locked", componentId: "sled" };

describe("GATE 2 — the table-law constraint solver, end to end", () => {
  it("(a) H 21000→24000 with a Locked sled 1800 → sled stays 1800, shelf ratios preserved", () => {
    let m = furniture([{ h: 1800, rule: locked }, { h: 9600, rule: ratio(1) }, { h: 9600, rule: ratio(1) }]);
    m = resizeBlockHeight(m, "blk", 24000); // 2100 → 2400 mm
    const hs = zoneHeights(m);
    expect(hs[0]).toBe(1800); // Locked sled unchanged
    expect(Math.abs(hs[1]! - hs[2]!)).toBeLessThanOrEqual(1); // 1:1 ratio preserved (<1mm)
    expect(hs.reduce((a, b) => a + b, 0)).toBe(24000); // still tiles exactly
    expect(checkConstraints(m)).toHaveLength(0); // healthy → no warning
  });

  it("(b) an all-Fixed column resized bigger → amber 'no-absorb' warning; sizes clamp, no overflow", () => {
    let m = furniture([{ h: 2000, rule: fixed(2000) }, { h: 2000, rule: fixed(2000) }, { h: 2000, rule: fixed(2000) }]);
    expect(checkConstraints(m)).toHaveLength(0); // fits exactly at first (6000 == 6000)
    m = resizeBlockHeight(m, "blk", 8000); // grow — nothing flexible can absorb the extra 2000
    expect(zoneHeights(m)).toEqual([2000, 2000, 2000]); // fixed zones clamp, never grow/negative
    const warnings = checkConstraints(m);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.status).toBe("no-absorb");
  });

  it("(b') an over-constrained column (Fixed sum > box) → 'over-constrained' warning", () => {
    let m = furniture([{ h: 2000, rule: fixed(2000) }, { h: 2000, rule: fixed(2000) }]);
    m = resizeBlockHeight(m, "blk", 3000); // 2 fixed 2000 (=4000) can't fit in 3000
    const warnings = checkConstraints(m);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.status).toBe("over-constrained");
  });

  it("(c) a Ratio/Flex chain never leaves a gap, at many resize targets", () => {
    for (const target of [12000, 6001, 18007, 9000]) {
      let m = furniture([{ h: 3000, rule: ratio(1) }, { h: 3000, rule: ratio(1) }, { h: 3000, rule: { kind: "flex" } }]);
      m = resizeBlockHeight(m, "blk", target);
      expect(zoneHeights(m).reduce((a, b) => a + b, 0)).toBe(target); // tiles the block exactly — no gap
      expect(m.blocks[0]!.box.h).toBe(target);
    }
  });
});
