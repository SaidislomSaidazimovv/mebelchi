// Step 2.1 (CONSTRUCTION_FRAME_v4 §4) — a division stamps a DivisionRule on every CHILD ZONE (Section),
// not on the N-1 lines, so every share of an N-way split is captured. Populated but not yet read by a
// solver here (Step 2.2+), so no geometry changes; the existing suite stays green.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection } from "../engine/structure/operations.js";
import type { DivisionRule } from "../engine/contracts/variables.js";

// The child zones (leaves of the root after one divide) and their rules.
const zoneRules = (m: ReturnType<typeof buildCarcassModel>): (DivisionRule | undefined)[] =>
  m.blocks[0]!.zones[0]!.root.children.map((c) => c.rule);

describe("Step 2.1 — division rule stamped per ZONE", () => {
  it("equal split → every zone is Ratio(weight 1) (all equal, no zone dropped)", () => {
    let m = buildCarcassModel(900, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 3 }); // 3 zones
    const rules = zoneRules(m);
    expect(rules).toHaveLength(3);
    expect(rules.every((r) => r?.kind === "ratio" && r.weight === 1)).toBe(true);
  });

  it("ratio split → each zone carries its OWN weight, including the trailing one", () => {
    let m = buildCarcassModel(900, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "ratio", axis: "x", ratio: [1, 1, 0.6] });
    expect(zoneRules(m).map((r) => (r?.kind === "ratio" ? r.weight : null))).toEqual([1, 1, 0.6]);
  });

  it("fixed step split → each zone Fixed(step), except the last which is Flex (absorbs remainder)", () => {
    let m = buildCarcassModel(900, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "fixed", axis: "y", step_mm10: 2000 });
    const rules = zoneRules(m);
    expect(rules.length).toBeGreaterThan(1);
    expect(rules.slice(0, -1).every((r) => r?.kind === "fixed" && r.mm10 === 2000)).toBe(true);
    expect(rules[rules.length - 1]!.kind).toBe("flex");
  });

  it("direct single cut → both zones are Flex", () => {
    let m = buildCarcassModel(900, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "direct", axis: "x", at_mm10: 3000 });
    const rules = zoneRules(m);
    expect(rules).toHaveLength(2);
    expect(rules.every((r) => r?.kind === "flex")).toBe(true);
  });
});
