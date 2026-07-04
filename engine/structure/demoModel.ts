// engine/structure/demoModel.ts — a realistic starter cabinet (S3-E1).
//
// One block (600 × 720 × 560 mm) split into two columns by a vertical line; the left
// column holds two shelves, the right column one — a real Block→Zone→Section→Instance
// tree the UI can initialise `model` with, so `solveStructure` + `solvePreview` render an
// actual cabinet (not a hand-made demo). Pure: returns a fresh model each call.

import type {
  Block,
  Component,
  Instance,
  Line,
  Section,
  StructuralModel,
  Zone,
} from "../contracts/structure.js";

const W = 6000; // 600 mm
const H = 7200; // 720 mm
const D = 5600; // 560 mm
const SPLIT = 3000; // vertical divider at 300 mm

/** A two-column cabinet with three shelves. Fresh objects every call (no shared mutation). */
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
