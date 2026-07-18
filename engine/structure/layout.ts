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
  Component,
  DrawerInterior,
  Instance,
  Junction3D,
  Line,
  Section,
  StructuralModel,
} from "../contracts/structure.js";
import { leafSections } from "../contracts/structure.js";
import { shelfMaxAngleDeg } from "./operations.js";
import type { mm10 } from "../contracts/types.js";
import {
  BOARD_MM10,
  CORNER_FILLER_W,
  GLASS_MM10,
  GLAZED_FRAME_W,
  GLAZED_MUNTIN_W,
  resolveThickness,
  sectionOfLine,
  shelfSpanX,
  shelfSpanY,
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
function carcassPlace(idBase: string, label: string, box: Box6, t: ResolvedT, omitSideR = false): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  const c = t.carcass; // sides / top / bottom stock
  const bk = t.back; // back panel (thin ХДФ) — its own thickness + flush-to-rear offset
  const ps = [
    place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z, c, h, d),
    place(`${idBase}__side_r`, `${label}Бок правый`, x + w - c, y, z, c, h, d),
    place(`${idBase}__top`, `${label}Верх`, x + c, y + h - c, z, w - 2 * c, c, d),
    place(`${idBase}__bottom`, `${label}Низ`, x + c, y, z, w - 2 * c, c, d),
    place(`${idBase}__back`, `${label}Задняя стенка`, x, y, z + d - bk, w, h, bk),
  ];
  return omitSideR ? ps.filter((p) => !p.id.endsWith("__side_r")) : ps;
}

function carcass(block: Block, t: ResolvedT): PanelPlacement[] {
  return carcassPlace(block.id, "", block.box, t);
}

/** Carcass positioned for a return run along Z (the L's second leg, rotated 90°). The corner-end
 *  side is omitted (it opens into leg-A); the far-end side is kept as `side_l`. Matches the 4 parts
 *  solveStructure emits for leg-B (side_r omitted). */
function carcassPlaceZ(idBase: string, label: string, box: Box6, t: ResolvedT): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  const c = t.carcass; // this leg's side/top/bottom are carcass stock…
  const bk = t.back; // …its back is the thin panel (thin in X here, at the far-wall side)
  return [
    place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z + d - c, w, h, c), // far end of the run
    place(`${idBase}__top`, `${label}Верх`, x, y + h - c, z + c, w, c, d - 2 * c),
    place(`${idBase}__bottom`, `${label}Низ`, x, y, z + c, w, c, d - 2 * c),
    place(`${idBase}__back`, `${label}Задняя стенка`, x + w - bk, y, z, bk, h, d), // wall side (far X)
  ];
}

/** Position an L-corner block: leg-A along X, leg-B as a Z-return behind it, + the corner filler. */
function lCornerLayout(block: Block, t: ResolvedT): PanelPlacement[] {
  const fp = block.footprint!;
  const { x, y, z, h } = block.box;
  const aDepth = fp.legA.depth_mm10;
  const aBox: Box6 = { x, y, z, w: fp.legA.length_mm10, h, d: aDepth };
  const bBox: Box6 = { x, y, z: z + aDepth, w: fp.legB.depth_mm10, h, d: fp.legB.length_mm10 };
  return [
    ...carcassPlace(`${block.id}__legA`, "Плечо A · ", aBox, t),
    // leg-B sits fully BEHIND leg-A (z + legA.depth): its back is perpendicular to leg-A's and
    // adjacent to it, not overlapping — the blind-corner Pattern A (see lCornerParts / -r4:1241-1250).
    ...carcassPlaceZ(`${block.id}__legB`, "Плечо B · ", bBox, t),
    // The 50mm blind-corner door-clearance filler at the inner corner (blocker #6; -r3:327, GEO-3).
    place(`${block.id}__corner_filler`, "Угловая планка", x + fp.legB.depth_mm10, y, z + aDepth - CORNER_FILLER_W, t.carcass, h, CORNER_FILLER_W),
  ];
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
function facadePlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || component.role !== "facade" || component.glazedGrid) return null;
  const s = section.box;
  return place(
    `${block.id}__inst_${inst.id}`,
    component.name,
    block.box.x + s.x,
    block.box.y + s.y,
    block.box.z + s.z, // the front face (near side of the section)
    s.w,
    s.h,
    boardThickness(component, t.facade), // 18mm МДФ / 32mm doubled door — matches the cut list
  );
}

/** Runner clearance per drawer side (mm10) — mirrors DRAWER_SLIDE_CLEAR_MM10 in solve.ts so the box
 *  the viewport draws sits exactly where the cut-list box is. */
const DRAWER_SLIDE_CLEAR_MM10 = 130;

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
): PanelPlacement[] {
  const c = t.carcass, bk = t.back, fa = t.facade; // box walls = carcass, bottom = thin back, facade = МДФ
  const bodyX = box.x + openingX0 + DRAWER_SLIDE_CLEAR_MM10; // opening inner face + left runner clearance
  const bodyW = openingW - 2 * DRAWER_SLIDE_CLEAR_MM10; // body width between the runners
  const innerW = bodyW - 2 * c; // between the two box sides
  const bodyY = box.y + c; // above the bottom clearance
  const sideH = box.h - 2 * c; // box side height within the opening
  const boxZ = box.z + fa; // behind the front facade (its own thickness)
  const boxD = box.d - fa - c; // body depth (behind the facade, small back clearance)
  return [
    place(`${idBase}__front`, "Ящик · фасад", box.x, box.y, box.z, box.w, box.h, fa), // full front opening
    place(`${idBase}__side_l`, "Ящик · бок Л", bodyX, bodyY, boxZ, c, sideH, boxD),
    place(`${idBase}__side_r`, "Ящик · бок П", bodyX + bodyW - c, bodyY, boxZ, c, sideH, boxD),
    place(`${idBase}__back`, "Ящик · задняя", bodyX + c, bodyY, boxZ + boxD - c, innerW, sideH, c),
    place(`${idBase}__bottom`, "Ящик · дно", bodyX + c, bodyY, boxZ, innerW, bk, boxD),
  ];
}

/** Placements for a drawer's nested interior (drawer-in-drawer, v5): each interior drawer fills the
 *  interior clear box (block-local → world via the block origin) freestanding, recursing into its own
 *  interior. Non-drawer interior content is out of scope for now. */
function drawerInteriorPlacements(idBase: string, block: Block, interior: DrawerInterior, t: ResolvedT): PanelPlacement[] {
  const out: PanelPlacement[] = [];
  const byId = new Map(interior.components.map((c) => [c.id, c] as const));
  for (const inst of interior.instances) {
    const comp = byId.get(inst.componentId);
    if (!comp?.drawer) continue;
    const innerBase = `${idBase}__in_${inst.id}`;
    const b = interior.box;
    const world = { x: block.box.x + b.x, y: block.box.y + b.y, z: block.box.z + b.z, w: b.w, h: b.h, d: b.d };
    out.push(...drawerBoxPlaceInto(innerBase, world, 0, b.w, t));
    if (inst.interior) out.push(...drawerInteriorPlacements(innerBase, block, inst.interior, t));
  }
  return out;
}

function drawerBoxPlacement(block: Block, inst: Instance, t: ResolvedT): PanelPlacement[] | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || !component.drawer) return null;
  const s = section.box;
  const world = { x: block.box.x + s.x, y: block.box.y + s.y, z: block.box.z + s.z, w: s.w, h: s.h, d: s.d };
  const span = shelfSpanX(block, section, t.carcass);
  const idBase = `${block.id}__inst_${inst.id}`;
  const out = drawerBoxPlaceInto(idBase, world, span.x0, span.width, t);
  if (inst.interior) out.push(...drawerInteriorPlacements(idBase, block, inst.interior, t)); // drawer-in-drawer
  return out;
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
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || component.role !== "facade" || !component.glazedGrid) return null;

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

/**
 * Positioned panels for the 3D viewport. Same panels (and ids) as `solveStructure`, but
 * each carries its place in the cabinet so the editor can render the assembled box.
 */
export function solveLayout(model: StructuralModel, thickness: ThicknessSpec = {}): PanelPlacement[] {
  const t = resolveThickness(thickness); // per-role board thickness — mirrors solveStructure so the
  // rendered box matches the cut list (thin ХДФ back, 18mm МДФ facade, 32mm doubled shelf/door…).
  const out: PanelPlacement[] = [];
  for (const block of model.blocks) {
    out.push(...(block.footprint ? lCornerLayout(block, t) : carcass(block, t)));
    for (const line of block.lines) out.push(dividerPlacement(block, line, t));
    for (const inst of block.instances) {
      const drawer = drawerBoxPlacement(block, inst, t); // E: drawer box (5 panels) — was missing → drawers were invisible
      const grid = glazedGridPlacement(block, inst); // E2: multi-panel glazed-grid door
      const placements = drawer ?? grid ?? [motionPlacement(block, inst, t) ?? shelfPlacement(block, inst, t) ?? facadePlacement(block, inst, t)]
        .filter((p): p is PanelPlacement => p !== null);
      // Display-shelf front lip (null unless the shelf has one) — an extra board at the front edge.
      const lip = shelfLipPlacement(block, inst, t);
      for (const p of lip ? [...placements, lip] : placements) out.push(inst.junction ? applyJunction(p, inst.junction) : p);
    }
  }
  return out;
}
