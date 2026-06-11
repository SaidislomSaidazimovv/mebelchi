// Layer-2 safety gate: collisionCheck / bounds check. "The safety gate; nothing
// passes without this" (11_ENGINE_ARCHITECTURE.md). Runs in the core, on mm10
// integers only, so a hole outside the panel is structurally caught before export.
//
// Machining axis convention (from the factory SWJ008): X runs along Length,
// Y runs along Width. So every drill must satisfy X∈[0,Length], Y∈[0,Width],
// and edge-drill Z∈[0,Thickness].

import type { Part, ValidationFinding, ValidationReport } from "../contracts/types.js";
import { isEdgeFace } from "./face.js";

export function validateParts(parts: Part[]): ValidationReport {
  const findings: ValidationFinding[] = [];

  for (const part of parts) {
    const maxX = part.length_mm10;
    const maxY = part.width_mm10;
    const maxZ = part.thickness_mm10;

    if (part.width_mm10 <= 0 || part.length_mm10 <= 0 || part.thickness_mm10 <= 0) {
      findings.push({
        code: "MACHINING_PANEL_DEGENERATE",
        message_ru: `Панель ${part.id}: некорректные габариты`,
        part_id: part.id,
      });
    }

    const outOfBounds = (x: number, y: number) => x < 0 || x > maxX || y < 0 || y > maxY;

    for (const op of part.operations) {
      if (outOfBounds(op.x_mm10, op.y_mm10)) {
        findings.push({
          code: "MACHINING_OP_OUT_OF_BOUNDS",
          message_ru: `Операция ${op.id} вне панели (${op.x_mm10 / 10}, ${op.y_mm10 / 10})мм`,
          part_id: part.id,
          op_id: op.id,
        });
      }
      if (op.depth_mm10 <= 0) {
        findings.push({
          code: "MACHINING_OP_INVALID",
          message_ru: `Операция ${op.id}: некорректная глубина`,
          part_id: part.id,
          op_id: op.id,
        });
      }

      if (op.op === "drill") {
        if (op.diameter_mm10 <= 0) {
          findings.push({
            code: "MACHINING_OP_INVALID",
            message_ru: `Отверстие ${op.id}: некорректный диаметр`,
            part_id: part.id,
            op_id: op.id,
          });
        }
        if (isEdgeFace(op.face)) {
          const z = op.z_mm10 ?? -1;
          if (z < 0 || z > maxZ) {
            findings.push({
              code: "MACHINING_EDGE_Z_OUT_OF_BOUNDS",
              message_ru: `Торцевое отверстие ${op.id} вне толщины панели по Z`,
              part_id: part.id,
              op_id: op.id,
            });
          }
        }
      } else if (op.op === "contour") {
        for (const s of op.segments) {
          if (outOfBounds(s.endX_mm10, s.endY_mm10)) {
            findings.push({
              code: "MACHINING_CONTOUR_OUT_OF_BOUNDS",
              message_ru: `Контур ${op.id}: точка (${s.endX_mm10 / 10}, ${s.endY_mm10 / 10})мм вне панели`,
              part_id: part.id,
              op_id: op.id,
            });
          }
        }
      } else if (op.op === "saw_groove") {
        if (outOfBounds(op.endX_mm10, op.endY_mm10) || op.width_mm10 <= 0) {
          findings.push({
            code: "MACHINING_GROOVE_INVALID",
            message_ru: `Паз ${op.id}: конец вне панели или некорректная ширина`,
            part_id: part.id,
            op_id: op.id,
          });
        }
      }
    }
  }

  return { ok: findings.length === 0, findings };
}
