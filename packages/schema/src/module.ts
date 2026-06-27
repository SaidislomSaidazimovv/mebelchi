// A single cabinet module in the run (PRICING_AND_SCHEMA.md §1).

import type { MM, UUID } from "./common.js";

export type ModuleKind = "base" | "tall" | "upper";

export type ModuleFill = "shelves" | "drawers" | "open";

export type DoorStyle = "flat" | "milled" | "glass" | "none";

export type HandleType = "bar" | "profile" | "knob" | "none";

export interface ModuleDoor {
  style: DoorStyle;
  hingeSide?: "L" | "R";
}

export interface ModuleHandle {
  type: HandleType;
}

export interface Module {
  id: UUID;
  kind: ModuleKind;
  w: MM;
  h: MM;
  d: MM;
  fill: ModuleFill;
  /** Number of shelves or drawers. */
  count: number;
  /** Vertical separators (0..n). */
  dividers: number;
  door: ModuleDoor;
  handle: ModuleHandle;
  /** Optional override — enables the "split facade/carcass" advisor. */
  facadeMaterialId?: UUID;
  /** Applied hardening-panel preset ids. */
  hardening?: string[];
}
