// three/karkasStore.ts — the StructuralModel editing state (Phase 3). A small, SEPARATE zustand
// store from the kitchen `store.ts`, so the karkas-block editor is fully parallel and the kitchen
// Cell flow is never touched. Holds one StructuralModel + its derived render/manufacturing data,
// plus the focused-editor open flag and the current selection. Editing operations (divide / add /
// material) wire into this in Phase 4; here it just loads a model, derives, and tracks selection.

import { create } from "zustand";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildDemoModel } from "../../../../engine/structure/demoModel.js";
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

interface KarkasState extends Derived {
  /** Focused karkas-block editor open over the constructor (like the fill editor). */
  open: boolean;
  /** Selected panel id (matches scene.boards[].id 1:1), or null. */
  selectedId: string | null;
  /** Load a model into the editor and open it. */
  openWith: (model: StructuralModel) => void;
  /** Replace the current model (re-derives), keeping the editor open. */
  setModel: (model: StructuralModel) => void;
  /** Close the editor (model stays loaded). */
  close: () => void;
  /** Select a panel by id (null clears). */
  tapPart: (id: string | null) => void;
}

export const useKarkas = create<KarkasState>((set) => ({
  ...derive(buildDemoModel()),
  open: false,
  selectedId: null,
  openWith: (model) => set({ ...derive(model), open: true, selectedId: null }),
  setModel: (model) => set({ ...derive(model), selectedId: null }),
  close: () => set({ open: false }),
  tapPart: (id) => set({ selectedId: id }),
}));
