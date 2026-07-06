// Layer-1 primitive: shelfPinPattern.
// Pure geometry. Every millimetre comes from the spec — NO numeric literals here.
//
// Convention (mm10, X along Length = cabinet height, Y along Width = depth):
// for each shelf position along X, drill a front-row and a back-row Ø-pin hole on
// Face A. The rows are set back from the panel's Y edges by the System-32 setbacks.

import type { mm10, DrillOp, PanelFace } from "../contracts/types.js";
import { mmToMm10 } from "../core/units.js";
import type { Panel, ShelfPinSpec, System32Spec } from "./types.js";

export function shelfPinPattern(
  sidePanel: Panel,
  shelfPositionsX: mm10[],
  spec: { pin: ShelfPinSpec; system32: System32Spec },
  /** which face to drill — a divider carries a shelf column on EACH side, so it is drilled on both
   *  faces (one per adjacent column). An outer side is drilled on its inner face only (default A). */
  face: PanelFace = "A",
): DrillOp[] {
  const diameter = mmToMm10(spec.pin.diameter);
  const depth = mmToMm10(spec.pin.depth);
  const frontY = mmToMm10(spec.system32.frontRowSetback);
  const backY = sidePanel.width_mm10 - mmToMm10(spec.system32.backRowSetback);

  const ops: DrillOp[] = [];
  let seq = 0;
  for (const x of shelfPositionsX) {
    for (const y of [frontY, backY]) {
      ops.push({
        op: "drill",
        id: `pin_${sidePanel.id}_${face}_${seq++}`,
        face,
        x_mm10: x,
        y_mm10: y,
        diameter_mm10: diameter,
        depth_mm10: depth,
        source: "auto",
      });
    }
  }
  return ops;
}
