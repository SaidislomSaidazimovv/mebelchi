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
import { divideSection, addInstance, setLoadBearing, type AddKind, type AddOpts } from "../../../../engine/structure/operations.js";
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
}
function derive(model: StructuralModel): Derived {
  const warnings = [
    ...checkStability(model),
    ...checkMotionClearance(model),
    ...checkHingeFit(model),
  ].map((f) => f.message_ru);
  return { model, parts: solveStructure(model), scene: layoutToScene(solveLayout(model)), warnings };
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
  /** Add content to the target section; opts carry the 32mm doubled build / glazed-grid door (P6). */
  add: (kind: AddKind, opts?: AddOpts) => void;
  /** The Component behind the current selection (its doubled/glazed/loadBearing flags), or null. */
  selectedComponent: () => Component | null;
  /** Toggle the selected component's load-bearing declaration (drives the stability ⚠). */
  toggleLoadBearing: () => void;
  /** Revert the last edit. */
  undo: () => void;
  canUndo: () => boolean;
}

export const useKarkas = create<KarkasState>((set, get) => {
  // push the current model onto the undo stack, then swap in + re-derive the next one
  const apply = (next: StructuralModel): void =>
    set((s) => ({ ...derive(next), past: [...s.past.slice(-49), s.model], selectedId: null }));
  // the section an edit targets: the section of the selected panel's instance, else the first leaf.
  const targetSection = (): string | undefined => {
    const s = get();
    const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
    return r ? r.inst.sectionId : firstLeafId(s.model);
  };
  return {
    ...derive(buildDemoModel()),
    open: false,
    selectedId: null,
    past: [],
    plan: DEFAULT_PLAN,
    setPlanMaterial: (slot, id) => set((s) => ({ plan: { ...s.plan, [slot]: id } })),
    openWith: (model) => set({ ...derive(model), open: true, selectedId: null, past: [] }),
    setModel: (model) => set({ ...derive(model), selectedId: null, past: [] }),
    close: () => set({ open: false }),
    tapPart: (id) => set({ selectedId: id }),
    divide: () => {
      const t = targetSection();
      if (!t) return;
      const model = get().model;
      // Splitting a section un-leafs it, orphaning any instances it held (their sectionId no longer
      // resolves to a leaf, so they stop emitting parts). Preserve them: after the split, re-home the
      // orphans into the first child leaf so nothing silently disappears.
      const orphanIds = new Set(
        model.blocks.flatMap((b) => b.instances.filter((i) => i.sectionId === t).map((i) => i.id)),
      );
      let next = divideSection(model, t, { kind: "equal", axis: "x", count: 2 });
      const divided = findSection(next, t);
      if (divided && orphanIds.size) next = rehomeInstances(next, orphanIds, firstLeafUnder(divided).id);
      apply(next);
    },
    add: (kind, opts) => {
      const t = targetSection();
      if (t) apply(addInstance(get().model, t, kind, opts));
    },
    selectedComponent: () => {
      const s = get();
      const r = s.selectedId ? resolveInstance(s.model, s.selectedId) : null;
      return r ? r.block.components.find((c) => c.id === r.inst.componentId) ?? null : null;
    },
    toggleLoadBearing: () => {
      const comp = get().selectedComponent();
      if (comp) apply(setLoadBearing(get().model, comp.id, !(comp.loadBearing === true)));
    },
    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return {};
        return { ...derive(prev), past: s.past.slice(0, -1), selectedId: null };
      }),
    canUndo: () => get().past.length > 0,
  };
});
