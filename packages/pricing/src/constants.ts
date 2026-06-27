// Pricing assumptions — the geometric/manufacturing rules buildBom applies when
// it decomposes a parametric Module into panels, edges, hardware and operations.
//
// These are PLACEHOLDER engineering defaults (a frameless LDSP carcass), not
// rates. Rates live in the RateTable (data). When the Layer-2 parametric solver
// in the engine lands, this decomposition moves behind it; pricing keeps reading
// the same RateTable. Everything here is pure data — no logic, no I/O.

import type { BomKind, QuoteGroup } from "../../schema/src/index.js";

/** Carcass board thickness (LDSP). Used to derive inner widths. */
export const CARCASS_THICKNESS_MM = 16;

/** Facade board thickness (MDF/milled). Area-pricing ignores it; geometry uses it. */
export const FACADE_THICKNESS_MM = 18;

/**
 * Canonical SKUs buildBom emits for the default hardware set. priceProject
 * resolves them against RateTable.hardware by `sku`. These are the seam where a
 * real per-module hardware-selection model would plug in; until then every
 * module uses this default kit. The strings MUST exist in the active RateTable.
 */
export const DEFAULT_HARDWARE_SKUS = {
  hinge: "HNG-CLIP-110",
  slide: "SLIDE-BB-450",
  dowel: "DOWEL-8x30",
  cam: "CAM-MINIFIX-15",
} as const;

/** Cam-and-dowel joints per carcass: top↔side ×2 + bottom↔side ×2 = 4 joints. */
export const CARCASS_JOINTS = 4;
/** Each joint takes 2 cams + 2 dowels. */
export const CAMS_PER_MODULE = CARCASS_JOINTS * 2; // 8
export const DOWELS_PER_MODULE = CARCASS_JOINTS * 2; // 8

/** Drilled holes per hinge: 1 cup + 2 mounting-plate marks. */
export const HOLES_PER_HINGE = 3;
/** Adjustable shelf rests on 4 pins → 4 holes. */
export const HOLES_PER_SHELF = 4;
/** One drawer slide set → 4 screw holes (2 per runner). */
export const HOLES_PER_SLIDE_SET = 4;

/** BomLine.kind → the UI quote group it rolls up into (PRICING_AND_SCHEMA.md §4). */
export const KIND_TO_GROUP: Record<BomKind, QuoteGroup> = {
  panel: "carcassFacade",
  labor: "carcassFacade",
  edge: "worktopEdge",
  worktop: "worktopEdge",
  hardware: "hardware",
  operation: "cnc",
  delivery: "delivery",
};

/** Hinges for a single door, by leaf height (mm). */
export function hingesForDoorHeight(heightMm: number): number {
  if (heightMm <= 900) return 2;
  if (heightMm <= 1600) return 3;
  return 4;
}
