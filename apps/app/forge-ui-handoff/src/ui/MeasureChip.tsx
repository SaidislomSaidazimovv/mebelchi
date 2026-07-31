// The measurement chip — the atom every Forge tool is assembled from.
//
// Read straight off the F1–F7 reference shots. Three states, one component:
//   LIVE     solid pill, white text, no affordance — it is moving right now (F1 `20,9`)
//   RESTING  pill + ✏️ — the number STAYED and can be typed into (F2-04 `28,5 ✏️`)
//   LOCKED   a resting chip paired with a padlock (F6/F7 `7,05 ✏️` 🔓)
//
// Tone carries meaning, not decoration:
//   live=green · size=red · offset=grey · angle=blue · radius=white
// The same colours the shots use, so a red number always means "a size this edit owns"
// and a grey one always means "a distance to something else".

import { toCm, toDeg, type MeasureTone } from "./measure";
import type { mm10 } from "../contract/types";

export interface MeasureChipProps {
  value: mm10 | number;
  tone: MeasureTone;
  /** Degrees skip the cm conversion and render whole (F3 `-25`). */
  unit?: "cm" | "deg";
  /** Live chips are read-only by definition — the gesture IS the input. */
  live?: boolean;
  /** Show a padlock beside the chip. `undefined` = this measure isn't lockable. */
  locked?: boolean;
  onToggleLock?: () => void;
  /** Opens the numpad. Absent → the chip is a readout. */
  onEdit?: () => void;
  title?: string;
}

export function MeasureChip({
  value, tone, unit = "cm", live = false, locked, onToggleLock, onEdit, title,
}: MeasureChipProps) {
  const text = unit === "deg" ? toDeg(value) : toCm(value);
  const editable = !live && !!onEdit;

  return (
    <span className="chip-group">
      <button
        type="button"
        className={`chip chip-${tone}`}
        onClick={editable ? onEdit : undefined}
        disabled={!editable}
        title={title}
      >
        <span className="chip-value">{text}</span>
        {unit === "deg" && <span className="chip-unit">°</span>}
        {/* the ✏️ is the whole promise of the universal rule: this number is typeable */}
        {editable && <span className="chip-pen">✎</span>}
      </button>
      {locked !== undefined && (
        <button
          type="button"
          className={`chip-lock${locked ? " on" : ""}`}
          onClick={onToggleLock}
          title={locked ? "Закреплено" : "Не закреплено"}
        >
          {locked ? "🔒" : "🔓"}
        </button>
      )}
    </span>
  );
}
