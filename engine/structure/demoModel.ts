// engine/structure/demoModel.ts — a realistic starter cabinet (S3-E1).
//
// One block (600 × 720 × 560 mm) split into two columns by a vertical line; the left
// column holds two shelves, the right column one — a real Block→Zone→Section→Instance
// tree the UI can initialise `model` with, so `solveStructure` + `solvePreview` render an
// actual cabinet (not a hand-made demo). Pure: returns a fresh model each call.

import type {
  Block,
  Component,
  FreeAxisAnchor,
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
    zones: [zone],
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
