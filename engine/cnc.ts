// engine/cnc.ts — model → manufacturing parts WITH drilling, and → SWJ008 (E1).
//
// This module loads the hardware catalog and owns the full manufacturing path:
//   model → solveStructure → applyDrilling → validateParts → exportSWJ008.
// The catalog is now a `.ts` data module (hardware_specs.dummy.ts, no JSON import-attribute),
// so this whole path is Metro-safe and the app reaches it through ui/engineBridge.ts. The
// live-geometry viewport still uses solveStructure/solveLayout directly (no drilling).

import type { StructuralModel } from "./contracts/structure.js";
import type { Part, Project } from "./contracts/types.js";
import { solveStructure, type ThicknessSpec } from "./structure/solve.js";
import { applyDrilling } from "./structure/drilling.js";
import { loadHardwareSpec } from "./catalogs/hardwareSpec.js";
import { validateParts } from "./core/validate.js";
import { checkEmitCompleteness } from "./structure/emitCheck.js";
import { exportSWJ008 } from "./postprocessors/swj008.js";

/**
 * Full structural solve for manufacturing: geometry (solveStructure) + automatic drilling
 * (applyDrilling) using the loaded hardware catalog. The drilled Part[] is ready for
 * validateParts → exportSWJ008.
 */
export function solveModelToParts(model: StructuralModel, thickness: ThicknessSpec = {}): Part[] {
  return applyDrilling(solveStructure(model, thickness), model, loadHardwareSpec());
}

/**
 * The one manufacturing entry point the app calls to produce a cut file (E1): drill the model,
 * run the safety gate, and — only if it passes — emit byte-exact SWJ008. Mirrors GATE 1 →
 * exporter ordering: nothing exports dirty. Throws MACHINING_VALIDATION_FAILED with the finding
 * codes if the gate rejects, so the UI can surface exactly what blocked the export.
 */
export function exportModelToSWJ008(
  model: StructuralModel,
  thickness: ThicknessSpec = {},
  materialByRole?: Record<string, string>,
): string {
  const parts = solveModelToParts(model, thickness);
  const validation = validateParts(parts);
  if (!validation.ok) {
    throw new Error(
      `MACHINING_VALIDATION_FAILED: ${validation.findings.map((f) => f.code).join(", ")}`,
    );
  }
  // L8 emit-completeness gate (E12): a declared feature (glass rebate, doubling) that never produced
  // its machining blocks the export — "not done until emitted" (v3 L8), caught on the cut output.
  const emit = checkEmitCompleteness(model, parts);
  if (emit.length > 0) {
    throw new Error(`EMIT_INCOMPLETE: ${emit.map((f) => f.code).join(", ")}`);
  }
  // Phase 5.C: stamp the SWJ008 Material from a caller-supplied role→decor map (cosmetic; runs after
  // the geometry gates). Absent map or unmapped role → Material="" (unchanged golden output).
  const named = materialByRole
    ? parts.map((p) => {
        const m = p.role ? materialByRole[p.role] : undefined;
        return m ? { ...p, material: m } : p;
      })
    : parts;
  const project: Project = { id: model.id, name: model.name, parts: named };
  return exportSWJ008(project);
}
