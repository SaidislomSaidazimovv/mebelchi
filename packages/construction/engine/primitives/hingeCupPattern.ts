// Layer-1 primitive: hingeCupPattern (Ø35 cup + Ø3 wing-screw marking pricks).
// Pure geometry. Every millimetre comes from the spec — NO numeric literals here.
//
// VERIFIED against the factory door export SHKOF ORTA CHAP ESHIK_7_1 (golden
// fixture, dump 2026-06-12). The real pattern, per hinge position X along the
// door height:
//   - 1 cup on Face A (the file drills Face 5), centre cupCenterFromDoorEdge
//     in from the hinge edge (one of the two long Y edges);
//   - satelliteMarks.count Ø3×1 marking pricks at X ± alongFromCupCenter,
//     sitting beyondCupFromEdge farther from the edge than the cup centre.
//     The factory marks the wing screws, it does not drill them.

import type { mm10, DrillOp } from "../contracts/types.js";
import { mmToMm10 } from "../core/units.js";
import type { HingeSpec, Panel } from "./types.js";

/** Which long edge of the door carries the hinges: y0 (Y=0) or yMax (Y=Width). */
export type HingeEdge = "y0" | "yMax";

export function hingeCupPattern(
  doorPanel: Panel,
  hingeEdge: HingeEdge,
  hingePositionsX: mm10[],
  spec: HingeSpec,
): DrillOp[] {
  const cupDiameter = mmToMm10(spec.cup.diameter);
  const cupDepth = mmToMm10(spec.cup.depth);
  const cupFromEdge = mmToMm10(spec.cupCenterFromDoorEdge);
  const markDiameter = mmToMm10(spec.satelliteMarks.diameter);
  const markDepth = mmToMm10(spec.satelliteMarks.depth);
  const markAlong = mmToMm10(spec.satelliteMarks.alongFromCupCenter);
  const markBeyond = mmToMm10(spec.satelliteMarks.beyondCupFromEdge);

  // Toward the panel interior: +Y from the y0 edge, -Y from the yMax edge.
  const inward = hingeEdge === "y0" ? 1 : -1;
  const cupY = hingeEdge === "y0" ? cupFromEdge : doorPanel.width_mm10 - cupFromEdge;
  const markY = cupY + inward * markBeyond;

  // Marks straddle the cup symmetrically along the hinge edge.
  const half = Math.floor(spec.satelliteMarks.count / 2);
  const alongOffsets: mm10[] = [];
  for (let i = 0; i < spec.satelliteMarks.count; i++) {
    alongOffsets.push((i < half ? -1 : 1) * markAlong);
  }

  const ops: DrillOp[] = [];
  let seq = 0;
  for (const cupX of hingePositionsX) {
    ops.push({
      op: "drill",
      id: `cup_${doorPanel.id}_${seq}`,
      face: "A",
      x_mm10: cupX,
      y_mm10: cupY,
      diameter_mm10: cupDiameter,
      depth_mm10: cupDepth,
      source: "auto",
    });
    for (const dx of alongOffsets) {
      ops.push({
        op: "drill",
        id: `cupmark_${doorPanel.id}_${seq}_${dx}`,
        face: "A",
        x_mm10: cupX + dx,
        y_mm10: markY,
        diameter_mm10: markDiameter,
        depth_mm10: markDepth,
        source: "auto",
      });
    }
    seq++;
  }
  return ops;
}
