// Layer-1 primitive: hingeCupPattern (Ø35 cup + mounting screw holes).
// Pure geometry. Every millimetre comes from the spec — NO numeric literals here.
//
// NOTE: no factory door panel exists yet, so this primitive is UNVERIFIED against
// ground truth (15_PRIMITIVES_STEP2.md). Its spec values are research estimates.
// Per hinge it emits: 1 cup on the interior face (Face B), set in cupCenterFromDoorEdge
// from the hinge edge, plus spec.mountingHoles.count screws straddling the cup in Y.

import type { mm10, DrillOp } from "../contracts/types.js";
import { mmToMm10 } from "../core/units.js";
import type { HingeSpec, Panel } from "./types.js";

/** Symmetric Y offsets of the mounting screws, in mm10, ranging −spacing..+spacing. */
function mountingOffsets(count: number, spacing_mm10: mm10): mm10[] {
  if (count <= 1) return [0];
  const offsets: mm10[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i * 2) / (count - 1) - 1; // -1 .. +1
    offsets.push(Math.round(t * spacing_mm10));
  }
  return offsets;
}

export function hingeCupPattern(
  doorPanel: Panel,
  hingeSide: "left" | "right",
  hingePositionsY: mm10[],
  spec: HingeSpec,
): DrillOp[] {
  const cupDiameter = mmToMm10(spec.cup.diameter);
  const cupDepth = mmToMm10(spec.cup.depth);
  const cupFromEdge = mmToMm10(spec.cupCenterFromDoorEdge);
  const screwDiameter = mmToMm10(spec.mountingHoles.diameter);
  const screwDepth = mmToMm10(spec.mountingHoles.depth);
  const offsets = mountingOffsets(
    spec.mountingHoles.count,
    mmToMm10(spec.mountingHoles.spacingFromCupCenter),
  );

  const cupX =
    hingeSide === "left" ? cupFromEdge : doorPanel.length_mm10 - cupFromEdge;

  const ops: DrillOp[] = [];
  let seq = 0;
  for (const cupY of hingePositionsY) {
    ops.push({
      op: "drill",
      id: `cup_${doorPanel.id}_${seq}`,
      face: "B",
      x_mm10: cupX,
      y_mm10: cupY,
      diameter_mm10: cupDiameter,
      depth_mm10: cupDepth,
      source: "auto",
    });
    for (const dy of offsets) {
      ops.push({
        op: "drill",
        id: `cupscrew_${doorPanel.id}_${seq}_${dy}`,
        face: "B",
        x_mm10: cupX,
        y_mm10: cupY + dy,
        diameter_mm10: screwDiameter,
        depth_mm10: screwDepth,
        source: "auto",
      });
    }
    seq++;
  }
  return ops;
}
