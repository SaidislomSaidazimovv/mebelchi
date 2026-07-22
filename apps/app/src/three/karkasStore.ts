// three/karkasStore.ts — the StructuralModel editing state (Phase 3 + 4). A small, SEPARATE
// zustand store from the kitchen `store.ts`, so the karkas-block editor is fully parallel and the
// kitchen Cell flow is never touched. Holds one StructuralModel + its derived render/manufacturing
// data, the focused-editor open flag, the selection, and an undo stack. Editing actions (Phase 4)
// call the engine's PURE immutable operations (divideSection / addInstance) and re-derive.

import { create } from "zustand";
import type { StructuralModel, Component, Block, Instance, FreePart, Box3D, HandleType, LiftType, ApplianceKind, PanelShell } from "../../../../engine/contracts/structure.js";

/** The shapes furniture is actually made of — what the ＋ panel offers. */
export type PrimitiveKind = "board" | "panel" | "post" | "box";
import type { Part } from "../../../../engine/contracts/types.js";
import { leafSections, type Section } from "../../../../engine/contracts/structure.js";
import { solveStructure, DRAWER_HEIGHT_MM10 } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildDemoModel, buildCarcassModel } from "../../../../engine/structure/demoModel.js";
import { divideSection, addInstance, removeInstance, setLoadBearing, setComponentThickness, setComponentMaterial, setComponentAngle, setComponentLip, setComponentHandle, setComponentLift, setComponentOrganizer, setComponentAppliance, setBlockFootprint, shelfMaxAngleDeg, setHingeEdge, forkComponentForInstance, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth, moveLine as moveLineOp, setZoneRule as setZoneRuleOp, setSectionPurpose as setSectionPurposeOp, checkBoilerClearance, addFreePart as addFreePartOp, removeFreePart as removeFreePartOp, groupBlocks, ungroupBlocks, resolveRun, snapRunToWall, fitCorner, nestDrawer, duplicateBlock, duplicateFreePart, applyToFamily, familyStatus, moveInstanceAnchor, parentSectionOf, moveInstanceToSection, type AddKind, type AddOpts } from "../../../../engine/structure/operations.js";
import type { SectionPurpose } from "../../../../engine/contracts/structure.js";
import type { DivisionRule } from "../../../../engine/contracts/variables.js";
import type { PanelFeatures, PanelCutout } from "../../../../engine/contracts/structure.js";
import { planDecors, foreignDecors, bindBlockMaterials } from "./slotBinding";
import { defaultJointProfile, solveModelToParts } from "../../../../engine/cnc.js";
import { checkJointConstraints, type JointFinding } from "../../../../engine/structure/jointConstraints.js";
import { holeKey } from "../../../../engine/structure/holeOverride.js";
import type { JointProfile } from "../../../../engine/contracts/variables.js";
import { checkStability } from "../../../../engine/structure/stability.js";
import { checkMotionClearance } from "../../../../engine/structure/motion.js";
import { checkHingeFit } from "../../../../engine/structure/hingeFit.js";
import { checkConstraints } from "../../../../engine/structure/constraints.js";
import { layoutBounds, layoutToScene, rotateBlockPlacements, sceneWithRoom, type Scene } from "./structureScene";
import { roomFromPreset } from "../../../../engine/structure/room.js";
import { withApplianceCutouts } from "./appliances";
import { snapCandidates, snapSpan, type SnapCandidate } from "../../../../engine/structure/snap.js";
import { DEFAULT_PLAN, planThickness, boardThicknessMm10, withPlanDefaults, type MaterialPlan } from "./materials";
import { loadWorkshopProfile, saveWorkshopProfile, type WorkshopProfile } from "./workshopProfile";
import type { ThicknessSpec } from "../../../../engine/structure/solve.js";

/** Everything the 3D viewport + readouts need, recomputed whenever the model changes. */
interface Derived {
  model: StructuralModel;
  parts: Part[]; // manufacturing leaves (for the future price / cut list / CNC)
  scene: Scene; // positioned render boxes (metres)
  warnings: string[]; // non-blocking engineering ⚠ (stability + motion + hinge fit), Russian text
  sections: { id: string; label: string }[]; // leaf sections you can add into (the add-target picker)
}
function derive(model: StructuralModel, plan: MaterialPlan, thickness: Partial<ThicknessSpec> = {}): Derived {
  const warnings = [
    ...checkStability(model),
    ...checkMotionClearance(model),
    ...checkHingeFit(model),
    ...checkConstraints(model),
  ].map((f) => f.message_ru);
  const sections: { id: string; label: string }[] = [];
  for (const b of model.blocks) for (const z of b.zones) for (const s of leafSections(z.root)) sections.push({ id: s.id, label: `${sections.length + 1}` });
  // 7b — each role's board thickness comes from its plan decor (ЛДСП 16 / МДФ 18 / ХДФ 3). Phase 6 — a
  // workshop-profile per-role thickness override wins over the decor default (absent → decor, byte-identical).
  const tk = { ...planThickness(plan), ...thickness }; // one per-role thickness spec for BOTH cut list + render (parity)
  // The 3D scene shows cabinets as PLACED (a turned block is rotated here); the cut list + drawing keep
  // reading solveLayout unrotated, because a cabinet is manufactured square-on however it is turned.
  // Recentre on the UNROTATED bounds: turning a cabinet is placement-only, so it must not move anything
  // else. Centring on the rotated AABB slid the entire model sideways as the cabinet turned.
  const flat = solveLayout(model, tk);
  // Phase 3.c — a hob/sink derives a worktop cutout; feed the augmented features to the render (both the
  // scene and the CNC read model.features, so this one overlay punches the hole). Same ref when none apply.
  const feats = withApplianceCutouts(model).features;
  // Phase 5 — the scene shows the cabinets PLUS the room's wall backdrop (no room → byte-identical, walls absent).
  const scene = sceneWithRoom(rotateBlockPlacements(flat, model.blocks), flat, model.room, feats);
  return { model, parts: solveStructure(model, tk), scene, warnings, sections };
}

/** First leaf section of the model (the default edit target when nothing is selected). */
function firstLeafId(model: StructuralModel): string | undefined {
  for (const b of model.blocks) {
    for (const z of b.zones) {
      const first = leafSections(z.root)[0];
      if (first) return first.id;
    }
  }
  return undefined;
}

/** Locate a section by id anywhere in the model's zone trees. */
function findSection(model: StructuralModel, id: string): Section | null {
  const walk = (s: Section): Section | null => {
    if (s.id === id) return s;
    for (const c of s.children) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  };
  for (const b of model.blocks) {
    for (const z of b.zones) {
      const r = walk(z.root);
      if (r) return r;
    }
  }
  return null;
}

/** A divided section's zones, as the ratio pill-row editor (Step 4) needs them: display order, each
 *  zone's current size along the divider axis, and its rule. `sectionId` + index feed setZoneRule. */
export type ZoneRow = {
  sectionId: string;
  axis: "x" | "y" | "z";
  zones: { id: string; size_mm10: number; rule: DivisionRule }[];
};

/** Immutably patch one part's PanelFeatures overlay (Step 4b); an emptied entry is dropped so the map
 *  stays clean and a fully-square/cut-free model serialises exactly as before. */
function patchFeatures(model: StructuralModel, pid: string, patch: Partial<PanelFeatures>): StructuralModel {
  const next: PanelFeatures = { ...(model.features?.[pid] ?? {}), ...patch };
  const empty = (!next.corners || next.corners.every((r) => r <= 0)) && (!next.cutouts || next.cutouts.length === 0) && (!next.kromka || next.kromka.every((k) => !k));
  const features: Record<string, PanelFeatures> = { ...(model.features ?? {}) };
  if (empty) delete features[pid]; else features[pid] = next;
  return { ...model, features: Object.keys(features).length ? features : undefined };
}

/** The nearest divided section matching `pred`, searched over every block's zone-tree. */
function findDivParent(model: StructuralModel, pred: (s: Section) => boolean): Section | null {
  const walk = (s: Section): Section | null => {
    if (s.children.length > 0 && pred(s)) return s;
    for (const c of s.children) { const r = walk(c); if (r) return r; }
    return null;
  };
  for (const b of model.blocks) for (const z of b.zones) { const r = walk(z.root); if (r) return r; }
  return null;
}

/** The first leaf descending from `s` (or `s` itself if it is a leaf). */
function firstLeafUnder(s: Section): Section {
  const child = s.children[0];
  return child ? firstLeafUnder(child) : s;
}

/**
 * Resolve a solved part id back to the instance that produced it. Instance parts are emitted as
 * `${block.id}__inst_${inst.id}` (with `__a`/`__b`, `__stile_l`, … suffixes for doubled / glazed-grid
 * builds), so we match that prefix. Carcass panels have no instance and return null. This replaces
 * selectByTap here, which matches against `component.partIds` — empty in the karkas models, so it
 * never resolved (Phase 4's section targeting silently fell back to the first leaf).
 */
function resolveInstance(model: StructuralModel, partId: string): { block: Block; inst: Instance } | null {
  for (const b of model.blocks) {
    for (const inst of b.instances) {
      const base = `${b.id}__inst_${inst.id}`;
      if (partId === base || partId.startsWith(`${base}__`)) return { block: b, inst };
    }
  }
  return null;
}

/** 2.2b — find a section (leaf OR parent) by id anywhere in a block's zone trees. */
function sectionInBlock(block: Block, id: string): Section | null {
  for (const z of block.zones) {
    const stack: Section[] = [z.root];
    while (stack.length) {
      const s = stack.pop()!;
      if (s.id === id) return s;
      for (const c of s.children) stack.push(c);
    }
  }
  return null;
}

// The DEEPEST drawer instance a part id names, following the `__in_<id>` nesting chain into `interior`s —
// so selecting a NESTED drawer resolves to THAT drawer, not its top-level ancestor (which the plain
// resolveInstance returns). Also hands back the component scope (for the drawer flag) + the id path
// (top→deep) needed to update the right instance immutably. Used only by the per-drawer height edit.
function resolveDrawerInstance(
  model: StructuralModel,
  partId: string,
): { block: Block; inst: Instance; components: readonly Component[]; path: string[]; base: string } | null {
  for (const b of model.blocks) {
    for (const top of b.instances) {
      const base = `${b.id}__inst_${top.id}`;
      if (partId !== base && !partId.startsWith(`${base}__`)) continue;
      let inst = top, components: readonly Component[] = b.components, curBase = base;
      const path = [top.id];
      for (;;) {
        const rest = partId.slice(curBase.length);
        if (!rest.startsWith("__in_") || !inst.interior) break;
        const after = rest.slice("__in_".length);
        const child = inst.interior.instances.find((ci) => after === ci.id || after.startsWith(`${ci.id}__`));
        if (!child) break;
        components = inst.interior.components;
        inst = child;
        curBase = `${curBase}__in_${child.id}`;
        path.push(child.id);
      }
      return { block: b, inst, components, path, base: curBase };
    }
  }
  return null;
}

// Immutably set fields on the instance addressed by `path` (top→deep) inside a block's instance tree,
// walking `interior.instances` at each step. Returns a fresh array; untouched instances keep identity.
function patchInstanceAtPath(instances: readonly Instance[], path: string[], patch: Partial<Instance>): Instance[] {
  const [head, ...rest] = path;
  return instances.map((i) => {
    if (i.id !== head) return i;
    if (rest.length === 0) return { ...i, ...patch };
    if (!i.interior) return i;
    return { ...i, interior: { ...i.interior, instances: patchInstanceAtPath(i.interior.instances, rest, patch) } };
  });
}

/** Return a copy of the model with the given instances re-pointed to `sectionId`. */
function rehomeInstances(model: StructuralModel, ids: Set<string>, sectionId: string): StructuralModel {
  return {
    ...model,
    blocks: model.blocks.map((b) => ({
      ...b,
      instances: b.instances.map((i) => (ids.has(i.id) ? { ...i, sectionId } : i)),
    })),
  };
}

interface KarkasState extends Derived {
  open: boolean;
  selectedId: string | null;
  /** The leaf section new content is added into (placement, issue #1). Set by tapping a part or the
   *  «Qayerga» picker; falls back to the first leaf. */
  targetId: string | null;
  setTarget: (id: string) => void;
  /** U4.1 — add a second cabinet (block) beside the current one; the foundation for grouping (E1). */
  addBlock: () => void;
  /** gizmos — translate a whole cabinet by `delta` (mm10). `pushHistory` only on the first drag frame. */
  moveBlock: (blockId: string, delta: { x: number; y: number; z: number }, pushHistory: boolean) => void;
  /** gizmos — put a cabinet's `axis` coord at `idealPos` (mm10), MAGNETICALLY clicking flush to another
   *  cabinet's face (or the floor on Y) first — how a kitchen run gets laid out by hand. */
  moveBlockTo: (blockId: string, axis: "x" | "y" | "z", idealPos: number, first: boolean) => { pos: number; snapped: boolean };
  /** gizmos «duplicate» — copy the selection: a free board (copy gets selected) or its whole cabinet. */
  duplicateSelected: () => void;
  /** gizmos «rotate» — turn a free board about the vertical axis (deg, render-only). `first` = new undo step. */
  rotateFreePartTo: (fpId: string, deg: number, first: boolean) => void;
  /** gizmos «rotate» — turn a whole cabinet about the vertical axis (deg, placement-only, not machined). */
  rotateBlockTo: (blockId: string, deg: number, first: boolean) => void;
  /** Phase 1.1b — set a cabinet's sokol/plinth height (mm10); `≤ 0` removes it. */
  setPlinth: (blockId: string, mm10: number) => void;
  /** Phase 1.2c — toggle a cabinet's worktop/stoleshnitsa on or off. */
  setWorktop: (blockId: string, on: boolean) => void;
  /** M2.3 — toggle carcass shell panels (open shelving / back-less). A panel set back to present drops
   *  out of the mask, and an all-present shell is deleted → byte-identical to a never-masked carcass. */
  setBlockShell: (blockId: string, patch: Partial<PanelShell>) => void;
  /** U4.2 — the set of whole blocks ticked in the block-navigator for grouping. */
  selectedBlockIds: string[];
  /** U4.2 — toggle a block in the group-selection (clears any part selection). */
  toggleBlockSel: (blockId: string) => void;
  /** U4.2 — group the ≥2 ticked blocks into a Run (E1 `groupBlocks`); no-op for <2. */
  groupSelectedBlocks: () => void;
  /** U4.2 — group ALL currently-ungrouped blocks into one Run (the «Barchasini» one-tap); no-op for <2. */
  groupAllBlocks: () => void;
  /** U4.3 — remove the ticked blocks from their Run(s); a Run left with <2 members dissolves entirely. */
  ungroupSelectedBlocks: () => void;
  /** U4.4 — fit a Run to a wall length (mm): members reflow by their Fixed/Ratio/Flex rules. */
  setRunLength: (runId: string, mm: number) => void;
  /** U4.5 — set one member's rule (Fixed mm / Ratio weight / Flex); the run re-solves at its length. */
  setRunMemberRule: (runId: string, blockId: string, rule: DivisionRule) => void;
  /** 5.r2 — snap a run to a room wall (or free it with null): tiles + orients its blocks along that wall. */
  snapRunToWall: (runId: string, wallId: string | null) => void;
  /** 5.r3 — add an L-corner block auto-fitted to the L room's corner (depth matched to the runs). */
  fitCorner: () => void;
  /** U3.2 — free assembly (Moblo free-primitive): drop a free board, drag it anywhere, or remove it. */
  /** Add a free primitive at the floor, centred: a flat board, a side panel, a leg, or a plain solid. */
  addFreeBoard: (kind?: PrimitiveKind) => void;
  moveFreePart: (fpId: string, delta: { x: number; y: number; z: number }, first: boolean) => void;
  /** gizmos — put a free board's `axis` coord at `idealPos` (mm10), MAGNETICALLY clicking to a nearby
   *  compartment face first. Absolute (no drift over a long drag); reports where it landed + whether it snapped. */
  moveFreePartTo: (fpId: string, axis: "x" | "y" | "z", idealPos: number, first: boolean) => { pos: number; snapped: boolean };
  snapFreePart: (fpId: string) => void;
  /** Resize a free board along one axis (mm). `pushHistory: false` for live drag frames — they replace
   *  the current state instead of stacking one undo entry per pointer move (gizmo resize). */
  resizeFreeBoard: (fpId: string, dim: "w" | "h" | "d", mm: number, pushHistory?: boolean) => void;
  /** Gizmo resize with a magnet (M1.3b): the growing face snaps to a nearby part face; also detaches the
   *  board from the template reflow. Returns the applied size (mm) + whether it snapped. */
  resizeFreeBoardTo: (fpId: string, dim: "w" | "h" | "d", mm: number, first: boolean) => { size: number; snapped: boolean };
  /** Rename a free board (M1.3a) — its `name` flows to the cut list + SWJ008. Blank → a default. */
  renameFreePart: (fpId: string, name: string) => void;
  rotateFreeBoard: (fpId: string) => void;
  setFreeBoardMaterial: (fpId: string, matId: string) => void;
  removeFreeBoard: (fpId: string) => void;
  past: StructuralModel[];
  /** Step 12 (#15) — the redo forward stack; a fresh edit clears it. */
  future: StructuralModel[];
  /** Which decor each panel role is cut from (drives the spec price). Persists across model edits. */
  plan: MaterialPlan;
  /** Phase 6 — per-role board-thickness overrides (mm10) from the workshop profile; win over the decor default. */
  thickness: Partial<ThicknessSpec>;
  /** Phase 6 — set one role's board-thickness override (mm; 0/absent → back to the decor default). */
  setRoleThickness: (role: keyof ThicknessSpec, mm: number) => void;
  /** Phase 6 — save the CURRENT plan + joints + thickness as the global factory default (localStorage). */
  saveWorkshopDefault: () => void;
  /** Phase 6 — reset this project's plan + joints + thickness to the saved factory default. */
  applyWorkshopDefault: () => void;
  /** Phase 6 — a read-only snapshot of the saved workshop profile, for the «Fabrika profili» summary. */
  workshopSummary: () => WorkshopProfile;
  setPlanMaterial: (slot: keyof MaterialPlan, id: string) => void;
  /** Step 5.2 — the project's material pool (distinct board decors it uses = its material variables). */
  materialPool: string[];
  /** Set when a just-opened block introduced decors not in the pool (§3.2); drives the map-or-create modal. */
  pendingBinding: { foreign: string[] } | null;
  /** Resolve the pending binding: map (foreign decor → pool decor id) or keep (null = create a new var). */
  resolveBinding: (mapping: Record<string, string | null>) => void;
  /** Dismiss the binding prompt keeping every foreign decor as a new variable (fold them into the pool). */
  cancelBinding: () => void;
  /** Open a fresh block; an optional plan (e.g. from a converted Cell module) sets the materials too. */
  openWith: (model: StructuralModel, plan?: MaterialPlan, meta?: { fromCabinet?: boolean }) => void;
  setModel: (model: StructuralModel) => void;
  close: () => void;
  tapPart: (id: string | null) => void;
  /** Split the target section into two (a vertical divider). */
  divide: () => void;
  /** Divide the target section into `count` equal parts (C3). axis "x" = columns, "y" = rows. */
  divideBy: (axis: "x" | "y", count: number) => void;
  /** Add `n` evenly-spaced shelves to the target section at once (C3, imos AS_O_Number). */
  addShelves: (n: number) => void;
  /** Add content to the target section; opts carry the 32mm doubled build / glazed-grid door (P6). */
  add: (kind: AddKind, opts?: AddOpts) => void;
  /** Delete the selected instance (shelf / door / drawer). No-op if a carcass panel is selected. */
  remove: () => void;
  /** E2 — nest a drawer inside the selected drawer (drawer-in-drawer). No-op if the selection isn't a drawer. */
  nestDrawerInSelected: () => void;
  /** Set the selected drawer's box/front height (mm, ≥50). No-op if the selection isn't a drawer. */
  setDrawerHeight: (mm: number) => void;
  /** The selected drawer's box/front height in mm (its override, or the 200mm default). null if not a drawer. */
  selectedDrawerHeight: () => number | null;
  /** The Component behind the current selection (its doubled/glazed/loadBearing flags), or null. */
  selectedComponent: () => Component | null;
  /**
   * The selection's group of identical parts: how many there are, and whether they still all share one
   * component. `united: false` means this one (or a sibling) was edited individually — which happens on
   * EVERY per-part edit, since those fork first. null when nothing is selected. Drives the group badge.
   */
  selectedGroup: () => { size: number; united: boolean } | null;
  /** «Apply to all identical» — push the selected part's component onto its whole family. */
  applyToAllIdentical: () => void;
  /** gizmos — slide a placed instance (a shelf) inside its section along `axis` to `pos` (mm10, block-local).
   *  `pushHistory` only on the first drag frame, so a drag is ONE undo step. Returns the clamped position. */
  moveInstanceTo: (instanceId: string, axis: "x" | "y" | "z", pos: number, pushHistory: boolean) => number;
  /** The solved parts belonging to the selected instance (for the info card's material colour bar). */
  selectedParts: () => Part[];
  /** Toggle the selected component's load-bearing declaration (drives the stability ⚠). */
  toggleLoadBearing: () => void;
  /** Set the selected component's per-part board thickness in mm (C4). */
  setThickness: (mm: number) => void;
  /** Set the selected shelf's incline angle in degrees (imos AS_O_Angle · qiya polka). 0 = flat.
   *  Auto-clamped to what fits the bay so the tilted shelf never pokes through the carcass. */
  setAngle: (deg: number) => void;
  /** Max incline (deg) the selected shelf can take and still stay inside its bay, or null if the
   *  selection isn't an internal shelf. Drives the "(max N°)" hint next to the angle field. */
  selectedShelfMaxAngle: () => number | null;
  /** Set the selected shelf's front lip height in mm (imos display shelf · 0 = flat, no border). */
  setLip: (mm: number) => void;
  /** Set (or clear with null) the selected component's per-part material decor key (F2). */
  setMaterial: (id: string | null) => void;
  /** Set the hinge side of the selected door (facade instance). No-op if the selection isn't a door. */
  setHinge: (edge: "left" | "right") => void;
  /** Set (or clear with null) the selected door/drawer-front handle type (1.3c). Forks per-instance. */
  setHandle: (handle: HandleType | null) => void;
  /** Set (or clear with null) the selected door's lift hinge (2.1c). Forks per-instance. Facade only. */
  setLift: (lift: LiftType | null) => void;
  /** Set the selected drawer's organizer divider count (2.3c). 0 clears it. Forks per-instance. Drawer only. */
  setDividers: (n: number) => void;
  /** Set (or clear with null) the selected appliance's kind (3.d). Forks per-instance. Appliance only. */
  setAppliance: (kind: ApplianceKind | null) => void;
  /** 4.a — toggle the selected block between a rectangle and an L-corner (legA = current box, +400mm legB). */
  toggleLCorner: () => void;
  /** 4.a — edit the L-corner return leg (legB) length + depth (mm). No-op if the block isn't an L. */
  setLegB: (length_mm: number, depth_mm: number) => void;
  /** 4 polish — set which way the L turns (left/right). No-op if the block isn't an L. */
  setLCornerHand: (hand: "left" | "right") => void;
  /** 5.r1 — set the room walls: preset I/L/U + per-wall lengths (mm) + turn. Render-only backdrop. */
  setRoom: (preset: "I" | "L" | "U", lengths_mm: number[], turn?: "left" | "right") => void;
  /** 5.r1 — drop the room (walls disappear; the model is byte-identical to no-room). */
  clearRoom: () => void;
  /** 2.2b — combine the selected door with its siblings: move it onto its parent section (spans them all). */
  combineSelectedDoor: () => void;
  /** 2.2b — split a combined door back to one compartment: move it to its section's first leaf child. */
  splitSelectedDoor: () => void;
  /** 2.2b — whether the selected door can combine (leaf, parent has >1 child) or split (on a non-leaf). */
  selectedDoorCombine: () => { canCombine: boolean; canSplit: boolean } | null;
  /** Set the block's width / height / depth in mm (C2). Content reflows proportionally. */
  resize: (dim: "w" | "h" | "d", mm: number) => void;
  /** Move a divider line by `delta` mm10 (Step 3.3b drag). `pushHistory` true on the FIRST frame of a
   *  drag (so the whole drag is one undo step), false on the live frames after. */
  moveLine: (lineId: string, delta: number, scope: "local" | "line" | "row" | "global", pushHistory: boolean) => void;
  /** Resize the block to an ABSOLUTE extent (mm10) along a dim by dragging a side handle (Step 3.3c).
   *  Rule-aware (Step 2). `pushHistory` true on the FIRST drag frame; clamped to a minimum; safe on throw. */
  resizeDrag: (dim: "w" | "h" | "d", extentMm10: number, pushHistory: boolean) => void;
  /** The active divided section's zones for the ratio pill-row editor (Step 4), or null. Follows the
   *  selected divider, else the active target section's divided parent. */
  zoneRow: () => ZoneRow | null;
  /** Retype zone `zoneIndex` of the current `zoneRow()` section (Fixed/Ratio/Locked/Flex) → reflow. */
  setZoneRuleAt: (zoneIndex: number, rule: DivisionRule) => void;
  /** «＋» on the pill row — split the current row's LAST zone in two (adds one more equal zone). */
  addZone: () => void;
  /** The finishing features (corner rounding + cutouts) on the selected part, or null (Step 4b). */
  selectedFeatures: () => PanelFeatures | null;
  /** Set the selected panel's corner radius (mm10): one corner ([tl,tr,br,bl] = 0..3), or "all" (chain ×4). */
  setCornerRadius: (target: "all" | 0 | 1 | 2 | 3, r_mm10: number) => void;
  /** Add or update a cutout aperture on the selected panel (matched by id). */
  addOrUpdateCutout: (cut: PanelCutout) => void;
  /** Remove a cutout by id from the selected panel. */
  removeCutout: (id: string) => void;
  /** Step 6 — paint the selected panel's edge (0..3 = front/back/side/side) with kromka K-variable
   *  `kId`; null strips the band. */
  setEdgeKromka: (edgeIndex: number, kId: string | null) => void;
  /** Step 7 — the project's Joint profile (System-32 grid + cam depth + margins); catalog default until
   *  the workshop edits it. Drives auto hole placement (solveModelToParts reads model.jointProfile). */
  jointProfile: () => JointProfile;
  setJointProfile: (profile: JointProfile) => void;
  /** Step 7c — auto-placed holes that break the Joint profile's rules (e.g. min-edge-margin), or []. */
  jointFindings: () => JointFinding[];
  /** Export gate: the master's explicit override that lets the CNC file emit despite joint warnings. */
  exportOverride: boolean;
  setExportOverride: (on: boolean) => void;
  /** Step 7c — the individually-selected drill hole (from a 3D marker tap), or null. */
  selectedHole: { partId: string; opId: string; fx: number; fy: number } | null;
  selectHole: (h: { partId: string; opId: string; fx: number; fy: number } | null) => void;
  /** Move the selected hole to a face-local mm10 position (persists as a model override; re-drills). */
  setHoleOverride: (partId: string, opId: string, x_mm10: number, y_mm10: number) => void;
  /** Reset one hole back to its auto-placed position. */
  clearHoleOverride: (partId: string, opId: string) => void;
  /** Step 9 — the active space's purpose tag (storage/hanging/boiler/…), or null. */
  activePurpose: () => SectionPurpose | null;
  /** Tag the active space with a purpose (null clears it). Drives Application-view ghosts + boiler check. */
  setPurpose: (purpose: SectionPurpose | null) => void;
  /** Boiler-tagged spaces smaller than the boiler's clearance (Gate 9 amber). */
  boilerFindings: () => ReturnType<typeof checkBoilerClearance>;
  /** Step 11 — the approved-and-locked price snapshot (client sign-off), or null. Persists in the file. */
  lockedQuote: { total: number; date: string } | null;
  /** Lock the current total as the approved quote (client demo close). */
  lockQuote: (total: number) => void;
  /** Release the locked quote (re-open the price for edits). */
  unlockQuote: () => void;
  /** Revert the last edit. */
  undo: () => void;
  canUndo: () => boolean;
  /** Step 12 (#15) — step forward through the redo stack. */
  redo: () => void;
  canRedo: () => boolean;
  /** Serialize the current project (model + material plan) to a JSON string (P7 save). */
  exportProject: () => string;
  /**
   * Load a project from a JSON string; throws on a malformed payload (P7 open). `blockId` (Phase E)
   * marks that this model came from re-opening a placed project block, so «＋ Loyihaga» UPDATES that
   * block instead of adding a duplicate. Any other load (file / library / new) clears the link.
   */
  importProject: (json: string, blockId?: string) => void;
  /** The project block currently being edited (Phase E), or null — set only by re-opening one. */
  editingBlockId: string | null;
  /** True when opened FROM an existing kitchen module (converter copy): saving adds a COPY, it does
   *  not edit the original cabinet in place. Drives the "nusxa" wording in the editor. */
  fromCabinet: boolean;
}

/** The on-disk project shape (P7). Versioned so a future schema change can migrate. */
interface ProjectFile {
  version: 1;
  model: StructuralModel;
  plan: MaterialPlan;
  lockedQuote?: { total: number; date: string } | null;
}

type XBox = { x: number; y: number; z: number; w: number; h: number; d: number };

/** Monotonic counter behind every new free-part id — see addFreeBoard. */
let freeSeq = 0;

/** Magnetic pull — 40 mm, the same reach for a live drag and for the drop. */
const SNAP_PULL = 400; // mm10

/**
 * What a free board may click onto. Compartments were the ONLY targets before, which meant a board had
 * nothing to snap to unless a cabinet was on screen — and building furniture from nothing is exactly the
 * case with no cabinet. OTHER FREE BOARDS are now targets too, so a leg clicks under a table top and the
 * next leg lines up with the first.
 *
 * The board itself is excluded by id, not by identity, because the store hands us a fresh object each
 * time it re-derives.
 */
function freeSnapTargets(block: Block, excludeFreeId?: string): Box3D[] {
  const out: Box3D[] = [];
  // Compartments are real surfaces to click against — but ONLY in a cabinet. In a BARE block the single
  // root section is just the working envelope: an invisible box the master never drew. Offering its faces
  // made them compete with real ones — a leg pushed up under a table top was pulled to the envelope's
  // ceiling instead, and left floating clear of the floor.
  if (!block.bare) for (const z of block.zones) for (const sec of leafSections(z.root)) out.push(sec.box);
  for (const f of block.freeParts ?? []) if (f.id !== excludeFreeId) out.push(f.box);
  return out;
}

/** Snap candidates for one axis: the boards/compartments above, plus the FLOOR — the one face of the
 *  envelope that is physically real, so a board can always be set down on the ground. */
function freeSnapCandidates(block: Block, axis: "x" | "y" | "z", excludeFreeId?: string): SnapCandidate[] {
  const cands = snapCandidates(freeSnapTargets(block, excludeFreeId), axis);
  if (axis === "y") cands.push({ at: 0, kind: "edge" });
  return cands;
}

/** U3.3 fix — keep a free board's box sane relative to its block `B` so a drag/resize can never explode the
 *  scene bounds (which would zoom the camera out until everything vanishes). Position stays near the block,
 *  each side ≥ 3 mm and ≤ 3× the block. */
function clampFreeBox(box: XBox, B: XBox): XBox {
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    w: c(box.w, 30, B.w * 3), h: c(box.h, 30, B.h * 3), d: c(box.d, 30, B.d * 3),
    x: c(box.x, -B.w, B.w * 2), y: c(box.y, -B.h, B.h * 2), z: c(box.z, -B.d, B.d * 2),
  };
}

/** B (multi-block) — the block that owns a part id (`${blockId}__…`) = the "active" block being edited.
 *  Falls back to the first block when nothing is selected or the id is unknown, so single-block behaviour
 *  is unchanged. Lets the dims bar / resize / free-board ops follow whichever cabinet the usta is in. */
export function blockOfPart(model: StructuralModel, partId: string | null | undefined): Block | undefined {
  if (!partId) return model.blocks[0];
  const sep = partId.indexOf("__");
  const bid = sep < 0 ? partId : partId.slice(0, sep);
  return model.blocks.find((b) => b.id === bid) ?? model.blocks[0];
}

export const useKarkas = create<KarkasState>((set, get) => {
  // Phase 6 — seed the session from the persisted GLOBAL workshop profile (materials + joints + per-role
  // thickness). Absent / corrupt storage falls back to the built-in default (loadWorkshopProfile never throws).
  const wp = loadWorkshopProfile();
  // push the current model onto the undo stack, then swap in + re-derive the next one. Structural
  // edits clear the selection (the tapped part id may be gone); property edits keep it (keepSel).
  const apply = (next: StructuralModel, keepSel = false): void =>
    set((s) => ({ ...derive(next, s.plan, s.thickness), past: [...s.past.slice(-49), s.model], future: [], selectedId: keepSel ? s.selectedId : null }));
  // the section an edit targets: the section of the selected panel's instance, else the first leaf.
  const targetSection = (): string | undefined => {
    const s = get();
    if (s.targetId && s.sections.some((x) => x.id === s.targetId)) return s.targetId; // explicit pick / last tap
    const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
    return r ? r.inst.sectionId : firstLeafId(s.model);
  };
  // imos-individual edits: give the selected instance its OWN component before a per-part edit, so
  // changing one shelf/door's material/thickness/load-bearing no longer changes its siblings.
  const forkSelected = (): { model: StructuralModel; compId: string } | null => {
    const sel = get().selectedId;
    const r = sel ? resolveInstance(get().model, sel) : null;
    if (!r || !sel) return null;
    const model = forkComponentForInstance(get().model, r.inst.id);
    const r2 = resolveInstance(model, sel);
    return r2 ? { model, compId: r2.inst.componentId } : null;
  };
  return {
    ...derive({ ...buildDemoModel(), jointProfile: wp.jointProfile }, wp.plan, wp.thickness ?? {}),
    open: false,
    selectedId: null,
    selectedBlockIds: [],
    targetId: null,
    setTarget: (id) => set({ targetId: id }),
    // U3.2 — free assembly: a board that lives OUTSIDE the carcass sections, placed by its own box and
    // draggable anywhere (Moblo free-primitive). The engine already cuts + renders block.freeParts.
    addFreeBoard: (kind = "board") => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block) return;
      const bx = block.box;
      const T = 160; // 16 mm stock
      // One primitive was never enough: a leg had to be made by adding a flat shelf and then fighting it
      // through a rotate and three resizes. These are the shapes furniture is actually made of, each
      // already the right way round and already a sensible size.
      const spec = {
        board: { name: "Taxta", role: "shelf" as const, axis: "y" as const, w: Math.min(4000, Math.round(bx.w * 0.55)), h: T, d: Math.min(3000, Math.round(bx.d * 0.6)) },
        panel: { name: "Yon panel", role: "panel" as const, axis: "x" as const, w: T, h: Math.min(7200, bx.h), d: Math.min(3000, Math.round(bx.d * 0.6)) },
        post: { name: "Oyoq", role: "leg" as const, axis: "x" as const, w: 500, h: Math.min(7100, bx.h), d: 500 },
        box: { name: "Quti", role: "panel" as const, axis: "y" as const, w: 3000, h: 3000, d: 3000 },
      }[kind];
      // Placed ON THE FLOOR and centred, nudged clear of what is already there — a new part that lands
      // inside an existing one looks like nothing happened.
      const n = (block.freeParts ?? []).length;
      const fp: FreePart = {
        // A clock alone is not unique enough: two parts added inside the same millisecond got the SAME
        // id, and the engine rightly refuses that (ADD_FREEPART_DUPLICATE_ID) — so a quick run of taps
        // threw. Adding four legs is the most ordinary thing a master does, so the counter is not
        // optional. The timestamp stays only because it makes ids readable while debugging.
        id: `free_${Date.now().toString(36)}_${(freeSeq++).toString(36)}`,
        name: spec.name,
        role: spec.role,
        thicknessAxis: spec.axis,
        box: { x: Math.round((bx.w - spec.w) / 2) + n * 600, y: 0, z: Math.round((bx.d - spec.d) / 2), w: spec.w, h: spec.h, d: spec.d },
        // a solid post takes no edge banding — see FreePart.edgeBands
        ...(kind === "post" ? { edgeBands: [0, 0, 0, 0] as const } : {}),
      };
      apply(addFreePartOp(s.model, block.id, fp));
      set({ selectedId: `${block.id}__free_${fp.id}` }); // select it so it highlights and can be dragged
    },
    // U4.1 — add a SECOND cabinet (block) beside the current one. Grouping (E1 `groupBlocks`) needs ≥2
    // blocks, so this is the foundation. A fresh bare carcass (same dims as block-0) is tiled just to the
    // right of the rightmost block, with a 30mm gap so the two read as separate until grouped. Every id is
    // suffixed unique so the new block never clashes with the existing one (the carcass is empty, so only
    // the block / zone / root-section ids need remapping — no instances or components to fix up).
    addBlock: () => {
      const s = get();
      const b0 = s.model.blocks[0];
      const dims = b0
        ? { w: Math.round(b0.box.w / 10), h: Math.round(b0.box.h / 10), d: Math.round(b0.box.d / 10) }
        : { w: 600, h: 720, d: 560 };
      const fresh = buildCarcassModel(dims.w, dims.h, dims.d).blocks[0];
      if (!fresh) return; // buildCarcassModel always yields a block — the guard only narrows the type
      const uid = Date.now().toString(36) + "_" + (freeSeq++).toString(36); // + a monotonic counter → no same-ms collision
      const zone = fresh.zones[0];
      if (!zone) return; // a fresh carcass always has one zone — narrows Zone | undefined → Zone
      const rightEdge = s.model.blocks.reduce((mx, b) => Math.max(mx, b.box.x + b.box.w), 0);
      const reblock: Block = {
        ...fresh,
        id: `blk_${uid}`,
        name: `Shkaf ${s.model.blocks.length + 1}`,
        box: { ...fresh.box, x: rightEdge + 300 }, // 30mm gap to the right of the run
        zones: [{ ...zone, id: `z_${uid}`, root: { ...zone.root, id: `sec_${uid}` } }],
      };
      apply({ ...s.model, blocks: [...s.model.blocks, reblock] });
    },
    // gizmos — translate a whole cabinet along one axis (the block move gizmo). Free positioning is what
    // lets an usta lay several cabinets out; grouping only TILES them flush. y is floored at 0 so a
    // cabinet never sinks below the floor (a wall unit still hangs at y > 0). `pushHistory` on the first
    // drag frame opens ONE undo step; later frames replace it.
    moveBlock: (blockId, delta, pushHistory) => {
      const s = get();
      if (!s.model.blocks.some((b) => b.id === blockId)) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== blockId ? b : {
          ...b,
          box: { ...b.box, x: b.box.x + delta.x, y: Math.max(0, b.box.y + delta.y), z: b.box.z + delta.z },
        })),
      };
      if (pushHistory) apply(model, true); // keepSel — the same panel stays selected through the drag
      else set((st) => ({ ...derive(model, st.plan, st.thickness), selectedId: st.selectedId }));
    },
    moveBlockTo: (blockId, axis, idealPos, first) => {
      const s = get();
      const blk = s.model.blocks.find((b) => b.id === blockId);
      if (!blk) return { pos: idealPos, snapped: false };
      const pick = (b: XBox, hi: boolean) => (axis === "x" ? (hi ? b.x + b.w : b.x) : axis === "y" ? (hi ? b.y + b.h : b.y) : hi ? b.z + b.d : b.z);
      const size = pick(blk.box, true) - pick(blk.box, false);
      // candidates: every OTHER cabinet's two faces on this axis (so they click flush side-by-side),
      // plus the floor on Y (a cabinet drops onto y=0).
      // every OTHER cabinet's faces (so they click flush side-by-side), plus the floor on Y. Same magnet
      // as the free boards use, so a cabinet and a board behave identically under the finger.
      const cands = snapCandidates(s.model.blocks.filter((o) => o.id !== blockId).map((o) => o.box), axis);
      if (axis === "y") cands.push({ at: 0, kind: "edge" }); // a cabinet drops onto the floor
      const t = snapSpan(idealPos, size, cands, SNAP_PULL);
      const delta = { x: 0, y: 0, z: 0 };
      delta[axis] = t.pos - pick(blk.box, false);
      if (delta[axis] !== 0) get().moveBlock(blockId, delta, first);
      return t;
    },
    // gizmos «rotate» — turn a free board about the VERTICAL axis. Render-only (rotY_deg): the cut panel
    // is unchanged, so the spec/CNC never sees it. Normalised to 0..359; `first` opens ONE undo step.
    rotateFreePartTo: (fpId, deg, first) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const d = ((Math.round(deg) % 360) + 360) % 360;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, rotY_deg: d })),
        })),
      };
      if (first) apply(model, true);
      else set((st) => ({ ...derive(model, st.plan, st.thickness), selectedId: st.selectedId }));
    },
    // gizmos «rotate» — turn a whole CABINET about the vertical axis (an L-run's return, an angled unit).
    // Placement-only (Block.rotY_deg): the cut list and the drawing sheet stay square-on.
    rotateBlockTo: (blockId, deg, first) => {
      const s = get();
      if (!s.model.blocks.some((b) => b.id === blockId)) return;
      const d = ((Math.round(deg) % 360) + 360) % 360;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== blockId ? b : { ...b, rotY_deg: d })),
      };
      if (first) apply(model, true);
      else set((st) => ({ ...derive(model, st.plan, st.thickness), selectedId: st.selectedId }));
    },
    // Phase 1.1b — sokol / plinth height for a whole cabinet (mm10). `≤ 0` clears the field (no plinth).
    // Mirrors rotateBlockTo: a block-level patch, keepSel, one undo step. box.h is untouched; the plinth
    // is an extra part below (solve/layout), so the scene recentres and the cabinet stands on it.
    setPlinth: (blockId, mm10) => {
      const s = get();
      if (!s.model.blocks.some((b) => b.id === blockId)) return;
      const v = Math.round(mm10);
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (v > 0) return { ...b, plinth_mm10: v };
          const { plinth_mm10: _drop, ...rest } = b; // clear the field entirely when off
          return rest;
        }),
      };
      apply(model, true); // keepSel — same cabinet, one undo step
    },
    // Phase 1.2c — worktop/stoleshnitsa on or off. Like setPlinth: block-level patch, keepSel, one undo
    // step; when off the field is DELETED so the model is byte-identical to a never-worktopped cabinet.
    setWorktop: (blockId, on) => {
      const s = get();
      if (!s.model.blocks.some((b) => b.id === blockId)) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (on) return { ...b, worktop: true };
          const { worktop: _drop, ...rest } = b; // clear the field entirely when off
          return rest;
        }),
      };
      apply(model, true); // keepSel — same cabinet, one undo step
    },
    setBlockShell: (blockId, patch) => {
      const s = get();
      if (!s.model.blocks.some((b) => b.id === blockId)) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const merged: Partial<PanelShell> = { ...(b.shell ?? {}), ...patch };
          // keep ONLY real removals (false); a panel back to present drops out of the mask entirely, and
          // an empty mask deletes `shell` → byte-identical to a never-masked carcass.
          for (const k of Object.keys(merged) as (keyof PanelShell)[]) if (merged[k] !== false) delete merged[k];
          if (Object.keys(merged).length === 0) { const { shell: _drop, ...rest } = b; return rest; }
          return { ...b, shell: merged };
        }),
      };
      apply(model, true); // keepSel, one undo step
    },
    // gizmos «duplicate» — copy whatever is selected: a free board (copy lands beside it, and is SELECTED
    // so the gizmo moves straight onto it) or, for any carcass panel, the WHOLE cabinet.
    duplicateSelected: () => {
      const s = get();
      const sel = s.selectedId;
      const block = sel ? blockOfPart(s.model, sel) : undefined;
      if (!sel || !block) return;
      const uid = Date.now().toString(36) + "_" + (freeSeq++).toString(36); // + a monotonic counter → no same-ms collision
      try {
        if (sel.includes("__free_")) {
          const fpId = sel.slice(sel.indexOf("__free_") + "__free_".length);
          const newId = `fp_${uid}`;
          apply(duplicateFreePart(s.model, block.id, fpId, newId));
          set({ selectedId: `${block.id}__free_${newId}` });
        } else {
          apply(duplicateBlock(s.model, block.id, uid));
        }
      } catch { /* unknown id — ignore rather than crash the editor */ }
    },
    // U4.2 — block navigator: tick whole blocks (clearing any part selection), then group ≥2 into a Run.
    // groupBlocks tiles the members end-to-end at their current widths (gaps removed); resolveRun (U4.4)
    // later fits the run to a wall. Guard <2 / an engine throw so a stray tap can't crash the editor.
    toggleBlockSel: (blockId) => set((s) => ({
      selectedId: null,
      selectedBlockIds: s.selectedBlockIds.includes(blockId)
        ? s.selectedBlockIds.filter((id) => id !== blockId)
        : [...s.selectedBlockIds, blockId],
    })),
    groupSelectedBlocks: () => {
      const s = get();
      const claimed = new Set((s.model.runs ?? []).flatMap((r) => r.members.map((m) => m.blockId)));
      // only the ticked blocks that are real AND not already in a run (groupBlocks throws on a claimed one)
      const ids = s.selectedBlockIds.filter((id) => s.model.blocks.some((b) => b.id === id) && !claimed.has(id));
      if (ids.length < 2) return;
      try {
        apply(groupBlocks(s.model, ids));
        set({ selectedBlockIds: [] });
      } catch {
        // GROUP_NEEDS_2_BLOCKS / unknown — ignore; the ticks stay for a retry.
      }
    },
    // U4.2 — «Barchasini»: group every not-yet-grouped block into one Run in a single tap (no ticking).
    groupAllBlocks: () => {
      const s = get();
      const claimed = new Set((s.model.runs ?? []).flatMap((r) => r.members.map((m) => m.blockId)));
      const free = s.model.blocks.filter((b) => !claimed.has(b.id)).map((b) => b.id);
      if (free.length < 2) return;
      try {
        apply(groupBlocks(s.model, free));
        set({ selectedBlockIds: [] });
      } catch {
        // defensive — groupBlocks only throws on <2 / unknown / already-claimed, all excluded above.
      }
    },
    // U4.3 — «Ajratish»: dissolve every Run any ticked block belongs to, then re-space that run's members
    // apart with a gap so they visibly SEPARATE again. Grouping had tiled them flush; ungroup restores the
    // gap ("oldingi holiga qaytib ajralishi") — otherwise the blocks stay touching and it looks like nothing
    // happened. Positions are laid in member order along the run's axis, keeping the run's starting origin.
    ungroupSelectedBlocks: () => {
      const s = get();
      const sel = s.selectedBlockIds.filter((id) => s.model.blocks.some((b) => b.id === id));
      const runIds = [...new Set(sel.map((id) => (s.model.runs ?? []).find((r) => r.members.some((mm) => mm.blockId === id))?.id).filter((x): x is string => !!x))];
      if (runIds.length === 0) return;
      const GAP = 300; // 30mm, same as addBlock — reads as two distinct cabinets again
      const orig = (box: XBox, ax: "x" | "y" | "z") => (ax === "x" ? box.x : ax === "y" ? box.y : box.z);
      const ext = (box: XBox, ax: "x" | "y" | "z") => (ax === "x" ? box.w : ax === "y" ? box.h : box.d);
      let m = s.model;
      for (const rid of runIds) {
        const run = (m.runs ?? []).find((r) => r.id === rid);
        if (!run) continue;
        const ax = run.axis as "x" | "y" | "z";
        const byId = new Map(m.blocks.map((b) => [b.id, b] as const));
        const order = run.members.map((mm) => mm.blockId);
        const firstId = order[0];
        const first = firstId ? byId.get(firstId) : undefined;
        let cur = first ? orig(first.box, ax) : 0;
        const pos: Record<string, number> = {};
        for (const id of order) {
          const bb = byId.get(id); if (!bb) continue;
          pos[id] = cur;
          cur += ext(bb.box, ax) + GAP;
        }
        m = ungroupBlocks(m, rid);
        m = { ...m, blocks: m.blocks.map((b) => (pos[b.id] === undefined ? b : { ...b, box: { ...b.box, [ax]: pos[b.id] } })) };
      }
      apply(m);
      set({ selectedBlockIds: [] });
    },
    // U4.4 — «Devorga moslash»: resize the whole Run to a typed wall length. resolveRun distributes it
    // across the members by their Fixed/Ratio/Flex rules (default = Flex, so they share the wall equally)
    // and reflows each cabinet's carcass to its new width. mm in → mm10 to the engine.
    setRunLength: (runId, mm) => {
      const s = get();
      const len = Math.max(1, Math.round(mm)) * 10;
      try { apply(resolveRun(s.model, runId, len)); } catch {
        // RUN_INVALID_LENGTH / unknown run — ignore.
      }
    },
    // U4.5 — per-cabinet rule inside a run: pin one to a Fixed width (or a Ratio weight), leave the rest
    // Flex. After the rule changes we re-solve the run at its CURRENT length so the reflow is immediate —
    // e.g. marking one cabinet «Fixed 600» instantly shrinks it and the Flex ones absorb the difference.
    setRunMemberRule: (runId, blockId, rule) => {
      const s = get();
      const run = (s.model.runs ?? []).find((r) => r.id === runId);
      if (!run) return;
      const members = run.members.map((mm) => (mm.blockId === blockId ? { ...mm, rule } : mm));
      const withRule: StructuralModel = { ...s.model, runs: s.model.runs!.map((r) => (r.id === runId ? { ...r, members } : r)) };
      try { apply(resolveRun(withRule, runId, run.length_mm10)); } catch { apply(withRule); }
    },
    // 5.r2 — snap the run to a room wall (its blocks tile + orient along it), or free it (null).
    snapRunToWall: (runId, wallId) => {
      const s = get();
      try { apply(snapRunToWall(s.model, runId, wallId)); } catch { /* engine guard — ignore a bad snap */ }
    },
    // 5.r3 — drop an L-corner block into the L room's corner: legs sized to the run depth (flush), hand =
    // room.turn, auto-positioned + oriented; the wall-1 run insets to clear it.
    fitCorner: () => {
      const s = get();
      const room = s.model.room;
      if (!room || room.walls.length < 2) return;
      if (s.model.blocks.some((b) => b.name === "Burchak shkaf")) return; // already has a corner block — no double
      const ref = s.model.blocks[0];
      const height_mm = ref ? Math.round(ref.box.h / 10) : 720;
      const depth_mm = ref ? Math.round(ref.box.d / 10) : 560; // corner leg depth = the run cabinets' depth (flush)
      const legLen_mm = depth_mm + 340; // leg reach along the wall = depth + a standard corner overhang
      const fresh = buildCarcassModel(legLen_mm, height_mm, depth_mm).blocks[0];
      if (!fresh) return;
      const uid = Date.now().toString(36) + "_" + (freeSeq++).toString(36); // + a monotonic counter → no same-ms collision
      const zone = fresh.zones[0];
      if (!zone) return;
      const block: Block = { ...fresh, id: `blk_${uid}`, name: "Burchak shkaf", zones: [{ ...zone, id: `z_${uid}`, root: { ...zone.root, id: `sec_${uid}` } }] };
      const withBlock: StructuralModel = { ...s.model, blocks: [...s.model.blocks, block] };
      const leg = { length_mm10: legLen_mm * 10, depth_mm10: depth_mm * 10 };
      const asL = setBlockFootprint(withBlock, block.id, { legA: leg, legB: leg, hand: room.turn ?? "left" });
      try { apply(fitCorner(asL, block.id)); } catch { /* engine guard — ignore a bad corner-fit */ }
    },
    moveFreePart: (fpId, delta, first) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block || !block.freeParts) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          // a manual move DETACHES the board from the template reflow (M1.3b), so it stays where dropped.
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: clampFreeBox({ ...f.box, x: f.box.x + delta.x, y: f.box.y + delta.y, z: f.box.z + delta.z }, block.box), anchor: undefined })),
        })),
      };
      // `first` opens ONE undo step; later drag frames just replace it, so a drag isn't 100 undo entries.
      if (first) set((st) => ({ ...derive(model, st.plan, st.thickness), past: [...st.past.slice(-49), st.model], future: [] }));
      else set((st) => ({ ...derive(model, st.plan, st.thickness) }));
    },
    moveFreePartTo: (fpId, axis, idealPos, first) => {
      const s = get();
      const block = s.model.blocks[0];
      const fp = block?.freeParts?.find((f) => f.id === fpId);
      if (!block || !fp) return { pos: idealPos, snapped: false };
      const pick = (b: XBox, hi: boolean) => (axis === "x" ? (hi ? b.x + b.w : b.x) : axis === "y" ? (hi ? b.y + b.h : b.y) : hi ? b.z + b.d : b.z);
      const size = pick(fp.box, true) - pick(fp.box, false);
      // same targets and same rule as the drop-snap — one magnet, not two that drift apart
      const t = snapSpan(idealPos, size, freeSnapCandidates(block, axis, fpId), SNAP_PULL);
      const delta = { x: 0, y: 0, z: 0 };
      delta[axis] = t.pos - pick(fp.box, false);
      if (delta[axis] !== 0) get().moveFreePart(fpId, delta, first);
      return t;
    },
    // U3.2c — on drop, snap the board flush to any nearby compartment face (magnet). Part of the same
    // drag undo step (a plain set, no new past entry), so one drag = one undo.
    snapFreePart: (fpId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const fp = block.freeParts.find((f) => f.id === fpId);
      if (!fp) return;
      // per-axis, so the floor candidate can join the Y axis only
      const snapped = {
        x: snapSpan(fp.box.x, fp.box.w, freeSnapCandidates(block, "x", fpId), SNAP_PULL).pos,
        y: snapSpan(fp.box.y, fp.box.h, freeSnapCandidates(block, "y", fpId), SNAP_PULL).pos,
        z: snapSpan(fp.box.z, fp.box.d, freeSnapCandidates(block, "z", fpId), SNAP_PULL).pos,
      };
      if (snapped.x === fp.box.x && snapped.y === fp.box.y && snapped.z === fp.box.z) return; // already flush
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: { ...f.box, x: snapped.x, y: snapped.y, z: snapped.z } })),
        })),
      };
      set((st) => ({ ...derive(model, st.plan, st.thickness) }));
    },
    resizeFreeBoard: (fpId, dim, mm, pushHistory = true) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const v = Math.max(30, Math.round(mm * 10)); // mm → mm10, min 3 mm
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          // a manual resize DETACHES the board from the template reflow (anchor dropped), so the typed size
          // sticks — a later block resize no longer overwrites it via resolveFreePartBox (M1.3b).
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: clampFreeBox({ ...f.box, [dim]: v }, block.box), anchor: undefined })),
        })),
      };
      // keep the board selected while resizing; a live drag frame replaces state instead of stacking undo
      if (pushHistory) apply(model, true);
      else set((st) => ({ ...derive(model, st.plan, st.thickness), selectedId: st.selectedId }));
    },
    // M1.3b — gizmo resize with a magnet: the growing HIGH face snaps to a nearby part/compartment face
    // (same magnet as move-snap), the LOW edge (origin) holds. Also detaches (anchor dropped) so the size
    // sticks through a later block resize. Returns the applied size (mm) + whether it snapped.
    resizeFreeBoardTo: (fpId, dim, mm, first) => {
      const s = get();
      const block = s.model.blocks[0];
      const fp = block?.freeParts?.find((f) => f.id === fpId);
      if (!block || !fp) return { size: mm, snapped: false };
      const axis = dim === "w" ? "x" : dim === "h" ? "y" : "z";
      const origin = axis === "x" ? fp.box.x : axis === "y" ? fp.box.y : fp.box.z;
      const idealHigh = origin + Math.max(30, Math.round(mm * 10)); // mm → mm10, grow the high face
      const t = snapSpan(idealHigh, 0, freeSnapCandidates(block, axis, fpId), SNAP_PULL); // magnet on the high edge
      const size = Math.max(30, t.pos - origin);
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: clampFreeBox({ ...f.box, [dim]: size }, block.box), anchor: undefined })),
        })),
      };
      if (first) apply(model, true);
      else set((st) => ({ ...derive(model, st.plan, st.thickness), selectedId: st.selectedId }));
      return { size: Math.round(size / 10), snapped: t.snapped };
    },
    // U3.3b — rotate 90°: cycle the thin axis y→x→z→y and swap the two dims so the 16 mm thickness moves
    // with it (horizontal shelf → vertical side → front/back panel → …). One undo step, keeps selection.
    rotateFreeBoard: (fpId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const dimOf = (ax: "x" | "y" | "z"): "w" | "h" | "d" => (ax === "x" ? "w" : ax === "y" ? "h" : "d");
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => {
            if (f.id !== fpId) return f;
            const next: "x" | "y" | "z" = f.thicknessAxis === "y" ? "x" : f.thicknessAxis === "x" ? "z" : "y";
            const box = { ...f.box };
            const od = dimOf(f.thicknessAxis), nd = dimOf(next);
            const t = box[od]; box[od] = box[nd]; box[nd] = t; // swap old-thin ↔ new-thin dim
            return { ...f, thicknessAxis: next, box, anchor: undefined }; // manual rotate detaches (M1.3b)
          }),
        })),
      };
      apply(model, true);
    },
    setFreeBoardMaterial: (fpId, matId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, material: matId || undefined })),
        })),
      };
      apply(model, true);
    },
    renameFreePart: (fpId, name) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const nm = name.trim() || "Деталь"; // never a nameless part in the cut list / SWJ008
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, name: nm })),
        })),
      };
      apply(model, true);
    },
    removeFreeBoard: (fpId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (block) apply(removeFreePartOp(s.model, block.id, fpId));
    },
    past: [],
    future: [],
    plan: wp.plan, // Phase 6 — seeded from the workshop profile
    thickness: wp.thickness ?? {}, // Phase 6 — per-role board-thickness overrides (from the profile)
    materialPool: planDecors(wp.plan),
    pendingBinding: null,
    editingBlockId: null,
    fromCabinet: false,
    // 7b — a plan decor change also changes that role's thickness → re-derive the parts. A manual decor
    // pick is an explicit choice, so it joins the material pool (only LIBRARY imports are gated, §3.2).
    setPlanMaterial: (slot, id) => set((s) => { const plan = { ...s.plan, [slot]: id }; return { plan, materialPool: [...new Set([...s.materialPool, id])], ...derive(s.model, plan, s.thickness) }; }),
    // a fresh model (new block / template) is NOT tied to a placed project block → clear the link.
    // meta.fromCabinet marks a converter copy of an existing kitchen module (saving adds a copy).
    openWith: (model, plan, meta) => set((s) => { const p = plan ?? s.plan; return { ...derive(model, p, s.thickness), plan: p, materialPool: planDecors(p), pendingBinding: null, lockedQuote: null, exportOverride: false, selectedHole: null, open: true, selectedId: null, past: [], future: [], editingBlockId: null, fromCabinet: meta?.fromCabinet ?? false }; }),
    setModel: (model) => set((s) => ({ ...derive(model, s.plan, s.thickness), selectedId: null, selectedBlockIds: [], past: [], future: [], editingBlockId: null, fromCabinet: false, lockedQuote: null, exportOverride: false, selectedHole: null })),
    close: () => set({ open: false }),
    tapPart: (id) => {
      // tapping a placed part also targets its section, so the next add lands where you're looking
      const r = id ? resolveInstance(get().model, id) : null;
      set({ selectedId: id, ...(r ? { targetId: r.inst.sectionId } : {}) });
    },
    divide: () => get().divideBy("x", 2),
    divideBy: (axis, count) => {
      const t = targetSection();
      if (!t) return;
      const model = get().model;
      const n = Math.max(2, Math.min(20, Math.round(count)));
      // Splitting a section un-leafs it, orphaning any instances it held (their sectionId no longer
      // resolves to a leaf, so they stop emitting parts). Preserve them: after the split, re-home the
      // orphans into the first child leaf so nothing silently disappears.
      const orphanIds = new Set(
        model.blocks.flatMap((b) => b.instances.filter((i) => i.sectionId === t).map((i) => i.id)),
      );
      let next = divideSection(model, t, { kind: "equal", axis, count: n });
      const divided = findSection(next, t);
      if (divided && orphanIds.size) next = rehomeInstances(next, orphanIds, firstLeafUnder(divided).id);
      apply(next);
    },
    addShelves: (n) => {
      const t = targetSection();
      if (!t) return;
      let m = get().model;
      const k = Math.max(1, Math.min(20, Math.round(n)));
      for (let i = 0; i < k; i += 1) m = addInstance(m, t, "shelf");
      apply(m);
    },
    add: (kind, opts) => {
      const t = targetSection();
      if (!t) return;
      // 3.d — an appliance is invisible until selected (no board mesh), so auto-select the new one so its
      // kind picker + delete show at once. Diff the instance ids to find the just-added instance.
      const before = new Set(get().model.blocks.flatMap((b) => b.instances.map((i) => i.id)));
      apply(addInstance(get().model, t, kind, opts));
      if (kind === "appliance") {
        for (const b of get().model.blocks) {
          const ni = b.instances.find((i) => !before.has(i.id));
          if (ni) { set({ selectedId: `${b.id}__inst_${ni.id}` }); break; }
        }
      }
    },
    remove: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (r) apply(removeInstance(s.model, r.inst.id));
    },
    // E2 — «Ichki yashik»: nest a fresh drawer inside the selected top-level drawer's interior (drawer-in-
    // drawer). resolveInstance gives the outer instance id; nestDrawer throws if it isn't a drawer → caught.
    // keepSel so the outer drawer stays selected → the usta can nest several in a row.
    nestDrawerInSelected: () => {
      const s = get();
      // deep resolver so «Ichki yashik» nests into the ACTUAL selected drawer (nested or top-level), not
      // always the top-level ancestor.
      const r = s.selectedId ? resolveDrawerInstance(s.model, s.selectedId) : null;
      if (!r) return;
      try { apply(nestDrawer(s.model, r.inst.id), true); } catch { /* NEST_NOT_A_DRAWER — ignore */ }
    },
    setHinge: (edge) => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (r) apply(setHingeEdge(s.model, r.inst.id, edge), true); // keepSel — same door, just re-hinged
    },
    // 1.3c — handle (dastak) type on the selected door/drawer front. Fork first (like setLip/setMaterial)
    // so one leaf's handle is independent of its siblings; null clears the field (byte-identical).
    setHandle: (handle) => {
      const f = forkSelected();
      if (f) apply(setComponentHandle(f.model, f.compId, handle), true);
    },
    // 2.1c — lift hinge on the selected door. Fork first (like setHandle) so one door's lift is independent
    // of its siblings; null clears the field (byte-identical, back to a side-hinged door).
    setLift: (lift) => {
      const f = forkSelected();
      if (f) apply(setComponentLift(f.model, f.compId, lift), true);
    },
    // 2.3c — drawer organizer divider count on the selected drawer. Fork first (like setLift); 0 clears the
    // organizer (byte-identical). Clamped 0..8; axis "x" (side-by-side) for now — the data supports "z" too.
    setDividers: (n) => {
      const f = forkSelected();
      if (!f) return;
      const count = Math.max(0, Math.min(8, Math.round(n)));
      apply(setComponentOrganizer(f.model, f.compId, count > 0 ? { dividers: count, axis: "x" } : null), true);
    },
    // 3.d — change the selected appliance's kind (oven → hob …). Fork first (like setLift); keepSel.
    setAppliance: (kind) => {
      const f = forkSelected();
      if (f) apply(setComponentAppliance(f.model, f.compId, kind), true);
    },
    // 4.a — make/unmake an L-corner on the selected block. legA = the current box (leg-A keeps its content),
    // a default 400mm return leg-B; toggling off restores the rectangle. keepSel.
    toggleLCorner: () => {
      const s = get();
      const b = blockOfPart(s.model, s.selectedId);
      if (!b) return;
      const fp = b.footprint
        ? null
        : { legA: { length_mm10: b.box.w, depth_mm10: b.box.d }, legB: { length_mm10: 4000, depth_mm10: Math.min(b.box.d, 4000) } };
      apply(setBlockFootprint(s.model, b.id, fp), true);
    },
    // 4.a — resize the L-corner return leg only (legA stays = the box, so leg-A content never reflows).
    setLegB: (length_mm, depth_mm) => {
      const s = get();
      const b = blockOfPart(s.model, s.selectedId);
      if (!b?.footprint) return;
      const legB = { length_mm10: Math.max(1000, Math.round(length_mm) * 10), depth_mm10: Math.max(1000, Math.round(depth_mm) * 10) };
      apply(setBlockFootprint(s.model, b.id, { legA: b.footprint.legA, legB, hand: b.footprint.hand }), true); // keep the hand
    },
    // 4 polish — flip the L between left- and right-hand (mirrors leg-B; leg-A stays). Keeps legA/legB dims.
    setLCornerHand: (hand) => {
      const s = get();
      const b = blockOfPart(s.model, s.selectedId);
      if (!b?.footprint || (b.footprint.hand ?? "left") === hand) return;
      apply(setBlockFootprint(s.model, b.id, { legA: b.footprint.legA, legB: b.footprint.legB, hand }), true);
    },
    // 5.r1 — set the room: an I/L/U wall preset + per-wall lengths (mm → mm10). Render-only backdrop.
    setRoom: (preset, lengths_mm, turn) => {
      const s = get();
      const room = roomFromPreset(preset, lengths_mm.map((mm) => Math.max(1000, Math.round(mm) * 10)), turn ?? s.model.room?.turn ?? "left");
      apply({ ...s.model, room }, true);
    },
    clearRoom: () => {
      const s = get();
      if (!s.model.room) return; // already no room — no-op
      const { room: _drop, ...rest } = s.model;
      apply(rest, true);
    },
    // 2.2b — combine the selected door with its siblings: move the instance onto its PARENT section (no fork —
    // sectionId is per-instance). keepSel so the same door stays selected as it widens.
    combineSelectedDoor: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r || r.block.components.find((c) => c.id === r.inst.componentId)?.role !== "facade") return;
      const parent = parentSectionOf(r.block, r.inst.sectionId);
      if (parent) apply(moveInstanceToSection(s.model, r.inst.id, parent.id), true);
    },
    // 2.2b — split a combined door back to one compartment: move it to its section's FIRST leaf child.
    splitSelectedDoor: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r || r.block.components.find((c) => c.id === r.inst.componentId)?.role !== "facade") return;
      const sec = sectionInBlock(r.block, r.inst.sectionId);
      const firstLeaf = sec && sec.children.length > 0 ? [...leafSections(sec)][0] : null;
      if (firstLeaf) apply(moveInstanceToSection(s.model, r.inst.id, firstLeaf.id), true);
    },
    selectedDoorCombine: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r || r.block.components.find((c) => c.id === r.inst.componentId)?.role !== "facade") return null;
      const sec = sectionInBlock(r.block, r.inst.sectionId);
      if (!sec) return null;
      const parent = parentSectionOf(r.block, r.inst.sectionId);
      return { canCombine: sec.children.length === 0 && !!parent && parent.children.length > 1, canSplit: sec.children.length > 0 };
    },
    // Yashik balandligi — per-drawer front/box height (mm). Clamp ≥ 50mm so the box never collapses;
    // solve/layout clamp the top at the section height, so an over-tall value just fills the bay.
    setDrawerHeight: (mm) => {
      const s = get();
      const r = s.selectedId ? resolveDrawerInstance(s.model, s.selectedId) : null;
      if (!r) return;
      const h = Math.max(50, Math.round(mm)) * 10;
      const model = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== r.block.id ? b : { ...b, instances: patchInstanceAtPath(b.instances, r.path, { drawerHeight_mm10: h }) })),
      };
      apply(model, true); // keepSel — same drawer (nested or top-level), just re-sized
    },
    selectedComponent: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      return r ? r.block.components.find((c) => c.id === r.inst.componentId) ?? null : null;
    },
    moveInstanceTo: (instanceId, axis, pos, pushHistory) => {
      const s = get();
      const next = moveInstanceAnchor(s.model, instanceId, axis, Math.round(pos));
      if (next !== s.model) {
        // live drag frames must not each stack an undo entry — only the first one does
        if (pushHistory) apply(next, true);
        else set((st) => ({ ...derive(next, st.plan, st.thickness) }));
      }
      const blk = next.blocks.find((b) => b.instances.some((i) => i.id === instanceId));
      return blk?.instances.find((i) => i.id === instanceId)?.anchor[axis] ?? pos;
    },
    selectedGroup: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      return r ? familyStatus(s.model, r.inst.id) : null;
    },
    applyToAllIdentical: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r) return;
      const next = applyToFamily(s.model, r.inst.id);
      // The engine returns the SAME model when there is nothing to unify (a lone part, or a family that
      // already shares one component). Pushing that through apply() would still stack an undo step, so
      // the master's next ↩ would silently do nothing.
      if (next === s.model) return;
      apply(next, true); // keepSel — same part, its siblings just caught up
    },
    selectedDrawerHeight: () => {
      const s = get();
      const r = s.selectedId ? resolveDrawerInstance(s.model, s.selectedId) : null;
      if (!r) return null;
      const comp = r.components.find((c) => c.id === r.inst.componentId);
      if (!comp?.drawer) return null;
      // show the drawer's ACTUAL solved front height (front part length = box height) so an unset nested
      // drawer reads its real fill height, not the 200 fallback — editing then grows/shrinks from what's seen.
      const front = s.parts.find((p) => p.id === `${r.base}__front`);
      return Math.round((front ? front.length_mm10 : r.inst.drawerHeight_mm10 ?? DRAWER_HEIGHT_MM10) / 10);
    },
    selectedParts: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r) return [];
      const base = `${r.block.id}__inst_${r.inst.id}`;
      return s.parts.filter((p) => p.id === base || p.id.startsWith(`${base}__`));
    },
    toggleLoadBearing: () => {
      const comp = get().selectedComponent();
      const f = forkSelected();
      if (comp && f) apply(setLoadBearing(f.model, f.compId, !(comp.loadBearing === true)), true);
    },
    setThickness: (mm) => {
      const f = forkSelected();
      if (f) apply(setComponentThickness(f.model, f.compId, Math.max(1, Math.round(mm)) * 10), true);
    },
    // qiya polka — fork first so tilting ONE shelf doesn't tilt its siblings (imos-individual edit),
    // then clamp to the angle that still fits this shelf's bay (so it never pokes out of the carcass).
    setAngle: (deg) => {
      const f = forkSelected();
      const sel = get().selectedId;
      if (!f || !sel) return;
      const r = resolveInstance(f.model, sel);
      const max = r ? shelfMaxAngleDeg(r.block, r.inst) : 45;
      apply(setComponentAngle(f.model, f.compId, Math.max(0, Math.min(Math.round(deg), max))), true);
    },
    selectedShelfMaxAngle: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (!r) return null;
      const comp = r.block.components.find((c) => c.id === r.inst.componentId);
      if (!comp || comp.role !== "internal_shelf") return null;
      return shelfMaxAngleDeg(r.block, r.inst);
    },
    // display-shelf front lip — fork first so lipping ONE shelf doesn't lip its siblings
    setLip: (mm) => {
      const f = forkSelected();
      if (f) apply(setComponentLip(f.model, f.compId, Math.max(0, Math.round(mm)) * 10), true);
    },
    setMaterial: (id) => {
      const f = forkSelected();
      if (!f) return;
      // 7b — a per-part decor also sets that part's thickness (material carries thickness)
      let next = setComponentMaterial(f.model, f.compId, id);
      if (id) next = setComponentThickness(next, f.compId, boardThicknessMm10(id));
      apply(next, true);
      if (id) set((s) => ({ materialPool: [...new Set([...s.materialPool, id])] })); // explicit pick joins the pool
    },
    resize: (dim, mm) => {
      const m = get().model;
      const b = blockOfPart(m, get().selectedId); // B — resize the ACTIVE cabinet (selected part's block)
      if (!b) return;
      const mm10 = Math.max(1, Math.round(mm)) * 10;
      const next =
        dim === "w" ? resizeBlockWidth(m, b.id, mm10)
        : dim === "h" ? resizeBlockHeight(m, b.id, mm10)
        : resizeBlockDepth(m, b.id, mm10);
      if (next !== m) apply(next, true); // B — keep the selection so the usta can edit w→h→d on one block
    },
    moveLine: (lineId, delta, scope, pushHistory) => {
      const s = get();
      let next: StructuralModel;
      try { next = moveLineOp(s.model, lineId, delta, scope); } catch { return; } // dragging past a collapse/edge limit — ignore, don't crash
      if (next === s.model) return; // no-op (0 delta)
      if (pushHistory) apply(next, true); // first drag frame → one undo step, keep the selection
      else set((st) => ({ ...derive(next, st.plan, st.thickness), selectedId: st.selectedId })); // live frame → no history
    },
    resizeDrag: (dim, extentMm10, pushHistory) => {
      const s = get();
      const b = blockOfPart(s.model, s.selectedId); // B — drag-resize the ACTIVE cabinet's face
      if (!b) return;
      const mm10 = Math.max(300, Math.round(extentMm10)); // clamp to ≥30mm so a drag never collapses it
      let next: StructuralModel;
      try {
        next = dim === "w" ? resizeBlockWidth(s.model, b.id, mm10) : dim === "h" ? resizeBlockHeight(s.model, b.id, mm10) : resizeBlockDepth(s.model, b.id, mm10);
      } catch { return; }
      if (next === s.model) return;
      if (pushHistory) apply(next, true);
      else set((st) => ({ ...derive(next, st.plan, st.thickness), selectedId: st.selectedId }));
    },
    zoneRow: () => {
      const s = get();
      if (!s.model.blocks.length) return null;
      let parent: Section | null = null;
      const sel = s.selectedId;
      if (sel && sel.includes("__div_")) {
        const lineId = sel.slice(sel.indexOf("__div_") + "__div_".length);
        parent = findDivParent(s.model, (sec) => sec.dividers.includes(lineId));
      }
      if (!parent && s.targetId) {
        const tid = s.targetId;
        parent = findDivParent(s.model, (sec) => sec.children.some((c) => c.id === tid));
      }
      if (!parent || parent.children.length < 2) return null;
      // B — the divider's axis: search every cabinet's lines (the parent section may be in the 2nd cabinet)
      const axis = s.model.blocks.flatMap((b) => b.lines).find((l) => l.id === parent!.dividers[0])?.axis ?? "y";
      const sizeOf = (b: { w: number; h: number; d: number }) => (axis === "x" ? b.w : axis === "y" ? b.h : b.d);
      const zones = parent.children.map((c) => ({ id: c.id, size_mm10: sizeOf(c.box), rule: c.rule ?? ({ kind: "flex" } as DivisionRule) }));
      return { sectionId: parent.id, axis, zones };
    },
    setZoneRuleAt: (zoneIndex, rule) => {
      const s = get();
      const row = s.zoneRow();
      if (!row) return;
      const next = setZoneRuleOp(s.model, row.sectionId, zoneIndex, rule);
      if (next !== s.model) apply(next, true);
    },
    addZone: () => {
      const s = get();
      const row = s.zoneRow();
      if (!row) return;
      const parent = findSection(s.model, row.sectionId);
      const last = parent?.children[parent.children.length - 1];
      if (!last) return;
      const leaf = firstLeafUnder(last);
      let next: StructuralModel;
      try { next = divideSection(s.model, leaf.id, { kind: "equal", axis: row.axis, count: 2 }); } catch { return; }
      if (next !== s.model) apply(next, true);
    },
    selectedFeatures: () => {
      const s = get();
      return s.selectedId ? s.model.features?.[s.selectedId] ?? null : null;
    },
    setCornerRadius: (target, r) => {
      const s = get();
      const pid = s.selectedId;
      if (!pid) return;
      const cur = s.model.features?.[pid]?.corners ?? [0, 0, 0, 0];
      const clamped = Math.max(0, Math.round(r));
      const corners: [number, number, number, number] = [cur[0], cur[1], cur[2], cur[3]];
      if (target === "all") corners.fill(clamped);
      else corners[target] = clamped;
      apply(patchFeatures(s.model, pid, { corners }), true);
    },
    addOrUpdateCutout: (cut) => {
      const s = get();
      const pid = s.selectedId;
      if (!pid) return;
      const cuts = (s.model.features?.[pid]?.cutouts ?? []).slice();
      const i = cuts.findIndex((c) => c.id === cut.id);
      if (i >= 0) cuts[i] = cut; else cuts.push(cut);
      apply(patchFeatures(s.model, pid, { cutouts: cuts }), true);
    },
    removeCutout: (id) => {
      const s = get();
      const pid = s.selectedId;
      if (!pid) return;
      const cuts = (s.model.features?.[pid]?.cutouts ?? []).filter((c) => c.id !== id);
      apply(patchFeatures(s.model, pid, { cutouts: cuts }), true);
    },
    setEdgeKromka: (edgeIndex, kId) => {
      const s = get();
      const pid = s.selectedId;
      if (!pid || edgeIndex < 0 || edgeIndex > 3) return;
      const cur = s.model.features?.[pid]?.kromka ?? [null, null, null, null];
      const kromka: [string | null, string | null, string | null, string | null] = [cur[0] ?? null, cur[1] ?? null, cur[2] ?? null, cur[3] ?? null];
      kromka[edgeIndex] = kId;
      apply(patchFeatures(s.model, pid, { kromka }), true);
    },
    jointProfile: () => get().model.jointProfile ?? defaultJointProfile(),
    setJointProfile: (profile) => apply({ ...get().model, jointProfile: profile }, true),
    // Phase 6 — per-role board-thickness override (mm → mm10). 0 clears the override (back to the decor default).
    setRoleThickness: (role, mm) => set((s) => {
      const thickness = { ...s.thickness };
      const v = Math.round(mm) * 10;
      if (v > 0) thickness[role] = v; else delete thickness[role];
      return { thickness, ...derive(s.model, s.plan, thickness) };
    }),
    // Phase 6 — snapshot the CURRENT plan + joints + thickness as the GLOBAL factory default (localStorage).
    // Does NOT touch the current model — only the persisted profile.
    saveWorkshopDefault: () => { const s = get(); saveWorkshopProfile({ plan: s.plan, jointProfile: s.jointProfile(), thickness: s.thickness }); },
    // Phase 6 — reset THIS project's plan + joints + thickness to the saved factory default.
    applyWorkshopDefault: () => set((s) => {
      const wp = loadWorkshopProfile();
      const thickness = wp.thickness ?? {};
      const model: StructuralModel = { ...s.model, jointProfile: wp.jointProfile };
      return { plan: wp.plan, thickness, materialPool: [...new Set([...s.materialPool, ...planDecors(wp.plan)])], ...derive(model, wp.plan, thickness), past: [...s.past.slice(-49), s.model], future: [], selectedId: null };
    }),
    workshopSummary: () => loadWorkshopProfile(),
    jointFindings: () => {
      const s = get();
      return checkJointConstraints(solveModelToParts(s.model, { ...planThickness(s.plan), ...s.thickness }), s.jointProfile().minEdgeMargin_mm10); // Phase 6 — honour the thickness override
    },
    exportOverride: false,
    setExportOverride: (on) => set({ exportOverride: on }),
    activePurpose: () => {
      const sid = targetSection();
      return sid ? findSection(get().model, sid)?.purpose ?? null : null;
    },
    setPurpose: (purpose) => {
      const sid = targetSection();
      if (!sid) return;
      const next = setSectionPurposeOp(get().model, sid, purpose);
      if (next !== get().model) apply(next, true);
    },
    boilerFindings: () => checkBoilerClearance(get().model),
    lockedQuote: null,
    lockQuote: (total) => set({ lockedQuote: { total, date: new Date().toISOString().slice(0, 10) } }),
    unlockQuote: () => set({ lockedQuote: null }),
    selectedHole: null,
    selectHole: (h) => set({ selectedHole: h }),
    setHoleOverride: (partId, opId, x, y) => {
      const s = get();
      const overrides = { ...(s.model.holeOverrides ?? {}), [holeKey(partId, opId)]: { x_mm10: Math.round(x), y_mm10: Math.round(y) } };
      apply({ ...s.model, holeOverrides: overrides }, true);
    },
    clearHoleOverride: (partId, opId) => {
      const s = get();
      if (!s.model.holeOverrides) return;
      const overrides = { ...s.model.holeOverrides };
      delete overrides[holeKey(partId, opId)];
      apply({ ...s.model, holeOverrides: Object.keys(overrides).length ? overrides : undefined }, true);
    },
    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        return { ...derive(prev, s.plan, s.thickness), past: s.past.slice(0, -1), future: [...s.future, s.model], selectedId: null };
      }),
    canUndo: () => get().past.length > 0,
    redo: () =>
      set((s) => {
        const next = s.future[s.future.length - 1];
        if (!next) return {};
        return { ...derive(next, s.plan, s.thickness), past: [...s.past, s.model], future: s.future.slice(0, -1), selectedId: null };
      }),
    canRedo: () => get().future.length > 0,
    exportProject: () => {
      const s = get();
      const file: ProjectFile = { version: 1, model: s.model, plan: s.plan, lockedQuote: s.lockedQuote };
      return JSON.stringify(file, null, 2);
    },
    importProject: (json, blockId) => {
      const data = JSON.parse(json) as Partial<ProjectFile>;
      if (!data || !data.model || !Array.isArray(data.model.blocks)) {
        throw new Error("BAD_PROJECT: not a karkas project file");
      }
      const plan = withPlanDefaults(data.plan); // migrate an old plan missing later slots (e.g. worktop)
      // §3.2 — a library block may carry decors the project pool lacks; flag them for the map-or-create
      // prompt (the block still loads so it's visible; resolveBinding/cancelBinding reconciles the pool).
      const foreign = foreignDecors(get().materialPool, data.model, plan);
      // reset the FULL edit context on load (Step 12 audit fix): future[] (else redo restores the previous
      // project), and the manufacturing exportOverride / selectedHole (else block A's override leaks to B).
      set({ ...derive(data.model, plan, get().thickness), plan, selectedId: null, past: [], future: [], exportOverride: false, selectedHole: null, open: true, editingBlockId: blockId ?? null, fromCabinet: false, pendingBinding: foreign.length ? { foreign } : null, lockedQuote: data.lockedQuote ?? null });
    },
    resolveBinding: (mapping) => {
      const s = get();
      const bound = bindBlockMaterials(s.model, s.plan, mapping);
      const kept = Object.entries(mapping).filter(([, t]) => t === null).map(([f]) => f); // "create new var"
      set({ ...derive(bound.model, bound.plan, s.thickness), plan: bound.plan, materialPool: [...new Set([...s.materialPool, ...kept])], pendingBinding: null });
    },
    cancelBinding: () => set((s) => ({ materialPool: [...new Set([...s.materialPool, ...(s.pendingBinding?.foreign ?? [])])], pendingBinding: null })),
  };
});

// dev-only: lets local tooling (e.g. puppeteer) drive the karkas store directly (stripped from prod
// builds), mirroring the kitchen store's `__store`. Uses globalThis + casts so the engine's
// node-only tsc (which type-checks this file via the app-touching tests) still compiles without DOM
// / Vite types; in the browser globalThis IS window, so `window.__karkas` resolves the same.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  (globalThis as unknown as { __karkas: typeof useKarkas }).__karkas = useKarkas;
}
