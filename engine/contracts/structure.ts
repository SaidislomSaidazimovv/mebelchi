// Layer 4 (structural extension) — the Construction-mode object model.
//
// This is the engine contract the Construction UI demands and that a flat
// "list of cabinet boxes" cannot express (DB/19_FUNCTION_MAP.md §3,
// CONSTRUCTION_FRAME_v2.md:159-166). It is an OVERLAY on the manufacturing
// model in ./types.ts: the leaf of the hierarchy is exactly the existing
// `Part` (Деталь), referenced by id. Nothing here changes the SWJ008 path.
//
// SELECTION HIERARCHY (CONSTRUCTION_FRAME_v2.md:159-164):
//   Block  (Блок — cabinet, the group, level 1)
//     └─ Zone  (Зона — a subdivision created by a rule)
//          └─ Component / Тип  (reusable definition, placed 1..N — level 2)
//               └─ Part  (Деталь — one physical panel, the leaf; ./types.ts)
//
// STRUCTURAL MECHANICS (DB/19_FUNCTION_MAP.md §3): first-class `Line`s split a
// volume into recursive `Section`s; `Row`s compose carcasses across the wall;
// dimensional edits carry a `Scope`.
//
// UNITS: every coordinate / dimension is an `mm10` integer (tenths of a mm),
// same convention as ./types.ts. Floats never appear here.
//
// IMMUTABILITY: every field is `readonly` and every collection is a
// `readonly[]`. Structural operations (S1-B) return NEW models; nothing here is
// ever mutated in place ("transform, not rebuild").

import type { mm10, Part, PartId } from "./types.js";

// ---------------------------------------------------------------------------
// Identifiers (plain strings, like the rest of the contract; aliased for reading)
// ---------------------------------------------------------------------------

export type BlockId = string;
export type ZoneId = string;
export type LineId = string;
export type LineGroupId = string;
export type SectionId = string;
export type RowId = string;
export type ComponentId = string;
export type InstanceId = string;

// ---------------------------------------------------------------------------
// Geometry (block-local mm10 frame)
// ---------------------------------------------------------------------------

/** Axis a `Line` divides along / a coordinate is measured on (block-local). */
export type Axis = "x" | "y" | "z";

/** An axis-aligned volume in block-local mm10 coordinates. Mirrors the runtime
 *  `bbox` shape in ./types.ts ({x,y,z} origin, {w,h,d} extents). */
export interface Box3D {
  readonly x: mm10;
  readonly y: mm10;
  readonly z: mm10;
  readonly w: mm10;
  readonly h: mm10;
  readonly d: mm10;
}

/** A placement anchor (offset of an instance within its section), block-local. */
export interface Anchor3D {
  readonly x: mm10;
  readonly y: mm10;
  readonly z: mm10;
}

// ---------------------------------------------------------------------------
// Scope — the heart of "group/global first" (DB/19_FUNCTION_MAP.md §4)
// ---------------------------------------------------------------------------

/**
 * The reach of a dimensional edit. UI label `Локально · Линия · Ряд · Все`.
 *   local  — this section only
 *   line   — the aligned line-group ("the overall lines of the furniture") — UI default
 *   row    — every carcass in the row (base / upper / tall)
 *   global — the whole model (depth edits default here, per founder)
 * S1-B's `moveLine(model, lineId, delta, scope)` is a thin wrapper over this.
 */
export type Scope = "local" | "line" | "row" | "global";

// ---------------------------------------------------------------------------
// Domain tags (DB/19_FUNCTION_MAP.md §3.5–3.6)
// ---------------------------------------------------------------------------

/** Panel role → per-role material + thickness resolution (load-bearing for the
 *  Материалы phase and the sheet counter). */
export type PanelRole =
  | "carcass_side"
  | "carcass_back"
  | "carcass_bottom"
  | "carcass_top"
  | "facade"
  | "internal_shelf";

/** Purpose tag on a section → load class → physics gate input (closes the loop
 *  with doc 16 §4). */
export type SectionPurpose =
  | "storage"
  | "hanging"
  | "appliance"
  | "drawer"
  | "display"
  | "structural";

/** Composition kind of a `Row` above the carcasses. */
export type RowKind = "base" | "upper" | "tall";

// ---------------------------------------------------------------------------
// Line — first-class entity (DB/19_FUNCTION_MAP.md §3.1)
// ---------------------------------------------------------------------------

/**
 * A dividing line: id, axis, position, the parts it bounds, and group
 * membership. Lines aligned across sections / carcasses share a `groupId` —
 * the "overall lines of the furniture" the founder described — so a `line`-scope
 * edit moves the whole group at once.
 */
export interface Line {
  readonly id: LineId;
  readonly axis: Axis;
  readonly position_mm10: mm10;
  /** Parts (Деталь leaves) this line physically bounds. */
  readonly boundsPartIds: readonly PartId[];
  /** Aligned-line group, or `null` when the line stands alone. */
  readonly groupId: LineGroupId | null;
}

// ---------------------------------------------------------------------------
// Section — recursive (DB/19_FUNCTION_MAP.md §3.3)
// ---------------------------------------------------------------------------

/**
 * A volume split by lines into child sections; children split further. Content
 * (shelves / drawers / doors, modelled as component `Instance`s) attaches to a
 * LEAF section (`children` empty). A non-leaf section's `instanceIds` is empty.
 */
export interface Section {
  readonly id: SectionId;
  readonly box: Box3D;
  /** Lines that split THIS section into `children`. Empty = leaf section. */
  readonly dividers: readonly LineId[];
  /** Child sections produced by `dividers`. Empty = leaf section. */
  readonly children: readonly Section[];
  /** Component placements living in this leaf section. */
  readonly instanceIds: readonly InstanceId[];
  /** Purpose → load class input. `null` until tagged. */
  readonly purpose: SectionPurpose | null;
}

// ---------------------------------------------------------------------------
// Zone — rule-driven subdivision (CONSTRUCTION_FRAME_v2.md:161)
// ---------------------------------------------------------------------------

/** Provenance of a `Zone`: the rule that produced the subdivision, so it can be
 *  re-solved. (The divide algorithms themselves live in S1-B operations.) */
export type ZoneRule = "manual" | "ratio" | "equal" | "fixed_mm";

/**
 * A named, rule-driven subdivision of a block (selection level between Block and
 * Component). It owns the root of a recursive `Section` tree; the tap-cycle
 * `block → zone → type → single` lands on this level as the coarse step.
 */
export interface Zone {
  readonly id: ZoneId;
  readonly name: string;
  readonly rule: ZoneRule;
  readonly root: Section;
}

// ---------------------------------------------------------------------------
// Component (Тип) + Instance — reusable definition placed 1..N
// ---------------------------------------------------------------------------

/**
 * A reusable definition (Тип): the leaf `Part`s that make up one placement (a
 * shelf = one part; a drawer = several). Placed 1..N times as `Instance`s.
 * Group-first selection (L0): tapping any member part selects the whole
 * Component and highlights every sibling instance (the blast radius).
 */
export interface Component {
  readonly id: ComponentId;
  readonly name: string;
  /** The leaf Part(s) (Деталь) composing a single placement of this type. */
  readonly partIds: readonly PartId[];
  /** Dominant panel role of the type, when it has one. */
  readonly role: PanelRole | null;
  /**
   * L1 doubling: `true` = 32mm build = TWO glued 16mm boards (never one 32mm board). The solver
   * emits two Part records per placement (layer A + B). Optional/additive — absent = single 16mm.
   */
  readonly doubled?: boolean;
  /**
   * Glass infill (facade): `true` = a glazed door. The machining pass emits the glass rebate
   * groove (L8 #38 — "the groove that holds the pane is cut, not implied"). Optional/additive.
   */
  readonly glazed?: boolean;
  /**
   * Glazed-GRID facade (CONSTRUCTION_FRAME_v3 Piece 2): the door is a frame of `lights` glass
   * panes stacked along its height, separated by muntins. The solver emits the assembly — outer
   * frame members (32mm doubled) + (lights−1) muntins (16mm) + `lights` glass panes (3mm) —
   * instead of one door panel. Optional/additive.
   */
  readonly glazedGrid?: { readonly lights: number };
  /**
   * Partial doubling (CONSTRUCTION_FRAME_v3 L2 "lightness via real partial doubling", Piece 3): a
   * `front_mm10`-wide strip along the panel's FRONT edge is doubled — 32mm at the front, 16mm
   * behind, with a step on the underside. The solver emits the base board + the front-strip board.
   * (This creates the step; the step-aware MOUNTING resolution of parts under it is a follow-up.)
   */
  readonly partialDouble?: { readonly front_mm10: mm10 };
  /**
   * Step-aware mount (blocker #7, CONSTRUCTION_FRAME_v3 Piece 3): a vertical support (pedestal /
   * blade) that stands UNDER a partially-doubled top. Its height resolves to the REAL underside
   * plane it touches — shorter under the 32mm front strip, taller behind the 16mm step. `front_mm10`
   * is the top's doubled strip; `y_mm10` is this mount's depth-position under the top.
   * v3-authoritative: the requirement is in v3 Piece 3; this model design is P's (docs don't spec it).
   */
  readonly mount?: { readonly front_mm10: mm10; readonly y_mm10: mm10 };
  /**
   * Corner band-transition (#39, CONSTRUCTION_FRAME_v3:135/189): how this panel's edge bands meet
   * at its corners — where a 32mm band meets a 16mm band. `"butt"` (default): the length-edge band
   * runs full, the width-edge bands butt into it (v3 line 189). `"overlap"`: the width-edge band
   * runs over instead. `"mitre"`: both cut 45° (the 45° geometry is V2-deferred; the value is
   * modelled now). Cosmetic + cut-list precision; NOT expressible in SWJ008. Absent = "butt".
   */
  readonly bandTransition?: BandTransition;
  /**
   * Motion envelope (E9, CONSTRUCTION_FRAME_v3 Piece 1 step 6: "sliding pants accessory — component
   * with motion envelope"). The one moving part in v3: it slides `travel_mm10` along `axis`, sweeping
   * a clearance volume nothing may obstruct. This is the envelope model, NOT drawer/rail hardware
   * (out of scope). Absent = a static component.
   */
  readonly motion?: { readonly axis: Axis; readonly travel_mm10: mm10 };
  /**
   * L5 load-bearing declaration (CONSTRUCTION_FRAME_v3 §2:77 "Declare any cabinet/panel load-bearing
   * → stability check → ⚠. Warns, never blocks."). `true` = the user declared this panel/type will
   * carry load, so the stability span check applies to it even when its role is not an internal
   * shelf. Non-blocking. Optional/additive — absent = not declared (internal shelves are still
   * auto-checked by role, so nothing regresses).
   */
  readonly loadBearing?: boolean;
  /**
   * Per-edge kromka override (#39, CONSTRUCTION_FRAME_v3 §6 · Material→Кром.). Band thickness (mm10)
   * for the panel's four perimeter faces `[front, back, left, right]` — `0` = bare edge, `10` = 1mm
   * kromka. When present it REPLACES the role default (shelf = front only; facade = all four), so the
   * user can band or bare any edge. Optional/additive — absent = the role default (nothing regresses).
   */
  readonly edgeBands?: readonly [mm10, mm10, mm10, mm10];
}

/** How two edge bands meet at a panel corner (#39). "mitre" 45° geometry is V2-deferred. */
export type BandTransition = "butt" | "mitre" | "overlap";

/**
 * Junction value editor (#40, CONSTRUCTION_FRAME_v3:191 — "the iPhone-box junction is NOT one
 * action"): a stepped reveal expressed as THREE explicit values, not one gesture. The advanced/
 * long-press offset control (Zone 6, L3) sets them. L8 requires these actual values carried, not
 * implied. All mm10; absent = flush (no offset).
 *   • oversail_x  — top oversail over the pedestal outer face (X)
 *   • stepBack_y  — pedestal face step-back (Y)
 *   • shadowGap_z — shadow-gap depth (Z) — the render-visible reveal; pushes the panel proud
 */
export interface Junction3D {
  readonly oversail_x_mm10: mm10;
  readonly stepBack_y_mm10: mm10;
  readonly shadowGap_z_mm10: mm10;
}

/** Whether an instance follows its Component definition or overrides it. */
export type InstanceLink = "linked" | "detached";

/**
 * One placement of a `Component` in a section.
 * `link`: `"linked"` (default) follows the shared definition; `"detached"` (✂)
 * is an EXCEPTION that overrides it. Detached instances are exactly what the
 * "✂ N" exceptions readout counts (CONSTRUCTION_FRAME_v2.md:150).
 */
export interface Instance {
  readonly id: InstanceId;
  readonly componentId: ComponentId;
  readonly sectionId: SectionId;
  readonly anchor: Anchor3D;
  readonly link: InstanceLink;
  /**
   * Per-instance part override (S1-B). `null`/absent = LINKED: the instance
   * inherits its `Component.partIds` (the shared definition). A populated list =
   * DETACHED (✂): a private snapshot the instance owns so it can diverge from the
   * type without dragging its siblings. `detachInstance` snapshots the component's
   * parts here; `reattachInstance` clears it back to `null`. Kept OPTIONAL so the
   * S1-A contract (and its fixtures) stay valid — this is a purely additive field.
   */
  readonly partIds?: readonly PartId[] | null;
  /**
   * Off-plane junction offset (#40, L3 advanced). Absent = flush. When present, the placement is
   * pushed proud by the shadow-gap in the 3D view (v3:177 "pushes the door proud"); the oversail /
   * step-back values are carried for the advanced multi-body cut geometry (L3, not yet rendered).
   */
  readonly junction?: Junction3D;
}

// ---------------------------------------------------------------------------
// Row — composition layer above carcasses (DB/19_FUNCTION_MAP.md §3.2)
// ---------------------------------------------------------------------------

/**
 * A row of sections across carcasses (base / upper / tall), so a structural edit
 * can propagate across the wall — the fix for "added bottom, top unchanged".
 */
export interface Row {
  readonly id: RowId;
  readonly kind: RowKind;
  /** Sections (across carcasses) that belong to this row. */
  readonly sectionIds: readonly SectionId[];
}

// ---------------------------------------------------------------------------
// Block (Блок) — the cabinet (level 1)
// ---------------------------------------------------------------------------

/**
 * A cabinet: outer volume, its rule-driven zones, the reusable component
 * definitions used inside it, every placement of those components, the
 * first-class dividing lines, and the rows it participates in.
 */
/**
 * One leg of an L-corner block (CONSTRUCTION_FRAME_v3 §7 Piece 1: "set leg-A depth 600, leg-B
 * depth 400 — at block/leg level, not panel"). Its length runs along its wall; its depth is
 * per-leg (blocker #3). Height is the block's (shared by both legs).
 */
export interface LegSpec {
  readonly length_mm10: mm10;
  readonly depth_mm10: mm10;
}

/**
 * L-corner footprint (blocker #1): "block can be L, not just box; the corner object owns the
 * depth-step." Two legs meet at a corner; the corner auto-emits filler(s) (blocker #6). Present
 * only on L-blocks — a rectangular block leaves it absent and uses `box`.
 */
export interface LCornerFootprint {
  readonly legA: LegSpec;
  readonly legB: LegSpec;
}

export interface Block {
  readonly id: BlockId;
  readonly name: string;
  readonly box: Box3D;
  readonly zones: readonly Zone[];
  readonly components: readonly Component[];
  readonly instances: readonly Instance[];
  readonly lines: readonly Line[];
  readonly rows: readonly Row[];
  /** L-corner footprint (blocker #1). Absent = a plain rectangular block (`box`). */
  readonly footprint?: LCornerFootprint;
}

// ---------------------------------------------------------------------------
// StructuralModel — the top container (overlay on the manufacturing Project)
// ---------------------------------------------------------------------------

/**
 * The Construction-mode model: a set of `Block`s over the same flat list of
 * manufacturing `Part`s the SWJ008 path consumes. The structure references parts
 * by id only; `parts` here IS the existing `Project.parts` list, unchanged, so
 * the two views never diverge.
 */
export interface StructuralModel {
  readonly id: string;
  readonly name: string;
  readonly blocks: readonly Block[];
  /** The flat manufacturing leaves (Деталь), shared with the Project. */
  readonly parts: readonly Part[];
}

// ---------------------------------------------------------------------------
// Pure read-only helpers (contract conveniences — no mutation, no operations).
// The structural operations (divide / moveLine / detach) belong to S1-B.
// ---------------------------------------------------------------------------

/** True when an instance is a detached exception (✂). */
export function isDetached(instance: Instance): boolean {
  return instance.link === "detached";
}

/** The exceptions count ("✂ N") for a block: how many instances are detached. */
export function countExceptions(block: Block): number {
  let n = 0;
  for (const instance of block.instances) {
    if (isDetached(instance)) n += 1;
  }
  return n;
}

/** Collect every leaf section (no children) under a section, depth-first. */
export function leafSections(section: Section): readonly Section[] {
  if (section.children.length === 0) return [section];
  const out: Section[] = [];
  for (const child of section.children) {
    out.push(...leafSections(child));
  }
  return out;
}
