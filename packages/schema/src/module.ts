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

/** A pre-decomposed panel — the app supplies these for a hybrid (Fill-Editor) module whose real
 *  layout the legacy fill/count/dividers can't express, so pricing + cut list read the true panels
 *  instead of the approximation. Shape mirrors pricing's DerivedPanel. */
export interface ModulePanel {
  role: "carcass" | "facade";
  name: string;
  lengthMm: MM;
  widthMm: MM;
  materialRef: UUID;
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
  /** Pre-decomposed panels for a hybrid layout — when set, they OVERRIDE the fill/count panel
   *  derivation (the app computes them from the real Cell tree via the karkas engine). */
  panels?: ModulePanel[];
  /** Pre-counted hardware for a hybrid layout — OVERRIDES the fill/count hardware derivation, so a
   *  mixed drawer/door module's slides, hinges + joints reach the quote. `pins` = shelf-pin holes. */
  hardware?: { hinges: number; slides: number; cams: number; dowels: number; pins: number };
  /** Optional override — enables the "split facade/carcass" advisor. */
  facadeMaterialId?: UUID;
  /** Applied hardening-panel preset ids. */
  hardening?: string[];
}
