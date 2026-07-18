// E1.1 + E1.2 — the Run (wall-run of blocks) type + `resolveRun` fit solver (v5 GATE E1 core math).
// A master combines several cabinets into ONE unit that fits a wall exactly: resolveRun distributes the
// wall length across the member blocks via the constraint solver (Fixed keeps its width, Flex/Ratio
// absorb), resizes each carcass, and lays them end-to-end with no gap. Blocks stay BLOCK-LOCAL (sections
// reflow from 0) with box-origin carrying the run position — the convention solveLayout renders by.
import { describe, it, expect } from "vitest";
import {
  addBlockToRun,
  groupBlocks,
  removeBlockFromRun,
  resolveRun,
  runFitStatus,
  ungroupBlocks,
} from "../engine/structure/operations.js";
import type { Block, Section, StructuralModel } from "../engine/contracts/structure.js";
import type { DivisionRule } from "../engine/contracts/variables.js";

const fixed = (mm10: number): DivisionRule => ({ kind: "fixed", mm10 });
const flex: DivisionRule = { kind: "flex" };
const ratio = (weight: number): DivisionRule => ({ kind: "ratio", weight });

/** A bare carcass block of width `w` (mm10) at origin — one empty zone/section, no interior. */
const mkBlock = (id: string, w: number): Block => {
  const box = { x: 0, y: 0, z: 0, w, h: 7200, d: 5600 };
  const root: Section = { id: `${id}_root`, box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: "storage" };
  return {
    id, name: id, box,
    zones: [{ id: `${id}_z`, name: "Корпус", rule: "manual", root }],
    components: [], instances: [], lines: [], rows: [],
  };
};

/** A run of three 600mm cabinets. Rules chosen per test. */
const mkModel = (r1: DivisionRule, r2: DivisionRule, r3: DivisionRule): StructuralModel => ({
  id: "run_test", name: "run",
  blocks: [mkBlock("b1", 6000), mkBlock("b2", 6000), mkBlock("b3", 6000)],
  runs: [{
    id: "run1", name: "Верхний ряд", axis: "x", length_mm10: 18000,
    members: [{ blockId: "b1", rule: r1 }, { blockId: "b2", rule: r2 }, { blockId: "b3", rule: r3 }],
  }],
  parts: [],
});

const widths = (m: StructuralModel) => m.blocks.map((b) => b.box.w);
const xs = (m: StructuralModel) => m.blocks.map((b) => b.box.x);

describe("E1 · Run — resolveRun fits a wall exactly", () => {
  it("GATE E1 — 6-8 uppers into a run: fixed + 2 flex fill a 4000mm wall, tiled end-to-end", () => {
    const out = resolveRun(mkModel(fixed(6000), flex, flex), "run1", 40000); // 4000mm wall
    // b1 keeps 600mm; the 3400mm pool splits equally to the two flex cabinets → 1700mm each.
    expect(widths(out)).toEqual([6000, 17000, 17000]);
    expect(xs(out)).toEqual([0, 6000, 23000]); // end-to-end, no gap
    expect(widths(out).reduce((a, b) => a + b, 0)).toBe(40000); // tiles the wall exactly
    expect(out.runs![0]!.length_mm10).toBe(40000);
    expect(runFitStatus(out, "run1", 40000)).toBe("ok");
  });

  it("interiors stay BLOCK-LOCAL: each block's root section reflows from 0 to the new width", () => {
    const out = resolveRun(mkModel(fixed(6000), flex, flex), "run1", 40000);
    out.blocks.forEach((b) => {
      const root = b.zones[0]!.root;
      expect(root.box.x).toBe(0); // section frame is block-local
      expect(root.box.w).toBe(b.box.w); // interior matches the new carcass width
    });
  });

  it("Ratio shares the pool by weight (2:1) after a Fixed cabinet", () => {
    const out = resolveRun(mkModel(fixed(10000), ratio(2), ratio(1)), "run1", 40000);
    // pool 3000mm → 2:1 → 2000 / 1000mm
    expect(widths(out)).toEqual([10000, 20000, 10000]);
    expect(xs(out)).toEqual([0, 10000, 30000]);
  });

  it("over-constrained — all-Fixed members exceed the wall → amber status, no negative widths", () => {
    const m = mkModel(fixed(20000), fixed(20000), fixed(20000)); // 6000mm of cabinets…
    expect(runFitStatus(m, "run1", 40000)).toBe("over-constrained"); // …into a 4000mm wall
    const out = resolveRun(m, "run1", 40000);
    expect(widths(out)).toEqual([20000, 20000, 20000]); // clamped to their fixed sizes
  });

  it("unknown run → no-op (same reference); a model without runs is untouched", () => {
    const m = mkModel(flex, flex, flex);
    expect(resolveRun(m, "nope", 40000)).toBe(m);
    const noRuns: StructuralModel = { ...m, runs: undefined };
    expect(resolveRun(noRuns, "run1", 40000)).toBe(noRuns);
  });

  it("rejects an invalid wall length", () => {
    expect(() => resolveRun(mkModel(flex, flex, flex), "run1", 0)).toThrow("RUN_INVALID_LENGTH");
  });

  it("works for ANY wall length — not just 4m: the length is a parameter, resolveChain fits whatever you pass", () => {
    // 800mm cupboard run, 2.5m, 3.72m (an odd real measurement), 5m — each tiles EXACTLY, no gap.
    for (const wall of [8000, 25000, 37200, 50000]) {
      const out = resolveRun(mkModel(fixed(6000), flex, flex), "run1", wall);
      const w = widths(out);
      expect(w.reduce((a, b) => a + b, 0)).toBe(wall); // fits the exact wall, whatever its size
      expect(w[0]).toBe(6000); // the fixed cabinet keeps 600mm at every wall size
      expect(xs(out)).toEqual([0, w[0]!, w[0]! + w[1]!]); // always end-to-end
      expect(runFitStatus(out, "run1", wall)).toBe(wall >= 6000 ? "ok" : "over-constrained");
    }
  });
});

/** Three loose blocks with gaps between them (widths 600 / 600 / 600 mm), NO run yet. */
const mkLoose = (): StructuralModel => {
  const at = (id: string, w: number, x: number): Block => {
    const b = mkBlock(id, w);
    return { ...b, box: { ...b.box, x } };
  };
  return {
    id: "loose", name: "loose",
    blocks: [at("b1", 6000, 0), at("b2", 6000, 9000), at("b3", 6000, 20000)], // gappy
    parts: [],
  };
};

describe("E1.3 · grouping operations — group / ungroup / add / remove", () => {
  it("groupBlocks combines cabinets into a run and tiles them end-to-end (removes gaps, does NOT resize)", () => {
    const out = groupBlocks(mkLoose(), ["b1", "b2", "b3"], { id: "run1" });
    expect(out.runs).toHaveLength(1);
    expect(out.runs![0]!.members.map((m) => m.blockId)).toEqual(["b1", "b2", "b3"]);
    expect(widths(out)).toEqual([6000, 6000, 6000]); // widths UNCHANGED (no resize on group)
    expect(xs(out)).toEqual([0, 6000, 12000]); // gaps removed, laid end-to-end from b1's position
    expect(out.runs![0]!.length_mm10).toBe(18000); // = sum of member widths
    expect(runFitStatus(out, "run1", 18000)).toBe("ok");
  });

  it("group (all Flex) then resolveRun redistributes to fit a wall exactly", () => {
    const grouped = groupBlocks(mkLoose(), ["b1", "b2", "b3"], { id: "run1" });
    const out = resolveRun(grouped, "run1", 40000); // 4m wall, 3 flex → ~equal thirds
    expect(widths(out).reduce((a, b) => a + b, 0)).toBe(40000);
    expect(Math.max(...widths(out)) - Math.min(...widths(out))).toBeLessThanOrEqual(1); // near-equal
  });

  it("ungroupBlocks dissolves the run; the blocks keep their positions/sizes", () => {
    const grouped = groupBlocks(mkLoose(), ["b1", "b2", "b3"], { id: "run1" });
    const out = ungroupBlocks(grouped, "run1");
    expect(out.runs).toBeUndefined();
    expect(xs(out)).toEqual(xs(grouped)); // positions unchanged by ungroup
  });

  it("addBlockToRun appends a block; the run grows and re-tiles", () => {
    const base = groupBlocks(mkLoose(), ["b1", "b2"], { id: "run1" }); // run of 2 (length 12000)
    const out = addBlockToRun(base, "run1", "b3");
    expect(out.runs![0]!.members.map((m) => m.blockId)).toEqual(["b1", "b2", "b3"]);
    expect(out.runs![0]!.length_mm10).toBe(18000); // grew by b3's 6000
    expect(xs(out)).toEqual([0, 6000, 12000]);
  });

  it("removeBlockFromRun shrinks the run; removing the last member dissolves it", () => {
    const run3 = groupBlocks(mkLoose(), ["b1", "b2", "b3"], { id: "run1" });
    const two = removeBlockFromRun(run3, "run1", "b3");
    expect(two.runs![0]!.members.map((m) => m.blockId)).toEqual(["b1", "b2"]);
    expect(two.runs![0]!.length_mm10).toBe(12000);
    const one = removeBlockFromRun(two, "run1", "b2");
    const none = removeBlockFromRun(one, "run1", "b1");
    expect(none.runs).toBeUndefined(); // last member removed → run dissolved
  });

  it("guards: <2 blocks, unknown block, and a block already in a run all throw", () => {
    expect(() => groupBlocks(mkLoose(), ["b1"], {})).toThrow("GROUP_NEEDS_2_BLOCKS");
    expect(() => groupBlocks(mkLoose(), ["b1", "ghost"], {})).toThrow("GROUP_BLOCK_NOT_FOUND");
    const grouped = groupBlocks(mkLoose(), ["b1", "b2"], { id: "run1" });
    expect(() => groupBlocks(grouped, ["b2", "b3"], { id: "run2" })).toThrow("GROUP_BLOCK_ALREADY_IN_RUN");
    expect(() => addBlockToRun(grouped, "run1", "b1")).toThrow("ADD_BLOCK_ALREADY_IN_RUN");
  });
});
