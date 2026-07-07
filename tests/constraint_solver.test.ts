// Step 2.2 — the constraint solver (CONSTRUCTION_FRAME_v4 §4), star-sizing. Pure resolveChain: zones
// tile the total exactly; Fixed/Locked keep their size, Ratio shares the pool by weight, Flex takes a
// weight-1 share. Integer mm10, no drift. Non-fatal statuses flag the amber cases.
import { describe, it, expect } from "vitest";
import { resolveChain, type ChainZone } from "../engine/structure/constraintSolver.js";
import type { DivisionRule } from "../engine/contracts/variables.js";

const z = (rule: DivisionRule, currentSize = 0): ChainZone => ({ rule, currentSize });
const ratio = (weight: number): DivisionRule => ({ kind: "ratio", weight });
const fixed = (mm10: number): DivisionRule => ({ kind: "fixed", mm10 });
const flex: DivisionRule = { kind: "flex" };
const locked: DivisionRule = { kind: "locked", componentId: "c" };
const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);

describe("Step 2.2 — resolveChain (star sizing)", () => {
  it("all-ratio 1:1:0.6 → shares the whole extent proportionally, sums exactly", () => {
    const r = resolveChain(2600, [z(ratio(1)), z(ratio(1)), z(ratio(0.6))]);
    expect(r.sizes).toEqual([1000, 1000, 600]);
    expect(r.status).toBe("ok");
    expect(sum(r.sizes)).toBe(2600);
  });

  it("Fixed + Ratio → Fixed keeps its mm, Ratio shares the pool", () => {
    const r = resolveChain(3000, [z(fixed(1000)), z(ratio(1)), z(ratio(1))]);
    expect(r.sizes).toEqual([1000, 1000, 1000]);
    expect(r.status).toBe("ok");
  });

  it("GATE 2(a) — a Locked zone stays; Ratio zones preserve their ratio when the total grows", () => {
    const chain = [z(locked, 1800), z(ratio(1), 1200), z(ratio(1), 1200)];
    const small = resolveChain(4200, chain); // locked 1800 + pool 2400 → 1200/1200
    expect(small.sizes).toEqual([1800, 1200, 1200]);
    const grown = resolveChain(4800, chain); // total +600 → locked STILL 1800, ratio grow equally
    expect(grown.sizes).toEqual([1800, 1500, 1500]); // sled unchanged, 1:1 preserved
    expect(grown.status).toBe("ok");
  });

  it("Flex absorbs the remainder after Fixed", () => {
    const r = resolveChain(3000, [z(fixed(1000)), z(flex)]);
    expect(r.sizes).toEqual([1000, 2000]);
  });

  it("Ratio + Flex share the pool by star weight (flex = 1)", () => {
    const r = resolveChain(3000, [z(ratio(2)), z(flex)]);
    expect(r.sizes).toEqual([2000, 1000]); // weights 2 : 1 of the 3000 pool
  });

  it("over-constrained — Fixed+Locked exceed the total → status flags it, no negative sizes", () => {
    const r = resolveChain(3000, [z(fixed(2000)), z(fixed(2000))]);
    expect(r.status).toBe("over-constrained");
    expect(r.sizes).toEqual([2000, 2000]); // clamped to their fixed sizes (overflow, not negative)
  });

  it("no-absorb — leftover space but nothing flexible → amber status (a gap would form)", () => {
    const r = resolveChain(3000, [z(fixed(1000)), z(locked, 500)]);
    expect(r.status).toBe("no-absorb");
    expect(sum(r.sizes)).toBe(1500); // less than 3000 — the caller warns
  });

  it("no rounding drift — an odd total splits across equal ratios and still sums exactly", () => {
    const r = resolveChain(1000, [z(ratio(1)), z(ratio(1)), z(ratio(1))]);
    expect(sum(r.sizes)).toBe(1000); // e.g. 333 + 333 + 334
    expect(Math.max(...r.sizes) - Math.min(...r.sizes)).toBeLessThanOrEqual(1); // near-equal
  });

  it("an empty chain resolves to nothing, cleanly", () => {
    expect(resolveChain(1000, [])).toEqual({ sizes: [], status: "ok" });
  });
});
