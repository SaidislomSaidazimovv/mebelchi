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
export type RoomId = string;
export type WallId = string;
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

/** Handle / dastak kind on a door or drawer (Phase 1.3). Absent on a Component = no handle (Без).
 *  M9E.4 widened the catalog: a brass ROUND KNOB (one screw, like `knob`), a modern LONG PULL (a screw
 *  pair, like `bow`) and a GOLA — the glued-on lip profile an usta fits instead of a handle, so like
 *  `profile` it drills nothing. Absent/unknown values keep drilling nothing, so old models are unchanged. */
export type HandleType = "bow" | "profile" | "knob" | "round_knob" | "long_pull" | "gola";

/**
 * Lift-hinge kind on a door (Phase 2.1) — a top-opening wall-cabinet door on a gas-strut/arm mechanism
 * instead of side hinges. `"swing"` = Aventos HK-class (the door tilts up as one piece); `"parallel"` =
 * HL-class (the door lifts straight up, staying parallel). Absent on a Component = a normal side-hinged
 * door. Expandable later (bifold / up-&-over).
 */
export type LiftType = "swing" | "parallel";

/**
 * Drawer organizer (Phase 2.3): `dividers` partition boards inside a drawer body. `axis "x"` (default) runs
 * them front-to-back → side-by-side compartments; `axis "z"` runs them left-to-right → front-back
 * compartments. They are real cut parts (role carcass_side), evenly spaced (compartment k at the
 * `k/(dividers+1)` fraction across the interior).
 */
export interface DrawerOrganizer {
  readonly dividers: number;
  readonly axis?: "x" | "z";
}

/**
 * Built-in appliance kind (Phase 3) — a BOUGHT object that fills a cabinet opening (духовка / варочная /
 * мойка / посудомоечная / вытяжка / СВЧ / холодильник). It is never CUT (emits no board part); it is
 * counted + priced as a bought line («Техника»), rendered as a mesh (3.b) and may drive a worktop cutout
 * (3.c). Absent on a Component = not an appliance.
 */
export type ApplianceKind = "oven" | "hob" | "sink" | "dishwasher" | "hood" | "microwave" | "fridge";

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
/** Which way a zone's facades OPEN — the front face its doors/drawers lay on. Absent = "-z" (the normal
 *  front, every existing zone). "-x" / "+x" = an L-corner return leg (leg-B), rotated 90°: its section box is a
 *  Z-run (w = leg depth along X, d = leg length along Z) and its facades sit on the −X (left-hand L) or +X
 *  (right-hand L) face. The two sideways dirs share the axis logic; only the X face + slide sign mirror. */
export type FaceDir = "-z" | "-x" | "+x";

export interface Zone {
  readonly id: ZoneId;
  readonly name: string;
  readonly rule: ZoneRule;
  readonly root: Section;
  /**
   * The direction this zone's facades open (Phase 4.d-2). Optional/additive — absent = "-z" (the normal
   * front), so every pre-4.d-2 zone is byte-identical. "-x" tags an L-corner return leg (leg-B): the facade
   * cut (solve) spans the leg length (box.d) and the placement (layout) lays the door/drawer thin-in-X on the
   * −X face. Drilling / handles / render stay orientation-agnostic (they derive from the placement box), so
   * only the facade cut + placement branch on this.
   */
  readonly facing?: FaceDir;
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
   * Lift hinge on a door (Phase 2.1): a top-opening wall-cabinet door on a gas-strut/arm mechanism. When
   * set, the door opens UPWARD, so `hingeEdge` (a side choice) is irrelevant, and it counts a LIFT
   * MECHANISM as hardware instead of side hinges — and carries no side hinge cups. Optional/additive —
   * absent = a normal side-hinged door, byte-identical. The lift's own mounting holes come in 2.1b.
   */
  readonly lift?: LiftType;
  /**
   * Drawer box (Phase 7.3): `true` = this placement is a drawer, so the solver emits a 5-panel box
   * (facade front + two carcass sides + carcass back + a thin bottom) sized to the section with a
   * runner clearance, instead of a single panel. The component's `role` is null (a drawer takes
   * slides, not hinges — hardware counts it as a slide set). Optional/additive — absent = not a drawer.
   */
  readonly drawer?: boolean;
  /**
   * Drawer organizer (Phase 2.3): partition panels inside a drawer body that split it into compartments.
   * Only meaningful on a drawer component. Emits `dividers` real cut boards (role carcass_side) inside the
   * box — `axis "x"` (default) runs them front-to-back (side-by-side compartments), `axis "z"` runs them
   * left-to-right (front-back compartments). Optional/additive — absent = a plain drawer, byte-identical.
   */
  readonly organizer?: DrawerOrganizer;
  /**
   * Built-in appliance (Phase 3): this instance holds a BOUGHT appliance (oven / hob / sink / …) filling a
   * cabinet opening. The component's `role` stays null — an appliance emits NO cut part; it is counted +
   * priced as a «Техника» line, rendered as a mesh (3.b), and a hob/sink drives a worktop cutout (3.c).
   * Optional/additive — absent = not an appliance, byte-identical.
   */
  readonly appliance?: ApplianceKind;
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
   * M7.3 — free text the usta wrote about this part («kromka faqat oldi», «mijozning taxtasi»). It
   * reaches every Part this component emits, and from there the cut list and the printed drawing.
   * Documentation only: it changes no size, no hole and no price. Optional/additive.
   */
  readonly note?: string;
  /**
   * M7.4 — VIEW state, deliberately stored on the model so it survives save/reload.
   * `hidden` drops the part from the 3-D viewport ONLY: it is still cut, still drilled, still priced and
   * still in the CNC file, because hiding a door to see the shelves behind it must never quietly delete
   * it from the order. To remove a part, delete it.
   * `locked` refuses moves, resizes and deletion in the editor — a table top the usta pinned so he can
   * drag the legs underneath without shifting it by accident. Purely an interaction rule (the engine
   * only carries the flag).
   */
  readonly hidden?: boolean;
  readonly locked?: boolean;
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
  /**
   * Which way the L turns (Phase 4 polish). Optional/additive — absent = "left" (leg-B returns at leg-A's
   * min-X end, opening −X), so every existing L is byte-identical. "right" mirrors leg-B to leg-A's max-X end
   * (opening +X). Handedness is a LAYOUT + section concern only — the cut list (`lCornerParts`) + drilling are
   * identical for both hands.
   */
  readonly hand?: "left" | "right";
}

// ---------------------------------------------------------------------------
// FreePart (v5) — a freely-placed board for arbitrary furniture (table / chair)
// ---------------------------------------------------------------------------

/** What a free-placed board IS — drives its material/price, not a carcass position. Open-ended set for
 *  free assembly (a table top, a leg-panel, an apron rail, a stretcher, a generic panel). */
export type FreePartRole = "top" | "leg" | "rail" | "stretcher" | "panel" | "shelf" | "back";

/**
 * The SHAPE a free part is drawn as (M4). Absent/"box" = the flat board every free part has been until
 * now — byte-identical. The others are NOT flat sheet panels: a cylinder (a round leg, or the hanging
 * RAIL every wardrobe needs), a sphere (a knob/foot), a tube (a metal frame), a wedge (an angled
 * support). The `box` stays the ENVELOPE — a cylinder's height is box.h and its radius min(box.w,box.d)/2
 * — so anchors, moving and resizing keep working unchanged. Because they cannot be cut from a sheet,
 * non-box parts are kept OUT of the panel cut list, the CNC export and the m² price (see solve/drilling).
 *
 * M7 widened the family to what a workshop actually shapes by hand or buys ready-made: an ARC (the
 * curved fascia of a rounded worktop or a bowed door), a CONE (the tapered leg every Scandinavian-style
 * table stands on), a HALF-CYLINDER (the rounded end of a worktop or a handrail), a HEXAGON post and a
 * TORUS ring (a pull). None of them can be nested on a sheet either, so they inherit the same treatment
 * — drawn in 3-D and in AR, listed under «Boshqa qismlar», never in the cut file. A curved door IS
 * cuttable in the real world, but only by a contour the SWJ008 export does not speak; sending a guessed
 * arc toolpath to a machine is not a risk worth taking, so the usta cuts that curve himself.
 */
export type PrimitiveShape =
  | "box" | "cylinder" | "sphere" | "tube" | "wedge"
  | "arc" | "cone" | "halfCylinder" | "hexagon" | "torus"
  // M9E.4 — a HAIRPIN leg: the bent steel wire loop under a mid-century table. Bought or bent, never
  // sawn from a sheet, so it inherits the same non-box treatment as the rest.
  | "hairpin";

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
  /** M4 — the shape drawn inside `box`. Absent = "box" (a flat board; byte-identical). See PrimitiveShape. */
  readonly shape?: PrimitiveShape;
  /**
   * Rotation about the VERTICAL (Y) axis, in DEGREES — turning a board to face another way (an angled
   * panel, the return of an L-shaped run). RENDER-ONLY, exactly like a tilted shelf's `rotX_deg`: a
   * rotated board is the SAME cut panel, so `solveStructure` is untouched by it. The board turns about
   * its own centre. Absent/0 = axis-aligned (every existing model is unchanged).
   */
  readonly rotY_deg?: number;
  /**
   * M8.1 — TILT about the X and Z axes, in degrees. Until now a free part could only be turned about the
   * vertical axis, so the whole app could not build anything slanted: an A-frame, a ladder shelf, a
   * pitched roof, a reclined chair back. Moblo turns on every axis (in 1°/5° steps) and its users build
   * exactly those.
   *
   * RENDER-ONLY, like `rotY_deg`: a tilted board is the SAME cut panel — 1000×100×18 stays 1000×100×18
   * however it leans — so `solveStructure`, the drilling and the price are untouched. A free part spins
   * about its own CENTRE (an inclined carcass shelf keeps pinning its front-top edge instead — that is a
   * different part with a different reason, see the renderer).
   *
   * A tilted part is deliberately kept OUT of the M5 dowel joinery: those contacts are computed from
   * axis-aligned boxes, and a 3-axis router can only drill perpendicular to a face — an angled joint is
   * marked and bored by hand in the workshop.
   */
  readonly rotX_deg?: number;
  readonly rotZ_deg?: number;
  /** Optional per-part decor override (opaque catalog key), like a Component's `material`. */
  readonly material?: string;
  /** M7.3 — free text about this part, carried to the cut list and the drawing. See Component.note. */
  readonly note?: string;
  /** M7.4 — hidden in the viewport but still cut/priced; locked against editing. See Component.hidden. */
  readonly hidden?: boolean;
  readonly locked?: boolean;
  /**
   * M9E.1 — soft edge radius (mm) for THIS part, overriding the renderer's global default. RENDER-ONLY,
   * like `shape`: a rounded edge is a pardoz detail, not a cut — the panel size, holes, kromka and price
   * are untouched. Absent = the global soft bevel; 0 = a deliberately sharp, industrial edge.
   */
  readonly bevel_mm?: number;
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

/** Which carcass shell panels a block keeps (M2). Each field absent or `true` = present; an explicit
 *  `false` DROPS that panel → open shelving / a back-less or open-top unit. Absent `shell` = the full
 *  carcass (byte-identical to pre-M2). At an L-corner, a leg's structural corner side stays dropped
 *  regardless of the mask. */
export interface PanelShell {
  readonly sideL?: boolean;
  readonly sideR?: boolean;
  readonly top?: boolean;
  readonly bottom?: boolean;
  readonly back?: boolean;
}

/**
 * M8.5 — WHICH carcass board an override is about. The same slot names `PanelShell` masks with, plus the
 * two boards that hang off the box: the plinth and the worktop.
 */
export type CarcassSlot = "sideL" | "sideR" | "top" | "bottom" | "back" | "plinth" | "worktop";

/**
 * M8.5 — the usta's own words and choices about ONE carcass board. Until now the cabinet's own sides,
 * top, bottom and back were the only parts he could say nothing about: they are not Components, so they
 * took no note, could not be hidden to look inside, and followed the plan's decor for their role with no
 * way to make just this one different.
 *
 * Everything here is DOCUMENTATION or VIEW state — nothing moves a millimetre. Per-board THICKNESS is
 * deliberately absent: it is structural (it changes the inner width, every shelf length and every hole
 * position), so it is its own step. Nor is there a `locked`: a carcass board cannot be dragged or
 * resized on its own, so there is nothing to lock.
 */
export interface CarcassPanel {
  readonly note?: string;
  readonly hidden?: boolean;
  readonly material?: string;
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
  /** Which carcass shell panels this block keeps (M2). Absent = the full 5-panel carcass. See PanelShell. */
  readonly shell?: PanelShell;
  /**
   * M8.5 — per-board overrides, keyed exactly like `shell`. Absent = today's cabinet, byte-identical.
   * On an L-corner block one entry covers BOTH legs, the same way `shell` does.
   */
  readonly panels?: Partial<Record<CarcassSlot, CarcassPanel>>;
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
  /**
   * Phase 5.r2 — the room wall this run hugs. Optional/additive: absent = a free run laid along X at its
   * current Z (byte-identical to pre-5.r2). When set, the run's members tile along that wall's segment,
   * backs to the wall, fronts (`rotY_deg`) facing into the room. Placement-only — the cut list is unchanged.
   */
  readonly wallId?: WallId;
  /**
   * Phase 5.r3 — how far along the wall (mm10) the run starts, to clear a corner block occupying the corner.
   * Optional/additive: absent = 0 (starts at the wall origin, byte-identical). Only meaningful with `wallId`.
   */
  readonly cornerInset_mm10?: mm10;
}

// ---------------------------------------------------------------------------
// Room (Phase 5) — the walls the cabinets stand against (render-only backdrop)
// ---------------------------------------------------------------------------

/**
 * One wall of a room (Phase 5). A kitchen's walls are axis-aligned 90° segments; a wall carries only its
 * run length (+ optional height). Its world segment (origin + direction) is DERIVED from the ordered wall
 * list + the room's `turn` by `roomWallSegments` — walls never store world coords, so a length edit reflows
 * the whole polyline. Render-only: a wall is never machined, never in the cut list, never raycast.
 */
export interface Wall {
  readonly id: WallId;
  readonly length_mm10: mm10;
  /** Optional wall height (mm10); absent = a standard room height. */
  readonly height_mm10?: mm10;
}

/**
 * A room (Phase 5): an ordered polyline of 90° walls — I (1), L (2) or П/U (3). `turn` is which way the
 * polyline bends at each corner (the room handedness, which the L-corner block hand follows in 5.r3).
 * Optional on the model (`StructuralModel.room?`) → absent = no room, every existing model byte-identical.
 */
export interface Room {
  readonly id: RoomId;
  readonly walls: readonly Wall[];
  /** Corner bend direction; absent = "left" (each wall turns 90° counter-clockwise from the previous). */
  readonly turn?: "left" | "right";
  /**
   * M12.1 — the room's surfaces, for showing a client the furniture in a room rather than in a void.
   * Ids come from the app's own `ROOM_MATERIALS` palette, NOT from `BOARDS`: a room is not made of ЛДСП
   * and must never reach the cut list, the estimate or the CNC file. Both optional — absent = the plain
   * neutral surfaces shipped before, so every existing model renders byte-identically.
   */
  readonly floorMaterial?: string;
  readonly wallMaterial?: string;
  /** M12.3 — an optional rug lying on the floor, centred under the furniture. Render-only, like the room. */
  readonly rug?: {
    readonly w_mm10: mm10;
    readonly d_mm10: mm10;
    /** Palette id (`RUG_COLORS`); absent = the default weave. */
    readonly color?: string;
  };
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
  /**
   * M9U.6 — the usta's PROJECT-level note (Moblo's «Notes»): the conditions that belong to the whole
   * order rather than to one panel — delivery, the client's request, an assembly caveat. Free text; the
   * drawing sheet prints it above the per-part notes (M7.3). Optional and inert: nothing solves, cuts,
   * drills or prices from it, so a model without one is byte-identical to the pre-M9U.6 world.
   */
  readonly notes?: string;
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
  /**
   * Phase 5 — the room the cabinets stand in: an axis-aligned 90° wall polyline (render-only backdrop).
   * Optional/additive: absent = no room, every existing model + the whole cut-list / run / L-corner path is
   * byte-identical. Walls are never machined, never raycast — they only frame the 3D scene.
   */
  readonly room?: Room;
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
