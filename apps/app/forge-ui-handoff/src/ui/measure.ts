// The measurement layer — units, formatting, and the numpad's arithmetic.
//
// THE UNIVERSAL RULE (founder, from the F1–F7 reference shots):
//   while an edit is in progress, show where it started and how far it has moved;
//   when it is released, THE NUMBER STAYS and is tappable for manual entry.
// Every tool obeys this. That is why this file is shared, not per-tool.
//
// UNITS. The reference UI reads in CENTIMETRES with a comma — `20,9` · `4,85` · `1,6`
// (see "cutting and making hole info given in santimeters.png"). The engine is mm10
// (tenths of a millimetre, DB glossary). 1 cm = 100 mm10 exactly, so cm-with-2-decimals
// maps onto the mm10 grid with nothing left over: 4,85 cm → 485 mm10. No float drift,
// no rounding policy to argue about.

import { Parser } from "expr-eval";
import type { mm10 } from "../contract/types";

/** 1 cm = 100 mm10. The only conversion constant in the UI layer. */
const MM10_PER_CM = 100;

/**
 * mm10 → the string the user sees. Up to 2 decimals, trailing zeros trimmed,
 * comma separator: 2090 → "20,9" · 485 → "4,85" · 1600 → "16" · 0 → "0".
 */
export function toCm(v_mm10: mm10): string {
  const cm = v_mm10 / MM10_PER_CM;
  return cm
    .toFixed(2)
    .replace(/\.?0+$/, "")   // 20.90 → 20.9 → "20.9"; 16.00 → "16"
    .replace(".", ",");
}

/** Degrees are shown whole, with a sign: -25 → "-25". */
export const toDeg = (v: number): string => String(Math.round(v));

const parser = new Parser();

/**
 * Evaluate what was typed into the numpad and land it ON the mm10 grid.
 *
 * The numpad offers `( ) / × − +` (see F2-03), so "72-2*1,6" is a legal entry — the
 * master's real arithmetic, straight off DB/19's "type-first numpad does math" note.
 *
 * The rounding happens HERE and only here. The library decision (DB/33 R25) was
 * explicit: expr-eval, and "round every result to the mm10 grid at the call site —
 * wrap it once, call through it always." This is that wrapper. Nothing else in the
 * app may call `Parser` directly.
 *
 * Returns null for anything unparseable, so a typo never silently becomes 0.
 */
export function evalCmToMm10(input: string): mm10 | null {
  const src = input.trim().replace(/,/g, ".").replace(/×/g, "*").replace(/−/g, "-");
  if (src === "") return null;
  try {
    const value = parser.evaluate(src);
    if (typeof value !== "number" || !isFinite(value)) return null;
    return Math.round(value * MM10_PER_CM);
  } catch {
    return null;
  }
}

/**
 * Same evaluator, no cm conversion — degrees are whole numbers.
 *
 * CONSTRAINT worth knowing before you type 25 here: a panel's orientation is stored as
 * the contract's `PartOrientation` (an axis PAIR), which can only express the three
 * principal planes. An arbitrary angle has nowhere to live. So this rounds to the
 * nearest quarter turn, and the numpad shows you what it will actually apply before
 * you commit. Free rotation is a contract change (DB/35 §7), not a UI change.
 */
export function evalDeg(input: string): number | null {
  const src = input.trim().replace(/,/g, ".").replace(/×/g, "*").replace(/−/g, "-");
  if (src === "") return null;
  try {
    const value = parser.evaluate(src);
    if (typeof value !== "number" || !isFinite(value)) return null;
    return Math.round(value);
  } catch {
    return null;
  }
}

/** What a chip is measuring. Drives its colour, straight from the reference shots. */
export type MeasureTone =
  /** live delta during a drag — green pill, white text (F1) */
  | "live"
  /** a size the edit owns — red pill (F2-04 `28,5` · F7 `12,1`) */
  | "size"
  /** a distance to a neighbouring edge — grey pill, lockable (F6/F7 `7,05` 🔓) */
  | "offset"
  /** an angle — blue pill (F3 `-25`) */
  | "angle"
  /** a corner radius — white pill (F7 `0`) */
  | "radius";
