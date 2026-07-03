// three/karkasStore.ts — the StructuralModel editing state (Phase 3 + 4). A small, SEPARATE
// zustand store from the kitchen `store.ts`, so the karkas-block editor is fully parallel and the
// kitchen Cell flow is never touched. Holds one StructuralModel + its derived render/manufacturing
// data, the focused-editor open flag, the selection, and an undo stack. Editing actions (Phase 4)
// call the engine's PURE immutable operations (divideSection / addInstance) and re-derive.

import { create } from "zustand";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { leafSections, type Section } from "../../../../engine/contracts/structure.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildDemoModel } from "../../../../engine/structure/demoModel.js";
import { divideSection, addInstance, selectByTap, type AddKind } from "../../../../engine/structure/operations.js";
import { layoutToScene, type Scene } from "./structureScene";

/** Everything the 3D viewport + readouts need, recomputed whenever the model changes. */
interface Derived {
  model: StructuralModel;
  parts: Part[]; // manufacturing leaves (for the future price / cut list / CNC)
  scene: Scene; // positioned render boxes (metres)
}
function derive(model: StructuralModel): Derived {
  return { model, parts: solveStructure(model), scene: layoutToScene(solveLayout(model)) };
}

/** First leaf section of the model (the default edit target when nothing is selected). */
function firstLeafId(model: StructuralModel): string | undefined {
  for (const b of model.blocks) {
    for (const z of b.zones) {
      const leaves = leafSections(z.root);
      if (leaves.length) return leaves[0].id;
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
  return s.children.length ? firstLeafUnder(s.children[0]) : s;
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
  openWith: (model: StructuralModel) => void;
  setModel: (model: StructuralModel) => void;
  close: () => void;
  tapPart: (id: string | null) => void;
  /** Split the target section into two (a vertical divider). */
  divide: () => void;
  /** Add a shelf / door / divider / drawer to the target section. */
  add: (kind: AddKind) => void;
  /** Revert the last edit. */
  undo: () => void;
  canUndo: () => boolean;
}

export const useKarkas = create<KarkasState>((set, get) => {
  // push the current model onto the undo stack, then swap in + re-derive the next one
  const apply = (next: StructuralModel): void =>
    set((s) => ({ ...derive(next), past: [...s.past.slice(-49), s.model], selectedId: null }));
  // the section an edit targets: the section of the selected panel's instance, else the first leaf.
  // (Selection carries instanceIds, not a sectionId — we look the instance up to find its section.)
  const targetSection = (): string | undefined => {
    const s = get();
    if (s.selectedId) {
      const instId = selectByTap(s.model, s.selectedId)?.instanceIds[0];
      if (instId) {
        for (const b of s.model.blocks) {
          const inst = b.instances.find((i) => i.id === instId);
          if (inst) return inst.sectionId;
        }
      }
    }
    return firstLeafId(s.model);
  };
  return {
    ...derive(buildDemoModel()),
    open: false,
    selectedId: null,
    past: [],
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
    add: (kind) => {
      const t = targetSection();
      if (t) apply(addInstance(get().model, t, kind));
    },
    undo: () =>
      set((s) => {
        if (!s.past.length) return {};
        const prev = s.past[s.past.length - 1];
        return { ...derive(prev), past: s.past.slice(0, -1), selectedId: null };
      }),
    canUndo: () => get().past.length > 0,
  };
});
