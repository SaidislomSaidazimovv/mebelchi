// The physical space the run lives in (PRICING_AND_SCHEMA.md §1).
// RoomPlan (scan) output normalises INTO this same shape so a scan and manual
// entry produce identical `Space` values (per ADR-002).

import type { MM } from "./common.js";

/** A wall constraint the layout must respect. */
export type SpaceConstraint =
  | "gas"
  | "riser"
  | "sockets"
  | "window"
  | "radiator";

/**
 * A window or door in the wall, with position + size.
 * Sourced from a RoomPlan scan or entered manually.
 *
 * NOTE: `Opening` is referenced but not defined in PRICING_AND_SCHEMA.md §1.
 * This is a minimal, sensible shape; revisit when the scan-normalisation
 * contract is finalised.
 */
export interface Opening {
  kind: "window" | "door";
  /** Distance from the run's left origin to the opening's left edge. */
  x: MM;
  /** Sill height above the floor (windows); 0 for doors. */
  y: MM;
  w: MM;
  h: MM;
}

export interface Space {
  source: "manual" | "roomplan";
  shape: "i" | "l" | "u";
  wallLength: MM;
  ceilingHeight: MM;
  waterWall: "left" | "center" | "right" | "none";
  constraints: SpaceConstraint[];
  /** Windows/doors with position + size (from scan or manual). */
  openings?: Opening[];
}
