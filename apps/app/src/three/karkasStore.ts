// three/karkasStore.ts — the StructuralModel editing state (Phase 3 + 4). A small, SEPARATE
// zustand store from the kitchen `store.ts`, so the karkas-block editor is fully parallel and the
// kitchen Cell flow is never touched. Holds one StructuralModel + its derived render/manufacturing
// data, the focused-editor open flag, the selection, and an undo stack. Editing actions (Phase 4)
// call the engine's PURE immutable operations (divideSection / addInstance) and re-derive.

import { create } from "zustand";
import type { StructuralModel, Component, Block, Instance, FreePart } from "../../../../engine/contracts/structure.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { leafSections, type Section } from "../../../../engine/contracts/structure.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildDemoModel, buildCarcassModel } from "../../../../engine/structure/demoModel.js";
import { divideSection, addInstance, removeInstance, setLoadBearing, setComponentThickness, setComponentMaterial, setComponentAngle, setComponentLip, shelfMaxAngleDeg, setHingeEdge, forkComponentForInstance, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth, moveLine as moveLineOp, setZoneRule as setZoneRuleOp, setSectionPurpose as setSectionPurposeOp, checkBoilerClearance, addFreePart as addFreePartOp, removeFreePart as removeFreePartOp, groupBlocks, ungroupBlocks, type AddKind, type AddOpts } from "../../../../engine/structure/operations.js";
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
import { layoutToScene, type Scene } from "./structureScene";
import { DEFAULT_PLAN, planThickness, boardThicknessMm10, type MaterialPlan } from "./materials";

/** Everything the 3D viewport + readouts need, recomputed whenever the model changes. */
interface Derived {
  model: StructuralModel;
  parts: Part[]; // manufacturing leaves (for the future price / cut list / CNC)
  scene: Scene; // positioned render boxes (metres)
  warnings: string[]; // non-blocking engineering ⚠ (stability + motion + hinge fit), Russian text
  sections: { id: string; label: string }[]; // leaf sections you can add into (the add-target picker)
}
function derive(model: StructuralModel, plan: MaterialPlan): Derived {
  const warnings = [
    ...checkStability(model),
    ...checkMotionClearance(model),
    ...checkHingeFit(model),
    ...checkConstraints(model),
  ].map((f) => f.message_ru);
  const sections: { id: string; label: string }[] = [];
  for (const b of model.blocks) for (const z of b.zones) for (const s of leafSections(z.root)) sections.push({ id: s.id, label: `${sections.length + 1}` });
  // 7b — each role's board thickness comes from its plan decor (ЛДСП 16 / МДФ 18 / ХДФ 3)
  const tk = planThickness(plan); // one per-role thickness spec for BOTH cut list + render (parity)
  return { model, parts: solveStructure(model, tk), scene: layoutToScene(solveLayout(model, tk), model.features), warnings, sections };
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
  /** U3.2 — free assembly (Moblo free-primitive): drop a free board, drag it anywhere, or remove it. */
  addFreeBoard: () => void;
  moveFreePart: (fpId: string, delta: { x: number; y: number; z: number }, first: boolean) => void;
  snapFreePart: (fpId: string) => void;
  resizeFreeBoard: (fpId: string, dim: "w" | "h" | "d", mm: number) => void;
  rotateFreeBoard: (fpId: string) => void;
  setFreeBoardMaterial: (fpId: string, matId: string) => void;
  removeFreeBoard: (fpId: string) => void;
  past: StructuralModel[];
  /** Step 12 (#15) — the redo forward stack; a fresh edit clears it. */
  future: StructuralModel[];
  /** Which decor each panel role is cut from (drives the spec price). Persists across model edits. */
  plan: MaterialPlan;
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
  /** The Component behind the current selection (its doubled/glazed/loadBearing flags), or null. */
  selectedComponent: () => Component | null;
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

/** U3.2c — snap a free board's box (block-local mm10) so any face within `thr` of a compartment face
 *  (a wall / shelf / floor / front / back) clicks flush to it. Magnetic placement, evaluated per axis. */
type XBox = { x: number; y: number; z: number; w: number; h: number; d: number };
function snapFreeBox(box: XBox, secBoxes: readonly XBox[], thr: number): { x: number; y: number; z: number } {
  const snap = (lo: number, size: number, cands: number[]): number => {
    const hi = lo + size;
    let best = lo, bestD = thr;
    for (const c of cands) {
      if (Math.abs(c - lo) < bestD) { best = c; bestD = Math.abs(c - lo); }
      if (Math.abs(c - hi) < bestD) { best = c - size; bestD = Math.abs(c - hi); }
    }
    return best;
  };
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (const s of secBoxes) { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); zs.push(s.z, s.z + s.d); }
  return { x: snap(box.x, box.w, xs), y: snap(box.y, box.h, ys), z: snap(box.z, box.d, zs) };
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

export const useKarkas = create<KarkasState>((set, get) => {
  // push the current model onto the undo stack, then swap in + re-derive the next one. Structural
  // edits clear the selection (the tapped part id may be gone); property edits keep it (keepSel).
  const apply = (next: StructuralModel, keepSel = false): void =>
    set((s) => ({ ...derive(next, s.plan), past: [...s.past.slice(-49), s.model], future: [], selectedId: keepSel ? s.selectedId : null }));
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
    ...derive(buildDemoModel(), DEFAULT_PLAN),
    open: false,
    selectedId: null,
    selectedBlockIds: [],
    targetId: null,
    setTarget: (id) => set({ targetId: id }),
    // U3.2 — free assembly: a board that lives OUTSIDE the carcass sections, placed by its own box and
    // draggable anywhere (Moblo free-primitive). The engine already cuts + renders block.freeParts.
    addFreeBoard: () => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block) return;
      const bx = block.box;
      const w = Math.min(4000, Math.round(bx.w * 0.55)); // mm10
      const d = Math.min(3000, Math.round(bx.d * 0.6));
      const fp: FreePart = {
        id: `free_${Date.now().toString(36)}`,
        name: "Erkin taxta",
        role: "shelf",
        thicknessAxis: "y", // horizontal board (thickness along Y)
        // float it just ABOVE the carcass top, centred — clearly visible so the master grabs and drags it
        // down into place (U3.2b) instead of it hiding among the existing shelves.
        box: { x: Math.round((bx.w - w) / 2), y: bx.h + 1000, z: Math.round((bx.d - d) / 2), w, h: 160, d },
      };
      apply(addFreePartOp(s.model, block.id, fp));
      set({ selectedId: `${block.id}__free_${fp.id}` }); // select it so it highlights (and, in U3.2b, drags)
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
      const uid = Date.now().toString(36);
      const zone = fresh.zones[0];
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
        const first = byId.get(order[0]);
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
    moveFreePart: (fpId, delta, first) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block || !block.freeParts) return;
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: clampFreeBox({ ...f.box, x: f.box.x + delta.x, y: f.box.y + delta.y, z: f.box.z + delta.z }, block.box) })),
        })),
      };
      // `first` opens ONE undo step; later drag frames just replace it, so a drag isn't 100 undo entries.
      if (first) set((st) => ({ ...derive(model, st.plan), past: [...st.past.slice(-49), st.model], future: [] }));
      else set((st) => ({ ...derive(model, st.plan) }));
    },
    // U3.2c — on drop, snap the board flush to any nearby compartment face (magnet). Part of the same
    // drag undo step (a plain set, no new past entry), so one drag = one undo.
    snapFreePart: (fpId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const fp = block.freeParts.find((f) => f.id === fpId);
      if (!fp) return;
      const secBoxes: XBox[] = [];
      for (const z of block.zones) for (const sec of leafSections(z.root)) secBoxes.push(sec.box);
      const snapped = snapFreeBox(fp.box, secBoxes, 400); // 400 mm10 = 40 mm pull
      if (snapped.x === fp.box.x && snapped.y === fp.box.y && snapped.z === fp.box.z) return; // already flush
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: { ...f.box, x: snapped.x, y: snapped.y, z: snapped.z } })),
        })),
      };
      set((st) => ({ ...derive(model, st.plan) }));
    },
    resizeFreeBoard: (fpId, dim, mm) => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block?.freeParts) return;
      const v = Math.max(30, Math.round(mm * 10)); // mm → mm10, min 3 mm
      const model: StructuralModel = {
        ...s.model,
        blocks: s.model.blocks.map((b) => (b.id !== block.id ? b : {
          ...b,
          freeParts: b.freeParts!.map((f) => (f.id !== fpId ? f : { ...f, box: clampFreeBox({ ...f.box, [dim]: v }, block.box) })),
        })),
      };
      apply(model, true); // keep the board selected while resizing
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
            return { ...f, thicknessAxis: next, box };
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
    removeFreeBoard: (fpId) => {
      const s = get();
      const block = s.model.blocks[0];
      if (block) apply(removeFreePartOp(s.model, block.id, fpId));
    },
    past: [],
    future: [],
    plan: DEFAULT_PLAN,
    materialPool: planDecors(DEFAULT_PLAN),
    pendingBinding: null,
    editingBlockId: null,
    fromCabinet: false,
    // 7b — a plan decor change also changes that role's thickness → re-derive the parts. A manual decor
    // pick is an explicit choice, so it joins the material pool (only LIBRARY imports are gated, §3.2).
    setPlanMaterial: (slot, id) => set((s) => { const plan = { ...s.plan, [slot]: id }; return { plan, materialPool: [...new Set([...s.materialPool, id])], ...derive(s.model, plan) }; }),
    // a fresh model (new block / template) is NOT tied to a placed project block → clear the link.
    // meta.fromCabinet marks a converter copy of an existing kitchen module (saving adds a copy).
    openWith: (model, plan, meta) => set((s) => { const p = plan ?? s.plan; return { ...derive(model, p), plan: p, materialPool: planDecors(p), pendingBinding: null, lockedQuote: null, exportOverride: false, selectedHole: null, open: true, selectedId: null, past: [], future: [], editingBlockId: null, fromCabinet: meta?.fromCabinet ?? false }; }),
    setModel: (model) => set((s) => ({ ...derive(model, s.plan), selectedId: null, selectedBlockIds: [], past: [], future: [], editingBlockId: null, fromCabinet: false, lockedQuote: null, exportOverride: false, selectedHole: null })),
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
      if (t) apply(addInstance(get().model, t, kind, opts));
    },
    remove: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (r) apply(removeInstance(s.model, r.inst.id));
    },
    setHinge: (edge) => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      if (r) apply(setHingeEdge(s.model, r.inst.id, edge), true); // keepSel — same door, just re-hinged
    },
    selectedComponent: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      return r ? r.block.components.find((c) => c.id === r.inst.componentId) ?? null : null;
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
      const b = m.blocks[0];
      if (!b) return;
      const mm10 = Math.max(1, Math.round(mm)) * 10;
      const next =
        dim === "w" ? resizeBlockWidth(m, b.id, mm10)
        : dim === "h" ? resizeBlockHeight(m, b.id, mm10)
        : resizeBlockDepth(m, b.id, mm10);
      if (next !== m) apply(next);
    },
    moveLine: (lineId, delta, scope, pushHistory) => {
      const s = get();
      let next: StructuralModel;
      try { next = moveLineOp(s.model, lineId, delta, scope); } catch { return; } // dragging past a collapse/edge limit — ignore, don't crash
      if (next === s.model) return; // no-op (0 delta)
      if (pushHistory) apply(next, true); // first drag frame → one undo step, keep the selection
      else set((st) => ({ ...derive(next, st.plan), selectedId: st.selectedId })); // live frame → no history
    },
    resizeDrag: (dim, extentMm10, pushHistory) => {
      const s = get();
      const b = s.model.blocks[0];
      if (!b) return;
      const mm10 = Math.max(300, Math.round(extentMm10)); // clamp to ≥30mm so a drag never collapses it
      let next: StructuralModel;
      try {
        next = dim === "w" ? resizeBlockWidth(s.model, b.id, mm10) : dim === "h" ? resizeBlockHeight(s.model, b.id, mm10) : resizeBlockDepth(s.model, b.id, mm10);
      } catch { return; }
      if (next === s.model) return;
      if (pushHistory) apply(next, true);
      else set((st) => ({ ...derive(next, st.plan), selectedId: st.selectedId }));
    },
    zoneRow: () => {
      const s = get();
      const block = s.model.blocks[0];
      if (!block) return null;
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
      const axis = block.lines.find((l) => l.id === parent!.dividers[0])?.axis ?? "y";
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
    jointFindings: () => {
      const s = get();
      return checkJointConstraints(solveModelToParts(s.model, planThickness(s.plan)), s.jointProfile().minEdgeMargin_mm10);
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
        return { ...derive(prev, s.plan), past: s.past.slice(0, -1), future: [...s.future, s.model], selectedId: null };
      }),
    canUndo: () => get().past.length > 0,
    redo: () =>
      set((s) => {
        const next = s.future[s.future.length - 1];
        if (!next) return {};
        return { ...derive(next, s.plan), past: [...s.past, s.model], future: s.future.slice(0, -1), selectedId: null };
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
      const plan = data.plan ?? DEFAULT_PLAN;
      // §3.2 — a library block may carry decors the project pool lacks; flag them for the map-or-create
      // prompt (the block still loads so it's visible; resolveBinding/cancelBinding reconciles the pool).
      const foreign = foreignDecors(get().materialPool, data.model, plan);
      // reset the FULL edit context on load (Step 12 audit fix): future[] (else redo restores the previous
      // project), and the manufacturing exportOverride / selectedHole (else block A's override leaks to B).
      set({ ...derive(data.model, plan), plan, selectedId: null, past: [], future: [], exportOverride: false, selectedHole: null, open: true, editingBlockId: blockId ?? null, fromCabinet: false, pendingBinding: foreign.length ? { foreign } : null, lockedQuote: data.lockedQuote ?? null });
    },
    resolveBinding: (mapping) => {
      const s = get();
      const bound = bindBlockMaterials(s.model, s.plan, mapping);
      const kept = Object.entries(mapping).filter(([, t]) => t === null).map(([f]) => f); // "create new var"
      set({ ...derive(bound.model, bound.plan), plan: bound.plan, materialPool: [...new Set([...s.materialPool, ...kept])], pendingBinding: null });
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
