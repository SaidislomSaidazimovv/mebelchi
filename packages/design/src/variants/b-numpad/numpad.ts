// Variant B — tap-then-numpad. Tap a panel to select its cabinet, then TYPE the
// size on an on-screen numpad: pick a dimension (Eni / Boʻyi / Chuqurlik), key in
// millimetres, press OK. This is the variant's whole identity — "resize by typing a
// number", the precise counterpart to Variant A's grab-and-drag.
//
// LAW (27 / TASK): the numpad never touches a panel. OK routes through the pure
// `resize` mutation on the CABINET's DesignNode.size (mm), asks the engine to
// re-decompose, and the scene re-stamps matrices. The target cabinet is resolved by
// nodeId (findCabinetOf), never by a part id. One OK = one commit = one undo entry.

import type { AppController } from "../../core/app.ts";
import { findCabinetOf, findNode, mm, resize } from "../../core/designModel.ts";

type Dim = "w" | "h" | "d";
const DIMS: ReadonlyArray<{ key: Dim; label: string; sizeKey: "w_mm10" | "h_mm10" | "d_mm10" }> = [
  { key: "w", label: "Eni", sizeKey: "w_mm10" },
  { key: "h", label: "Boʻyi", sizeKey: "h_mm10" },
  { key: "d", label: "Chuqurlik", sizeKey: "d_mm10" },
];
const MAX_DIGITS = 4; // millimetres — up to 9999 mm, plenty for one cabinet

export function wireNumpadB(app: AppController): () => void {
  const panel = document.createElement("div");
  panel.style.cssText = [
    "position:fixed", "right:16px", "top:16px", "z-index:20",
    "display:none", "flex-direction:column", "gap:8px", "width:210px", "padding:12px",
    "border-radius:14px", "border:1px solid #2a3a36", "background:#1b2522ee",
    "font:600 14px system-ui,sans-serif", "color:#e8ecec", "user-select:none",
  ].join(";");

  // ── dimension chips (which measurement the digits apply to) ────────────────
  const dimRow = document.createElement("div");
  dimRow.style.cssText = "display:flex;flex-direction:column;gap:6px";
  const chips = DIMS.map((d) => {
    const c = document.createElement("button");
    c.dataset.dim = d.key;
    c.style.cssText = [
      "display:flex", "justify-content:space-between", "align-items:center",
      "padding:9px 11px", "border-radius:9px", "border:1px solid #2a3a36",
      "background:#141d1b", "color:#e8ecec", "cursor:pointer", "font:inherit",
      "touch-action:manipulation",
    ].join(";");
    dimRow.appendChild(c);
    return c;
  });

  // ── numeric keypad ─────────────────────────────────────────────────────────
  const pad = document.createElement("div");
  pad.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:6px";
  const mkKey = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = [
      "padding:12px 0", "border-radius:9px", "border:1px solid #2a3a36",
      "background:#1f2b28", "color:#e8ecec", "cursor:pointer", "font:600 16px system-ui",
      "touch-action:manipulation",
    ].join(";");
    b.addEventListener("click", onClick);
    return b;
  };

  // Editing state: which dimension, and the digits typed SO FAR (empty = showing the
  // node's committed value, nothing entered yet).
  let activeDim: Dim = "w";
  let typed = "";

  const cab = () => {
    const id = findCabinetOf(app.history.project, app.selectedNodeId)?.nodeId ?? null;
    return id ? findNode(app.history.project.nodes, id) : null;
  };

  const commitTyped = () => {
    const node = cab();
    if (!node || typed === "") return;
    const millimetres = parseInt(typed, 10);
    if (!Number.isFinite(millimetres) || millimetres <= 0) { typed = ""; refresh(); return; }
    // One number → one commit → one undo entry. resize is pure; engine re-derives.
    // commit fires onChange, which clears `typed` and re-reads the committed value.
    app.commit(resize(app.history.project, node.nodeId, activeDim, mm(millimetres)));
  };

  const digits = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];
  for (const dgt of digits) {
    pad.appendChild(mkKey(dgt, () => {
      if (typed.length >= MAX_DIGITS) return;
      if (typed === "" && dgt === "0") return; // no leading zero
      typed += dgt;
      refresh();
    }));
  }
  pad.appendChild(mkKey("⌫", () => { typed = typed.slice(0, -1); refresh(); }));
  pad.appendChild(mkKey("0", () => {
    if (typed === "" || typed.length >= MAX_DIGITS) return; // no leading zero, cap length
    typed += "0";
    refresh();
  }));
  const okKey = mkKey("OK", () => commitTyped());
  okKey.style.background = "#2f6f5a";
  pad.appendChild(okKey);

  panel.append(dimRow, pad);
  document.body.appendChild(panel);

  // Selecting a chip switches which dimension the digits edit; clears the entry.
  for (const c of chips) {
    c.addEventListener("click", () => {
      activeDim = c.dataset.dim as Dim;
      typed = "";
      refresh();
    });
  }

  // Reflect selection + editing state. Hidden when no cabinet is under selection.
  function refresh(): void {
    const node = cab();
    if (!node) { panel.style.display = "none"; return; }
    panel.style.display = "flex";
    for (let i = 0; i < chips.length; i++) {
      const d = DIMS[i]!;
      const chip = chips[i]!;
      const committedMm = Math.round((node.size?.[d.sizeKey] ?? 0) / 10);
      const isActive = d.key === activeDim;
      // The active chip shows the digits being entered (or the committed value if the
      // entry is empty); the others always show their committed value.
      const shown = isActive && typed !== "" ? typed : String(committedMm);
      chip.innerHTML = `<span>${d.label}</span><span>${shown}<small style="opacity:.6"> mm</small></span>`;
      chip.style.borderColor = isActive ? "#2f6f5a" : "#2a3a36";
      chip.style.background = isActive ? "#173028" : "#141d1b";
    }
  }

  refresh();
  // Any change that DIDN'T come from a digit press — a selection, an OK commit, an
  // action-bar undo/redo — invalidates a half-typed entry: clear it and re-read the
  // committed values, so OK can never apply stale digits to a changed state, and the
  // chip never shows a typed value that outlived its edit. (Watcher 2 #1/#2.) Local
  // digit/⌫/dim edits call refresh() directly and keep `typed`.
  const offChange = app.onChange(() => { typed = ""; refresh(); });

  // Teardown: drop the change-listener before removing the DOM (mirrors the action bar).
  return () => { offChange(); panel.remove(); };
}
