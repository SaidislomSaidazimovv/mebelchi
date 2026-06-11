// mm10 fixed-point helpers. Conversion to/from float lives ONLY here and at the
// export/parse edges — never inside solver/validator logic (13 v2.0, 14 Part 2).

import type { mm10 } from "../contracts/types.js";

/** Parse a millimetre string (e.g. "486.000") into an mm10 integer (4860). */
export function mmStringToMm10(s: string): mm10 {
  const f = Number.parseFloat(s);
  if (!Number.isFinite(f)) throw new Error(`Not a number: "${s}"`);
  // Round to nearest tenth to absorb any trailing-decimal noise from the source.
  return Math.round(f * 10);
}

/** Convert a millimetre number (e.g. spec value 12.5) into an mm10 integer (125). */
export function mmToMm10(mm: number): mm10 {
  return Math.round(mm * 10);
}

/** Format an mm10 integer as a 3-decimal millimetre string ("486.000"). */
export function mm10ToMmString(v: mm10): string {
  return (v / 10).toFixed(3);
}

/**
 * Edge-banding thickness as SWJ008 writes it: zero is emitted with 6 decimals
 * ("0.000000"), any non-zero value with 3 ("1.000"). Reproduces the factory quirk
 * for byte-exact Fixture 0 confirmation.
 */
export function mm10ToEdgeString(v: mm10): string {
  return v === 0 ? "0.000000" : (v / 10).toFixed(3);
}
