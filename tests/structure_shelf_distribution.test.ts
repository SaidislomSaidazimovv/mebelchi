// B2 — shelves distribute into EQUAL clear openings, boundary-aware. A section end is a full carcass
// board at a block edge but only HALF a board at a divider (centred on the cut). The distribution must
// account for that so a shelf column bounded by a divider (e.g. a lower ROW) still has equal gaps —
// the earlier fix insetting a full board at both ends only handled carcass-bounded sections.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const T = 160; // board

/** The clear openings (mm10) between a section's bounding panels and its shelves. */
function clearOpenings(m: StructuralModel, leafId: string): number[] {
  const b = m.blocks[0]!;
  const sec = leafSections(b.zones[0]!.root).find((s) => s.id === leafId)!;
  const roleOf = (i: (typeof b.instances)[number]) => b.components.find((c) => c.id === i.componentId)?.role;
  const ys = b.instances.filter((i) => roleOf(i) === "internal_shelf" && i.sectionId === leafId).map((i) => i.anchor.y).sort((a, c) => a - c);
  const bottomInset = sec.box.y === b.box.y ? T : T / 2;
  const topInset = sec.box.y + sec.box.h === b.box.y + b.box.h ? T : T / 2;
  const lo = sec.box.y + bottomInset, hi = sec.box.y + sec.box.h - topInset;
  const marks = [lo, ...ys.flatMap((y) => [y, y + T]), hi]; // interior floor, shelf bottoms+tops, interior ceiling
  const gaps: number[] = [];
  for (let i = 0; i < marks.length; i += 2) gaps.push(marks[i + 1]! - marks[i]!);
  return gaps;
}

describe("shelf vertical distribution — equal clear openings", () => {
  it("a plain carcass column: 3 shelves → 4 equal openings", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    for (let i = 0; i < 3; i++) m = addInstance(m, leaf, "shelf");
    const gaps = clearOpenings(m, leaf);
    expect(gaps.length).toBe(4);
    expect(new Set(gaps).size).toBe(1); // all equal
    expect(gaps[0]).toBe(1600); // (720−16−16−3×16)/4 = 160mm
  });

  it("a ROW bounded by a horizontal divider: shelves still get EQUAL openings (B2)", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "y", count: 2 });
    const rows = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.y - b.box.y);
    const bottomRow = rows[0]!; // bottom = carcass, top = horizontal divider
    for (let i = 0; i < 3; i++) m = addInstance(m, bottomRow.id, "shelf");
    const gaps = clearOpenings(m, bottomRow.id);
    expect(gaps.length).toBe(4);
    expect(new Set(gaps).size).toBe(1); // all equal — the divider end insets only half a board
  });
});
