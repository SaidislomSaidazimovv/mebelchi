// Step 2.2 · The constraint solver — "acts like a table" (CONSTRUCTION_FRAME_v4 §2, §4).
//
// PURE + DETERMINISTIC: given a parent's total extent and its child zones (each with a DivisionRule),
// resolve every zone's new size so they tile the extent EXACTLY. Star-sizing model (founder-approved):
//   • Fixed  — keeps its absolute mm.
//   • Locked — keeps the component's size (its current extent — the component owns the dimension).
//   • Ratio  — shares the leftover "pool" proportionally by weight.
//   • Flex   — a weight-1 share of the pool (absorbs its part of the remainder).
// So the pool (total − Fixed − Locked) is split among Ratio+Flex by star weight (ratio weight, flex=1).
//
// Integer mm10 with NO drift: the last flexible zone takes the rounding remainder, so Σ sizes == total
// exactly whenever the chain is satisfiable. Two non-fatal statuses feed the amber warning (§4):
//   • "over-constrained" — Fixed+Locked exceed the total (pool would be negative); sizes clamp.
//   • "no-absorb"        — leftover pool but no Ratio/Flex zone to take it (a gap would form).

import type { mm10 } from "../contracts/types.js";
import type { DivisionRule } from "../contracts/variables.js";

/** One child zone fed to the solver: its rule + its current size (used by Locked, which keeps it). */
export interface ChainZone {
  readonly rule: DivisionRule;
  readonly currentSize: mm10;
}

export type ChainStatus = "ok" | "over-constrained" | "no-absorb";

export interface ChainResult {
  /** New size per zone, in input order. Σ == total when status is "ok". */
  readonly sizes: readonly mm10[];
  readonly status: ChainStatus;
}

/** A zone's star weight: Ratio → its weight, Flex → 1, Fixed/Locked → 0 (absolute, not in the pool). */
function starWeight(rule: DivisionRule): number {
  if (rule.kind === "ratio") return Math.max(0, rule.weight);
  if (rule.kind === "flex") return 1;
  return 0;
}

/** The absolute (non-pool) size a Fixed/Locked zone claims; 0 for a pool (Ratio/Flex) zone. */
function absoluteSize(z: ChainZone): mm10 {
  if (z.rule.kind === "fixed") return Math.max(0, z.rule.mm10);
  if (z.rule.kind === "locked") return Math.max(0, z.currentSize);
  return 0;
}

/**
 * Resolve a division chain to new integer mm10 sizes that tile `total`. See the module header for the
 * star-sizing rules. Never throws; a non-fatal `status` flags an over-constrained or unabsorbable chain
 * (the caller raises the amber warning). An empty chain returns no sizes with status "ok".
 */
export function resolveChain(total: mm10, zones: readonly ChainZone[]): ChainResult {
  if (zones.length === 0) return { sizes: [], status: "ok" };

  let absSum = 0;
  let weightSum = 0;
  for (const z of zones) {
    absSum += absoluteSize(z);
    weightSum += starWeight(z.rule);
  }

  let status: ChainStatus = "ok";
  let pool = total - absSum;
  if (pool < 0) {
    status = "over-constrained"; // Fixed+Locked overflow the total → clamp the pool to nothing
    pool = 0;
  } else if (pool > 0 && weightSum <= 0) {
    status = "no-absorb"; // leftover space but nothing flexible to take it → a gap would form
  }

  // Absolute zones first; flexible zones filled below.
  const sizes: number[] = zones.map(absoluteSize);
  const flexIdx: number[] = [];
  zones.forEach((z, i) => { if (starWeight(z.rule) > 0) flexIdx.push(i); });

  if (flexIdx.length > 0) {
    let assigned = 0;
    for (let k = 0; k < flexIdx.length; k += 1) {
      const i = flexIdx[k]!;
      // The LAST flexible zone takes the exact remainder (no rounding drift — Σ stays exact).
      const share = k === flexIdx.length - 1
        ? pool - assigned
        : Math.round((pool * starWeight(zones[i]!.rule)) / weightSum);
      sizes[i] = share;
      assigned += share;
    }
  }

  return { sizes, status };
}
