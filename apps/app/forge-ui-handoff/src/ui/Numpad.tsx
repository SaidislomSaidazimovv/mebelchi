// The numpad sheet — the second half of the universal rule.
//
// Laid out from F2-03: the current value sits top-left ALREADY SELECTED (so the first
// keypress replaces it), a big blue ✓ commits, × dismisses. Digits on the left,
// `( ) / × − +` down the right — the numpad does arithmetic, which is DB/19's
// "type-first numpad does math (720-2*18)" and the reason expr-eval is a dependency.
//
// This is a sheet, not a modal: it does not block the scene, and dismissing it never
// discards the edit it was opened from. DB/35 §1 — zero popups.

import { useState } from "react";
import { evalCmToMm10, evalDeg, toCm, toDeg } from "./measure";
import type { mm10 } from "../contract/types";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"];
const OPS = ["(", ")", "/", "×", "−", "+"];

export interface NumpadProps {
  /** What the chip showed when it was tapped. Pre-filled and pre-selected. */
  initial: mm10 | number;
  label: string;
  /** "deg" swaps the evaluator and snaps to quarter turns — see evalDeg. */
  mode?: "cm" | "deg";
  onCommit: (value: number) => void;
  onCancel: () => void;
}

export function Numpad({ initial, label, mode = "cm", onCommit, onCancel }: NumpadProps) {
  const fmt = mode === "deg" ? toDeg : toCm;
  const evaluate = mode === "deg" ? evalDeg : evalCmToMm10;
  const unit = mode === "deg" ? "°" : "см";
  const [draft, setDraft] = useState(fmt(initial));
  // "Pre-selected" as F2-03 shows it: the first keypress replaces the whole value
  // instead of appending to it. After that, typing appends normally.
  const [fresh, setFresh] = useState(true);

  const preview = evaluate(draft);
  const valid = preview !== null && (mode === "deg" ? true : preview > 0);

  const press = (k: string) => {
    if (k === "⌫") {
      setFresh(false);
      setDraft((d) => d.slice(0, -1));
      return;
    }
    setDraft((d) => (fresh ? k : d + k));
    setFresh(false);
  };

  return (
    <div className="numpad-sheet">
      <div className="numpad-head">
        <div className="numpad-field">
          <span className="numpad-label">{label}</span>
          <span className={`numpad-value${fresh ? " sel" : ""}${valid || draft === "" ? "" : " bad"}`}>
            {draft || "0"}
          </span>
          {/* An expression shows its result before you commit it. */}
          {/* An expression — or a snapped angle — shows its result before you commit. */}
          {preview !== null && draft !== fmt(preview) && (
            <span className="numpad-preview">= {fmt(preview)} {unit}</span>
          )}
        </div>
        <button
          className="numpad-ok"
          disabled={!valid}
          onClick={() => valid && onCommit(preview!)}
          title="Применить"
        >
          ✓
        </button>
        <button className="numpad-x" onClick={onCancel} title="Закрыть">×</button>
      </div>

      <div className="numpad-body">
        <div className="numpad-keys">
          {KEYS.map((k) => (
            <button key={k} className="numpad-key" onClick={() => press(k)}>{k}</button>
          ))}
        </div>
        <div className="numpad-ops">
          {OPS.map((o) => (
            <button key={o} className="numpad-op" onClick={() => press(o)}>{o}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
