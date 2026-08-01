import { useState } from "react";
import { evalCmToMm10, evalDeg, toCm, toDeg } from "./measure";
import type { mm10 } from "../contract/types";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"];
const OPS = ["(", ")", "/", "×", "−", "+"];

export interface NumpadProps {

  initial: mm10 | number;
  label: string;

  mode?: "cm" | "deg";
  onCommit: (value: number) => void;
  onCancel: () => void;
}

export function Numpad({ initial, label, mode = "cm", onCommit, onCancel }: NumpadProps) {
  const fmt = mode === "deg" ? toDeg : toCm;
  const evaluate = mode === "deg" ? evalDeg : evalCmToMm10;
  const unit = mode === "deg" ? "°" : "см";
  const [draft, setDraft] = useState(fmt(initial));

  const [fresh, setFresh] = useState(true);

  const preview = evaluate(draft);
  const valid = preview !== null && (mode === "deg" ? true : preview > 0);

  const press = (k: string) => {
    if (k === "⌫") {
      setFresh(false);
      setDraft((d) => d.slice(0, -1));
      return;
    }
    setDraft((d) => fresh ? k : d + k);
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
          {}
          {}
          {preview !== null && draft !== fmt(preview) &&
          <span className="numpad-preview">= {fmt(preview)} {unit}</span>
          }
        </div>
        <button
          className="numpad-ok"
          disabled={!valid}
          onClick={() => valid && onCommit(preview!)}
          title="Применить">

          ✓
        </button>
        <button className="numpad-x" onClick={onCancel} title="Закрыть">×</button>
      </div>

      <div className="numpad-body">
        <div className="numpad-keys">
          {KEYS.map((k) =>
          <button key={k} className="numpad-key" onClick={() => press(k)}>{k}</button>
          )}
        </div>
        <div className="numpad-ops">
          {OPS.map((o) =>
          <button key={o} className="numpad-op" onClick={() => press(o)}>{o}</button>
          )}
        </div>
      </div>
    </div>);

}
