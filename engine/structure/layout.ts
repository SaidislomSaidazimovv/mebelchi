// engine/structure/layout.ts — assembly layout for the 3D viewport (S3-E1).
//
// `solveStructure` emits flat manufacturing panels (dimensions only — every Part sits at
// the origin, because the SWJ008 machine doesn't care where a panel lives in the cabinet).
// The 3D editor needs the OPPOSITE: each panel POSITIONED in the cabinet so the viewport can
// draw the assembled box. `solveLayout` produces exactly that — positioned panels in the
// block-local mm10 frame — derived from the same geometry. Pure & deterministic.
//
// Panel ids match solveStructure's, so a selected part id maps 1:1 to its placement.

import type {
  Block,
  CarcassSlot,
  Component,
  DrawerInterior,
  DrawerOrganizer,
  FaceDir,
  FreePart,
  Instance,
  Junction3D,
  Line,
  PanelShell,
  PrimitiveShape,
  Section,
  StructuralModel,
} from "../contracts/structure.js";
import { leafSections } from "../contracts/structure.js";
import { shelfMaxAngleDeg } from "./operations.js";
import type { mm10 } from "../contracts/types.js";
import {
  BOARD_MM10,
  CORNER_FILLER_W,
  DRAWER_HEIGHT_MM10,
  DRAWER_SLIDE_CLEAR_MM10,
  WORKTOP_OVERHANG_MM10,
  drawerInteriorFromBox,
  GLASS_MM10,
  GLAZED_FRAME_W,
  GLAZED_MUNTIN_W,
  resolveThickness,
  sectionOfLine,
  shelfSpanX,
  shelfSpanY,
  shelfSpanZ,
  stackSlices,
  zoneFacingOfSection,
} from "./solve.js";
import type { ResolvedT, ThicknessSpec } from "./solve.js";

/** A panel placed in the cabinet: position + size in mm10 (block-local; X=width, Y=height, Z=depth). */
export interface PanelPlacement {
  readonly id: string;
  readonly name: string;
  readonly x_mm10: mm10;
  readonly y_mm10: mm10;
  readonly z_mm10: mm10;
  readonly w_mm10: mm10;
  readonly h_mm10: mm10;
  readonly d_mm10: mm10;
  /**
   * Tilt about the width (X) axis, in degrees — an inclined shelf (imos AS_O_Angle · "qiya polka").
   * The box keeps its rectangular size; the renderer rotates the mesh in place about its centre.
   * Optional/additive — absent or `0` = an axis-aligned board (every existing placement is unchanged).
   */
  readonly rotX_deg?: number;
  /**
   * Rotation about the VERTICAL (Y) axis in degrees — a free board turned to face another way (see
   * FreePart.rotY_deg). Render-only, like rotX_deg; the panel's cut size is unchanged. Absent = square-on.
   */
  readonly rotY_deg?: number;
  /**
   * M8.1 — tilt about the Z axis in degrees (see FreePart.rotZ_deg). Render-only, like the other two.
   * With rotX_deg and rotY_deg this completes free rotation on all three axes.
   */
  readonly rotZ_deg?: number;
  /**
   * M4 — the primitive SHAPE drawn inside this box (a cylinder leg / hanging rail, a sphere knob, a tube,
   * a wedge). Render-only, exactly like rotY_deg: the box (and so every layout figure) is unchanged, only
   * the viewport draws something other than a cuboid. Absent = "box" — every existing placement unchanged.
   */
  readonly shape?: PrimitiveShape;
  /** M7.4 — the usta hid this part in the viewport. Render-only: it is still cut, drilled and priced. */
  readonly hidden?: boolean;
  /** M9E.1 — per-part soft edge radius (mm), overriding the global bevel. Render-only. */
  readonly bevel_mm?: number;
}

const B = BOARD_MM10;

function place(
  id: string,
  name: string,
  x: mm10,
  y: mm10,
  z: mm10,
  w: mm10,
  h: mm10,
  d: mm10,
): PanelPlacement {
  return { id, name, x_mm10: x, y_mm10: y, z_mm10: z, w_mm10: w, h_mm10: h, d_mm10: d };
}

interface Box6 {
  readonly x: mm10;
  readonly y: mm10;
  readonly z: mm10;
  readonly w: mm10;
  readonly h: mm10;
  readonly d: mm10;
}

/** Carcass positioned for a run along X: 2 sides + top + bottom (inner width) + back. `omitSideR`
 *  drops the right side (the L corner-join). */
/**
 * M8.5 — a carcass board the usta hid. VIEW ONLY, exactly like a free part's `hidden`: the board is
 * still cut, still drilled, still priced and still in the CNC file — hiding a side to look inside the
 * cabinet must never quietly drop it from the order.
 */
function hide(p: PanelPlacement, slot: CarcassSlot, panels?: Block["panels"]): PanelPlacement {
  return panels?.[slot]?.hidden ? { ...p, hidden: true } : p;
}

function carcassPlace(idBase: string, label: string, box: Box6, t: ResolvedT, omitSideR = false, shell?: PanelShell, panels?: Block["panels"]): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  const c = t.carcass; // sides / top / bottom stock
  const bk = t.back; // back panel (thin ХДФ) — its own thickness + flush-to-rear offset
  const sh = shell ?? {};
  // M2 — mirror boxCarcass exactly: the same shell mask drops the same placements (solve == layout).
  return [
    ...(sh.sideL !== false ? [hide(place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z, c, h, d), "sideL", panels)] : []),
    ...(sh.sideR !== false && !omitSideR ? [hide(place(`${idBase}__side_r`, `${label}Бок правый`, x + w - c, y, z, c, h, d), "sideR", panels)] : []),
    ...(sh.top !== false ? [hide(place(`${idBase}__top`, `${label}Верх`, x + c, y + h - c, z, w - 2 * c, c, d), "top", panels)] : []),
    ...(sh.bottom !== false ? [hide(place(`${idBase}__bottom`, `${label}Низ`, x + c, y, z, w - 2 * c, c, d), "bottom", panels)] : []),
    ...(sh.back !== false ? [hide(place(`${idBase}__back`, `${label}Задняя стенка`, x, y, z + d - bk, w, h, bk), "back", panels)] : []),
  ];
}

/** Toe-kick recess: how far the plinth sits BACK from the carcass front, so it reads as recessed. */
const PLINTH_RECESS_MM10 = 500; // 50 mm, the usual kitchen toe-kick setback

function carcass(block: Block, t: ResolvedT): PanelPlacement[] {
  const ps = carcassPlace(block.id, "", block.box, t, false, block.shell, block.panels);
  // Sokol / plinth (Phase 1.1): a recessed board spanning the inner width, standing at the FRONT and
  // BELOW the carcass (y from box.y − plinth up to box.y). box.y is untouched, so every carcass panel
  // keeps its exact position; the scene recentres on the new minY (layoutBounds) and stands the
  // furniture on the plinth. Thickness = carcass, along Z, so its face looks out the front.
  const p = block.plinth_mm10;
  if (p && p > 0) {
    const { x, y, z, w } = block.box;
    const c = t.carcass;
    ps.push(hide(place(`${block.id}__plinth`, "Цоколь", x + c, y - p, z + PLINTH_RECESS_MM10, w - 2 * c, p, c), "plinth", block.panels));
  }
  // Sokol-usti / worktop (Phase 1.2): ON TOP (y + h), spanning the full width, its front edge overhanging
  // forward (z − overhang) and its depth grown to match. box.y/box.h untouched — the scene recentres on
  // the new bounds (layoutBounds), same as the plinth below.
  if (block.worktop) {
    const { x, y, z, w, h, d } = block.box;
    ps.push(hide(place(`${block.id}__worktop`, "Столешница", x, y + h, z - WORKTOP_OVERHANG_MM10, w, t.worktop, d + WORKTOP_OVERHANG_MM10), "worktop", block.panels));
  }
  return ps;
}

/** Carcass positioned for a return run along Z (the L's second leg, rotated 90°). The corner-end
 *  side is omitted (it opens into leg-A); the far-end side is kept as `side_l`. Matches the 4 parts
 *  solveStructure emits for leg-B (side_r omitted). */
function carcassPlaceZ(idBase: string, label: string, box: Box6, t: ResolvedT, shell?: PanelShell, panels?: Block["panels"]): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  const c = t.carcass; // this leg's side/top/bottom are carcass stock…
  const bk = t.back; // …its back is the thin panel (thin in X here, at the far-wall side)
  const sh = shell ?? {};
  // M2 — leg-B keeps side_l (far end), top, bottom, back (side_r is structural, never emitted here). The
  // shell mask gates the same four as leg-B's boxCarcass in solve (omitSideR=true), so the two stay in sync.
  return [
    ...(sh.sideL !== false ? [hide(place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z + d - c, w, h, c), "sideL", panels)] : []), // far end
    ...(sh.top !== false ? [hide(place(`${idBase}__top`, `${label}Верх`, x, y + h - c, z + c, w, c, d - 2 * c), "top", panels)] : []),
    ...(sh.bottom !== false ? [hide(place(`${idBase}__bottom`, `${label}Низ`, x, y, z + c, w, c, d - 2 * c), "bottom", panels)] : []),
    ...(sh.back !== false ? [hide(place(`${idBase}__back`, `${label}Задняя стенка`, x + w - bk, y, z, bk, h, d), "back", panels)] : []), // wall side
  ];
}

/** Position an L-corner block: leg-A along X, leg-B as a Z-return behind it, + the corner filler. */
function lCornerLayout(block: Block, t: ResolvedT): PanelPlacement[] {
  const fp = block.footprint!;
  const { x, y, z, h } = block.box;
  const aDepth = fp.legA.depth_mm10;
  const aBox: Box6 = { x, y, z, w: fp.legA.length_mm10, h, d: aDepth };
  const bBox: Box6 = { x, y, z: z + aDepth, w: fp.legB.depth_mm10, h, d: fp.legB.length_mm10 };
  const out: PanelPlacement[] = [
    ...carcassPlace(`${block.id}__legA`, "Плечо A · ", aBox, t, false, block.shell, block.panels),
    // leg-B sits fully BEHIND leg-A (z + legA.depth): its back is perpendicular to leg-A's and
    // adjacent to it, not overlapping — the blind-corner Pattern A (see lCornerParts / -r4:1241-1250).
    ...carcassPlaceZ(`${block.id}__legB`, "Плечо B · ", bBox, t, block.shell, block.panels),
    // The 50mm blind-corner door-clearance filler at the inner corner (blocker #6; -r3:327, GEO-3).
    place(`${block.id}__corner_filler`, "Угловая планка", x + fp.legB.depth_mm10, y, z + aDepth - CORNER_FILLER_W, t.carcass, h, CORNER_FILLER_W),
  ];
  const c = t.carcass;
  // Phase 4.c — worktop: A on leg-A (front overhang −Z) + B on leg-B, abutting A exactly at z + legA.depth.
  if (block.worktop) {
    out.push(place(`${block.id}__worktop_a`, "Столешница A", x, y + h, z - WORKTOP_OVERHANG_MM10, fp.legA.length_mm10, t.worktop, aDepth + WORKTOP_OVERHANG_MM10));
    out.push(place(`${block.id}__worktop_b`, "Столешница B", x, y + h, z + aDepth, fp.legB.depth_mm10, t.worktop, fp.legB.length_mm10));
  }
  // Phase 4.c — plinth: A along leg-A's front (−Z, thickness in Z); B along leg-B's front (−X, thickness in X).
  const p = block.plinth_mm10;
  if (p && p > 0) {
    out.push(place(`${block.id}__plinth_a`, "Цоколь A", x + c, y - p, z + PLINTH_RECESS_MM10, fp.legA.length_mm10 - 2 * c, p, c));
    out.push(place(`${block.id}__plinth_b`, "Цоколь B", x + PLINTH_RECESS_MM10, y - p, z + aDepth + c, c, p, fp.legB.length_mm10 - 2 * c));
  }
  // Phase 4 polish — handedness: a right-hand L is the MIRROR of the return leg about leg-A's X-centre. leg-A +
  // worktop_a + plinth_a are symmetric → untouched; only leg-B / filler / worktop_b / plinth_b flip to the max-X
  // end (x' = 2x + legA.length − pl.x − pl.w, exact integer). Left (default) is byte-identical.
  if (fp.hand === "right") {
    const isLegB = (id: string): boolean =>
      id.includes("__legB__") || id.endsWith("__corner_filler") || id.endsWith("__worktop_b") || id.endsWith("__plinth_b");
    return out.map((pl) => (isLegB(pl.id) ? { ...pl, x_mm10: 2 * x + fp.legA.length_mm10 - pl.x_mm10 - pl.w_mm10 } : pl));
  }
  return out;
}

/** A divider positioned inside the SECTION it divides (leg-aware for L-blocks): its depth + origin
 *  follow that section, not the block's bounding box. An x-line makes a VERTICAL divider (thin in X,
 *  full section height); a y-line makes a HORIZONTAL divider (thin in Y at the split height, spanning
 *  the section width between the sides — like a shelf). */
function dividerPlacement(block: Block, line: Line, t: ResolvedT): PanelPlacement {
  const section = sectionOfLine(block, line.id);
  const box = section?.box;
  const sx = box ? box.x : 0;
  const sy = box ? box.y : 0;
  const sz = box ? box.z : 0;
  const sw = box ? box.w : block.box.w;
  const sh = box ? box.h : block.box.h;
  const sd = box ? box.d : block.box.d;
  const c = t.carcass; // spans inset by the carcass board (matches shelfSpanX in solve's dividerPart)
  const dv = t.divider; // the divider's own thickness, centred on the cut line
  if (line.axis === "y") {
    // horizontal divider: X-span reaches the bounding side/divider faces (boundary-aware), not a fixed
    // 2·board — so a NESTED horizontal divider no longer leaves an 8mm gap. Matches dividerPart (solve).
    const span = section ? shelfSpanX(block, section, c) : { x0: c, width: sw - 2 * c };
    const py = block.box.y + line.position_mm10;
    return place(`${block.id}__div_${line.id}`, "Перегородка", block.box.x + sx + span.x0, py - dv / 2, block.box.z + sz, span.width, dv, sd);
  }
  // vertical divider: Y-span boundary-aware (full board at carcass top/bottom, half at a horizontal divider).
  const span = section ? shelfSpanY(block, section, c) : { y0: c, height: sh - 2 * c };
  const px = block.box.x + line.position_mm10;
  return place(`${block.id}__div_${line.id}`, "Перегородка", px - dv / 2, block.box.y + sy + span.y0, block.box.z + sz, dv, span.height, sd);
}

function sectionById(block: Block, sectionId: string): Section | null {
  for (const zone of block.zones) {
    for (const leaf of leafSections(zone.root)) {
      if (leaf.id === sectionId) return leaf;
    }
  }
  return null;
}

/** Phase 2.2 — resolve ANY section (leaf OR parent) for a combined door (a facade on a parent section).
 *  Mirrors solve.ts; used only as a facade fallback, so it never changes a non-facade placement. */
function sectionByIdAny(block: Block, sectionId: string): Section | null {
  for (const zone of block.zones) {
    const stack: Section[] = [zone.root];
    while (stack.length) {
      const s = stack.pop()!;
      if (s.id === sectionId) return s;
      for (const c of s.children) stack.push(c);
    }
  }
  return null;
}

function componentById(block: Block, componentId: string): Component | null {
  return block.components.find((c) => c.id === componentId) ?? null;
}

/** A shelf placement: spans its section's width (between sides/dividers) at the anchor height. */
/** The physical render thickness of a single board component: a doubled build is 2 glued boards
 *  (32mm) drawn as ONE box; an explicit per-part `thickness_mm10` wins; otherwise the role default.
 *  Mirrors solve.ts (`component.thickness_mm10 ?? role` + `doublePanel`) so the box the viewport draws
 *  matches the cut list's glued result. (`partialDouble`'s step is not modelled in the render — the
 *  single box uses the base thickness, as before.) */
function boardThickness(component: Component, roleDefault: mm10): mm10 {
  const base = component.thickness_mm10 ?? roleDefault;
  return component.doubled ? 2 * base : base;
}

function shelfPlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || component.role !== "internal_shelf") return null;
  const s = section.box;
  // Clear span between the bounding panels: a carcass side insets a full board, a divider (centred on
  // the cut) only half — so the shelf reaches the divider face instead of leaving a half-board gap.
  const span = shelfSpanX(block, section, t.carcass);
  const p = place(
    `${block.id}__inst_${inst.id}`,
    component.name,
    block.box.x + s.x + span.x0,
    block.box.y + inst.anchor.y,
    block.box.z + s.z,
    span.width,
    boardThickness(component, t.shelf), // 32mm doubled / per-part override / t.shelf — matches the cut list
    s.d,
  );
  // Inclined shelf (imos AS_O_Angle): carry the tilt so the renderer leans the board (clamped to the
  // bay). Only added when nonzero, so a flat shelf's placement stays byte-identical to before.
  const angle = effectiveShelfAngleDeg(block, inst, component);
  return angle ? { ...p, rotX_deg: angle } : p;
}

/** The tilt a shelf actually renders at: the requested angle, clamped to what fits its bay
 *  (shelfMaxAngleDeg) so the raised back edge never pokes through the carcass / the shelf above. */
function effectiveShelfAngleDeg(block: Block, inst: Instance, component: Component): number {
  const requested = component.angle_deg ?? 0;
  return requested > 0 ? Math.min(requested, shelfMaxAngleDeg(block, inst)) : 0;
}

/** Display-shelf front lip (imos CP_O_1_Angle_Shelf): a retention upstand standing at the shelf's
 *  FRONT edge to stop goods sliding off. It stands WORLD-VERTICAL (NOT tilted with the board) — a
 *  lip leaning with the tilt would swing forward out of the carcass and wouldn't catch anything; a
 *  vertical fiddle-rail sits inside the opening and actually stops items (matches imos's front hook).
 *  Its base sits on the shelf's front-bottom edge (the tilt pivot, which never moves), so it stays
 *  attached whatever the angle. Null unless the shelf has a lip. */
function shelfLipPlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || component.role !== "internal_shelf" || !component.lip_mm10) return null;
  const s = section.box;
  const span = shelfSpanX(block, section, t.carcass); // same clear span as the shelf it sits on
  return place(
    `${block.id}__inst_${inst.id}__lip`,
    `${component.name} · борт`,
    block.box.x + s.x + span.x0, // same X span as the shelf
    block.box.y + inst.anchor.y, // stands up from the shelf's front-bottom edge (the tilt pivot)
    block.box.z + s.z, // FRONT face
    span.width,
    component.lip_mm10, // upstand height (Y) — world-vertical, no rotX
    t.shelf, // thin strip in depth (Z) — same stock as the shelf (matches solve's lip part)
  );
}

/** A facade/door placement: covers its section's front opening (single door only; the glazed-grid
 *  assembly layout is a follow-up). */
/**
 * Phase 2.1d — a lift door renders OPEN (tilted up on its top edge) so the client reads "podyomnik".
 * RENDER-ONLY via rotX_deg (like a tilted shelf): the cut size is untouched. Negative angle tilts the
 * door up from the top-front edge. `parallel` (HL) lifts flatter/higher than `swing` (HK). Provisional
 * cosmetic angles.
 */
const LIFT_OPEN_DEG: Record<NonNullable<Component["lift"]>, number> = { swing: 60, parallel: 72 };

function facadePlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement | null {
  const component = componentById(block, inst.componentId);
  if (!component || component.role !== "facade" || component.glazedGrid) return null;
  // Phase 2.2 — a combined door sits on a PARENT section; fall back to the full-tree lookup for it.
  const section = sectionById(block, inst.sectionId) ?? sectionByIdAny(block, inst.sectionId);
  if (!section) return null;
  const s = section.box;
  const th = boardThickness(component, t.facade); // 18mm МДФ / 32mm doubled door — matches the cut list
  // Phase 4.d-2 / 4 polish — an L return-leg (leg-B) door faces sideways: thin in X, spanning the leg length
  // (s.d) in Z, on the −X face (left-hand L) or the +X face (right-hand L). The default (−Z) door is thin in Z,
  // spanning s.w in X. Same id/anchor; only the axes swap + which X face.
  const facing = zoneFacingOfSection(block, section.id);
  const sideways = facing !== "-z";
  const faceX = facing === "+x" ? block.box.x + s.x + s.w - th : block.box.x + s.x; // +x door hangs on the max-X face
  const p = sideways
    ? place(`${block.id}__inst_${inst.id}`, component.name, faceX, block.box.y + s.y, block.box.z + s.z, th, s.h, s.d)
    : place(`${block.id}__inst_${inst.id}`, component.name, block.box.x + s.x, block.box.y + s.y, block.box.z + s.z, s.w, s.h, th);
  // 2.1d — a lift door renders open (cut size unchanged). The open-tilt pivots about the −Z front (handles.ts),
  // so a sideways (leg-B) lift would tilt about the wrong edge → render it CLOSED until leg-B lift lands (deferred).
  return component.lift && !sideways ? { ...p, rotX_deg: LIFT_OPEN_DEG[component.lift] } : p;
}

// Audit E1 — DRAWER_SLIDE_CLEAR_MM10 + DRAWER_HEIGHT_MM10 now imported from solve.ts (single source of truth,
// compiler-enforced), instead of re-declared here (the two copies could drift silently).

/** A drawer placement → the 5-panel box (facade front + 2 sides + back + bottom) laid into its
 *  section, matching the ids + geometry `drawerBoxParts` emits in solve.ts so the 3D shows the drawer
 *  and its parts colour correctly. Was MISSING — drawers were counted in the cut list but invisible. */
/** Place a drawer's 5-panel box into a WORLD-space `box` through a clear opening of width `openingW`
 *  starting at `openingX0`. Shared by a top-level drawer (opening = the carcass clear span) and a nested
 *  one (opening = the box's full width, no carcass). Mirrors solve.ts's drawerBoxFromBox exactly. */
function drawerBoxPlaceInto(
  idBase: string,
  box: { x: mm10; y: mm10; z: mm10; w: mm10; h: mm10; d: mm10 },
  openingX0: mm10,
  openingW: mm10,
  t: ResolvedT,
  organizer?: DrawerOrganizer,
  facing: FaceDir = "-z",
): PanelPlacement[] {
  const c = t.carcass, bk = t.back, fa = t.facade; // box walls = carcass, bottom = thin back, facade = МДФ
  // Phase 4.d-2 / 4 polish — a leg-B (sideways) drawer: front thin-in-X, the opening runs along Z
  // (openingX0/openingW arrive as Z values), depth runs along X. Built at the −X face (left-hand L); a +X
  // (right-hand L) drawer is the MIRROR of it within the box. Panel SIZES mirror drawerBoxFromBox exactly.
  if (facing === "-x" || facing === "+x") {
    const bodyZ = box.z + openingX0 + DRAWER_SLIDE_CLEAR_MM10; // Z: opening inner face + near runner clearance
    const bodyW = openingW - 2 * DRAWER_SLIDE_CLEAR_MM10; // Z: body width between the runners
    const innerW = bodyW - 2 * c; // between the two box sides (along Z)
    const bodyY = box.y + c;
    const sideH = box.h - 2 * c;
    const boxX = box.x + fa; // behind the front facade (its own thickness, along X)
    const boxD = box.w - fa - c; // body depth along X (box.w = legB.depth), small back clearance
    const out = [
      place(`${idBase}__front`, "Ящик · фасад", box.x, box.y, box.z, fa, box.h, box.d), // full −X opening (Y×Z)
      place(`${idBase}__side_l`, "Ящик · бок Л", boxX, bodyY, bodyZ, boxD, sideH, c), // near-Z side, runs X-depth
      place(`${idBase}__side_r`, "Ящик · бок П", boxX, bodyY, bodyZ + bodyW - c, boxD, sideH, c), // far-Z side
      place(`${idBase}__back`, "Ящик · задняя", boxX + boxD - c, bodyY, bodyZ + c, c, sideH, innerW), // far-X back
      place(`${idBase}__bottom`, "Ящик · дно", boxX, bodyY, bodyZ + c, boxD, bk, innerW), // floor (X-depth × Z-inner)
    ];
    if (organizer && organizer.dividers > 0) {
      const n = organizer.dividers;
      for (let k = 0; k < n; k += 1) {
        if (organizer.axis === "z") {
          // spans the width (Z) like the back → thin in X, at a depth line along X
          const xc = boxX + Math.round((boxD * (k + 1)) / (n + 1)) - Math.round(c / 2);
          out.push(place(`${idBase}__org_${k}`, "Ящик · разделитель", xc, bodyY, bodyZ + c, c, sideH, innerW));
        } else {
          // axis "x": spans the depth (X) like a side → thin in Z, at a width line along Z
          const zc = bodyZ + c + Math.round((innerW * (k + 1)) / (n + 1)) - Math.round(c / 2);
          out.push(place(`${idBase}__org_${k}`, "Ящик · разделитель", boxX, bodyY, zc, boxD, sideH, c));
        }
      }
    }
    // a right-hand (+X) drawer is the −x box mirrored about the box's own X-centre (front → the +X face).
    return facing === "+x" ? out.map((pl) => ({ ...pl, x_mm10: 2 * box.x + box.w - pl.x_mm10 - pl.w_mm10 })) : out;
  }
  const bodyX = box.x + openingX0 + DRAWER_SLIDE_CLEAR_MM10; // opening inner face + left runner clearance
  const bodyW = openingW - 2 * DRAWER_SLIDE_CLEAR_MM10; // body width between the runners
  const innerW = bodyW - 2 * c; // between the two box sides
  const bodyY = box.y + c; // above the bottom clearance
  const sideH = box.h - 2 * c; // box side height within the opening
  const boxZ = box.z + fa; // behind the front facade (its own thickness)
  const boxD = box.d - fa - c; // body depth (behind the facade, small back clearance)
  const out = [
    place(`${idBase}__front`, "Ящик · фасад", box.x, box.y, box.z, box.w, box.h, fa), // full front opening
    place(`${idBase}__side_l`, "Ящик · бок Л", bodyX, bodyY, boxZ, c, sideH, boxD),
    place(`${idBase}__side_r`, "Ящик · бок П", bodyX + bodyW - c, bodyY, boxZ, c, sideH, boxD),
    place(`${idBase}__back`, "Ящик · задняя", bodyX + c, bodyY, boxZ + boxD - c, innerW, sideH, c),
    place(`${idBase}__bottom`, "Ящик · дно", bodyX + c, bodyY, boxZ, innerW, bk, boxD),
  ];
  // Phase 2.3 — organizer dividers, evenly spaced inside the body (compartment k at k/(N+1) across it),
  // matching solve.ts's drawerBoxFromBox exactly. axis "x" splits the WIDTH (dividers run depth-wise);
  // axis "z" splits the DEPTH (dividers run width-wise). Each divider is centred on its divide line.
  if (organizer && organizer.dividers > 0) {
    const n = organizer.dividers;
    const x0 = bodyX + c; // left inner face
    for (let k = 0; k < n; k += 1) {
      if (organizer.axis === "z") {
        const zc = boxZ + Math.round((boxD * (k + 1)) / (n + 1)) - Math.round(c / 2); // divide line along depth
        out.push(place(`${idBase}__org_${k}`, "Ящик · разделитель", x0, bodyY, zc, innerW, sideH, c));
      } else {
        const xc = x0 + Math.round((innerW * (k + 1)) / (n + 1)) - Math.round(c / 2); // divide line along width
        out.push(place(`${idBase}__org_${k}`, "Ящик · разделитель", xc, bodyY, boxZ, c, sideH, boxD));
      }
    }
  }
  return out;
}

/** Place a drawer (its 5-panel box + any nested content) into a WORLD-space `box` through a clear opening
 *  `openingW`@`openingX0`, then SLIDE the whole subtree forward by `inst.open × travel` (v5 E2.5, layout
 *  only — the master pulls a drawer out to reach its contents; the cut parts never move). Shared by a
 *  top-level drawer and every nested one, so each drawer's open state composes with its parent's. */
function placeDrawer(idBase: string, box: Box6, openingX0: mm10, openingW: mm10, inst: Instance, t: ResolvedT, organizer?: DrawerOrganizer, facing: FaceDir = "-z"): PanelPlacement[] {
  // honour this drawer's OWN height (nested drawers pass the full parent box; top-level arrives pre-clamped
  // in drawerBoxPlacement, so re-clamping here is idempotent). Unset = fills the box, as before.
  const dbox = inst.drawerHeight_mm10 != null ? { ...box, h: Math.min(box.h, inst.drawerHeight_mm10) } : box;
  const out = drawerBoxPlaceInto(idBase, dbox, openingX0, openingW, t, organizer, facing);
  if (inst.interior) {
    // Phase 4.d-2 — a nested drawer-in-drawer inside a leg-B (−x) drawer is deferred; the interior lays out in
    // the default (−z) frame for now (only fires if the master explicitly nests a drawer in the leg-B one).
    out.push(...drawerInteriorPlacements(idBase, drawerInteriorFromBox(dbox, openingX0, openingW, t), inst.interior, t));
  }
  // pull-out travel ≈ the body depth; a sideways (leg-B) drawer slides along X (−x pulls toward −X, +x toward
  // +X), a normal one toward +Z (the front).
  const sideways = facing === "-x" || facing === "+x";
  const travel = (sideways ? dbox.w : dbox.d) - t.facade - t.carcass;
  const openAmt = Math.round((inst.open ?? 0) * travel);
  if (!openAmt) return out;
  if (facing === "-x") return out.map((p) => ({ ...p, x_mm10: p.x_mm10 - openAmt }));
  if (facing === "+x") return out.map((p) => ({ ...p, x_mm10: p.x_mm10 + openAmt }));
  return out.map((p) => ({ ...p, z_mm10: p.z_mm10 + openAmt }));
}

/** Placements for a drawer's nested interior (drawer-in-drawer, v5): each interior drawer fills the
 *  parent's clear inner `box` (WORLD space) freestanding, recursing — and applying its OWN open state —
 *  through placeDrawer. Non-drawer interior content is out of scope for now. */
function drawerInteriorPlacements(idBase: string, box: Box6, interior: DrawerInterior, t: ResolvedT): PanelPlacement[] {
  const out: PanelPlacement[] = [];
  const byId = new Map(interior.components.map((c) => [c.id, c] as const));
  // stack the sibling drawers down the parent's clear volume (mirrors solve's drawerInteriorParts)
  const drawers = interior.instances.filter((inst) => byId.get(inst.componentId)?.drawer);
  const slices = stackSlices(box.y, box.h, drawers.map((d) => d.drawerHeight_mm10 ?? null));
  drawers.forEach((inst, i) => {
    const sub: Box6 = { ...box, y: slices[i]!.y, h: slices[i]!.h };
    out.push(...placeDrawer(`${idBase}__in_${inst.id}`, sub, 0, sub.w, inst, t, byId.get(inst.componentId)?.organizer));
  });
  return out;
}

function drawerBoxPlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement[] | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || !component.drawer) return null;
  const s = section.box;
  // B/D fix — the drawer is DRAWER_HEIGHT tall at the section floor, not the full section (a full-height
  // drawer renders as thin slats). Matches drawerBoxOf() in solve.ts so the 3D box == the cut list.
  const world = { x: block.box.x + s.x, y: block.box.y + s.y, z: block.box.z + s.z, w: s.w, h: Math.min(s.h, inst.drawerHeight_mm10 ?? DRAWER_HEIGHT_MM10), d: s.d };
  // Phase 4.d-2 / 4 polish — a leg-B (sideways ±x) drawer's opening runs along Z (shelfSpanZ); the normal
  // drawer opens along X. The facing (−x / +x) is threaded so placeDrawer mirrors + slides the correct way.
  const facing = zoneFacingOfSection(block, section.id);
  if (facing === "-x" || facing === "+x") {
    const span = shelfSpanZ(block, section, t.carcass);
    return placeDrawer(`${block.id}__inst_${inst.id}`, world, span.z0, span.depth, inst, t, component.organizer, facing);
  }
  const span = shelfSpanX(block, section, t.carcass);
  return placeDrawer(`${block.id}__inst_${inst.id}`, world, span.x0, span.width, inst, t, component.organizer);
}

/**
 * A glazed-GRID door positioned in the front opening (E2): the outer frame (2 stiles + 2 rails),
 * `lights−1` muntins, and `lights` glass panes, all laid into the section's front face. Mirrors the
 * geometry `glazedGridParts` emits (same Fw/Mw/pane split) so the render matches the cut list. Ids
 * use the member base (a doubled frame member is ONE visual box, not its two glued boards). Returns
 * `null` unless the instance is a glazed-grid facade; a door too small for its frame falls back to a
 * single covering panel so the viewport never draws a negative box.
 */
function glazedGridPlacement(block: Block, inst: Instance): PanelPlacement[] | null {
  const component = componentById(block, inst.componentId);
  if (!component || component.role !== "facade" || !component.glazedGrid) return null;
  // Phase 2.2 — a combined glazed door may sit on a PARENT section too.
  const section = sectionById(block, inst.sectionId) ?? sectionByIdAny(block, inst.sectionId);
  if (!section) return null;

  const s = section.box;
  const idBase = `${block.id}__inst_${inst.id}`;
  const x0 = block.box.x + s.x;
  const y0 = block.box.y + s.y;
  const zf = block.box.z + s.z; // front face
  const Fw = GLAZED_FRAME_W;
  const Mw = GLAZED_MUNTIN_W;
  const n = Math.max(1, Math.round(component.glazedGrid.lights));
  const innerW = s.w - 2 * Fw;
  const innerH = s.h - 2 * Fw;

  if (innerW <= 0 || innerH <= 0) {
    // Opening too small for a frame → render as one door panel (matches nothing to sub-divide).
    return [place(idBase, component.name, x0, y0, zf, s.w, s.h, B)];
  }

  const out: PanelPlacement[] = [
    place(`${idBase}__stile_l`, `${component.name} · стойка Л`, x0, y0, zf, Fw, s.h, B),
    place(`${idBase}__stile_r`, `${component.name} · стойка П`, x0 + s.w - Fw, y0, zf, Fw, s.h, B),
    place(`${idBase}__rail_b`, `${component.name} · рама низ`, x0 + Fw, y0, zf, innerW, Fw, B),
    place(`${idBase}__rail_t`, `${component.name} · рама верх`, x0 + Fw, y0 + s.h - Fw, zf, innerW, Fw, B),
  ];

  // Interior: panes stacked bottom→top, muntins between them (same order as glazedGridParts).
  const paneH = Math.floor((innerH - (n - 1) * Mw) / n);
  let cursor = y0 + Fw;
  for (let i = 0; i < n; i += 1) {
    out.push(place(`${idBase}__glass_${i}`, `${component.name} · стекло ${i + 1}`, x0 + Fw, cursor, zf, innerW, paneH, GLASS_MM10));
    cursor += paneH;
    if (i < n - 1) {
      out.push(place(`${idBase}__muntin_${i}`, `${component.name} · раскладка ${i + 1}`, x0 + Fw, cursor, zf, innerW, Mw, B));
      cursor += Mw;
    }
  }
  return out;
}

/** A sliding accessory placement (E9): render the motion component as a thin rack in its section at
 *  the anchor height (its home/retracted position). The swept envelope is computed in motion.ts. */
function motionPlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || !component.motion) return null;
  const s = section.box;
  return place(
    `${block.id}__inst_${inst.id}`,
    component.name,
    block.box.x + s.x + t.carcass,
    block.box.y + inst.anchor.y,
    block.box.z + s.z,
    s.w - 2 * t.carcass, // spans between the carcass sides (matches the solve board)
    t.shelf, // shelf-stock board thickness (parity with instanceParts' motion part)
    s.d,
  );
}

/**
 * Off-plane junction offset (#40, E5): push a placement proud by the shadow-gap so the reveal is
 * emitted, not implied (v3:177). The oversail / step-back values are carried in the model for the
 * advanced multi-body cut geometry (L3), not applied to this single-body placement yet.
 */
function applyJunction(p: PanelPlacement, j: Junction3D): PanelPlacement {
  return j.shadowGap_z_mm10 ? { ...p, z_mm10: p.z_mm10 - j.shadowGap_z_mm10 } : p;
}

/** A freely-placed board → its viewport placement: its own block-local box, lifted to world by the block
 *  origin (v5, free assembly). Ids match freePartToPart so a tapped free board maps 1:1 to its part. */
function freePartPlacement(block: Block, fp: FreePart): PanelPlacement {
  const b = fp.box;
  const p = place(`${block.id}__free_${fp.id}`, fp.name, block.box.x + b.x, block.box.y + b.y, block.box.z + b.z, b.w, b.h, b.d);
  // M8.1 — all three axes ride through, render-only: a tilted board is the same cut panel.
  const turned = fp.rotY_deg ? { ...p, rotY_deg: fp.rotY_deg } : p; // render-only turn about the vertical axis
  const tiltedX = fp.rotX_deg ? { ...turned, rotX_deg: fp.rotX_deg } : turned;
  const tilted = fp.rotZ_deg ? { ...tiltedX, rotZ_deg: fp.rotZ_deg } : tiltedX;
  const shaped = fp.shape && fp.shape !== "box" ? { ...tilted, shape: fp.shape } : tilted; // M4 — render-only shape
  const beveled = fp.bevel_mm !== undefined ? { ...shaped, bevel_mm: fp.bevel_mm } : shaped; // M9E.1 — soft edge
  return fp.hidden ? { ...beveled, hidden: true } : beveled; // M7.4 — hidden in the viewport only
}

/**
 * Positioned panels for the 3D viewport. Same panels (and ids) as `solveStructure`, but
 * each carries its place in the cabinet so the editor can render the assembled box.
 */
export function solveLayout(model: StructuralModel, thickness: ThicknessSpec = {}): PanelPlacement[] {
  const t = resolveThickness(thickness); // per-role board thickness — mirrors solveStructure so the
  // rendered box matches the cut list (thin ХДФ back, 18mm МДФ facade, 32mm doubled shelf/door…).
  const out: PanelPlacement[] = [];
  for (const block of model.blocks) {
    if (!block.bare) out.push(...(block.footprint ? lCornerLayout(block, t) : carcass(block, t))); // v5 — bare = no shell
    for (const line of block.lines) out.push(dividerPlacement(block, line, t));
    for (const inst of block.instances) {
      const drawer = drawerBoxPlacement(block, inst, t); // E: drawer box (5 panels) — was missing → drawers were invisible
      const grid = glazedGridPlacement(block, inst); // E2: multi-panel glazed-grid door
      const placements = drawer ?? grid ?? [motionPlacement(block, inst, t) ?? shelfPlacement(block, inst, t) ?? facadePlacement(block, inst, t)]
        .filter((p): p is PanelPlacement => p !== null);
      // Display-shelf front lip (null unless the shelf has one) — an extra board at the front edge.
      const lip = shelfLipPlacement(block, inst, t);
      // M7.4 — a hidden component hides every panel it draws (a drawer is five of them).
      const hide = componentById(block, inst.componentId)?.hidden === true;
      for (const p0 of lip ? [...placements, lip] : placements) {
        const p = inst.junction ? applyJunction(p0, inst.junction) : p0;
        out.push(hide ? { ...p, hidden: true } : p);
      }
    }
    for (const fp of block.freeParts ?? []) out.push(freePartPlacement(block, fp)); // v5 — free assembly boards
  }
  return out;
}
