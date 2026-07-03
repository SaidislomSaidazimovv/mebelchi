// engine/structure/solve.ts — S3-E1 parametric solver.
//
// Turns the Construction structural model (Block → Zone → Section → Instance) into the
// flat manufacturing `Part[]` the SWJ008 path consumes. This is the bridge that was
// missing — `index.ts` notes "Later layers (Layer 2 parametric solver) plug in here";
// THIS is that layer. Before it, parts were hand-authored fixtures with no path from
// design intent to a cuttable panel set.
//
// FIRST SLICE: generates the carcass (2 sides + top + bottom), one divider panel per
// `Line`, and a shelf panel per `internal_shelf` instance — each with dimensions DERIVED
// from block/section geometry. Drilling operations are added in S3-E2 (primitive
// integration); parts here carry `operations: []` (a blank panel is still a valid,
// cuttable Part). Other panel roles (facade/back/drawer) land in later steps.
//
// CONVENTIONS (mm10; 16 mm board = 160, L1 single stock):
//   block.box / section.box = { w: width(X), h: height(Y), d: depth(Z) }
//   Part.length_mm10 = X extent, Part.width_mm10 = Y extent  (SWJ008: X=Length, Y=Width)
//   Sides stand full height × depth; top/bottom span the inner width (w − 2·board).
//
// PURE & DETERMINISTIC: same model in → same parts out. No mutation, no I/O.

import type { Grain, Part, mm10 } from "../contracts/types.js";
import {
  leafSections,
  type Block,
  type Component,
  type Instance,
  type Line,
  type Section,
  type StructuralModel,
} from "../contracts/structure.js";

/** 16 mm stock — the only board thickness (law L1). */
export const BOARD_MM10: mm10 = 160;

/**
 * Edge-band tape thickness on a banded (visible) edge — 1.0 mm. GROUNDED: factory golden files
 * show banded edges at Thickness="1.000" (e.g. POLKA-1_7_1.XML), and the field research
 * (Researches/-R7F_3_factory_answers.md, DB/-rF_4_market_reframe.md) confirms "kromka 1mm is the
 * 99% default" (visible 1.0 · hidden 0.4 · premium 2.0) — superseding the older 0.4/2.0 in
 * 06_CONVENTIONS §5. S3-E5 / L8: a banded edge must be EMITTED in the cut output, not implied.
 */
export const EDGE_BAND_MM10: mm10 = 10;

const GRAIN: Grain = "L";

function panel(
  id: string,
  name: string,
  length_mm10: mm10,
  width_mm10: mm10,
  edges: Part["edges"] = [0, 0, 0, 0],
): Part {
  return {
    id,
    name,
    length_mm10,
    width_mm10,
    thickness_mm10: BOARD_MM10,
    grain: GRAIN,
    edges,
    operations: [],
  };
}

/**
 * The FRONT edge banded at 1.0mm. Front = Face 1 = edges[0] = the Y=Width (depth-front) edge.
 * SWJ008 face map (GROUNDED from factory edge-drill coordinates: Face1 drills at Y=Width, e.g.
 * POL_3_1.XML Face1 @ Y=503=Width): Face1=top(Y-max) · Face2=bottom(Y=0) · Face3=right(X-max) ·
 * Face4=left(X=0). Every solved carcass/shelf/divider here has Width = depth, so its room-facing
 * front edge is Face 1. (POLKA-1 bands its front edge too — its Face 3 only because that panel is
 * drawn transposed, depth = X.) Fresh array per call to avoid shared references.
 */
const frontBand = (): Part["edges"] => [EDGE_BAND_MM10, 0, 0, 0];

/** All four edges banded — a facade/door is visible from every side (GROUNDED: the factory door
 *  SHKOF_ORTA_CHAP_ESHIK_7_1.XML bands Face 1/2/3/4 at 1.000mm). */
const allBand = (): Part["edges"] => [EDGE_BAND_MM10, EDGE_BAND_MM10, EDGE_BAND_MM10, EDGE_BAND_MM10];

/**
 * L1 doubling: a 32mm build = TWO glued 16mm boards, never one 32mm board. Emit two Part records
 * (same geometry, 16mm each). The doubled edge wears ONE kromka run — the OUTER layer keeps the
 * front band, the INNER layer is bare (the glue seam hides under the band). Follows L1 literally
 * ("cut list emits two boards + wider kromka run").
 * NOTE: the exact per-board SWJ008 encoding of a doubled edge's kromka run awaits a factory
 * doubled-panel export to confirm (S3-E7); this is the L1-literal representation until then.
 */
export function doublePanel(base: Part): [Part, Part] {
  const outer: Part = { ...base, id: `${base.id}__a`, name: `${base.name} · слой A`, operations: [] };
  const inner: Part = { ...base, id: `${base.id}__b`, name: `${base.name} · слой B`, edges: [0, 0, 0, 0], operations: [] };
  return [outer, inner];
}

/**
 * Partial doubling (CONSTRUCTION_FRAME_v3 L2 "lightness via real partial doubling" / Piece 3): a
 * `front_mm10`-wide strip along the FRONT edge is doubled. Emit the base board + a front-strip
 * board (16mm, full length × front_mm10 deep) glued under the front — 32mm at the front, 16mm
 * behind, with a step on the underside. (This creates the step; the step-aware MOUNTING resolution
 * of parts touching that underside needs a mounting-relationship model — a follow-up.)
 */
/**
 * Step-aware mounting resolution (blocker #7, CONSTRUCTION_FRAME_v3 Piece 3): the underside plane a
 * part touches when it meets a partially-doubled top at depth `y_mm10`. Under the front strip the
 * top is 32mm (2 boards); behind the step it is 16mm (1 board). Returns the top's thickness at that
 * depth — the offset from the top face down to the underside the mount rests against, so a pedestal
 * "resolves to the actual plane it touches, not the top treated as uniform" (v3 line 188).
 * v3-authoritative: a thorough grounding hunt (DB/16 joints, the model, the factory files, general
 * furniture-CAD) confirmed #7 is specified ONLY in v3 Piece 3 — this implements it literally, no
 * invention. (Wiring real pedestal/blade parts to this needs a mounting-relationship field — next.)
 */
export function undersidePlaneAt(topWidth_mm10: mm10, front_mm10: mm10, y_mm10: mm10): mm10 {
  const stepAt = topWidth_mm10 - front_mm10; // the step's depth position from the back (Y=0)
  return y_mm10 >= stepAt ? 2 * BOARD_MM10 : BOARD_MM10;
}

export function partialDoublePanels(base: Part, front_mm10: mm10): [Part, Part] {
  const strip: Part = {
    ...base,
    id: `${base.id}__front`,
    name: `${base.name} · фронт-удвоение`,
    width_mm10: front_mm10, // the doubled strip runs full length × front_mm10 deep
    edges: [0, 0, 0, 0], // internal glue face — not banded
    operations: [],
  };
  return [base, strip];
}

// Glazed-grid dimensions (CONSTRUCTION_FRAME_v3 Piece 2). NOT fixture-grounded — reasonable
// defaults, confirm at the factory (S3-E7). Frame + muntins are 16/32mm wood; the pane is 3mm glass.
export const GLAZED_FRAME_W: mm10 = 400; // 40 mm outer stile/rail width
export const GLAZED_MUNTIN_W: mm10 = 200; // 20 mm muntin bar width
export const GLASS_MM10: mm10 = 30; // 3 mm glass pane (factory OYNA panes measure 3mm)

/** A glass pane Part — 3mm, no grain, no edge-banding. */
function glassPane(id: string, name: string, length_mm10: mm10, width_mm10: mm10): Part {
  return { id, name, length_mm10, width_mm10, thickness_mm10: GLASS_MM10, grain: "NONE", edges: [0, 0, 0, 0], operations: [] };
}

/**
 * A glazed-GRID door → the full assembly: outer frame (2 stiles + 2 rails, 32mm doubled, banded)
 * + (lights−1) muntins (16mm) + `lights` glass panes (3mm), stacked along the door height (X).
 * v3 Piece 2: the outer frame is a 32mm group, the muntins a 16mm group. Dimensions use the
 * flagged glazed-grid defaults above.
 */
function glazedGridParts(idBase: string, name: string, length: mm10, width: mm10, lights: number): Part[] {
  const Fw = GLAZED_FRAME_W;
  const Mw = GLAZED_MUNTIN_W;
  const n = Math.max(1, Math.round(lights));
  const innerW = width - 2 * Fw; // opening width between the stiles
  const innerH = length - 2 * Fw; // opening height between the rails
  const parts: Part[] = [];

  // Outer frame — 32mm (two glued 16mm boards each), banded all round.
  parts.push(...doublePanel(panel(`${idBase}__stile_l`, `${name} · стойка Л`, length, Fw, allBand())));
  parts.push(...doublePanel(panel(`${idBase}__stile_r`, `${name} · стойка П`, length, Fw, allBand())));
  parts.push(...doublePanel(panel(`${idBase}__rail_b`, `${name} · рама низ`, innerW, Fw, allBand())));
  parts.push(...doublePanel(panel(`${idBase}__rail_t`, `${name} · рама верх`, innerW, Fw, allBand())));

  // Muntins — 16mm bars between the lights.
  for (let i = 0; i < n - 1; i += 1) {
    parts.push(panel(`${idBase}__muntin_${i}`, `${name} · раскладка ${i + 1}`, innerW, Mw));
  }

  // Glass panes — 3mm, one per light; the opening height splits evenly after the muntins.
  const paneH = Math.floor((innerH - (n - 1) * Mw) / n);
  for (let i = 0; i < n; i += 1) {
    parts.push(glassPane(`${idBase}__glass_${i}`, `${name} · стекло ${i + 1}`, paneH, innerW));
  }

  return parts;
}

/** Carcass box: two sides (full height × depth) + top + bottom (inner width × depth). */
/** Five carcass panels for a rectangular volume (idBase-prefixed). `omitSideR` drops the right
 *  side — used at an L-corner where one leg abuts the other (avoids a doubled wall). */
function boxCarcass(idBase: string, label: string, w: mm10, h: mm10, d: mm10, omitSideR = false): Part[] {
  const innerW = w - 2 * BOARD_MM10;
  const ps = [
    panel(`${idBase}__side_l`, `${label}Бок левый`, h, d, frontBand()),
    panel(`${idBase}__side_r`, `${label}Бок правый`, h, d, frontBand()),
    panel(`${idBase}__top`, `${label}Верх`, innerW, d, frontBand()),
    panel(`${idBase}__bottom`, `${label}Низ`, innerW, d, frontBand()),
    panel(`${idBase}__back`, `${label}Задняя стенка`, w, h), // back is hidden — not banded
  ];
  return omitSideR ? ps.filter((p) => !p.id.endsWith("__side_r")) : ps;
}

function carcassParts(block: Block): Part[] {
  const { w, h, d } = block.box;
  return boxCarcass(block.id, "", w, h, d);
}

// Corner-filler width (blocker #6) — the strip that bridges the L junction. GROUNDED: the corner
// convention is a 50mm blind-corner overlap (Researches/-r3 UI 1.md: "Blind corner overlap: 50mm",
// join angle 90°) and fillers make the run-length sum exact (DB/20_ENGINE_INVARIANTS GEO-3:
// "carcass widths + fillers = run length"). Exported so solveLayout places it.
export const CORNER_FILLER_W: mm10 = 500; // 50 mm — blind-corner overlap

/**
 * An L-corner block (blocker #1: "block can be L, not just box; the corner object owns the
 * depth-step") → the L carcass: leg-A's carcass + leg-B's carcass (its corner-abutting side omitted)
 * + a corner filler (blocker #6). Each leg carries its own depth (blocker #3).
 *
 * GROUNDING (E14, corrected): the join is the blind-corner Pattern A — "the perpendicular wall
 * cabinet butts into the SIDE of the first" (Researches/-r4 UI Further.md:1241-1250). So leg-B drops
 * its corner-abutting side and leg-A keeps both of its sides (leg-B butts against one). The filler is
 * the 50mm blind-corner strip (default of the grounded 50–100mm range: -r3 UI 1.md:327 + -r4:1250);
 * carcass widths + filler close the run length (DB/20 GEO-3). NOTE: the earlier "back-panel exclusion
 * (Researches/-h03)" note was a MISLABEL — that file only NAMES a test fixture, it states no rule;
 * and in solveLayout's geometry leg-B sits fully BEHIND leg-A (z + legA.depth), so the two backs are
 * perpendicular and adjacent, NOT overlapping — there is nothing to exclude. Real leg-B interior
 * content (its own shelves/dividers) needs per-leg sections — a separate blocker-#1 task, not this.
 */
function lCornerParts(block: Block): Part[] {
  const fp = block.footprint!;
  const h = block.box.h;
  return [
    ...boxCarcass(`${block.id}__legA`, "Плечо A · ", fp.legA.length_mm10, h, fp.legA.depth_mm10),
    ...boxCarcass(`${block.id}__legB`, "Плечо B · ", fp.legB.length_mm10, h, fp.legB.depth_mm10, true),
    panel(`${block.id}__corner_filler`, "Угловая планка", h, CORNER_FILLER_W, frontBand()),
  ];
}

/** The section a divider `Line` splits — the one whose `dividers` list holds its id (walks ALL
 *  sections, not just leaves, since a divided section is a non-leaf). Falls back to null. */
export function sectionOfLine(block: Block, lineId: string): Section | null {
  for (const zone of block.zones) {
    let hit: Section | null = null;
    const walk = (s: Section): void => {
      if (!hit && s.dividers.includes(lineId)) hit = s;
      s.children.forEach(walk);
    };
    walk(zone.root);
    if (hit) return hit;
  }
  return null;
}

/** A vertical divider (axis "x") stands between top and bottom, spanning the depth of the SECTION
 *  it divides (leg-aware for L-blocks) — not the block's bounding box. */
function dividerPart(block: Block, line: Line): Part {
  const box = sectionOfLine(block, line.id)?.box ?? block.box;
  return panel(`${block.id}__div_${line.id}`, "Перегородка", box.h - 2 * BOARD_MM10, box.d, frontBand());
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

/** One placed instance → its content panel(s), sized from the section it sits in.
 *  Returns two boards when the component is `doubled` (L1), one otherwise, or none for
 *  roles not yet emitted. */
function instanceParts(block: Block, inst: Instance): Part[] {
  const section = sectionById(block, inst.sectionId);
  const component = componentById(block, inst.componentId);
  if (!section || !component) return [];
  // Step-aware mount (#7): a vertical support whose height resolves to the real underside plane of
  // the partially-doubled top above it — shorter under the 32mm front strip, taller behind the step.
  if (component.mount) {
    const clear = section.box.h - undersidePlaneAt(section.box.d, component.mount.front_mm10, component.mount.y_mm10);
    return [panel(`${block.id}__inst_${inst.id}`, `${component.name} · опора`, clear, section.box.d, frontBand())];
  }
  // First slice handles shelves; other roles return [] until their step.
  if (component.role === "internal_shelf") {
    const length = section.box.w - 2 * BOARD_MM10; // span between sides / dividers (X)
    const width = section.box.d; // depth (Y)
    // Banded on the FRONT edge by default (Face 1 = edges[0]); a user #39 kromka override wins.
    const edges = component.edgeBands ? [...component.edgeBands] as Part["edges"] : frontBand();
    const base = panel(`${block.id}__inst_${inst.id}`, component.name, length, width, edges);
    if (component.partialDouble) return partialDoublePanels(base, component.partialDouble.front_mm10);
    return component.doubled ? doublePanel(base) : [base];
  }
  // A facade/door covers a section's front opening: height (X, hinge axis) × width (Y), banded
  // on all four visible edges. Hinge drilling is added by the drilling pass (engine/structure).
  if (component.role === "facade") {
    const length = section.box.h; // door height (X) — hinge cups run along this axis
    const width = section.box.w; // door width (Y)
    if (component.glazedGrid) {
      return glazedGridParts(`${block.id}__inst_${inst.id}`, component.name, length, width, component.glazedGrid.lights);
    }
    // A facade is banded on all four visible edges by default; a user #39 kromka override wins.
    const edges = component.edgeBands ? [...component.edgeBands] as Part["edges"] : allBand();
    const base = panel(`${block.id}__inst_${inst.id}`, component.name, length, width, edges);
    return component.doubled ? doublePanel(base) : [base];
  }
  return [];
}

/**
 * The parametric solve: structural model → flat manufacturing `Part[]`.
 * Feed the result to `solveFull` / `solveAndExportSWJ008` (it slots in exactly where
 * hand-authored parts used to).
 */
export function solveStructure(model: StructuralModel): Part[] {
  const parts: Part[] = [];
  for (const block of model.blocks) {
    parts.push(...(block.footprint ? lCornerParts(block) : carcassParts(block)));
    for (const line of block.lines) parts.push(dividerPart(block, line));
    for (const inst of block.instances) parts.push(...instanceParts(block, inst));
  }
  return parts;
}
