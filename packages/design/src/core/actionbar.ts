// Phase 1.3 — the add-affordances. A minimal on-screen bar: with a cabinet
// selected, add a shelf / a divider / toggle a door. Shared by all variants
// (the variants differ in the RESIZE gesture, not in adds). The UI is deliberately
// plain — the founder said "don't mind the UI now".
//
// LAW: every button routes through a pure design edit (addShelf/addDivider/
// toggleDoor) → app.commit → re-decompose. No panel is touched. The target is the
// CABINET that owns the selection (findCabinetOf), resolved by nodeId.

import type { AppController } from "./app.ts";
import { addDivider, addShelf, findCabinetOf, toggleDoor } from "./designModel.ts";

export function createActionBar(app: AppController): () => void {
  const bar = document.createElement("div");
  bar.style.cssText = [
    "position:fixed", "left:50%", "bottom:16px", "transform:translateX(-50%)",
    "z-index:20", "display:flex", "gap:8px",
    "font:600 14px system-ui,sans-serif",
  ].join(";");

  const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = [
      "padding:11px 15px", "border-radius:12px", "border:1px solid #2a3a36",
      "background:#1f2b28", "color:#e8ecec", "cursor:pointer", "touch-action:manipulation",
    ].join(";");
    b.addEventListener("click", onClick);
    return b;
  };

  const cabId = (): string | null => findCabinetOf(app.history.project, app.selectedNodeId)?.nodeId ?? null;

  const addShelfBtn = mkBtn("+ Polka", () => { const c = cabId(); if (c) app.commit(addShelf(app.history.project, c)); });
  const addDivBtn = mkBtn("+ Toʻsiq", () => { const c = cabId(); if (c) app.commit(addDivider(app.history.project, c)); });
  const doorBtn = mkBtn("Eshik", () => { const c = cabId(); if (c) app.commit(toggleDoor(app.history.project, c)); });

  // Undo / redo — driven by History, NOT by selection. app.undo/redo already
  // rerender + emitChange, so `refresh` below re-derives their enabled-state.
  const undoBtn = mkBtn("↶", () => app.undo());
  const redoBtn = mkBtn("↷", () => app.redo());

  bar.append(undoBtn, redoBtn, addShelfBtn, addDivBtn, doorBtn);
  document.body.appendChild(bar);

  const setEnabled = (b: HTMLButtonElement, on: boolean) => {
    b.disabled = !on;
    b.style.opacity = on ? "1" : "0.4";
    b.style.cursor = on ? "pointer" : "default";
  };

  // Add actions need a cabinet under selection; undo/redo track the history stack.
  const refresh = () => {
    const hasCab = cabId() !== null;
    for (const b of [addShelfBtn, addDivBtn, doorBtn]) setEnabled(b, hasCab);
    setEnabled(undoBtn, app.history.canUndo());
    setEnabled(redoBtn, app.history.canRedo());
  };
  refresh();
  const offChange = app.onChange(refresh);

  // Teardown: drop the change-listener BEFORE removing the DOM, so a re-mount
  // never leaves a stale `refresh` firing against detached buttons (Watcher 1.4 #1).
  return () => { offChange(); bar.remove(); };
}
