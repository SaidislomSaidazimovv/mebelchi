// DB/27 — the design/construction separation, as types. (v2, after the DB/28 replay.)
//
// THE LAW: a DesignBlock carries INTENT. It has NO FIELD for construction, so a
// community author cannot ship a construction opinion — Frankenstein is a compile
// error, not a bug. Construction lives in exactly ONE ConstructionProfile per
// project. Parts are COMPUTED by panelDecomposition(), never stored, never shared.
//
// IDENTITY (resolves the doc-06 §8 tension "an ID never changes"):
//   - DESIGN nodes carry ASSIGNED ids (`nodeId`), created once, never mutated.
//   - PARTS carry DERIVED ids (hash of nodeId + role + sub). Re-decomposing is
//     idempotent; swapping the profile keeps identity and changes geometry only.
//
// v2 CHANGE (DB/28's architectural finding): construction is scoped BY CABINET TYPE.
// One flat profile could not describe both the shelf-unit (plinth 80, вкладное) and
// the census aggregate (plinth 120). The law is unchanged — still ONE source of
// construction truth — but the profile is now parameterised: defaults + byType.
// Per DB/27 §4 this cost zero published blocks, exactly as the tiebreak rule predicted.

import type { mm10 } from "./types.js";

// ───────────────────────────────────────────────────────── design (shareable)

export type RoleSlot = "fasad" | "korpus" | "orqa";

/** WHAT a piece is. Design, not construction: two workshops agree "it's a wardrobe"
 *  and disagree about how to build it. That disagreement is what `byType` scopes. */
export type CabinetType =
  | "kitchen_base" | "kitchen_wall" | "tall" | "drawer_base" | "wardrobe" | "shelf_unit";

export type NodeKind = "cabinet" | "shelf" | "divider" | "door" | "drawer" | "filler" | "rod";

export type Division =
  | { rule: "fixed"; mm: mm10 }
  | { rule: "ratio"; weight: number }
  | { rule: "flex" };

/**
 * One node of the design tree. `nodeId` is the ONLY assigned identity in the system.
 *
 * NOTE what is absent and must stay absent: thickness, kromka, groove, bottom
 * placement, setbacks, overhangs, joints, holes. There is no field for them.
 */
export interface DesignNode {
  nodeId: string;
  kind: NodeKind;
  /** Design intent: what kind of piece this is → selects the profile's type scope. */
  cabinetType?: CabinetType;
  roleSlot?: RoleSlot;
  size?: { w_mm10?: mm10; h_mm10?: mm10; d_mm10?: mm10 };
  division?: Division;
  purpose?: string;
  children?: DesignNode[];
  /** Design: it changes what it LOOKS like. */
  hasDoor?: boolean;
  /** Design: "this cabinet is topped by a worktop". The OVERHANG is construction. */
  hasWorktop?: boolean;
}

export interface DesignBlock {
  blockId: string;
  name: string;
  author: string;
  /** Unknown version → REJECTED at import, never guessed. */
  schemaVersion: 1;
  root: DesignNode;
  requiredSlots: RoleSlot[];
  tags?: string[];
}

// ────────────────────────────────────────────────── construction (per project)

export type KromkaSlot = "K1" | "K2";

/**
 * Semantic edges. The decomposer maps these onto face1..4 through each part's
 * declared orientation (DB/28 C1: panels are stored in the MACHINE frame, so a raw
 * face index is a framing choice, not a construction fact).
 *
 * SIX names, because a panel's two axes decide WHICH four it has:
 *   depth axis  → front / back      width axis → left / right
 *   height axis → top / bottom
 * A side (height×depth) has front/back/top/bottom — it has no "left". A door
 * (height×width) has top/bottom/left/right — it has no "front". Modelling only
 * four names silently double-banded the height ends; the tests caught it.
 */
export interface EdgeKromka {
  front: KromkaSlot | null;
  back: KromkaSlot | null;
  left: KromkaSlot | null;
  right: KromkaSlot | null;
  top: KromkaSlot | null;
  bottom: KromkaSlot | null;
}

export type PartRole =
  | "side" | "bottom" | "top" | "stretcher" | "shelf" | "back" | "worktop"
  | "door" | "divider" | "plinth" | "filler";

/**
 * The construction of ONE cabinet type. Every field here is something two competent
 * workshops would disagree about for the same design (DB/27 §4's boundary test).
 */
export interface TypeConstruction {
  /** Bottom between the sides (вкладное: W−2t) or under them (накладное: W). */
  bottomPlacement: "nakladnoe" | "vkladnoe";
  /** "none" = a worktop sits on the sides instead of a carcass top (DB/28 A4). */
  topStyle: "full" | "stretchers" | "none";
  stretcherWidth_mm10: mm10;
  back: {
    /** "none" = genuinely backless. NOT the same as "the back wasn't in this export". */
    treatment: "groove" | "overlay" | "none";
    grooveWidth_mm10: mm10;
    grooveDepth_mm10: mm10;
    grooveSetback_mm10: mm10;
  };
  /** Depth the back steals from bottom/shelf/divider. DB/28 A2: 17mm on the real
   *  cabinet = a 16mm ЛДСП back + 1mm clearance (16mm backs are 17 of the dump's 33). */
  backZone_mm10: mm10;
  /** EXTRA front clearance on shelves, beyond the back zone. */
  shelfSetback_mm10: mm10;
  plinth: {
    style: "box" | "strip" | "none";
    height_mm10: mm10;
    /** Between the sides (W−2t) or running the full width under them. */
    placement: "between" | "under";
  };
  worktop: { sideOverhang_mm10: mm10; frontOverhang_mm10: mm10 };
  kromkaByRole: Record<PartRole, EdgeKromka>;
}

/**
 * THE single source of construction truth for a project. Seeded from the workshop
 * profile; the values are measured (DB/25, DB/28), not guessed.
 *
 * OPEN FOR EXTENSION (doc 13 / DB/27 §4): adding a field or a type scope is free —
 * blocks never referenced them, so every published block keeps working.
 */
export interface ConstructionProfile {
  profileId: string;
  name: string;
  material: { carcass_mm10: mm10; back_mm10: mm10; front_mm10: mm10 };
  kromka: { slots: Record<KromkaSlot, { thickness_mm10: mm10 }> };
  grain: "L" | "NONE";
  /** Applied when a type has no scope of its own. */
  defaults: TypeConstruction;
  /** Per-cabinet-type construction. Still one profile, one owner, one edit. */
  byType: Partial<Record<CabinetType, Partial<TypeConstruction>>>;
}

// ──────────────────────────────────────────────────────── project-local state

/** A per-node construction deviation. PROJECT-LOCAL — stripped when a block is
 *  shared, so block purity survives user overrides (DB/27). */
export interface ConstructionOverride {
  nodeId: string;
  field: "topStyle" | "bottomPlacement" | "shelfSetback_mm10" | "plinthHeight_mm10";
  value: string | number;
}

export interface DesignProject {
  projectId: string;
  name: string;
  nodes: DesignNode[];
  slotBindings: Record<RoleSlot, string>;
  overrides: ConstructionOverride[];
}

// ────────────────────────────────────────────────────────────── decomposition

export type DecomposeFlagCode =
  | "ORPHANED_OVERRIDE"
  | "UNBOUND_SLOT"
  | "DEGENERATE_GEOMETRY";

export interface DecomposeFlag { code: DecomposeFlagCode; where: string; detail: string }

/** Which physical edge each semantic edge landed on — the audit trail for DB/28 C1. */
export interface PartOrientation {
  /** What the part's X (Length) axis means physically. */
  xAxis: "width" | "height" | "depth";
  /** What the part's Y (Width) axis means physically. */
  yAxis: "width" | "height" | "depth";
}

export interface DecomposeResult {
  parts: import("./types.js").Part[];
  flags: DecomposeFlag[];
  provenance: Record<string, { nodeId: string; role: PartRole; orientation: PartOrientation }>;
}
