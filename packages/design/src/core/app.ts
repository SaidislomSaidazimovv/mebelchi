// The shared app controller. Holds the design (History), re-renders through the
// engine, and owns selection. Every variant builds on this; only the EDIT gesture
// (drag handles / numpad / seam-drag) differs, added per variant on top.
//
// The loop is always: mutate the design → History.push → rerender() → decompose →
// layout → scene.setPanels. A panel is never touched directly. Selection keys on
// nodeId (from the picked panel), never on a part id or instance index.

import { createScene, type Scene } from "../render/scene.ts";
import { layout, type PlacedPanel } from "../render/layout.ts";
import { decompose } from "./decompose.ts";
import { newProject } from "./designModel.ts";
import { History } from "./undo.ts";
import type { DesignProject } from "@mebelchi/construction/design";

export interface AppController {
  readonly scene: Scene;
  readonly history: History;
  /** The nodeId under selection, or null. */
  selectedNodeId: string | null;
  /** Decompose + lay out + push to the scene; returns the placed panels. Pass a
   *  transient project to PREVIEW it (e.g. a live drag) without recording history;
   *  omit to render the committed `history.project`. */
  rerender(project?: DesignProject): PlacedPanel[];
  /** Replace the current design (records it in history) and rerender. */
  commit(next: DesignProject): void;
  /** Select a node (or null to clear) and update the highlight. */
  select(nodeId: string | null): void;
  /** Register a variant's input-unbind so `dispose` tears it down too. */
  onDispose(unbind: () => void): void;
  /** Tear down input listeners and the scene. */
  dispose(): void;
}

export function startApp(): AppController {
  const scene = createScene();
  const history = new History(newProject());
  const teardowns: Array<() => void> = [];

  const app: AppController = {
    scene,
    history,
    selectedNodeId: null,

    rerender(project = history.project) {
      const result = decompose(project);
      const panels = layout(project.nodes, result);
      scene.setPanels(panels);
      scene.highlight(this.selectedNodeId); // keep the highlight across a rerender
      return panels;
    },

    commit(next) {
      history.push(next);
      this.rerender();
    },

    select(nodeId) {
      this.selectedNodeId = nodeId;
      scene.highlight(nodeId);
    },

    onDispose(unbind) {
      teardowns.push(unbind);
    },

    dispose() {
      for (const t of teardowns) t();
      scene.dispose();
    },
  };

  // Frame the camera on the panels rerender just produced — no second decompose.
  const panels = app.rerender();
  app.scene.frame(panels);

  app.onDispose(wireTapToSelect(app));
  return app;
}

/** Shared tap-to-select: a short press that doesn't move is a tap (select), not an
 *  orbit drag — so it never fights OrbitControls. Empty space clears the selection.
 *  Returns an unbind so the scene's dispose can tear the listeners down. */
function wireTapToSelect(app: AppController): () => void {
  const el = app.scene.renderer.domElement;
  let downX = 0, downY = 0, downT = 0;

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return; // ignore secondary fingers so a pinch is never a tap
    downX = e.clientX; downY = e.clientY; downT = performance.now();
  };
  const onUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    const held = performance.now() - downT;
    if (moved > 6 || held > 400) return; // an orbit/drag or long press — not a tap
    const panel = app.scene.pick(e.clientX, e.clientY);
    app.select(panel ? panel.nodeId : null);
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointerup", onUp);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointerup", onUp);
  };
}
