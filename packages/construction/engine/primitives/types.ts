// Layer-1 primitive inputs. A `Panel` is the minimal geometry a drilling primitive
// needs — the same mm10 conventions as Part (X along Length, Y along Width;
// origin bottom-left of Face A). Specs carry every millimetre; primitives carry none.

import type { mm10 } from "../contracts/types.js";

export interface Panel {
  id: string;
  /** Y extent of machining space (SWJ008 @Width). */
  width_mm10: mm10;
  /** X extent of machining space (SWJ008 @Length). */
  length_mm10: mm10;
  thickness_mm10: mm10;
}

// ---------------------------------------------------------------------------
// Hardware spec shapes (typed mirror of hardware_specs.dummy.json).
// All numbers here are in mm (whole millimetres); primitives convert to mm10.
// `verified` flips to true only when a value is confirmed against factory data.
// ---------------------------------------------------------------------------

/**
 * Two grades of SKU — the safety line (doc 17 §2). Browse grade may be shown,
 * priced, and quoted; ONLY manufacturing grade (verified drilling) may ever
 * drive drilling output.
 */
export type SkuGrade = "browse" | "manufacturing";

/**
 * Media references (doc 17 §5): content-addressed refs into media packs, never
 * inline data. Media is lazy — a missing image must never block pricing or solving.
 */
export interface SkuMedia {
  image?: string;
  drawing?: string;
  animation?: string;
}

/**
 * Catalog provenance fields shared by every SKU-bearing spec (doc 17 sequence
 * step 1 — additive only). `verified`/`source` predate this and stay required;
 * the rest are optional so existing catalog JSON remains valid unchanged.
 */
export interface CatalogMeta {
  /** True only when confirmed against a real export or manufacturer datasheet. */
  verified: boolean;
  /** Where the values came from (datasheet, factory file, research estimate). */
  source: string;
  /** Defaults to "browse" when absent; "manufacturing" requires verified: true. */
  grade?: SkuGrade;
  media?: SkuMedia;
  /** Immutable pack the SKU shipped in, e.g. "gtv@2025.06". */
  packVersion?: string;
}

export interface HingeSpec extends CatalogMeta {
  brand: string;
  cup: { diameter: number; depth: number };
  /** Cup centre distance from the hinge edge. Factory door proves 21.5 (not 22.5). */
  cupCenterFromDoorEdge: number;
  /**
   * The factory does NOT pre-drill hinge wing screws. It pricks Ø3×1 marking
   * points instead (proven by SHKOF ORTA CHAP ESHIK_7_1): per cup, `count` marks
   * at cupX ± alongFromCupCenter along the hinge edge, sitting beyondCupFromEdge
   * farther from the edge than the cup centre.
   */
  satelliteMarks: {
    count: number;
    diameter: number;
    depth: number;
    alongFromCupCenter: number;
    beyondCupFromEdge: number;
  };
}

export interface ConnectorSpec extends CatalogMeta {
  brand: string;
  camSeat: {
    diameter: number;
    depth: number;
    /** Distance of the cam-seat centre from the mating edge, on the face. */
    fromMatingEdge: number;
  };
  dowelHole: { diameter: number; depth: number };
}

export interface ShelfPinSpec extends CatalogMeta {
  brand: string;
  diameter: number;
  depth: number;
}

export interface System32Spec extends CatalogMeta {
  verticalPitch: number;
  firstHoleOffset: number;
  frontRowSetback: number;
  backRowSetback: number;
}

export interface HardwareSpec {
  hinges: Record<string, HingeSpec>;
  connectors: Record<string, ConnectorSpec>;
  shelfPins: Record<string, ShelfPinSpec>;
  system32: System32Spec;
}
