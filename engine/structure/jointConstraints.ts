// engine/structure/jointConstraints.ts — Step 7c (CONSTRUCTION_FRAME_v4 §8.2.3). The Joint profile's
// min-edge-margin is a safety rule: no hole may sit closer than that to a panel edge (it would blow out
// the board). This pure check flags every offending drilled hole, naming the rule — the app surfaces it
// as an amber warning and gates the CNC export on an explicit master override.
import type { Part, mm10 } from "../contracts/types.js";

export interface JointFinding {
  readonly partId: string;
  readonly opId: string;
  /** the rule that was broken (e.g. "minEdgeMargin") — shown to the master by name. */
  readonly rule: string;
  readonly message_ru: string;
}

/**
 * Flag each FACE drill (A/B) sitting closer than `minEdgeMargin_mm10` to any of its panel's four edges.
 * Edge drills (dowels into the board thickness) are exempt — they run along the edge by design. Pure.
 */
export function checkJointConstraints(parts: readonly Part[], minEdgeMargin_mm10: mm10): JointFinding[] {
  if (minEdgeMargin_mm10 <= 0) return [];
  const out: JointFinding[] = [];
  for (const p of parts) {
    for (const op of p.operations) {
      if (op.op !== "drill" || (op.face !== "A" && op.face !== "B")) continue;
      const margin = Math.min(op.x_mm10, p.length_mm10 - op.x_mm10, op.y_mm10, p.width_mm10 - op.y_mm10);
      if (margin < minEdgeMargin_mm10) {
        out.push({
          partId: p.id,
          opId: op.id,
          rule: "minEdgeMargin",
          message_ru: `Отверстие ${Math.round(margin / 10)}мм от края (< ${Math.round(minEdgeMargin_mm10 / 10)}мм min) — ${p.name}`,
        });
      }
    }
  }
  return out;
}
