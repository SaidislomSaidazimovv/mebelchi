// Layer 0 — catalog loader. Reads the hardware spec once (pure data, no logic).
// Primitives never import JSON or fs; they receive a typed spec object as a
// parameter. This is the seam where tomorrow's verified values slot in by editing
// the JSON only — never the primitive functions (15_PRIMITIVES_STEP2.md, "the one rule").

import raw from "./hardware_specs.dummy.json" with { type: "json" };
import type { HardwareSpec } from "../primitives/types.js";

// The JSON carries documentation keys (_README, comment_*) the type does not model;
// the cast narrows to the structural fields the primitives consume.
export const hardwareSpec = raw as unknown as HardwareSpec;

export function loadHardwareSpec(): HardwareSpec {
  return hardwareSpec;
}
