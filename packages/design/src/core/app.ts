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
  /** A variant's drag gesture sets this the moment it takes over the active pointer
   *  (crosses its dead-zone). The shared tap-to-select then ignores the trailing
   *  pointerup, so a small drag can never ALSO fire a tap — independent of each
   *  variant's dead-zone size. tap-to-select resets it. (Watcher Phase-1 #1.) */
  pointerConsumed: boolean;
  /** Decompose + lay out + push to the scene; returns the placed panels. Pass a
   *  transient project to PREVIEW it (e.g. a live drag) without recording history;
   *  omit to render the committed `history.project`. */
  rerender(project?: DesignProject): PlacedPanel[];
  /** Replace the current design (records it in history) and rerender. */
  commit(next: DesignProject): void;
  /** Step back / forward through the design snapshots, then rerender. No-op when
   *  the stack is empty. Both notify onChange so UI (button enablement) refreshes. */
  undo(): void;
  redo(): void;
  /** Select a node (or null to clear) and update the highlight. */
  select(nodeId: string | null): void;
  /** Register a variant's input-unbind so `dispose` tears it down too. */
  onDispose(unbind: () => void): void;
  /** Subscribe to state changes (selection / commit / undo). UI refreshes on this.
   *  Returns an unsubscribe so a UI component can drop its listener on teardown
   *  (else recreating it — e.g. a variant re-mount — leaks stale closures). */
  onChange(cb: () => void): () => void;
  /** Tear down input listeners and the scene. */
  dispose(): void;
}

export function startApp(): AppController {
  const scene = createScene();
  const history = new History(newProject());
  const teardowns: Array<() => void> = [];
  const changeListeners: Array<() => void> = [];
  const emitChange = () => { for (const cb of changeListeners) cb(); };

  const app: AppController = {
    scene,
    history,
    selectedNodeId: null,
    pointerConsumed: false,

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
      emitChange();
    },

    undo() {
      // history.undo() returns null when there's nothing to undo — skip the work.
      if (history.undo() === null) return;
      this.rerender(); // decompose the restored design; identity/geometry re-derive
      emitChange();     // Watcher 1.3 #1: refresh button enablement after undo/redo
    },

    redo() {
      if (history.redo() === null) return;
      this.rerender();
      emitChange();
    },

    select(nodeId) {
      this.selectedNodeId = nodeId;
      scene.highlight(nodeId);
      emitChange();
    },

    onDispose(unbind) {
      teardowns.push(unbind);
    },

    onChange(cb) {
      changeListeners.push(cb);
      return () => {
        const i = changeListeners.indexOf(cb);
        if (i >= 0) changeListeners.splice(i, 1);
      };
    },

    dispose() {
      // Isolate teardowns: one that throws must not strand the rest — or the scene's
      // own dispose (RAF/GL/DOM release) below. (Watcher Phase-1 #2.)
      for (const t of teardowns) {
        try { t(); } catch (err) { console.error("[app] a teardown threw during dispose", err); }
      }
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
    // A variant's drag already claimed this pointer — don't also treat the release
    // as a tap. Reset for the next gesture. (Closes the dead-zone/tap-threshold gap.)
    if (app.pointerConsumed) { app.pointerConsumed = false; return; }
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
