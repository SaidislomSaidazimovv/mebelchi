// engine/structure/emitCheck.ts — L8 emit-completeness gate (E12).
//
// CONSTRUCTION_FRAME_v3 L8 (:83): "A feature shown in 3D is not done until its machining is emitted:
// glass needs its rebate groove, a doubled edge needs its kromka run… Acceptance tests check the cut
// output, not the render." validateParts only checks geometric bounds; THIS gate checks that every
// feature the MODEL declares actually produced its machining in the solved parts. A missing emission
// blocks the SWJ008 export (run from cnc.ts), so a glazed door can never ship without its rebate.
//
// Pure + Metro-safe (contracts + Part types only). Junctions (#40) are NOT checked here — they are
// not SWJ008-expressible (see banding.ts / E5), so they are not a machining emission.

import type { StructuralModel } from "../contracts/structure.js";
import type { Part } from "../contracts/types.js";

export interface EmitFinding {
  readonly code: string;
  readonly instanceId: string;
  readonly message_ru: string;
}

const FRAME_MEMBERS = ["stile_l", "stile_r", "rail_b", "rail_t"] as const;

/**
 * Emit-completeness findings for a solved model (L8): a glazed door must carry its glass rebate, a
 * glazed-grid's frame members each their rebate, and a doubled component both glued layers. Empty =
 * every declared feature emitted its machining. Non-empty blocks the export.
 */
export function checkEmitCompleteness(model: StructuralModel, parts: readonly Part[]): EmitFinding[] {
  const findings: EmitFinding[] = [];
  const byId = new Map(parts.map((p) => [p.id, p] as const));
  const hasGroove = (id: string): boolean => (byId.get(id)?.operations ?? []).some((o) => o.op === "saw_groove");

  for (const block of model.blocks) {
    const compById = new Map(block.components.map((c) => [c.id, c] as const));
    for (const inst of block.instances) {
      const c = compById.get(inst.componentId);
      if (!c) continue;
      const base = `${block.id}__inst_${inst.id}`;

      // Doubled component → both glued layers (A + B) emitted, so the kromka run has its two boards.
      if (c.doubled) {
        if (!byId.has(`${base}__a`) || !byId.has(`${base}__b`)) {
          findings.push({ code: "EMIT_DOUBLING_INCOMPLETE", instanceId: inst.id, message_ru: `Удвоение «${inst.id}»: эмитированы не оба слоя (A+B)` });
        }
      }

      // Single glazed facade → the door panel carries a glass rebate (#38).
      if (c.glazed && c.role === "facade") {
        const doorParts = parts.filter((p) => p.id.startsWith(base) && !p.id.includes("__glass"));
        if (!doorParts.some((p) => p.operations.some((o) => o.op === "saw_groove"))) {
          findings.push({ code: "EMIT_GLASS_REBATE_MISSING", instanceId: inst.id, message_ru: `Остеклённая дверь «${inst.id}»: не эмитирован паз под стекло (#38)` });
        }
      }

      // Glazed-grid facade → each outer frame member (__a board) carries a rebate (#38).
      if (c.glazedGrid && c.role === "facade") {
        for (const m of FRAME_MEMBERS) {
          if (!hasGroove(`${base}__${m}__a`)) {
            findings.push({ code: "EMIT_GRID_REBATE_MISSING", instanceId: inst.id, message_ru: `Витрина «${inst.id}»: у элемента ${m} нет паза под стекло (#38)` });
          }
        }
      }
    }
  }
  return findings;
}
