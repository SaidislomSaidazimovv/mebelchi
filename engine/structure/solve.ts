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
  type Box3D,
  type Component,
  type DrawerInterior,
  type DrawerOrganizer,
  type FreePart,
  type Instance,
  type Line,
  type Section,
  type StructuralModel,
} from "../contracts/structure.js";
import type { MaterialVar } from "../contracts/variables.js";

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

/**
 * Per-role board thickness (mm10). Any absent role falls back to the 16mm single-stock
 * default (law L1) — so an empty / all-absent spec reproduces the legacy 16mm-only geometry
 * byte-for-byte. `carcass` drives the inner-width and the shelf/divider spans.
 */
export interface ThicknessSpec {
  readonly carcass?: mm10;
  readonly back?: mm10;
  readonly shelf?: mm10;
  readonly divider?: mm10;
  readonly facade?: mm10;
  readonly worktop?: mm10; // Phase 1.2 — the worktop's own stock (38mm postforming)
}
export interface ResolvedT { carcass: mm10; back: mm10; shelf: mm10; divider: mm10; facade: mm10; worktop: mm10 }
export function resolveThickness(spec: ThicknessSpec = {}): ResolvedT {
  return {
    carcass: spec.carcass ?? BOARD_MM10,
    back: spec.back ?? BOARD_MM10,
    shelf: spec.shelf ?? BOARD_MM10,
    divider: spec.divider ?? BOARD_MM10,
    facade: spec.facade ?? BOARD_MM10,
    worktop: spec.worktop ?? BOARD_MM10,
  };
}

/**
 * CONSTRUCTION_FRAME_v4 §3.1 — "thickness travels with the material". Derive a per-role `ThicknessSpec`
 * from the project's global material slots, so a Part gets its board thickness from the slot it
 * references, not a hardcoded number: the **korpus** slot drives the carcass family (carcass + shelf +
 * divider), **fasad** drives the facade, **orqa** drives the back. Feed the result to `solveStructure`
 * / `solveLayout` and changing MaterialVar B (korpus) 16→18 re-solves every carcass part in one edit.
 * A role with no slot is left absent (falls back to the 16mm default via `resolveThickness`).
 */
export function thicknessSpecFromVars(vars: readonly MaterialVar[]): ThicknessSpec {
  const th = (role: string): mm10 | undefined => vars.find((v) => v.role === role)?.thickness_mm10;
  const korpus = th("korpus");
  const fasad = th("fasad");
  const orqa = th("orqa");
  return {
    ...(korpus !== undefined ? { carcass: korpus, shelf: korpus, divider: korpus } : {}),
    ...(fasad !== undefined ? { facade: fasad } : {}),
    ...(orqa !== undefined ? { back: orqa } : {}),
  };
}

function panel(
  id: string,
  name: string,
  length_mm10: mm10,
  width_mm10: mm10,
  edges: Part["edges"] = [0, 0, 0, 0],
  thickness_mm10: mm10 = BOARD_MM10,
  role?: string, // Phase 5.C: PanelRole tag for material/price; omitted → untagged (absent, not undefined)
): Part {
  return {
    id,
    name,
    length_mm10,
    width_mm10,
    thickness_mm10,
    grain: GRAIN,
    edges,
    operations: [],
    ...(role ? { role } : {}),
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
export function undersidePlaneAt(topWidth_mm10: mm10, front_mm10: mm10, y_mm10: mm10, topThickness_mm10: mm10 = BOARD_MM10): mm10 {
  const stepAt = topWidth_mm10 - front_mm10; // the step's depth position from the back (Y=0)
  return y_mm10 >= stepAt ? 2 * topThickness_mm10 : topThickness_mm10;
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

/** A glass pane Part — 3mm, no grain, no edge-banding, role "glass" (priced/coloured as glass,
 *  never as a board — F1). */
function glassPane(id: string, name: string, length_mm10: mm10, width_mm10: mm10): Part {
  return { id, name, length_mm10, width_mm10, thickness_mm10: GLASS_MM10, grain: "NONE", edges: [0, 0, 0, 0], operations: [], role: "glass" };
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
  parts.push(...doublePanel(panel(`${idBase}__stile_l`, `${name} · стойка Л`, length, Fw, allBand(), BOARD_MM10, "facade")));
  parts.push(...doublePanel(panel(`${idBase}__stile_r`, `${name} · стойка П`, length, Fw, allBand(), BOARD_MM10, "facade")));
  parts.push(...doublePanel(panel(`${idBase}__rail_b`, `${name} · рама низ`, innerW, Fw, allBand(), BOARD_MM10, "facade")));
  parts.push(...doublePanel(panel(`${idBase}__rail_t`, `${name} · рама верх`, innerW, Fw, allBand(), BOARD_MM10, "facade")));

  // Muntins — 16mm bars between the lights.
  for (let i = 0; i < n - 1; i += 1) {
    parts.push(panel(`${idBase}__muntin_${i}`, `${name} · раскладка ${i + 1}`, innerW, Mw, [0, 0, 0, 0], BOARD_MM10, "facade"));
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
function boxCarcass(idBase: string, label: string, w: mm10, h: mm10, d: mm10, t: ResolvedT, omitSideR = false): Part[] {
  const innerW = w - 2 * t.carcass;
  const ps = [
    panel(`${idBase}__side_l`, `${label}Бок левый`, h, d, frontBand(), t.carcass, "carcass_side"),
    panel(`${idBase}__side_r`, `${label}Бок правый`, h, d, frontBand(), t.carcass, "carcass_side"),
    panel(`${idBase}__top`, `${label}Верх`, innerW, d, frontBand(), t.carcass, "carcass_top"),
    panel(`${idBase}__bottom`, `${label}Низ`, innerW, d, frontBand(), t.carcass, "carcass_bottom"),
    panel(`${idBase}__back`, `${label}Задняя стенка`, w, h, [0, 0, 0, 0], t.back, "carcass_back"), // back is hidden — not banded
  ];
  return omitSideR ? ps.filter((p) => !p.id.endsWith("__side_r")) : ps;
}

/** Worktop front overhang (mm10): how far the stoleshnitsa sticks out past the carcass front. The
 *  depth grows by this in solve and the front edge moves forward by it in layout, so it lives here and
 *  layout imports it — both must agree or the cut list and the render diverge. */
export const WORKTOP_OVERHANG_MM10: mm10 = 300; // 30 mm, the standard kitchen worktop overhang

function carcassParts(block: Block, t: ResolvedT): Part[] {
  const { w } = block.box;
  const parts = boxCarcass(block.id, "", w, block.box.h, block.box.d, t);
  // Sokol / plinth (Phase 1.1): a recessed toe-kick board spanning the inner width, standing at the
  // front UNDER the carcass. `box.h` stays the carcass height — this is an extra part below it. Its
  // edges are all concealed (bottom on the floor, top under the carcass, ends behind the sides), so it
  // is unbanded like the hidden back panel. Carcass material; no drilling (a toe-kick takes none).
  if (block.plinth_mm10 && block.plinth_mm10 > 0) {
    parts.push(panel(`${block.id}__plinth`, "Цоколь", w - 2 * t.carcass, block.plinth_mm10, [0, 0, 0, 0], t.carcass, "carcass_plinth"));
  }
  // Sokol-usti / worktop (Phase 1.2): a board on TOP spanning the full width, its depth grown by the
  // front overhang. box.h stays the carcass height — this is an extra part above it. Unbanded: a
  // postforming worktop has an integral rolled front edge, not a PVC band, and its m² rate already
  // includes that finished edge — banding here would add a wrong kromka charge. No drilling.
  if (block.worktop) {
    parts.push(panel(`${block.id}__worktop`, "Столешница", w, block.box.d + WORKTOP_OVERHANG_MM10, [0, 0, 0, 0], t.worktop, "carcass_worktop"));
  }
  return parts;
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
function lCornerParts(block: Block, t: ResolvedT): Part[] {
  const fp = block.footprint!;
  const h = block.box.h;
  const c = t.carcass;
  const parts: Part[] = [
    ...boxCarcass(`${block.id}__legA`, "Плечо A · ", fp.legA.length_mm10, h, fp.legA.depth_mm10, t),
    ...boxCarcass(`${block.id}__legB`, "Плечо B · ", fp.legB.length_mm10, h, fp.legB.depth_mm10, t, true),
    panel(`${block.id}__corner_filler`, "Угловая планка", h, CORNER_FILLER_W, frontBand(), t.carcass, "carcass_side"),
  ];
  // Phase 4.c — an L worktop is TWO abutting slabs (one per leg): A covers leg-A's top + a front overhang, B
  // covers leg-B's top, meeting at the corner. Same role/thickness/finish as the rectangular worktop.
  if (block.worktop) {
    parts.push(panel(`${block.id}__worktop_a`, "Столешница A", fp.legA.length_mm10, fp.legA.depth_mm10 + WORKTOP_OVERHANG_MM10, [0, 0, 0, 0], t.worktop, "carcass_worktop"));
    parts.push(panel(`${block.id}__worktop_b`, "Столешница B", fp.legB.depth_mm10, fp.legB.length_mm10, [0, 0, 0, 0], t.worktop, "carcass_worktop"));
  }
  // Phase 4.c — an L plinth is TWO toe-kicks: A along leg-A's front (−Z), B along leg-B's front (−X).
  if (block.plinth_mm10 && block.plinth_mm10 > 0) {
    parts.push(panel(`${block.id}__plinth_a`, "Цоколь A", fp.legA.length_mm10 - 2 * c, block.plinth_mm10, [0, 0, 0, 0], c, "carcass_plinth"));
    parts.push(panel(`${block.id}__plinth_b`, "Цоколь B", fp.legB.length_mm10 - 2 * c, block.plinth_mm10, [0, 0, 0, 0], c, "carcass_plinth"));
  }
  return parts;
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

/** A divider spans the two axes perpendicular to its split axis, over the SECTION it divides
 *  (leg-aware for L-blocks) — not the block's bounding box. An x-split is a VERTICAL divider
 *  (height × depth); a y-split is a HORIZONTAL divider/shelf (width × depth). */
function dividerPart(block: Block, line: Line, t: ResolvedT): Part {
  const section = sectionOfLine(block, line.id);
  const box = section?.box ?? block.box;
  // Boundary-aware span (matches shelfPlacement): a full board at a carcass edge, half at a divider —
  // so a NESTED divider reaches its bounding panel's face instead of leaving an 8mm gap. A y-line
  // (horizontal divider) spans X (shelfSpanX); an x-line (vertical divider) spans Y (shelfSpanY).
  const spanLen = section
    ? line.axis === "y" ? shelfSpanX(block, section, t.carcass).width : shelfSpanY(block, section, t.carcass).height
    : (line.axis === "y" ? box.w : box.h) - 2 * t.carcass;
  return panel(`${block.id}__div_${line.id}`, "Перегородка", spanLen, box.d, frontBand(), t.divider, "carcass_side");
}

function sectionById(block: Block, sectionId: string): Section | null {
  for (const zone of block.zones) {
    for (const leaf of leafSections(zone.root)) {
      if (leaf.id === sectionId) return leaf;
    }
  }
  return null;
}

/** Phase 2.2 — resolve ANY section (leaf OR parent) by id, walking the full tree. Used ONLY as a facade
 *  fallback: a combined door sits on a PARENT section (its box spans the children). Safe/additive — every
 *  existing instance is on a leaf, so this only ever resolves a facade whose section has children. */
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

/**
 * The CLEAR span (mm10) a shelf/content occupies inside a section along X — from the inner face of
 * the LEFT bounding panel to the inner face of the RIGHT one. A block-EDGE boundary is a full carcass
 * side, so its inner face is one whole board (`board`) inside the section box. An INTERIOR boundary
 * is a divider CENTRED on the cut, so its face is only HALF a board in. Insetting a fixed whole board
 * on both sides (the old `w − 2·board`) therefore left a half-board gap wherever a shelf met a
 * divider. Returns the left inset + the clear width; used by BOTH the cut list (solve) and the render
 * (layout) so they always agree.
 */
export function shelfSpanX(block: Block, section: Section, board: mm10): { x0: mm10; width: mm10 } {
  // Sections are BLOCK-LOCAL (0-based within the block); `block.box.x` is the block's run position,
  // added by the layout. So the block's own edges in the section frame are 0 and `block.box.w` — NOT
  // `block.box.x`. (Identical when the block sits at x=0, so single-block cut lists are unchanged;
  // correct for a block positioned in a run, where box.x ≠ 0.)
  const atLeftEdge = section.box.x === 0;
  const atRightEdge = section.box.x + section.box.w === block.box.w;
  const li = atLeftEdge ? board : Math.round(board / 2);
  const ri = atRightEdge ? board : Math.round(board / 2);
  return { x0: li, width: section.box.w - li - ri };
}

/** The VERTICAL twin of shelfSpanX: the clear span (mm10) between a section's bottom and top bounding
 *  panels. A block-EDGE boundary is a full carcass board; an INTERIOR boundary is a horizontal divider
 *  CENTRED on the cut → half a board in. Used by the shelf vertical distribution (equal openings even
 *  when a section is bounded by a divider) and by a vertical divider's own span. */
export function shelfSpanY(block: Block, section: Section, board: mm10): { y0: mm10; height: mm10 } {
  // Block-local edges (see shelfSpanX): the block's bottom/top in the section frame are 0 and
  // `block.box.h`, not `block.box.y`. Identical at y=0 (blocks are never positioned in Y), correct
  // if they ever are.
  const atBottomEdge = section.box.y === 0;
  const atTopEdge = section.box.y + section.box.h === block.box.h;
  const bi = atBottomEdge ? board : Math.round(board / 2);
  const ti = atTopEdge ? board : Math.round(board / 2);
  return { y0: bi, height: section.box.h - bi - ti };
}

/** Runner clearance per drawer side (mm10) — the gap the slide occupies between box and carcass. */
const DRAWER_SLIDE_CLEAR_MM10 = 130;

/** Default drawer height (mm10): a fresh drawer is this tall, sitting at the BOTTOM of its section —
 *  NOT the full section height (a full-height drawer renders as thin slats and reads as "broken"). Capped
 *  to the section when it's shorter. MUST match DRAWER_HEIGHT_MM10 in layout.ts so the cut list + 3D agree. */
const DRAWER_HEIGHT_MM10 = 2000; // 200 mm
/** The drawer's own box: the section's footprint but only DRAWER_HEIGHT tall, kept at the section floor. */
const drawerBoxOf = (b: Box3D, height_mm10?: mm10): Box3D => ({ ...b, h: Math.min(b.h, height_mm10 ?? DRAWER_HEIGHT_MM10) });

/** A drawer placement → its 5-panel box: facade front + two carcass sides + carcass back + thin
 *  bottom, sized to the section less the runner clearance. Part ids share the instance base so the
 *  editor's resolveInstance still selects the whole drawer. */
/** A drawer's 5-panel box (facade front + two sides + back + thin bottom) filling `box` through a clear
 *  opening of width `openingW`. Shared by a TOP-LEVEL drawer (opening = carcass clear span) and a NESTED
 *  one (opening = the parent interior's full width, no carcass). Part ids share `idBase` so the editor
 *  still selects the whole drawer. Height + depth inset the same way in both cases. */
function drawerBoxFromBox(idBase: string, box: Box3D, openingW: mm10, t: ResolvedT, organizer?: DrawerOrganizer): Part[] {
  const c = t.carcass, fa = t.facade, bk = t.back;
  const outerW = openingW - 2 * DRAWER_SLIDE_CLEAR_MM10; // body width inside the runner clearance
  const innerW = outerW - 2 * c; // between the two box sides
  const sideH = box.h - 2 * c; // box side height within the opening
  const bodyD = box.d - fa - c; // depth behind the facade, small back clearance (matches drawerBoxPlacement)
  const parts: Part[] = [
    panel(`${idBase}__front`, "Ящик · фасад", box.h, box.w, allBand(), fa, "facade"),
    panel(`${idBase}__side_l`, "Ящик · бок Л", bodyD, sideH, frontBand(), c, "carcass_side"),
    panel(`${idBase}__side_r`, "Ящик · бок П", bodyD, sideH, frontBand(), c, "carcass_side"),
    panel(`${idBase}__back`, "Ящик · задняя", innerW, sideH, frontBand(), c, "carcass_side"),
    panel(`${idBase}__bottom`, "Ящик · дно", innerW, bodyD, [0, 0, 0, 0], bk, "carcass_back"),
  ];
  // Phase 2.3 — organizer: `dividers` partition boards inside the body. axis "x" (default) spans the depth
  // (like a box side); axis "z" spans the width (like the back). Real cut parts, priced as carcass_side.
  if (organizer && organizer.dividers > 0) {
    const zAxis = organizer.axis === "z";
    for (let k = 0; k < organizer.dividers; k += 1) {
      parts.push(zAxis
        ? panel(`${idBase}__org_${k}`, "Ящик · разделитель", innerW, sideH, frontBand(), c, "carcass_side")
        : panel(`${idBase}__org_${k}`, "Ящик · разделитель", bodyD, sideH, frontBand(), c, "carcass_side"));
    }
  }
  return parts;
}

/** A TOP-LEVEL drawer in a carcass section: the opening is the clear span between the carcass sides /
 *  dividers (shelfSpanX subtracts a full board at a wall, half at a divider). */
function drawerBoxParts(block: Block, inst: Instance, section: Section, t: ResolvedT): Part[] {
  const openingW = shelfSpanX(block, section, t.carcass).width;
  const comp = block.components.find((c) => c.id === inst.componentId);
  return drawerBoxFromBox(`${block.id}__inst_${inst.id}`, drawerBoxOf(section.box, inst.drawerHeight_mm10), openingW, t, comp?.organizer);
}

/** Parts for a drawer's nested interior (drawer-in-drawer, v5): each interior drawer fills the parent's
 *  clear inner `box` freestanding (opening = the box's full width, no carcass) and recurses into its own
 *  interior — whose clear box is computed fresh from this one — giving arbitrary nesting depth. The clear
 *  box is computed (never stored), so it always matches the board thickness in force. Non-drawer interior
 *  content is out of scope for now. */
/** Stack N drawers down a clear volume of height `totalH` from `y0` (bottom→top): each drawer takes its
 *  own `drawerHeight_mm10` when set, and the leftover height is split EQUALLY among the unset ones. One
 *  unset drawer → the whole volume (unchanged fill). Clamped so a run of explicit heights never pokes out
 *  the top. Shared by solve (cut list) + layout (3D) so the two always agree. */
export function stackSlices(y0: mm10, totalH: mm10, heights: readonly (mm10 | null)[]): { y: mm10; h: mm10 }[] {
  const usedH = heights.reduce<number>((sum, h) => sum + (h ?? 0), 0);
  const autoCount = heights.filter((h) => h == null).length;
  const share = autoCount > 0 ? Math.max(0, Math.round((totalH - usedH) / autoCount)) : 0;
  const out: { y: mm10; h: mm10 }[] = [];
  let y = y0;
  for (const hi of heights) {
    const remain = y0 + totalH - y; // never let a slice extend past the top of the volume
    const h = Math.max(0, Math.min(hi ?? share, remain));
    out.push({ y, h });
    y += h;
  }
  return out;
}

function drawerInteriorParts(idBase: string, box: Box3D, interior: DrawerInterior, t: ResolvedT): Part[] {
  const out: Part[] = [];
  const byId = new Map(interior.components.map((c) => [c.id, c] as const));
  // stack the sibling drawers down the parent's clear volume so 2+ nested drawers don't overlap
  const drawers = interior.instances.filter((inst) => byId.get(inst.componentId)?.drawer);
  const slices = stackSlices(box.y, box.h, drawers.map((d) => d.drawerHeight_mm10 ?? null));
  drawers.forEach((inst, i) => {
    const sub: Box3D = { ...box, y: slices[i]!.y, h: slices[i]!.h };
    const innerBase = `${idBase}__in_${inst.id}`;
    out.push(...drawerBoxFromBox(innerBase, sub, box.w, t, byId.get(inst.componentId)?.organizer));
    if (inst.interior) out.push(...drawerInteriorParts(innerBase, drawerInteriorFromBox(sub, 0, box.w, t), inst.interior, t));
  });
  return out;
}

/**
 * The clear inner volume (block-local `Box3D`) of a drawer that fills `box` through a clear opening of
 * width `openingW` starting at `openingX0` — the space a NESTED drawer (or any content) sits in: between
 * the two box sides, above the bottom board, behind the facade, in front of the back board. Shared by
 * top-level drawers (opening = the carcass clear span) and nested ones (opening = the parent interior's
 * full width, no carcass). Matches drawerBoxParts / drawerBoxPlacement exactly.
 */
export function drawerInteriorFromBox(box: Box3D, openingX0: mm10, openingW: mm10, t: ResolvedT): Box3D {
  const c = t.carcass, bk = t.back, fa = t.facade;
  const innerW = openingW - 2 * DRAWER_SLIDE_CLEAR_MM10 - 2 * c; // between the two box sides
  const bodyD = box.d - fa - c; // body depth behind the facade
  return {
    x: box.x + openingX0 + DRAWER_SLIDE_CLEAR_MM10 + c, // inner-left face
    y: box.y + c + bk, // above the drawer bottom
    z: box.z + fa, // behind the facade
    w: innerW,
    h: box.h - 2 * c - bk, // side height less the bottom board
    d: bodyD - c, // body depth less the back board
  };
}

/** The clear inner volume of a TOP-LEVEL drawer in `section` (opening = the carcass clear span). This is
 *  what a nested drawer's `interior.box` is set to. Pure. */
export function drawerInteriorBox(block: Block, section: Section, t: ResolvedT, height_mm10?: mm10): Box3D {
  const span = shelfSpanX(block, section, t.carcass);
  return drawerInteriorFromBox(drawerBoxOf(section.box, height_mm10), span.x0, span.width, t);
}

/** One placed instance → its content panel(s), sized from the section it sits in.
 *  Returns two boards when the component is `doubled` (L1), one otherwise, or none for
 *  roles not yet emitted. */
function instanceParts(block: Block, inst: Instance, t: ResolvedT): Part[] {
  const component = componentById(block, inst.componentId);
  // Phase 2.2 — a combined door is a facade on a PARENT section; fall back to the full-tree lookup for a
  // facade whose section isn't a leaf. Non-facades stay leaf-only (they're always added to leaves).
  const section = sectionById(block, inst.sectionId) ?? (component?.role === "facade" ? sectionByIdAny(block, inst.sectionId) : null);
  if (!section || !component) return [];
  // F2 — carry the component's per-part material override onto every emitted part.
  const mat = component.material;
  // glass panes are never a board decor → don't stamp the override onto them (F1)
  const stampMat = (ps: Part[]): Part[] => (mat ? ps.map((p) => (p.role === "glass" ? p : { ...p, materialId: mat })) : ps);
  // A drawer is a whole box (its own multi-panel build), independent of a single-panel role.
  if (component.drawer) {
    const box = stampMat(drawerBoxParts(block, inst, section, t));
    // v5 — drawer-in-drawer: fill this drawer's clear inner volume (computed) with its nested content.
    if (!inst.interior) return box;
    return [...box, ...drawerInteriorParts(`${block.id}__inst_${inst.id}`, drawerInteriorBox(block, section, t, inst.drawerHeight_mm10), inst.interior, t)];
  }
  // A sliding accessory (motion, e.g. a pull-out rack — role null) is a single shelf-like board spanning
  // the opening; it was RENDERED (motionPlacement) but never emitted here, so it was missing from the cut
  // list. Emit the matching board (untagged → the pin-drilling pass skips it, since it rides runners not
  // pins). Geometry mirrors layout.ts's motionPlacement (s.w − 2·carcass × s.d × shelf board).
  if (component.motion) {
    return stampMat([panel(`${block.id}__inst_${inst.id}`, component.name, section.box.w - 2 * t.carcass, section.box.d, frontBand(), t.shelf)]);
  }
  // Step-aware mount (#7): a vertical support whose height resolves to the real underside plane of
  // the partially-doubled top above it — shorter under the 32mm front strip, taller behind the step.
  if (component.mount) {
    const clear = section.box.h - undersidePlaneAt(section.box.d, component.mount.front_mm10, component.mount.y_mm10, t.carcass);
    return stampMat([panel(`${block.id}__inst_${inst.id}`, `${component.name} · опора`, clear, section.box.d, frontBand(), t.carcass, "carcass_side")]);
  }
  // First slice handles shelves; other roles return [] until their step.
  if (component.role === "internal_shelf") {
    const length = shelfSpanX(block, section, t.carcass).width; // clear span (sides = full board, dividers = half)
    const width = section.box.d; // depth (Y)
    // Banded on the FRONT edge by default (Face 1 = edges[0]); a user #39 kromka override wins.
    const edges = component.edgeBands ? [...component.edgeBands] as Part["edges"] : frontBand();
    const base = panel(`${block.id}__inst_${inst.id}`, component.name, length, width, edges, component.thickness_mm10 ?? t.shelf, "internal_shelf");
    const shelfParts = component.partialDouble
      ? partialDoublePanels(base, component.partialDouble.front_mm10)
      : component.doubled ? doublePanel(base) : [base];
    // Display-shelf front lip (imos CP_O_1_Angle_Shelf): a real cut strip — length × lip height —
    // banded on its top (visible) edge. Emitted as its own part so it shows in the cut list / Detallar.
    const lip = component.lip_mm10
      ? [panel(`${block.id}__inst_${inst.id}__lip`, `${component.name} · борт`, length, component.lip_mm10, frontBand(), t.shelf, "internal_shelf")]
      : [];
    return stampMat([...shelfParts, ...lip]);
  }
  // A facade/door covers a section's front opening: height (X, hinge axis) × width (Y), banded
  // on all four visible edges. Hinge drilling is added by the drilling pass (engine/structure).
  if (component.role === "facade") {
    const length = section.box.h; // door height (X) — hinge cups run along this axis
    const width = section.box.w; // door width (Y)
    if (component.glazedGrid) {
      return stampMat(glazedGridParts(`${block.id}__inst_${inst.id}`, component.name, length, width, component.glazedGrid.lights));
    }
    // A facade is banded on all four visible edges by default; a user #39 kromka override wins.
    const edges = component.edgeBands ? [...component.edgeBands] as Part["edges"] : allBand();
    const base = panel(`${block.id}__inst_${inst.id}`, component.name, length, width, edges, component.thickness_mm10 ?? t.facade, "facade");
    return stampMat(component.doubled ? doublePanel(base) : [base]);
  }
  return [];
}

/**
 * The parametric solve: structural model → flat manufacturing `Part[]`.
 * Feed the result to `solveFull` / `solveAndExportSWJ008` (it slots in exactly where
 * hand-authored parts used to).
 */
/**
 * A freely-placed board → its cut `Part` (v5, free assembly). The thickness is the box dimension along
 * `thicknessAxis`; the other two are the cut length × width. Banded on all edges (a visible furniture
 * board); carries the free part's decor override. Untagged role → no carcass drilling (it rides no pins).
 */
export function freePartToPart(block: Block, fp: FreePart): Part {
  const { w, h, d } = fp.box;
  // `thicknessAxis` is the author's declaration, fixed when the part was created — but the master then
  // resizes it, and a board turned on its side keeps the stale axis. That put nonsense in the cut list:
  // a bed's headboard came out "900 × 25 × 1610 thick", and no workshop can order 1610mm stock.
  //
  // A board's thickness IS its smallest dimension — that is what makes it a board. So the box decides,
  // and the declared axis only settles a tie (a square post, where any choice is the same part). This
  // also matches how the renderer already picks the face to draw.
  const smallest = Math.min(w, h, d);
  const axis = fp.thicknessAxis === "x" && w === smallest ? "x"
    : fp.thicknessAxis === "y" && h === smallest ? "y"
      : fp.thicknessAxis === "z" && d === smallest ? "z"
        : w === smallest ? "x" : h === smallest ? "y" : "z";
  const [length, width, thickness] =
    axis === "x" ? [h, d, w]
      : axis === "y" ? [w, d, h]
        : [w, h, d]; // "z"
  // Banding defaults to every edge — right for a visible board (a table top), wrong for a solid post,
  // so a free part may declare its own. See FreePart.edgeBands.
  const bands = fp.edgeBands ? [...fp.edgeBands] as [mm10, mm10, mm10, mm10] : allBand();
  const p = panel(`${block.id}__free_${fp.id}`, fp.name, length, width, bands, thickness);
  return fp.material ? { ...p, materialId: fp.material } : p;
}

export function solveStructure(model: StructuralModel, thickness: ThicknessSpec = {}): Part[] {
  const t = resolveThickness(thickness);
  const parts: Part[] = [];
  for (const block of model.blocks) {
    if (!block.bare) parts.push(...(block.footprint ? lCornerParts(block, t) : carcassParts(block, t))); // v5 — bare = no shell
    for (const line of block.lines) parts.push(dividerPart(block, line, t));
    for (const inst of block.instances) parts.push(...instanceParts(block, inst, t));
    for (const fp of block.freeParts ?? []) parts.push(freePartToPart(block, fp)); // v5 — free assembly boards
  }
  return parts;
}
