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
  Instance,
  Junction3D,
  Line,
  Section,
  StructuralModel,
} from "../contracts/structure.js";
import { leafSections } from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";
import {
  BOARD_MM10,
  CORNER_FILLER_W,
  GLASS_MM10,
  GLAZED_FRAME_W,
  GLAZED_MUNTIN_W,
  sectionOfLine,
} from "./solve.js";

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
function carcassPlace(idBase: string, label: string, box: Box6, omitSideR = false): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  const ps = [
    place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z, B, h, d),
    place(`${idBase}__side_r`, `${label}Бок правый`, x + w - B, y, z, B, h, d),
    place(`${idBase}__top`, `${label}Верх`, x + B, y + h - B, z, w - 2 * B, B, d),
    place(`${idBase}__bottom`, `${label}Низ`, x + B, y, z, w - 2 * B, B, d),
    place(`${idBase}__back`, `${label}Задняя стенка`, x, y, z + d - B, w, h, B),
  ];
  return omitSideR ? ps.filter((p) => !p.id.endsWith("__side_r")) : ps;
}

function carcass(block: Block): PanelPlacement[] {
  return carcassPlace(block.id, "", block.box);
}

/** Carcass positioned for a return run along Z (the L's second leg, rotated 90°). The corner-end
 *  side is omitted (it opens into leg-A); the far-end side is kept as `side_l`. Matches the 4 parts
 *  solveStructure emits for leg-B (side_r omitted). */
function carcassPlaceZ(idBase: string, label: string, box: Box6): PanelPlacement[] {
  const { x, y, z, w, h, d } = box;
  return [
    place(`${idBase}__side_l`, `${label}Бок левый`, x, y, z + d - B, w, h, B), // far end of the run
    place(`${idBase}__top`, `${label}Верх`, x, y + h - B, z + B, w, B, d - 2 * B),
    place(`${idBase}__bottom`, `${label}Низ`, x, y, z + B, w, B, d - 2 * B),
    place(`${idBase}__back`, `${label}Задняя стенка`, x + w - B, y, z, B, h, d), // wall side (far X)
  ];
}

/** Position an L-corner block: leg-A along X, leg-B as a Z-return behind it, + the corner filler. */
function lCornerLayout(block: Block): PanelPlacement[] {
  const fp = block.footprint!;
  const { x, y, z, h } = block.box;
  const aDepth = fp.legA.depth_mm10;
  const aBox: Box6 = { x, y, z, w: fp.legA.length_mm10, h, d: aDepth };
  const bBox: Box6 = { x, y, z: z + aDepth, w: fp.legB.depth_mm10, h, d: fp.legB.length_mm10 };
  return [
    ...carcassPlace(`${block.id}__legA`, "Плечо A · ", aBox),
    // leg-B sits fully BEHIND leg-A (z + legA.depth): its back is perpendicular to leg-A's and
    // adjacent to it, not overlapping — the blind-corner Pattern A (see lCornerParts / -r4:1241-1250).
    ...carcassPlaceZ(`${block.id}__legB`, "Плечо B · ", bBox),
    // The 50mm blind-corner door-clearance filler at the inner corner (blocker #6; -r3:327, GEO-3).
    place(`${block.id}__corner_filler`, "Угловая планка", x + fp.legB.depth_mm10, y, z + aDepth - CORNER_FILLER_W, B, h, CORNER_FILLER_W),
  ];
}

/** Vertical divider (axis "x") positioned inside the SECTION it divides (leg-aware for L-blocks):
 *  its depth + z-origin follow that section, not the block's bounding box. */
function dividerPlacement(block: Block, line: Line): PanelPlacement {
  const box = sectionOfLine(block, line.id)?.box;
  const sy = box ? box.y : 0;
  const sz = box ? box.z : 0;
  const sh = box ? box.h : block.box.h;
  const sd = box ? box.d : block.box.d;
  const px = block.box.x + line.position_mm10;
  return place(`${block.id}__div_${line.id}`, "Перегородка", px - B / 2, block.box.y + sy + B, block.box.z + sz, B, sh - 2 * B, sd);
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
function shelfPlacement(block: Block, inst: Instance): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || component.role !== "internal_shelf") return null;
  const s = section.box;
  return place(
    `${block.id}__inst_${inst.id}`,
    component.name,
    block.box.x + s.x + B,
    block.box.y + inst.anchor.y,
    block.box.z + s.z,
    s.w - 2 * B,
    B,
    s.d,
  );
}

/** A facade/door placement: covers its section's front opening (single door only; the glazed-grid
 *  assembly layout is a follow-up). */
function facadePlacement(block: Block, inst: Instance): PanelPlacement | null {
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
    B,
  );
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
function motionPlacement(block: Block, inst: Instance): PanelPlacement | null {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component || !component.motion) return null;
  const s = section.box;
  return place(
    `${block.id}__inst_${inst.id}`,
    component.name,
    block.box.x + s.x + B,
    block.box.y + inst.anchor.y,
    block.box.z + s.z,
    s.w - 2 * B,
    B,
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
export function solveLayout(model: StructuralModel): PanelPlacement[] {
  const out: PanelPlacement[] = [];
  for (const block of model.blocks) {
    out.push(...(block.footprint ? lCornerLayout(block) : carcass(block)));
    for (const line of block.lines) out.push(dividerPlacement(block, line));
    for (const inst of block.instances) {
      const grid = glazedGridPlacement(block, inst); // E2: multi-panel glazed-grid door
      const placements = grid ?? [motionPlacement(block, inst) ?? shelfPlacement(block, inst) ?? facadePlacement(block, inst)]
        .filter((p): p is PanelPlacement => p !== null);
      for (const p of placements) out.push(inst.junction ? applyJunction(p, inst.junction) : p);
    }
  }
  return out;
}
