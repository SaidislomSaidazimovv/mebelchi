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
import type { DivisionRule, MaterialVar, KromkaVar, JointProfile } from "./variables.js";

// ---------------------------------------------------------------------------
// Identifiers (plain strings, like the rest of the contract; aliased for reading)
// ---------------------------------------------------------------------------

export type BlockId = string;
export type ZoneId = string;
export type LineId = string;
export type LineGroupId = string;
export type SectionId = string;
export type RowId = string;
export type RunId = string;
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
  | "carcass_plinth" // the toe-kick / sokol under the carcass (carcass material, no drilling)
  | "carcass_worktop" // the worktop / stoleshnitsa on top (its own material + thickness, no drilling)
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
  | "structural"
  | "boiler"; // Step 9 — a wall boiler hidden in a cabinet (attaches min-clearance, §9)

/** Composition kind of a `Row` above the carcasses. */
export type RowKind = "base" | "upper" | "tall";

/** Handle / dastak kind on a door or drawer (Phase 1.3). Absent on a Component = no handle (Без). */
export type HandleType = "bow" | "profile" | "knob";

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
  /**
   * The division rule (CONSTRUCTION_FRAME_v4 §4) for how THIS section (zone) sizes when its PARENT is
   * resized: Fixed keeps its mm, Locked keeps a component's size, Ratio shares by weight, Flex absorbs
   * the leftover. Lives per-zone (not per-line) so every child of an N-way split carries its own share
   * — the constraint solver (Step 2) reads it. Optional/additive: absent = Flex (leftover-absorbing),
   * so a pre-v4 section never over-constrains. The root section has no parent, so its rule is unused.
   */
  readonly rule?: DivisionRule;
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
   * Facade only: hinge side. Absent (or "left") drills the hinge cups on the y0 edge; "right" drills
   * them on the yMax edge. Optional/additive — a left-hung door keeps the exact same component as
   * before, so only an explicitly right-hung door changes. Handle sits opposite the hinge.
   */
  readonly hingeEdge?: "left" | "right";
  /**
   * Handle / dastak on a door or drawer front (Phase 1.3). `"bow"` = Скоба (a bow/D handle, two
   * screws), `"knob"` = Кнопка (one screw), `"profile"` = gola/integral profile (no separate drilling).
   * Absent = Без / handle-less (every existing door unchanged). Placement is DERIVED opposite the hinge
   * (`hingeEdge`) when drilling/rendering, not stored. The handle is counted + priced as hardware.
   */
  readonly handle?: HandleType;
  /**
   * Drawer box (Phase 7.3): `true` = this placement is a drawer, so the solver emits a 5-panel box
   * (facade front + two carcass sides + carcass back + a thin bottom) sized to the section with a
   * runner clearance, instead of a single panel. The component's `role` is null (a drawer takes
   * slides, not hinges — hardware counts it as a slide set). Optional/additive — absent = not a drawer.
   */
  readonly drawer?: boolean;
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
  /**
   * Per-component board thickness (mm10). Absent = the role default from the solve's
   * `ThicknessSpec` (16mm by default). Lets a facade be 18mm МДФ while the carcass stays
   * 16mm ЛДСП, etc. The exporter already writes per-part thickness. Optional/additive —
   * absent regresses nothing (the solver falls back to the single-stock 16mm law).
   */
  readonly thickness_mm10?: mm10;
  /**
   * Per-component material override (Phase F2): an OPAQUE decor key (the app's material-catalog id).
   * The engine stays catalog-agnostic — it just carries the key and stamps it onto the emitted parts
   * (`Part.materialId`) so the app can price / colour / name that part by a decor other than its role
   * default. Optional/additive — absent = the role's material from the plan (nothing regresses).
   */
  readonly material?: string;
  /**
   * Inclined shelf tilt (imos AS_O_Angle · "qiya polka"): the front edge is raised by `angle_deg`
   * degrees about the shelf's width axis, so an internal shelf leans back like a display / shoe rack.
   * Applies to `internal_shelf` components only. The board itself is the SAME rectangle (the cut list,
   * pricing and CNC are unchanged) — only its mounted orientation tilts, which the layout renders.
   * Optional/additive — absent or `0` = a flat shelf (nothing regresses).
   */
  readonly angle_deg?: number;
  /**
   * Display-shelf front lip / border (imos AS_O_Shelf_type · `CP_O_1_Angle_Shelf`): an upstand of
   * `lip_mm10` height standing at the shelf's FRONT edge so goods on an inclined ("qiya") shelf don't
   * slide off. The solver emits it as its OWN cut part (a strip, id `…__lip`) and the layout stands
   * it at the front, tilted WITH the shelf. Applies to `internal_shelf` only. Optional/additive —
   * absent or `0` = a plain flat shelf with no border (nothing regresses).
   */
  readonly lip_mm10?: mm10;
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
  /** Per-drawer height (mm10). Absent = the default DRAWER_HEIGHT; only meaningful for a drawer instance.
   *  Capped to the section height by the solver. Purely additive — non-drawer instances ignore it. */
  readonly drawerHeight_mm10?: mm10;
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
  /**
   * Nested content inside THIS drawer's clear inner volume (drawer-in-drawer, v5, CONSTRUCTION_FRAME_v4
   * §4 "a sled … can host another Space with its own inner sled"). Only meaningful when this instance's
   * component is a drawer. Recursive: an inner instance may itself be a drawer carrying its own
   * `interior`. Optional/additive — absent = a plain drawer (nothing regresses).
   */
  readonly interior?: DrawerInterior;
  /**
   * Slide state of a drawer (v5), 0 = shut … 1 = fully pulled out. Only the 3D LAYOUT reads it — it
   * slides the drawer box (and everything nested inside it) forward by `open × travel` so the master can
   * open a drawer to see / reach its contents; the manufacturing parts never change. Absent or 0 = shut.
   */
  readonly open?: number;
}

/**
 * The interior of a drawer: the reusable component definitions and their placements that live inside its
 * clear inner volume — the same shape as a mini-block, so the solver fills a drawer body exactly as it
 * fills a carcass. An inner drawer here can carry its own `interior`, giving arbitrary drawer-in-drawer
 * nesting. (v5.) The clear volume itself is NOT stored — it is thickness-dependent (it subtracts the
 * drawer's boards), so the solver computes it fresh from the parent each solve (`drawerInteriorBox`),
 * never drifting from the board thickness in force.
 */
export interface DrawerInterior {
  readonly components: readonly Component[];
  readonly instances: readonly Instance[];
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

// ---------------------------------------------------------------------------
// FreePart (v5) — a freely-placed board for arbitrary furniture (table / chair)
// ---------------------------------------------------------------------------

/** What a free-placed board IS — drives its material/price, not a carcass position. Open-ended set for
 *  free assembly (a table top, a leg-panel, an apron rail, a stretcher, a generic panel). */
export type FreePartRole = "top" | "leg" | "rail" | "stretcher" | "panel" | "shelf" | "back";

/** One edge of a free part on an axis, pinned to the block's LOW (`x=0`) or HIGH (`x=extent`) face at a
 *  fixed `offset_mm10` inside it. This is what makes the "table law" work for free parts: on a block
 *  resize the edge re-resolves against the new extent — a leg pinned `hi` stays inset from the right. */
export interface FreeEdge {
  readonly ref: "lo" | "hi";
  readonly offset_mm10: mm10;
}

/** A free part's extent on one axis = its start & end edges. `{lo,0}..{hi,0}` spans the block; `{lo,0}..
 *  {lo,S}` is a fixed size pinned to the low face; `{hi,S}..{hi,0}` a fixed size pinned to the high face. */
export interface FreeAxisAnchor {
  readonly start: FreeEdge;
  readonly end: FreeEdge;
}

/** How a free part reflows when its block resizes — per-axis edge anchors (v5). When present, the solver
 *  chain / resize re-derives the part's `box` from the block's box, so a table's top spans and its legs
 *  stay in the corners as the master pulls the outer size. */
export interface FreePartAnchor {
  readonly x: FreeAxisAnchor;
  readonly y: FreeAxisAnchor;
  readonly z: FreeAxisAnchor;
}

/**
 * A board placed FREELY in the block by an explicit box — the primitive of "build any furniture", not a
 * panel derived from a divided carcass. So a table = a bare block (no carcass shell) + a `top` FreePart +
 * four `leg` FreeParts, each positioned by its own box. `thicknessAxis` says which of the box's three
 * dimensions is the board thickness; the other two are the cut length × width. Block-local mm10. (v5.)
 */
export interface FreePart {
  readonly id: string;
  readonly name: string;
  readonly role: FreePartRole;
  /** Block-local position + full 3-D size of the board. */
  readonly box: Box3D;
  /** Which box dimension is the board's thickness (the face = the other two). */
  readonly thicknessAxis: Axis;
  /**
   * Rotation about the VERTICAL (Y) axis, in DEGREES — turning a board to face another way (an angled
   * panel, the return of an L-shaped run). RENDER-ONLY, exactly like a tilted shelf's `rotX_deg`: a
   * rotated board is the SAME cut panel, so `solveStructure` is untouched by it. The board turns about
   * its own centre. Absent/0 = axis-aligned (every existing model is unchanged).
   */
  readonly rotY_deg?: number;
  /** Optional per-part decor override (opaque catalog key), like a Component's `material`. */
  readonly material?: string;
  /**
   * How the board reflows when its block resizes (v5, the "table law" for free parts). Absent = the box
   * is static (a hand-placed board that stays put). Present = `box` is re-derived from the block's box on
   * resize, so a top spans and legs hold the corners. `box` and `anchor` must agree at build time.
   */
  readonly anchor?: FreePartAnchor;
  /**
   * Per-edge kromka for THIS board (mm10, `[front, back, left, right]` in the same order a Component's
   * `edgeBands` uses). Absent = every edge banded, which is right for a visible board like a table top
   * but wrong for a solid post: a 50×50 leg was being charged 1.5 m of banding it never receives, and
   * on a small table that phantom kromka reached about a third of the price. `[0,0,0,0]` = bare.
   */
  readonly edgeBands?: readonly [mm10, mm10, mm10, mm10];
}

export interface Block {
  readonly id: BlockId;
  readonly name: string;
  readonly box: Box3D;
  /**
   * How the whole cabinet is TURNED in the room, about the vertical axis, in degrees (an L-shaped run's
   * return, a unit set at an angle). PLACEMENT-ONLY: the cabinet is manufactured square-on however it is
   * turned, so `solveStructure` (the cut list) and the drawing sheet never see it — only the 3D viewport
   * applies it, as a rigid rotation of the block's panels about its own centre. Absent/0 = square-on.
   */
  readonly rotY_deg?: number;
  readonly zones: readonly Zone[];
  readonly components: readonly Component[];
  readonly instances: readonly Instance[];
  readonly lines: readonly Line[];
  readonly rows: readonly Row[];
  /** L-corner footprint (blocker #1). Absent = a plain rectangular block (`box`). */
  readonly footprint?: LCornerFootprint;
  /**
   * Freely-placed boards for arbitrary (non-carcass) furniture — a table top + legs, a chair, etc. (v5).
   * Optional/additive: absent = a pure carcass block (nothing regresses). Emitted + rendered ALONGSIDE the
   * carcass unless the block is `bare`.
   */
  readonly freeParts?: readonly FreePart[];
  /**
   * A BARE block has no carcass shell — the solver emits NO sides/top/bottom/back for it (v5, free
   * assembly). A table is a bare block whose whole body is `freeParts` (a top + legs). Optional/additive:
   * absent/false = a normal carcass cabinet. Its `box` still defines the block's extent (for a run / room
   * placement); dividers/instances/free parts inside it still solve.
   */
  readonly bare?: boolean;
  /**
   * Sokol / plinth height (mm10) — a recessed toe-kick UNDER the carcass. Absent = no plinth (every
   * existing model is unchanged). `box.h` stays the CARCASS height; the plinth is an EXTRA part below,
   * at `y ∈ [box.y − plinth, box.y]`, so the carcass placement never moves — the scene recentres on the
   * new lowest point (`layoutBounds` minY) and the furniture stands on the plinth. Kitchen default 1000
   * (= 100 mm), grounded in `apps/app/src/three/kitchen3d.ts` (PLINTH) + `model/layout.ts` (GEOM.plinth).
   */
  readonly plinth_mm10?: mm10;
  /**
   * Worktop / stoleshnitsa on TOP of the carcass. Absent = none (every existing model unchanged). A
   * boolean, not a dimension: the thickness comes from the worktop material slot (38 mm for postforming)
   * and the front overhang is a constant — nothing here is user-chosen, unlike the plinth's height. The
   * worktop is an EXTRA part above `box.y + box.h` (box.h stays the carcass height), overhanging the
   * front; the scene recentres via `layoutBounds` exactly as the plinth does below.
   */
  readonly worktop?: boolean;
}

// ---------------------------------------------------------------------------
// Run (Ряд блоков) — a wall-run of blocks that fits & resizes as ONE unit (v5)
// ---------------------------------------------------------------------------

/**
 * One member of a `Run`: which block, and how its width behaves when the run is
 * resized to fit a wall. The rule is the same §4 `DivisionRule` applied at BLOCK
 * level — Fixed keeps its mm, Ratio shares the pool by weight, Flex absorbs the
 * leftover, Locked keeps the block's current width.
 */
export interface RunMember {
  readonly blockId: BlockId;
  readonly rule: DivisionRule;
}

/**
 * A run of blocks lined up along one wall axis — the master's "combine several
 * cabinets into ONE unit that fits the wall exactly". The founder's Building-mode
 * "table law" (CONSTRUCTION_FRAME_v4 §2) applied at cabinet-run level: resizing the
 * run re-solves every member's width through the constraint solver (`resolveChain`)
 * — Fixed cabinets keep their size, Flex/Ratio absorb the change — so the members
 * always tile `length_mm10` with no gap, and each block is repositioned end-to-end
 * along the run. Optional/additive on the model: absent = the pre-v5 world of
 * independent blocks placed by hand.
 */
export interface Run {
  readonly id: RunId;
  readonly name: string;
  /** The wall axis the member blocks line up along (`"x"` for a standard run). */
  readonly axis: Axis;
  /** Member blocks in run order (left→right along `axis`), each with its width rule. */
  readonly members: readonly RunMember[];
  /** The total run length (wall length) the members tile, mm10. */
  readonly length_mm10: mm10;
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
  /**
   * Wall-runs grouping blocks into resize-as-one units (v5, §2 table law at run level). Optional/
   * additive: absent = the pre-v5 world where every block stands alone. A block may belong to at most
   * one run; blocks not in any run keep their independent placement. `resolveRun` re-solves a run.
   */
  readonly runs?: readonly Run[];
  /** The flat manufacturing leaves (Деталь), shared with the Project. */
  readonly parts: readonly Part[];
  /**
   * The project's GLOBAL variable slots (CONSTRUCTION_FRAME_v4 §3). Optional/additive: absent =
   * the pre-v4 model where materials/thickness came from the app's MaterialPlan + per-role
   * ThicknessSpec. When present, a Part resolves its material (and thickness) from a `MaterialVar`
   * by id, so one edit reflows every part on that slot. `jointProfile` drives hole placement (§8.2).
   */
  readonly materialVars?: readonly MaterialVar[];
  readonly kromkaVars?: readonly KromkaVar[];
  readonly jointProfile?: JointProfile;
  /**
   * Per-panel finishing overlay (Step 4b, CONSTRUCTION_FRAME_v4 §12), keyed by `Part.id`. Kept on the
   * model (not on the derived Part) so it round-trips through save/load and survives every re-solve —
   * a Part is regenerated each solve, but its id (`${block}__side_l`, `${block}__inst_${id}` …) is
   * stable. Optional\additive: absent = every panel is a plain square-cornered rectangle.
   */
  readonly features?: Readonly<Record<PartId, PanelFeatures>>;
  /**
   * Step 7c — per-hole position overrides (the master moves an individual auto-placed drill), keyed by
   * `${partId}::${opId}` → the new face-local mm10 position. A moved hole is re-stamped source:"user" so
   * the solver never recomputes it. Optional\additive; absent = every hole stays where the profile put it.
   */
  readonly holeOverrides?: Readonly<Record<string, { readonly x_mm10: mm10; readonly y_mm10: mm10 }>>;
}

/** A rectangular aperture cut into a panel — sink / hob / boiler (Step 4b, v4 §12). Part-local mm10.
 *  `offset` is the clearance from the [left, top, right, bottom] panel edges to the aperture; a `locked`
 *  offset is PINNED — it is preserved when the panel resizes (the opposite, unlocked offset absorbs the
 *  change), so a boiler keeps its fixed clearance from the wall side. */
export interface PanelCutout {
  readonly id: string;
  readonly w_mm10: mm10;
  readonly h_mm10: mm10;
  readonly offset: readonly [mm10, mm10, mm10, mm10];
  readonly locked: readonly [boolean, boolean, boolean, boolean];
}

/** Per-panel finishing features (Step 4b/6): corner rounding + apertures + per-edge kromka, by Part id. */
export interface PanelFeatures {
  /** Corner radii mm10 in Face-A order [top-left, top-right, bottom-right, bottom-left]; 0 = square. */
  readonly corners?: readonly [mm10, mm10, mm10, mm10];
  readonly cutouts?: readonly PanelCutout[];
  /**
   * Per-edge kromka (jiyak) variable id in SWJ008 edge order [front, back, side, side] (Step 6, v4 §3.3/
   * §8.1). null = a bare, unbanded edge. The K-variable's band SKU / colour / price / thickness lives in
   * the app catalog — the engine only records which slot each edge references, and prices the metres.
   */
  readonly kromka?: readonly [string | null, string | null, string | null, string | null];
}

// ---------------------------------------------------------------------------
// v4 §1 terminology aliases — the standard ladder Part / Component / Block / Furniture / Space / Line.
// The engine's historical names (Section, StructuralModel) keep working; these aliases give new code
// the founder's standard vocabulary without a risky mass-rename. A `Space` IS a `Section`; the whole
// project (`Furniture` / Мебель) IS the `StructuralModel`.
// ---------------------------------------------------------------------------

/** v4 §1: an empty cell/volume you add things into. Alias of `Section`. */
export type Space = Section;
export type SpaceId = SectionId;
/** v4 §1: everything in the project — behaves as one body in Building mode. Alias of `StructuralModel`. */
export type Furniture = StructuralModel;

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
