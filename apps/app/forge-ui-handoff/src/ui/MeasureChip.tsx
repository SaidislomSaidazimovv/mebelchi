import { toCm, toDeg, type MeasureTone } from "./measure";
import type { mm10 } from "../contract/types";

export interface MeasureChipProps {
  value: mm10 | number;
  tone: MeasureTone;

  unit?: "cm" | "deg";

  live?: boolean;

  locked?: boolean;
  onToggleLock?: () => void;

  onEdit?: () => void;
  title?: string;
}

export function MeasureChip({
  value, tone, unit = "cm", live = false, locked, onToggleLock, onEdit, title
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
        title={title}>

        <span className="chip-value">{text}</span>
        {unit === "deg" && <span className="chip-unit">°</span>}
        {}
        {editable && <span className="chip-pen">✎</span>}
      </button>
      {locked !== undefined &&
      <button
        type="button"
        className={`chip-lock${locked ? " on" : ""}`}
        onClick={onToggleLock}
        title={locked ? "Закреплено" : "Не закреплено"}>

          {locked ? "🔒" : "🔓"}
        </button>
      }
    </span>);

}
