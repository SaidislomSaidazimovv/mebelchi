// three/karkasStore.ts — the StructuralModel editing state (Phase 3 + 4). A small, SEPARATE
// zustand store from the kitchen `store.ts`, so the karkas-block editor is fully parallel and the
// kitchen Cell flow is never touched. Holds one StructuralModel + its derived render/manufacturing
// data, the focused-editor open flag, the selection, and an undo stack. Editing actions (Phase 4)
// call the engine's PURE immutable operations (divideSection / addInstance) and re-derive.

import { create } from "zustand";
import type { StructuralModel, Component, Block, Instance } from "../../../../engine/contracts/structure.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { leafSections, type Section } from "../../../../engine/contracts/structure.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildDemoModel } from "../../../../engine/structure/demoModel.js";
import { divideSection, addInstance, removeInstance, setLoadBearing, setComponentThickness, setComponentMaterial, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth, type AddKind, type AddOpts } from "../../../../engine/structure/operations.js";
import { checkStability } from "../../../../engine/structure/stability.js";
import { checkMotionClearance } from "../../../../engine/structure/motion.js";
import { checkHingeFit } from "../../../../engine/structure/hingeFit.js";
import { layoutToScene, type Scene } from "./structureScene";
import { DEFAULT_PLAN, type MaterialPlan } from "./materials";

/** Everything the 3D viewport + readouts need, recomputed whenever the model changes. */
interface Derived {
  model: StructuralModel;
  parts: Part[]; // manufacturing leaves (for the future price / cut list / CNC)
  scene: Scene; // positioned render boxes (metres)
  warnings: string[]; // non-blocking engineering ⚠ (stability + motion + hinge fit), Russian text
  sections: { id: string; label: string }[]; // leaf sections you can add into (the add-target picker)
}
function derive(model: StructuralModel): Derived {
  const warnings = [
    ...checkStability(model),
    ...checkMotionClearance(model),
    ...checkHingeFit(model),
  ].map((f) => f.message_ru);
  const sections: { id: string; label: string }[] = [];
  for (const b of model.blocks) for (const z of b.zones) for (const s of leafSections(z.root)) sections.push({ id: s.id, label: `${sections.length + 1}` });
  return { model, parts: solveStructure(model), scene: layoutToScene(solveLayout(model)), warnings, sections };
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
  past: StructuralModel[];
  /** Which decor each panel role is cut from (drives the spec price). Persists across model edits. */
  plan: MaterialPlan;
  setPlanMaterial: (slot: keyof MaterialPlan, id: string) => void;
  openWith: (model: StructuralModel) => void;
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
  /** Toggle the selected component's load-bearing declaration (drives the stability ⚠). */
  toggleLoadBearing: () => void;
  /** Set the selected component's per-part board thickness in mm (C4). */
  setThickness: (mm: number) => void;
  /** Set (or clear with null) the selected component's per-part material decor key (F2). */
  setMaterial: (id: string | null) => void;
  /** Set the block's width / height / depth in mm (C2). Content reflows proportionally. */
  resize: (dim: "w" | "h" | "d", mm: number) => void;
  /** Revert the last edit. */
  undo: () => void;
  canUndo: () => boolean;
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
}

/** The on-disk project shape (P7). Versioned so a future schema change can migrate. */
interface ProjectFile {
  version: 1;
  model: StructuralModel;
  plan: MaterialPlan;
}

export const useKarkas = create<KarkasState>((set, get) => {
  // push the current model onto the undo stack, then swap in + re-derive the next one. Structural
  // edits clear the selection (the tapped part id may be gone); property edits keep it (keepSel).
  const apply = (next: StructuralModel, keepSel = false): void =>
    set((s) => ({ ...derive(next), past: [...s.past.slice(-49), s.model], selectedId: keepSel ? s.selectedId : null }));
  // the section an edit targets: the section of the selected panel's instance, else the first leaf.
  const targetSection = (): string | undefined => {
    const s = get();
    if (s.targetId && s.sections.some((x) => x.id === s.targetId)) return s.targetId; // explicit pick / last tap
    const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
    return r ? r.inst.sectionId : firstLeafId(s.model);
  };
  return {
    ...derive(buildDemoModel()),
    open: false,
    selectedId: null,
    targetId: null,
    setTarget: (id) => set({ targetId: id }),
    past: [],
    plan: DEFAULT_PLAN,
    editingBlockId: null,
    setPlanMaterial: (slot, id) => set((s) => ({ plan: { ...s.plan, [slot]: id } })),
    // a fresh model (new block / template) is NOT tied to a placed project block → clear the link
    openWith: (model) => set({ ...derive(model), open: true, selectedId: null, past: [], editingBlockId: null }),
    setModel: (model) => set({ ...derive(model), selectedId: null, past: [], editingBlockId: null }),
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
    selectedComponent: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      return r ? r.block.components.find((c) => c.id === r.inst.componentId) ?? null : null;
    },
    toggleLoadBearing: () => {
      const comp = get().selectedComponent();
      if (comp) apply(setLoadBearing(get().model, comp.id, !(comp.loadBearing === true)), true);
    },
    setThickness: (mm) => {
      const comp = get().selectedComponent();
      if (comp) apply(setComponentThickness(get().model, comp.id, Math.max(1, Math.round(mm)) * 10), true);
    },
    setMaterial: (id) => {
      const comp = get().selectedComponent();
      if (comp) apply(setComponentMaterial(get().model, comp.id, id), true);
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
    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        return { ...derive(prev), past: s.past.slice(0, -1), selectedId: null };
      }),
    canUndo: () => get().past.length > 0,
    exportProject: () => {
      const s = get();
      const file: ProjectFile = { version: 1, model: s.model, plan: s.plan };
      return JSON.stringify(file, null, 2);
    },
    importProject: (json, blockId) => {
      const data = JSON.parse(json) as Partial<ProjectFile>;
      if (!data || !data.model || !Array.isArray(data.model.blocks)) {
        throw new Error("BAD_PROJECT: not a karkas project file");
      }
      set({ ...derive(data.model), plan: data.plan ?? DEFAULT_PLAN, selectedId: null, past: [], open: true, editingBlockId: blockId ?? null });
    },
  };
});
