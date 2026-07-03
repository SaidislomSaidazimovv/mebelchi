// engine/structure/hingeFit.ts — hinge ↔ offset revalidation (#13, E6).
//
// CONSTRUCTION_FRAME_v3:177 — an off-plane offset "changes hinge cup-to-plate geometry. v3 requires
// the hinge selection to REVALIDATE against the offset — if a standard hinge can't reach, flag it (a
// fit-check, like stability)." Ledger #13 (:228): "Must verify the revalidation FIRES." So when a
// facade is pushed proud by a #40 junction beyond a standard cup hinge's reach, this raises a
// NON-BLOCKING ⚠ — pick an offset/crank hinge. Like stability, it warns, never blocks. Pure + Metro-safe.
//
// The reach LIMIT is a FLAGGED placeholder pending the factory hinge datasheet (S3-E7), consistent
// with the rest of the dummy hinge spec (verified:false). v3's requirement is that the check fires;
// the exact millimetre threshold is confirmed at the factory.

import type { BlockId, InstanceId, StructuralModel } from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";

/** Max proud offset (mm10) a STANDARD cup hinge tolerates before a cranked/offset hinge is needed.
 *  FLAGGED placeholder — confirm against the factory hinge datasheet (S3-E7). */
export const HINGE_MAX_PROUD_MM10: mm10 = 300; // 30 mm

export interface HingeFitFinding {
  readonly blockId: BlockId;
  readonly instanceId: InstanceId;
  readonly proud_mm10: mm10;
  readonly limit_mm10: mm10;
  readonly message_ru: string;
}

/**
 * #13 hinge revalidation (non-blocking): every facade pushed proud by a #40 junction beyond a
 * standard hinge's reach flags a fit warning. Depends on E5 (the junction offset) — a flush door
 * (no junction, or a zero shadow-gap) never flags.
 */
export function checkHingeFit(model: StructuralModel): HingeFitFinding[] {
  const out: HingeFitFinding[] = [];
  for (const block of model.blocks) {
    const roleOf = new Map(block.components.map((c) => [c.id, c.role] as const));
    for (const inst of block.instances) {
      if (roleOf.get(inst.componentId) !== "facade") continue;
      const proud = inst.junction?.shadowGap_z_mm10 ?? 0;
      if (proud <= HINGE_MAX_PROUD_MM10) continue;
      out.push({
        blockId: block.id,
        instanceId: inst.id,
        proud_mm10: proud,
        limit_mm10: HINGE_MAX_PROUD_MM10,
        message_ru: `Дверь «${inst.id}» вынесена вперёд на ${Math.round(proud / 10)}мм — стандартная петля не дотянется (предел ${Math.round(HINGE_MAX_PROUD_MM10 / 10)}мм). Выберите петлю с компенсацией/крестовиной.`,
      });
    }
  }
  return out;
}
