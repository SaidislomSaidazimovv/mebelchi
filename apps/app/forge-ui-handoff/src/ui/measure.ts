import { Parser } from "expr-eval";
import type { mm10 } from "../contract/types";

const MM10_PER_CM = 100;

export function roundMm10(v: number): mm10 {
  return Math.round(v);
}

export function toCm(v_mm10: mm10): string {
  const cm = v_mm10 / MM10_PER_CM;
  return cm.
  toFixed(2).
  replace(/\.?0+$/, "").
  replace(".", ",");
}

export const toDeg = (v: number): string => String(Math.round(v));

const parser = new Parser();

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

export type MeasureTone =

"live" |

"size" |

"offset" |

"angle" |

"radius";
