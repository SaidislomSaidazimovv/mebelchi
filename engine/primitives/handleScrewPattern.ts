// Layer-1 primitive: handleScrewPattern (Ø4.5 handle screw holes). Pure geometry — every
// millimetre comes from the spec, NO numeric literals here (the one rule).
//
// GROUNDED Ø/depth: Ø4.5 × 17 through-hole (mined_dump_holeclasses.csv:16, real SHKOF…ESHIK door
// panels — M4 handle screws through a 16mm door). The POSITION is a PROVISIONAL standard (spec
// `verified:false`), mirroring System-32:
//   - a DOOR takes a vertical handle on its OPENING edge (opposite the hinge), `edgeOffset` in;
//   - a DRAWER front takes a horizontal handle, centred.
//   - a `bow` handle is a pair of screws `centres` apart; a `knob` is a single screw;
//     a `profile` (gola) and an absent handle drill nothing (a gola grips a milled lip).

import type { mm10, DrillOp } from "../contracts/types.js";
import type { HandleType } from "../contracts/structure.js";
import { mmToMm10 } from "../core/units.js";
import type { HandleSpec, Panel } from "./types.js";

/** How the handle sits on the panel: a door reads `openingEdge`, a drawer is always centred. */
export interface HandleLayout {
  type: HandleType;
  layout: "door" | "drawer";
  /** Door only: the panel's opening Y edge (opposite the hinge) the handle sits on. */
  openingEdge?: "y0" | "yMax";
}

export function handleScrewPattern(panel: Panel, opts: HandleLayout, spec: HandleSpec): DrillOp[] {
  // `bow` needs a screw pair, `knob` a single screw; `profile`/anything else drills nothing.
  const count = opts.type === "bow" ? 2 : opts.type === "knob" ? 1 : 0;
  if (count === 0) return [];

  const diameter = mmToMm10(spec.screw.diameter);
  const depth = mmToMm10(spec.screw.depth);
  const halfCentres = Math.round(mmToMm10(spec.centres) / 2);
  const offset = mmToMm10(spec.edgeOffset);

  // The handle's fixed axis (the line the screws sit on) and the pair's spread axis.
  let fixedX: mm10;
  let fixedY: mm10;
  let spread: "x" | "y";
  if (opts.layout === "door") {
    // Vertical handle on the opening edge (opposite the hinge); the pair spreads along the height (X).
    fixedY = opts.openingEdge === "y0" ? offset : panel.width_mm10 - offset;
    fixedX = Math.round(panel.length_mm10 / 2);
    spread = "x";
  } else {
    // Horizontal handle, centred; the pair spreads along the width (Y).
    fixedX = Math.round(panel.length_mm10 / 2);
    fixedY = Math.round(panel.width_mm10 / 2);
    spread = "y";
  }

  // A single screw sits on the fixed axis; a pair straddles it by ±halfCentres along the spread axis.
  const spreads: mm10[] = count === 2 ? [-halfCentres, halfCentres] : [0];
  return spreads.map((d, i) => ({
    op: "drill" as const,
    id: `handle_${panel.id}_${i}`,
    face: "A" as const,
    x_mm10: spread === "x" ? fixedX + d : fixedX,
    y_mm10: spread === "y" ? fixedY + d : fixedY,
    diameter_mm10: diameter,
    depth_mm10: depth,
    source: "auto" as const,
  }));
}
