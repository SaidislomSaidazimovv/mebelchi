// S1-B — Structural operations (divide / moveLine(scope) / selectByTap / detach).
// Pure-function unit tests over the S1-A contract. Every test that mutates also
// asserts the two laws: the input is never mutated, and every coordinate stays
// an mm10 integer. See S1-B_TEST_PLAN.md for the case catalogue.

import { describe, expect, it } from "vitest";

import {
  countExceptions,
  isDetached,
  type Block,
  type Box3D,
  type Component,
  type Instance,
  type Line,
  type Row,
  type Section,
  type StructuralModel,
  type Zone,
} from "../engine/index.js";
import {
  detachInstance,
  divideSection,
  moveLine,
  reattachInstance,
  selectByTap,
  type DivideMode,
} from "../engine/structure/operations.js";

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

/** Deep-frozen snapshot for "input was not mutated" assertions. */
function snapshot<T>(value: T): T {
  return structuredClone(value);
}

/** Every number reachable from a model is an integer (mm10, no floats). */
function allIntegers(value: unknown): boolean {
  if (typeof value === "number") return Number.isInteger(value);
  if (value === null || typeof value !== "object") return true;
  return Object.values(value as Record<string, unknown>).every(allIntegers);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const box = (x: number, y: number, z: number, w: number, h: number, d: number): Box3D => ({
  x, y, z, w, h, d,
});

/** A bare leaf section spanning 6000 along x — the divide unit under test. */
function leaf(id = "sec", b: Box3D = box(0, 0, 0, 6000, 7200, 5600), instanceIds: string[] = []): Section {
  return { id, box: b, dividers: [], children: [], instanceIds, purpose: null };
}

/** A model whose zone root IS a divisible leaf section `sec`. */
function leafModel(b: Box3D = box(0, 0, 0, 6000, 7200, 5600), instanceIds: string[] = []): StructuralModel {
  const root = leaf("sec", b, instanceIds);
  const zone: Zone = { id: "z", name: "Body", rule: "manual", root };
  const block: Block = {
    id: "blk", name: "C", box: b,
    zones: [zone], components: [], instances: [], lines: [], rows: [],
  };
  return { id: "m", name: "W", blocks: [block], parts: [] };
}

/** New lines created on a block by a divide (test convenience). */
const blockLines = (m: StructuralModel): readonly Line[] => m.blocks[0]!.lines;

/** Simple model: one block, root split into left/right by `line_mid` (x). */
function simpleModel(): StructuralModel {
  const left: Section = {
    id: "sec_left", box: box(0, 0, 0, 3000, 7200, 5600),
    dividers: [], children: [], instanceIds: ["inst_a"], purpose: "storage",
  };
  const right: Section = {
    id: "sec_right", box: box(3000, 0, 0, 3000, 7200, 5600),
    dividers: [], children: [], instanceIds: ["inst_b"], purpose: "storage",
  };
  const lineMid: Line = {
    id: "line_mid", axis: "x", position_mm10: 3000, boundsPartIds: [], groupId: "lg_v",
  };
  const root: Section = {
    id: "sec_root", box: box(0, 0, 0, 6000, 7200, 5600),
    dividers: ["line_mid"], children: [left, right], instanceIds: [], purpose: null,
  };
  const zone: Zone = { id: "z", name: "Body", rule: "manual", root };
  const shelf: Component = { id: "cmp_shelf", name: "Shelf", partIds: ["p_shelf"], role: "internal_shelf" };
  const instA: Instance = {
    id: "inst_a", componentId: "cmp_shelf", sectionId: "sec_left",
    anchor: { x: 0, y: 1800, z: 0 }, link: "linked",
  };
  const instB: Instance = {
    id: "inst_b", componentId: "cmp_shelf", sectionId: "sec_right",
    anchor: { x: 3000, y: 1800, z: 0 }, link: "linked",
  };
  const block: Block = {
    id: "blk", name: "Cabinet", box: box(0, 0, 0, 6000, 7200, 5600),
    zones: [zone], components: [shelf], instances: [instA, instB], lines: [lineMid], rows: [],
  };
  return { id: "m", name: "Wall", blocks: [block], parts: [] };
}

/**
 * Wall model for scope discrimination: root split (x) into two carcasses sec_A /
 * sec_B; each carcass split (y) by lineA / lineB into bottom/top. lineA∈group gA,
 * lineB∈group gB (distinct, so `line` ≠ `row`). Row `base` lists both carcasses.
 */
function wallModel(): StructuralModel {
  const aBottom: Section = {
    id: "a_bottom", box: box(0, 0, 0, 3000, 3600, 5600),
    dividers: [], children: [], instanceIds: [], purpose: null,
  };
  const aTop: Section = {
    id: "a_top", box: box(0, 3600, 0, 3000, 3600, 5600),
    dividers: [], children: [], instanceIds: [], purpose: null,
  };
  const bBottom: Section = {
    id: "b_bottom", box: box(3000, 0, 0, 3000, 3600, 5600),
    dividers: [], children: [], instanceIds: [], purpose: null,
  };
  const bTop: Section = {
    id: "b_top", box: box(3000, 3600, 0, 3000, 3600, 5600),
    dividers: [], children: [], instanceIds: [], purpose: null,
  };
  const lineMid: Line = { id: "line_mid", axis: "x", position_mm10: 3000, boundsPartIds: [], groupId: null };
  const lineA: Line = { id: "lineA", axis: "y", position_mm10: 3600, boundsPartIds: [], groupId: "gA" };
  const lineB: Line = { id: "lineB", axis: "y", position_mm10: 3600, boundsPartIds: [], groupId: "gB" };
  const secA: Section = {
    id: "sec_A", box: box(0, 0, 0, 3000, 7200, 5600),
    dividers: ["lineA"], children: [aBottom, aTop], instanceIds: [], purpose: null,
  };
  const secB: Section = {
    id: "sec_B", box: box(3000, 0, 0, 3000, 7200, 5600),
    dividers: ["lineB"], children: [bBottom, bTop], instanceIds: [], purpose: null,
  };
  const root: Section = {
    id: "sec_root", box: box(0, 0, 0, 6000, 7200, 5600),
    dividers: ["line_mid"], children: [secA, secB], instanceIds: [], purpose: null,
  };
  const zone: Zone = { id: "z", name: "Body", rule: "manual", root };
  const baseRow: Row = { id: "row_base", kind: "base", sectionIds: ["sec_A", "sec_B"] };
  const block: Block = {
    id: "blk", name: "Wall cabinet", box: box(0, 0, 0, 6000, 7200, 5600),
    zones: [zone], components: [], instances: [], lines: [lineMid, lineA, lineB], rows: [baseRow],
  };
  return { id: "m", name: "Wall", blocks: [block], parts: [] };
}

/** Find a line/section anywhere in a model (test convenience). */
const lineOf = (m: StructuralModel, id: string): Line =>
  m.blocks.flatMap((b) => b.lines).find((l) => l.id === id)!;
function sectionOf(m: StructuralModel, id: string): Section {
  let hit: Section | undefined;
  const walk = (s: Section) => { if (s.id === id) hit = s; s.children.forEach(walk); };
  m.blocks.forEach((b) => b.zones.forEach((z) => walk(z.root)));
  return hit!;
}

// ===========================================================================
// 1 · divideSection
// ===========================================================================

describe("divideSection", () => {
  const divided = (m: StructuralModel, mode: DivideMode) => {
    const next = divideSection(m, "sec", mode);
    return { next, section: sectionOf(next, "sec"), lines: blockLines(next) };
  };

  it("input model is never mutated and output is all mm10 integers", () => {
    const m = leafModel();
    const before = snapshot(m);
    const next = divideSection(m, "sec", { kind: "equal", axis: "x", count: 3 });
    expect(m).toEqual(before);
    expect(allIntegers(next)).toBe(true);
  });

  it("returns the whole model with new lines spliced into the block", () => {
    const { section, lines } = divided(leafModel(), { kind: "direct", axis: "x", at_mm10: 2000 });
    expect(lines).toHaveLength(1); // line lives on Block.lines now
    expect(section.dividers).toEqual([lines[0]!.id]);
  });

  // 1a · direct-split
  it("direct-split cuts a section into two at the given coordinate", () => {
    const { section, lines } = divided(leafModel(), { kind: "direct", axis: "x", at_mm10: 2000 });
    expect(section.children).toHaveLength(2);
    expect(lines[0]!.position_mm10).toBe(2000);
    expect(section.children[0]!.box.w).toBe(2000);
    expect(section.children[1]!.box.x).toBe(2000);
    expect(section.children[1]!.box.w).toBe(4000);
  });

  it("direct-split rejects a position outside the section bounds", () => {
    expect(() => divideSection(leafModel(), "sec", { kind: "direct", axis: "x", at_mm10: 9000 })).toThrow(
      /OUT_OF_BOUNDS/,
    );
    expect(() => divideSection(leafModel(), "sec", { kind: "direct", axis: "x", at_mm10: 0 })).toThrow();
  });

  // 1b · ratio
  it("ratio 1:1:0.6 produces three children in proportion, sum conserved", () => {
    const { section } = divided(leafModel(), { kind: "ratio", axis: "x", ratio: [1, 1, 0.6] });
    const widths = section.children.map((c) => c.box.w);
    expect(widths).toHaveLength(3);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(6000); // exact, no drift
    expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(1); // 1:1 within rounding
    expect(widths[2]).toBeLessThan(widths[0]!); // 0.6 share smaller
  });

  it("ratio of length 1 is a no-op (model unchanged, same reference)", () => {
    const m = leafModel();
    expect(divideSection(m, "sec", { kind: "ratio", axis: "x", ratio: [1] })).toBe(m);
  });

  it("ratio rejects non-positive shares", () => {
    expect(() => divideSection(leafModel(), "sec", { kind: "ratio", axis: "x", ratio: [1, 0] })).toThrow(
      /INVALID_RATIO/,
    );
  });

  // 1c · equal-N
  it("equal-N=3 produces three equal children", () => {
    const { section } = divided(leafModel(), { kind: "equal", axis: "x", count: 3 });
    expect(section.children.map((c) => c.box.w)).toEqual([2000, 2000, 2000]);
  });

  it("equal-N distributes an indivisible extent without losing a tenth", () => {
    const m = leafModel(box(0, 0, 0, 1000, 100, 100));
    const { section } = divided(m, { kind: "equal", axis: "x", count: 3 });
    const widths = section.children.map((c) => c.box.w);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(1000); // exact, no drift
    expect(widths.every((w) => Number.isInteger(w))).toBe(true);
  });

  it("equal-N=1 is a no-op; N<1 throws", () => {
    const m = leafModel();
    expect(divideSection(m, "sec", { kind: "equal", axis: "x", count: 1 })).toBe(m);
    expect(() => divideSection(m, "sec", { kind: "equal", axis: "x", count: 0 })).toThrow(/INVALID_COUNT/);
  });

  // 1d · fixed-mm
  it("fixed-mm places cuts every step and keeps the remainder", () => {
    const { section } = divided(leafModel(), { kind: "fixed", axis: "x", step_mm10: 2500 });
    // 6000 / 2500 → cuts at 2500, 5000 → widths 2500, 2500, 1000
    expect(section.children.map((c) => c.box.w)).toEqual([2500, 2500, 1000]);
  });

  it("fixed-mm step larger than the section is a no-op", () => {
    const m = leafModel();
    expect(divideSection(m, "sec", { kind: "fixed", axis: "x", step_mm10: 9000 })).toBe(m);
  });

  // 1e · structural guards
  it("rejects dividing a non-leaf section", () => {
    const once = divideSection(leafModel(), "sec", { kind: "equal", axis: "x", count: 2 });
    expect(() => divideSection(once, "sec", { kind: "equal", axis: "x", count: 2 })).toThrow(/NOT_LEAF/);
  });

  it("rejects an unknown sectionId", () => {
    expect(() => divideSection(leafModel(), "ghost", { kind: "equal", axis: "x", count: 2 })).toThrow(
      /NOT_FOUND/,
    );
  });

  it("carries existing instances into the first child (parent stays content-free)", () => {
    const m = leafModel(box(0, 0, 0, 6000, 7200, 5600), ["inst_x"]);
    const { section } = divided(m, { kind: "equal", axis: "x", count: 2 });
    expect(section.instanceIds).toEqual([]);
    expect(section.children[0]!.instanceIds).toEqual(["inst_x"]);
    expect(section.children[1]!.instanceIds).toEqual([]);
  });

  it("divides along y as well as x (door light-grid, FRAME :247 T3)", () => {
    const m = leafModel(box(0, 0, 0, 1800, 600, 200));
    const { section } = divided(m, { kind: "equal", axis: "y", count: 3 });
    expect(section.children.map((c) => c.box.h)).toEqual([200, 200, 200]);
  });
});

// ===========================================================================
// 2 · moveLine — scope propagation
// ===========================================================================

describe("moveLine — scope propagation", () => {
  it("input model is never mutated and output is all mm10 integers", () => {
    const m = simpleModel();
    const before = snapshot(m);
    const next = moveLine(m, "line_mid", 500, "local");
    expect(m).toEqual(before);
    expect(allIntegers(next)).toBe(true);
  });

  // 2a · local
  it("local moves only the tapped line and reflows its two neighbours", () => {
    const next = moveLine(simpleModel(), "line_mid", 500, "local");
    expect(lineOf(next, "line_mid").position_mm10).toBe(3500);
    expect(sectionOf(next, "sec_left").box.w).toBe(3500);
    expect(sectionOf(next, "sec_right").box.x).toBe(3500);
    expect(sectionOf(next, "sec_right").box.w).toBe(2500);
  });

  it("reflow conserves the total extent (mass conservation)", () => {
    const next = moveLine(simpleModel(), "line_mid", 500, "local");
    const total = sectionOf(next, "sec_left").box.w + sectionOf(next, "sec_right").box.w;
    expect(total).toBe(6000);
  });

  // 2b · line (group, default semantics)
  it("line scope moves only same-group lines (gA), leaving gB put", () => {
    const next = moveLine(wallModel(), "lineA", 400, "line");
    expect(lineOf(next, "lineA").position_mm10).toBe(4000);
    expect(lineOf(next, "lineB").position_mm10).toBe(3600); // different group, untouched
  });

  // 2c · row
  it("row scope moves the aligned divider in every carcass of the row", () => {
    const next = moveLine(wallModel(), "lineA", 400, "row");
    expect(lineOf(next, "lineA").position_mm10).toBe(4000);
    expect(lineOf(next, "lineB").position_mm10).toBe(4000); // sec_B shares row_base
    expect(lineOf(next, "line_mid").position_mm10).toBe(3000); // x-axis, untouched
    expect(sectionOf(next, "a_bottom").box.h).toBe(4000);
    expect(sectionOf(next, "b_top").box.y).toBe(4000);
  });

  // 2d · global
  it("global scope moves every same-axis line in the model", () => {
    const next = moveLine(wallModel(), "lineA", 400, "global");
    expect(lineOf(next, "lineA").position_mm10).toBe(4000);
    expect(lineOf(next, "lineB").position_mm10).toBe(4000);
    expect(lineOf(next, "line_mid").position_mm10).toBe(3000); // x stays
  });

  // 2e · reflow integrity / guards
  it("delta = 0 is a no-op returning the same model reference", () => {
    const m = simpleModel();
    expect(moveLine(m, "line_mid", 0, "local")).toBe(m);
  });

  it("a move that would collapse a section throws", () => {
    expect(() => moveLine(simpleModel(), "line_mid", 3000, "local")).toThrow(/COLLAPSE/);
  });

  it("an unknown lineId throws and the model is untouched", () => {
    const m = simpleModel();
    const before = snapshot(m);
    expect(() => moveLine(m, "nope", 100, "local")).toThrow(/NOT_FOUND/);
    expect(m).toEqual(before);
  });

  it("a non-integer delta throws", () => {
    expect(() => moveLine(simpleModel(), "line_mid", 12.5, "local")).toThrow(/NON_INTEGER/);
  });

  it("untouched blocks/zones are preserved by reference (transform-not-rebuild)", () => {
    const m = wallModel();
    const next = moveLine(m, "lineA", 400, "line");
    // sec_B's subtree didn't move under line-scope → same reference.
    expect(sectionOf(next, "sec_B")).toBe(sectionOf(m, "sec_B"));
  });
});

// ===========================================================================
// 3 · selectByTap — group-first selection
// ===========================================================================

describe("selectByTap — group-first selection", () => {
  it("tapping a part selects the whole Component, not a single instance", () => {
    const sel = selectByTap(simpleModel(), "p_shelf");
    expect(sel?.componentId).toBe("cmp_shelf");
    expect(sel?.detached).toBe(false);
  });

  it("blast radius lists every linked sibling instance", () => {
    const sel = selectByTap(simpleModel(), "p_shelf");
    expect(sel?.instanceIds.slice().sort()).toEqual(["inst_a", "inst_b"]);
  });

  it("a detached instance with its own part resolves to just that one", () => {
    const m = simpleModel();
    // Give inst_b a private (detached) part; tapping it selects only inst_b.
    const block = m.blocks[0]!;
    const instances = block.instances.map((i) =>
      i.id === "inst_b" ? { ...i, link: "detached" as const, partIds: ["p_shelf_b"] } : i,
    );
    const m2: StructuralModel = { ...m, blocks: [{ ...block, instances }] };
    const sel = selectByTap(m2, "p_shelf_b");
    expect(sel).toEqual({ componentId: "cmp_shelf", instanceIds: ["inst_b"], detached: true });
  });

  it("excludes detached siblings from the linked blast radius", () => {
    const detached = detachInstance(simpleModel(), "inst_b");
    const sel = selectByTap(detached, "p_shelf");
    expect(sel?.instanceIds).toEqual(["inst_a"]); // inst_b is now an exception
  });

  it("an unknown part returns null (no crash)", () => {
    expect(selectByTap(simpleModel(), "ghost")).toBeNull();
  });

  it("does not mutate the model (read-only resolver)", () => {
    const m = simpleModel();
    const before = snapshot(m);
    selectByTap(m, "p_shelf");
    expect(m).toEqual(before);
  });
});

// ===========================================================================
// 4 · detachInstance / reattachInstance — exceptions
// ===========================================================================

describe("detachInstance / reattachInstance — exceptions", () => {
  const blockOf = (m: StructuralModel) => m.blocks[0]!;
  const instOf = (m: StructuralModel, id: string) =>
    blockOf(m).instances.find((i) => i.id === id)!;

  // 4a · detach
  it("detach marks the instance ✂ and snapshots its component parts", () => {
    const next = detachInstance(simpleModel(), "inst_b");
    const inst = instOf(next, "inst_b");
    expect(isDetached(inst)).toBe(true);
    expect(inst.partIds).toEqual(["p_shelf"]); // snapshot of the component
  });

  it("detach raises the exceptions count by one", () => {
    const m = simpleModel();
    expect(countExceptions(blockOf(m))).toBe(0);
    expect(countExceptions(blockOf(detachInstance(m, "inst_b")))).toBe(1);
  });

  it("re-detaching an already-detached instance is a no-op (count steady)", () => {
    const once = detachInstance(simpleModel(), "inst_b");
    const twice = detachInstance(once, "inst_b");
    expect(twice).toBe(once); // same reference, no churn
    expect(countExceptions(blockOf(twice))).toBe(1);
  });

  it("detach does not mutate the input model", () => {
    const m = simpleModel();
    const before = snapshot(m);
    detachInstance(m, "inst_b");
    expect(m).toEqual(before);
  });

  it("an unknown instanceId throws", () => {
    expect(() => detachInstance(simpleModel(), "nope")).toThrow(/NOT_FOUND/);
  });

  // 4b · reattach
  it("reattach clears the ✂ override and re-links the instance", () => {
    const detached = detachInstance(simpleModel(), "inst_b");
    const inst = instOf(reattachInstance(detached, "inst_b"), "inst_b");
    expect(isDetached(inst)).toBe(false);
    expect(inst.partIds).toBeNull();
  });

  it("reattach lowers the exceptions count by one", () => {
    const detached = detachInstance(simpleModel(), "inst_b");
    expect(countExceptions(blockOf(reattachInstance(detached, "inst_b")))).toBe(0);
  });

  it("reattaching an already-linked instance is a no-op (count never goes negative)", () => {
    const m = simpleModel();
    const same = reattachInstance(m, "inst_b");
    expect(same).toBe(m);
    expect(countExceptions(blockOf(same))).toBe(0);
  });

  // 4c · counter integrity
  it("detach → detach → reattach leaves exactly one exception", () => {
    let m = simpleModel();
    m = detachInstance(m, "inst_a");
    m = detachInstance(m, "inst_b");
    m = reattachInstance(m, "inst_a");
    expect(countExceptions(blockOf(m))).toBe(1);
    expect(isDetached(instOf(m, "inst_b"))).toBe(true);
  });

  it("the exceptions count always equals the number of ✂ instances", () => {
    const m = detachInstance(detachInstance(simpleModel(), "inst_a"), "inst_b");
    const detachedCount = blockOf(m).instances.filter(isDetached).length;
    expect(countExceptions(blockOf(m))).toBe(detachedCount);
  });
});
