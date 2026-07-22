// engine/structure/demoModel.ts — a realistic starter cabinet (S3-E1).
//
// One block (600 × 720 × 560 mm) split into two columns by a vertical line; the left
// column holds two shelves, the right column one — a real Block→Zone→Section→Instance
// tree the UI can initialise `model` with, so `solveStructure` + `solvePreview` render an
// actual cabinet (not a hand-made demo). Pure: returns a fresh model each call.

import type {
  Block,
  Box3D,
  Component,
  FreeAxisAnchor,
  FreeEdge,
  FreePart,
  FreePartAnchor,
  Instance,
  Line,
  Section,
  StructuralModel,
  Zone,
} from "../contracts/structure.js";
import { resolveFreePartBox } from "./operations.js";

const W = 6000; // 600 mm
const H = 7200; // 720 mm
const D = 5600; // 560 mm
const SPLIT = 3000; // vertical divider at 300 mm

/** A two-column cabinet with three shelves. Fresh objects every call (no shared mutation). */
/**
 * An EMPTY document — a bare block with nothing in it.
 *
 * Every other entry point hands the master a finished cabinet, which is fine for editing one and wrong
 * for building something that is not a cabinet: there was no way to start from nothing. The block still
 * carries a `box`, because that box is what the free boards snap against and what the dimension bar
 * edits — it is the working envelope, not a carcass. Default 1200×750×600, a table-sized volume.
 */
export function buildEmptyModel(w_mm = 1200, h_mm = 750, d_mm = 600): StructuralModel {
  const box = {
    x: 0, y: 0, z: 0,
    w: Math.max(1, Math.round(w_mm)) * 10,
    h: Math.max(1, Math.round(h_mm)) * 10,
    d: Math.max(1, Math.round(d_mm)) * 10,
  };
  const root: Section = { id: "sec_root", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null };
  const block: Block = {
    id: "blk", name: "Mebel", box, bare: true,
    zones: [{ id: "z_body", name: "Korpus", rule: "manual", root }],
    components: [], instances: [], lines: [], rows: [],
    freeParts: [],
  };
  return { id: "empty", name: "Yangi loyiha", blocks: [block], parts: [] };
}

export function buildDemoModel(): StructuralModel {
  const line: Line = {
    id: "ln_mid",
    axis: "x",
    position_mm10: SPLIT,
    boundsPartIds: [],
    groupId: null,
  };

  const leftLeaf: Section = {
    id: "sec_left",
    box: { x: 0, y: 0, z: 0, w: SPLIT, h: H, d: D },
    dividers: [],
    children: [],
    instanceIds: ["inst_l1", "inst_l2"],
    purpose: "storage",
  };
  const rightLeaf: Section = {
    id: "sec_right",
    box: { x: SPLIT, y: 0, z: 0, w: W - SPLIT, h: H, d: D },
    dividers: [],
    children: [],
    instanceIds: ["inst_r1"],
    purpose: "storage",
  };
  const root: Section = {
    id: "sec_root",
    box: { x: 0, y: 0, z: 0, w: W, h: H, d: D },
    dividers: [line.id],
    children: [leftLeaf, rightLeaf],
    instanceIds: [],
    purpose: null,
  };

  const zone: Zone = { id: "z_body", name: "Корпус", rule: "manual", root };
  const shelf: Component = {
    id: "cmp_shelf",
    name: "Полка",
    partIds: [],
    role: "internal_shelf",
  };

  const inst = (id: string, sectionId: string, y: number): Instance => ({
    id,
    componentId: shelf.id,
    sectionId,
    anchor: { x: 0, y, z: 0 },
    link: "linked",
  });

  const block: Block = {
    id: "blk_main",
    name: "Шкаф",
    box: { x: 0, y: 0, z: 0, w: W, h: H, d: D },
    zones: [zone],
    components: [shelf],
    instances: [
      inst("inst_l1", "sec_left", 2400),
      inst("inst_l2", "sec_left", 4800),
      inst("inst_r1", "sec_right", 3600),
    ],
    lines: [line],
    rows: [],
  };

  return { id: "demo", name: "Демо-шкаф", blocks: [block], parts: [] };
}

/**
 * A blank carcass at an arbitrary size (Phase K) — one block, one empty leaf section, no content.
 * This is what the «Новый блок (0 dan)» flow seeds: the usta types the client's dimensions and gets a
 * bare box (sides/top/bottom/back from the solver) to fill with shelves / doors / drawers. Dimensions
 * are in millimetres; converted to mm10. Fresh objects each call.
 */
export function buildCarcassModel(w_mm: number, h_mm: number, d_mm: number): StructuralModel {
  const W = Math.max(1, Math.round(w_mm)) * 10;
  const H = Math.max(1, Math.round(h_mm)) * 10;
  const D = Math.max(1, Math.round(d_mm)) * 10;
  const root: Section = {
    id: "sec_root",
    box: { x: 0, y: 0, z: 0, w: W, h: H, d: D },
    dividers: [],
    children: [],
    instanceIds: [],
    purpose: "storage",
  };
  const zone: Zone = { id: "z_body", name: "Корпус", rule: "manual", root };
  const block: Block = {
    id: "blk_main",
    name: "Блок",
    box: { x: 0, y: 0, z: 0, w: W, h: H, d: D },
    zones: [zone],
    components: [],
    instances: [],
    lines: [],
    rows: [],
  };
  return { id: "custom", name: `Блок ${Math.round(w_mm)}×${Math.round(h_mm)}×${Math.round(d_mm)}`, blocks: [block], parts: [] };
}

/**
 * An L-corner wardrobe (blocker #1). Two legs meet at a corner, each with its own depth
 * (CONSTRUCTION_FRAME_v3 §7 Piece 1: leg-A depth 600mm, leg-B depth 400mm). Fresh objects each call.
 */
export function buildLCornerModel(): StructuralModel {
  const H = 7200; // 720 mm height (shared by both legs)
  const legA = { length_mm10: 10000, depth_mm10: 6000 }; // 1000mm run × 600mm deep
  const legB = { length_mm10: 8000, depth_mm10: 4000 }; //  800mm run × 400mm deep

  // Content lives in a leg: leg-A holds one shelf (v3 §7 Piece 1 — the L-wardrobe's legs carry
  // shelves). The section is sized to leg-A, so the shelf solves + positions inside that leg.
  const root: Section = {
    id: "sec_l",
    box: { x: 0, y: 0, z: 0, w: legA.length_mm10, h: H, d: legA.depth_mm10 },
    dividers: [],
    children: [],
    instanceIds: ["inst_l_shelf"],
    purpose: "storage",
  };
  const zone: Zone = { id: "z_l", name: "Корпус", rule: "manual", root };
  // Phase 4.d-1 — leg-B is its own (empty) compartment so the usta can add shelves to the RETURN leg too.
  // Sized 1:1 to leg-B's carcass (bBox in lCornerLayout): z origin = legA.depth, width = legB.depth (X),
  // depth = legB.length (Z), shared height. Empty → emits no part (the demo's cut list is unchanged); it
  // simply appears as a second «bo'lim» you can add content to. Ids match operations.ts LEGB_*_ID.
  const legBRoot: Section = {
    id: "blk_l__sec_legB", // Audit S1 — per-block leg-B section id (block is blk_l)
    box: { x: 0, y: 0, z: legA.depth_mm10, w: legB.depth_mm10, h: H, d: legB.length_mm10 },
    dividers: [],
    children: [],
    instanceIds: [],
    purpose: null,
  };
  const legBZone: Zone = { id: "blk_l__z_legB", name: "Плечо B", rule: "manual", facing: "-x", root: legBRoot }; // Audit S1 — per-block leg-B zone id
  const shelf: Component = { id: "cmp_l_shelf", name: "Полка", partIds: [], role: "internal_shelf" };
  const shelfInst: Instance = {
    id: "inst_l_shelf",
    componentId: shelf.id,
    sectionId: "sec_l",
    anchor: { x: 0, y: 3600, z: 0 }, // mid-height
    link: "linked",
  };

  const block: Block = {
    id: "blk_l",
    name: "Г-образный шкаф",
    box: { x: 0, y: 0, z: 0, w: legA.length_mm10, h: H, d: legA.depth_mm10 + legB.length_mm10 },
    footprint: { legA, legB },
    zones: [zone, legBZone],
    components: [shelf],
    instances: [shelfInst],
    lines: [],
    rows: [],
  };

  return { id: "demo_l", name: "Г-демо", blocks: [block], parts: [] };
}

/**
 * A parametric TABLE (v5, free assembly) — a BARE block (no carcass) built from free boards: a top + four
 * corner legs. The master types the outer size; every board's box is computed. Millimetres in, mm10 out.
 * Fresh objects each call. This is the first "any furniture" template — a chair / shelf-unit follows the
 * same shape (a bare block + positioned free parts).
 */
export function buildTable(
  w_mm: number,
  h_mm: number,
  d_mm: number,
  opts: { topThickness_mm10?: number; legSize_mm10?: number; legInset_mm10?: number } = {},
): StructuralModel {
  const W = Math.max(1, Math.round(w_mm)) * 10;
  const H = Math.max(1, Math.round(h_mm)) * 10;
  const D = Math.max(1, Math.round(d_mm)) * 10;
  const topT = opts.topThickness_mm10 ?? 400; // 40mm top
  const legSz = opts.legSize_mm10 ?? 500; // 50mm square legs
  const inset = opts.legInset_mm10 ?? 0; // legs at the corners by default

  const box = { x: 0, y: 0, z: 0, w: W, h: H, d: D };
  // Edge anchors (the "table law"): the top SPANS the block; each leg is a fixed-size post pinned to a
  // corner, standing from the floor to under the top. So the table reflows on resize (resizeBlock*).
  const lo = (o: number) => ({ ref: "lo", offset_mm10: o } as const);
  const hi = (o: number) => ({ ref: "hi", offset_mm10: o } as const);
  const span: FreeAxisAnchor = { start: lo(0), end: hi(0) };
  const colLo: FreeAxisAnchor = { start: lo(inset), end: lo(inset + legSz) }; // left / front column
  const colHi: FreeAxisAnchor = { start: hi(inset + legSz), end: hi(inset) }; // right / back column
  const mkFree = (id: string, name: string, role: FreePart["role"], thicknessAxis: FreePart["thicknessAxis"], anchor: FreePartAnchor, edgeBands?: FreePart["edgeBands"]): FreePart =>
    ({ id, name, role, thicknessAxis, anchor, box: resolveFreePartBox(anchor, box), ...(edgeBands ? { edgeBands } : {}) });
  const BARE: FreePart["edgeBands"] = [0, 0, 0, 0]; // a solid post takes no edge banding

  const top = mkFree("top", "Столешница", "top", "y", { x: span, y: { start: hi(topT), end: hi(0) }, z: span });
  const legY: FreeAxisAnchor = { start: lo(0), end: hi(topT) }; // floor → under the top
  const legs: FreePart[] = [
    mkFree("leg_fl", "Ножка", "leg", "x", { x: colLo, y: legY, z: colLo }, BARE),
    mkFree("leg_fr", "Ножка", "leg", "x", { x: colHi, y: legY, z: colLo }, BARE),
    mkFree("leg_bl", "Ножка", "leg", "x", { x: colLo, y: legY, z: colHi }, BARE),
    mkFree("leg_br", "Ножка", "leg", "x", { x: colHi, y: legY, z: colHi }, BARE),
  ];
  const root: Section = { id: "sec_root", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null };
  const block: Block = {
    id: "tbl", name: "Стол", box, bare: true,
    zones: [{ id: "z_body", name: "Корпус", rule: "manual", root }],
    components: [], instances: [], lines: [], rows: [],
    freeParts: [top, ...legs],
  };
  return { id: "table", name: `Стол ${Math.round(w_mm)}×${Math.round(h_mm)}×${Math.round(d_mm)}`, blocks: [block], parts: [] };
}

// ---------------------------------------------------------------------------
// M1.1 — Free-assembly template library (v5). Every template below is a BARE block (no carcass shell)
// built from `freeParts` positioned by the SAME "table law" as buildTable: per-axis lo/hi edge anchors,
// so the whole piece reflows on a block resize (a top spans, legs hold the corners, a shelf keeps its
// height) — see resolveFreePartBox + resizeBlock* in operations.ts. Byte-additive: these are new entry
// points, so no existing model changes. Templates that need DRAWERS / DOORS require a carcass section →
// those wait for M2 (this phase is legs-and-surfaces furniture only).
// ---------------------------------------------------------------------------

/** An edge pinned `o` mm10 in from the block's LOW / HIGH face on one axis (the "table law"). */
const edgeLo = (o: number): FreeEdge => ({ ref: "lo", offset_mm10: o });
const edgeHi = (o: number): FreeEdge => ({ ref: "hi", offset_mm10: o });
/** Full-extent span on an axis (low face → high face) — grows with the block. */
const AXIS_SPAN: FreeAxisAnchor = { start: edgeLo(0), end: edgeHi(0) };
/** A fixed band of `size`, its near edge `at` in from the LOW face (stays put on a resize). */
const bandLo = (at: number, size: number): FreeAxisAnchor => ({ start: edgeLo(at), end: edgeLo(at + size) });
/** A fixed band of `size`, its near edge `at` in from the HIGH face (stays put on a resize). */
const bandHi = (at: number, size: number): FreeAxisAnchor => ({ start: edgeHi(at + size), end: edgeHi(at) });
/** A span inset `m` from BOTH faces — sits between the two corner legs / side panels. */
const spanInset = (m: number): FreeAxisAnchor => ({ start: edgeLo(m), end: edgeHi(m) });
const NO_BAND: FreePart["edgeBands"] = [0, 0, 0, 0]; // a solid post / leg / hidden slat takes no edge banding

/** A part factory bound to a block box (mirrors buildTable's local mkFree). */
function partMaker(box: Box3D) {
  return (
    id: string,
    name: string,
    role: FreePart["role"],
    thicknessAxis: FreePart["thicknessAxis"],
    anchor: FreePartAnchor,
    edgeBands?: FreePart["edgeBands"],
  ): FreePart => ({ id, name, role, thicknessAxis, anchor, box: resolveFreePartBox(anchor, box), ...(edgeBands ? { edgeBands } : {}) });
}

/** Assemble a BARE furniture block from free parts — the shared shell of every template. */
function freeAssembly(modelId: string, blockId: string, name: string, box: Box3D, freeParts: FreePart[]): StructuralModel {
  const root: Section = { id: "sec_root", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null };
  const block: Block = {
    id: blockId,
    name,
    box,
    bare: true,
    zones: [{ id: "z_body", name: "Корпус", rule: "manual", root }],
    components: [],
    instances: [],
    lines: [],
    rows: [],
    freeParts,
  };
  return { id: modelId, name: `${name} ${Math.round(box.w / 10)}×${Math.round(box.h / 10)}×${Math.round(box.d / 10)}`, blocks: [block], parts: [] };
}

/** A top surface + four corner legs — the shared skeleton of a table / stool / bench. */
function fourLegSurface(box: Box3D, o: { topT: number; legSz: number; inset: number; topName: string }): FreePart[] {
  const mk = partMaker(box);
  const colX_lo = bandLo(o.inset, o.legSz), colX_hi = bandHi(o.inset, o.legSz);
  const colZ_lo = bandLo(o.inset, o.legSz), colZ_hi = bandHi(o.inset, o.legSz);
  const legY: FreeAxisAnchor = { start: edgeLo(0), end: edgeHi(o.topT) }; // floor → under the top
  return [
    mk("top", o.topName, "top", "y", { x: AXIS_SPAN, y: bandHi(0, o.topT), z: AXIS_SPAN }),
    mk("leg_fl", "Ножка", "leg", "x", { x: colX_lo, y: legY, z: colZ_lo }, NO_BAND),
    mk("leg_fr", "Ножка", "leg", "x", { x: colX_hi, y: legY, z: colZ_lo }, NO_BAND),
    mk("leg_bl", "Ножка", "leg", "x", { x: colX_lo, y: legY, z: colZ_hi }, NO_BAND),
    mk("leg_br", "Ножка", "leg", "x", { x: colX_hi, y: legY, z: colZ_hi }, NO_BAND),
  ];
}

/** A STOOL — a small four-leg seat (no back). Defaults 400×450×400. */
export function buildStool(w_mm = 400, h_mm = 450, d_mm = 400, opts: { seatThickness_mm10?: number; legSize_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const parts = fourLegSurface(box, { topT: opts.seatThickness_mm10 ?? 300, legSz: opts.legSize_mm10 ?? 400, inset: 0, topName: "Сиденье" });
  return freeAssembly("stool", "stl", "Табурет", box, parts);
}

/** A BENCH — a long four-leg seat (no back), legs inset from the ends. Defaults 1200×450×350. */
export function buildBench(w_mm = 1200, h_mm = 450, d_mm = 350, opts: { seatThickness_mm10?: number; legSize_mm10?: number; legInset_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const parts = fourLegSurface(box, { topT: opts.seatThickness_mm10 ?? 400, legSz: opts.legSize_mm10 ?? 500, inset: opts.legInset_mm10 ?? 300, topName: "Сиденье" });
  return freeAssembly("bench", "bnc", "Скамья", box, parts);
}

/**
 * A CHAIR — four legs + a seat at ergonomic height + a full-width backrest above it. The seat + legs are
 * pinned to a FIXED seat height (450 mm), so a height resize grows the backrest, not the legs. Backrest is
 * a `back` panel on the high-Z face (thin in Z). Defaults 450×850×450.
 */
export function buildChair(w_mm = 450, h_mm = 850, d_mm = 450, opts: { seatHeight_mm10?: number; seatThickness_mm10?: number; legSize_mm10?: number; backThickness_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const seatH = opts.seatHeight_mm10 ?? 4500, seatT = opts.seatThickness_mm10 ?? 300, legSz = opts.legSize_mm10 ?? 400, backT = opts.backThickness_mm10 ?? 250;
  const mk = partMaker(box);
  const colX_lo = bandLo(0, legSz), colX_hi = bandHi(0, legSz);
  const colZ_lo = bandLo(0, legSz), colZ_hi = bandHi(0, legSz);
  const legY: FreeAxisAnchor = bandLo(0, seatH - seatT); // floor → seat underside (fixed height)
  const parts: FreePart[] = [
    mk("seat", "Сиденье", "top", "y", { x: AXIS_SPAN, y: bandLo(seatH - seatT, seatT), z: AXIS_SPAN }),
    mk("back", "Спинка", "back", "z", { x: AXIS_SPAN, y: { start: edgeLo(seatH), end: edgeHi(0) }, z: bandHi(0, backT) }),
    mk("leg_fl", "Ножка", "leg", "x", { x: colX_lo, y: legY, z: colZ_lo }, NO_BAND),
    mk("leg_fr", "Ножка", "leg", "x", { x: colX_hi, y: legY, z: colZ_lo }, NO_BAND),
    mk("leg_bl", "Ножка", "leg", "x", { x: colX_lo, y: legY, z: colZ_hi }, NO_BAND),
    mk("leg_br", "Ножка", "leg", "x", { x: colX_hi, y: legY, z: colZ_hi }, NO_BAND),
  ];
  return freeAssembly("chair", "chr", "Стул", box, parts);
}

/** A COFFEE TABLE — a low table + a lower shelf inset between the legs. Defaults 1000×450×550. */
export function buildCoffeeTable(w_mm = 1000, h_mm = 450, d_mm = 550, opts: { topThickness_mm10?: number; legSize_mm10?: number; legInset_mm10?: number; shelfHeight_mm10?: number; shelfThickness_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const topT = opts.topThickness_mm10 ?? 400, legSz = opts.legSize_mm10 ?? 500, inset = opts.legInset_mm10 ?? 200, shelfH = opts.shelfHeight_mm10 ?? 800, shelfT = opts.shelfThickness_mm10 ?? 300;
  const mk = partMaker(box);
  const surf = fourLegSurface(box, { topT, legSz, inset, topName: "Столешница" });
  const between = spanInset(inset + legSz); // between the legs on both floor axes
  const shelf = mk("shelf", "Полка", "shelf", "y", { x: between, y: bandLo(shelfH, shelfT), z: between });
  return freeAssembly("coffee", "cof", "Журнальный стол", box, [...surf, shelf]);
}

/** A CONSOLE / TV STAND — top + bottom + two side panels + a mid shelf (open front). Defaults 1200×750×350. */
export function buildConsole(w_mm = 1200, h_mm = 750, d_mm = 350, opts: { panelThickness_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const t = opts.panelThickness_mm10 ?? 160;
  const mk = partMaker(box);
  const yInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) }; // sides run between bottom and top
  const xInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) }; // shelves run between the two sides
  const parts: FreePart[] = [
    mk("top", "Верх", "top", "y", { x: AXIS_SPAN, y: bandHi(0, t), z: AXIS_SPAN }),
    mk("bottom", "Дно", "shelf", "y", { x: AXIS_SPAN, y: bandLo(0, t), z: AXIS_SPAN }),
    mk("side_l", "Боковина", "panel", "x", { x: bandLo(0, t), y: yInner, z: AXIS_SPAN }),
    mk("side_r", "Боковина", "panel", "x", { x: bandHi(0, t), y: yInner, z: AXIS_SPAN }),
    mk("shelf_mid", "Полка", "shelf", "y", { x: xInner, y: bandLo(Math.round(box.h / 2), t), z: AXIS_SPAN }),
  ];
  return freeAssembly("console", "cns", "ТВ-тумба", box, parts);
}

/** A BOOKSHELF / RACK — top + bottom + two sides + N interior shelves (fully free-part, open front). Defaults 800×1800×300. */
export function buildBookshelf(w_mm = 800, h_mm = 1800, d_mm = 300, opts: { panelThickness_mm10?: number; shelves?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const t = opts.panelThickness_mm10 ?? 180, shelves = Math.max(0, opts.shelves ?? 4);
  const mk = partMaker(box);
  const yInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) };
  const xInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) };
  const parts: FreePart[] = [
    mk("top", "Верх", "top", "y", { x: AXIS_SPAN, y: bandHi(0, t), z: AXIS_SPAN }),
    mk("bottom", "Дно", "shelf", "y", { x: AXIS_SPAN, y: bandLo(0, t), z: AXIS_SPAN }),
    mk("side_l", "Боковина", "panel", "x", { x: bandLo(0, t), y: yInner, z: AXIS_SPAN }),
    mk("side_r", "Боковина", "panel", "x", { x: bandHi(0, t), y: yInner, z: AXIS_SPAN }),
  ];
  // Interior shelves at fixed even heights. They hold their floor height on a resize (the anchor kit pins
  // lo/hi, not fractions) — the usta nudges them after; a bookshelf's shelves are meant to be adjustable.
  const gap = Math.round(box.h / (shelves + 1));
  for (let i = 1; i <= shelves; i++) parts.push(mk(`shelf_${i}`, "Полка", "shelf", "y", { x: xInner, y: bandLo(gap * i, t), z: AXIS_SPAN }));
  return freeAssembly("bookshelf", "bsh", "Стеллаж", box, parts);
}

/** An open PEDESTAL / nightstand — top + bottom + two sides + a back + one mid shelf (open front). Defaults 450×550×450. Drawers → M2. */
export function buildPedestal(w_mm = 450, h_mm = 550, d_mm = 450, opts: { panelThickness_mm10?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const t = opts.panelThickness_mm10 ?? 160;
  const mk = partMaker(box);
  const yInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) };
  const xInner: FreeAxisAnchor = { start: edgeLo(t), end: edgeHi(t) };
  const parts: FreePart[] = [
    mk("top", "Верх", "top", "y", { x: AXIS_SPAN, y: bandHi(0, t), z: AXIS_SPAN }),
    mk("bottom", "Дно", "shelf", "y", { x: AXIS_SPAN, y: bandLo(0, t), z: AXIS_SPAN }),
    mk("side_l", "Боковина", "panel", "x", { x: bandLo(0, t), y: yInner, z: AXIS_SPAN }),
    mk("side_r", "Боковина", "panel", "x", { x: bandHi(0, t), y: yInner, z: AXIS_SPAN }),
    mk("back", "Задняя стенка", "back", "z", { x: xInner, y: yInner, z: bandHi(0, t) }),
    mk("shelf_mid", "Полка", "shelf", "y", { x: xInner, y: bandLo(Math.round(box.h / 2), t), z: { start: edgeLo(t), end: edgeHi(0) } }),
  ];
  return freeAssembly("pedestal", "ped", "Тумба", box, parts);
}

/**
 * A BED FRAME — four corner posts + a perimeter of side/end rails + N cross slats near the top. A platform
 * frame (no headboard, no mattress); the slats carry the mattress. Defaults 1600×300×2000 (a double).
 */
export function buildBedFrame(w_mm = 1600, h_mm = 300, d_mm = 2000, opts: { postSize_mm10?: number; railThickness_mm10?: number; slatThickness_mm10?: number; slats?: number } = {}): StructuralModel {
  const box: Box3D = { x: 0, y: 0, z: 0, w: Math.max(1, Math.round(w_mm)) * 10, h: Math.max(1, Math.round(h_mm)) * 10, d: Math.max(1, Math.round(d_mm)) * 10 };
  const postSz = opts.postSize_mm10 ?? 700, railT = opts.railThickness_mm10 ?? 300, slatT = opts.slatThickness_mm10 ?? 200, slats = Math.max(0, opts.slats ?? 8);
  const mk = partMaker(box);
  const railY: FreeAxisAnchor = { start: edgeLo(Math.round(box.h * 0.35)), end: edgeHi(0) }; // upper part of the frame
  const cX_lo = bandLo(0, postSz), cX_hi = bandHi(0, postSz);
  const cZ_lo = bandLo(0, postSz), cZ_hi = bandHi(0, postSz);
  const betweenZ = spanInset(postSz), betweenX = spanInset(postSz);
  const parts: FreePart[] = [
    // 4 corner posts (floor → top)
    mk("post_fl", "Стойка", "leg", "x", { x: cX_lo, y: AXIS_SPAN, z: cZ_lo }, NO_BAND),
    mk("post_fr", "Стойка", "leg", "x", { x: cX_hi, y: AXIS_SPAN, z: cZ_lo }, NO_BAND),
    mk("post_bl", "Стойка", "leg", "x", { x: cX_lo, y: AXIS_SPAN, z: cZ_hi }, NO_BAND),
    mk("post_br", "Стойка", "leg", "x", { x: cX_hi, y: AXIS_SPAN, z: cZ_hi }, NO_BAND),
    // side rails (run along the length Z, thin in X) + end rails (run along the width X, thin in Z)
    mk("rail_l", "Царга", "rail", "x", { x: bandLo(0, railT), y: railY, z: betweenZ }),
    mk("rail_r", "Царга", "rail", "x", { x: bandHi(0, railT), y: railY, z: betweenZ }),
    mk("rail_f", "Царга", "rail", "z", { x: betweenX, y: railY, z: bandLo(0, railT) }),
    mk("rail_b", "Царга", "rail", "z", { x: betweenX, y: railY, z: bandHi(0, railT) }),
  ];
  // Cross slats across the width near the top, evenly spaced along the length (hidden under the mattress).
  const slatW = 400;
  for (let i = 0; i < slats; i++) {
    const zPos = Math.max(0, Math.round((box.d * (i + 1)) / (slats + 1)) - Math.round(slatW / 2));
    parts.push(mk(`slat_${i}`, "Ламель", "stretcher", "y", { x: betweenX, y: bandHi(0, slatT), z: bandLo(zPos, slatW) }, NO_BAND));
  }
  return freeAssembly("bed", "bed", "Кровать", box, parts);
}
