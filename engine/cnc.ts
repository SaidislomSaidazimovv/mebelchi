// engine/cnc.ts — model → manufacturing parts WITH drilling, and → SWJ008 (E1).
//
// This module loads the hardware catalog and owns the full manufacturing path:
//   model → solveStructure → applyDrilling → validateParts → exportSWJ008.
// The catalog is now a `.ts` data module (hardware_specs.dummy.ts, no JSON import-attribute),
// so this whole path is Metro-safe and the app reaches it through ui/engineBridge.ts. The
// live-geometry viewport still uses solveStructure/solveLayout directly (no drilling).

import type { StructuralModel } from "./contracts/structure.js";
import type { JointProfile } from "./contracts/variables.js";
import type { Part, Project } from "./contracts/types.js";
import { solveStructure, type ThicknessSpec } from "./structure/solve.js";
import { applyFeatures } from "./structure/features.js";
import { applyHoleOverrides } from "./structure/holeOverride.js";
import { applyDrilling } from "./structure/drilling.js";
import { loadHardwareSpec } from "./catalogs/hardwareSpec.js";
import type { HardwareSpec } from "./primitives/types.js";
import { validateParts } from "./core/validate.js";
import { checkEmitCompleteness } from "./structure/emitCheck.js";
import { exportSWJ008 } from "./postprocessors/swj008.js";

/**
 * Full structural solve for manufacturing: geometry (solveStructure) + panel finishing features
 * (applyFeatures — corner rounding + cutout contours, Step 4b) + automatic drilling (applyDrilling)
 * using the loaded hardware catalog. The drilled Part[] is ready for validateParts → exportSWJ008.
 */
export function solveModelToParts(model: StructuralModel, thickness: ThicknessSpec = {}): Part[] {
  const spec = specWithProfile(loadHardwareSpec(), model.jointProfile);
  const drilled = applyDrilling(applyFeatures(solveStructure(model, thickness), model), model, spec);
  return applyHoleOverrides(drilled, model.holeOverrides); // Step 7c — master's per-hole moves win last
}

const CAM_SKU = "DUMMY_RASTEX_15";

/**
 * Step 7a — a JointProfile seeded from the (factory-verified) hardware catalog: the workshop's starting
 * point that the Joints-mode editor then tweaks. Catalog values are millimetres; the profile is mm10.
 */
export function defaultJointProfile(spec: HardwareSpec = loadHardwareSpec()): JointProfile {
  const s = spec.system32;
  return {
    id: "workshop",
    camSku: CAM_SKU,
    camSeatDepth_mm10: Math.round((spec.connectors[CAM_SKU]?.camSeat?.depth ?? 12.5) * 10),
    system32: {
      pitch_mm10: Math.round(s.verticalPitch * 10),
      frontSetback_mm10: Math.round(s.frontRowSetback * 10),
      backSetback_mm10: Math.round(s.backRowSetback * 10),
    },
    minEdgeMargin_mm10: 100, // 10mm default clearance (§8.2.3)
  };
}

/**
 * Step 7a — overlay a JointProfile's System-32 grid onto the catalog spec so the profile DRIVES hole
 * placement (retype a setback → the shelf pins move). Absent profile → the catalog defaults stand.
 */
function specWithProfile(spec: HardwareSpec, profile?: JointProfile): HardwareSpec {
  if (!profile) return spec;
  const cam = spec.connectors[CAM_SKU];
  return {
    ...spec,
    system32: {
      ...spec.system32,
      verticalPitch: profile.system32.pitch_mm10 / 10,
      frontRowSetback: profile.system32.frontSetback_mm10 / 10,
      backRowSetback: profile.system32.backSetback_mm10 / 10,
    },
    // cam seat depth also follows the profile (the cut file's Ø15 drill depth; not a visible 2D marker shift)
    connectors: cam
      ? { ...spec.connectors, [CAM_SKU]: { ...cam, camSeat: { ...cam.camSeat, depth: profile.camSeatDepth_mm10 / 10 } } }
      : spec.connectors,
  };
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
  materialNameById?: Record<string, string>,
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
  const named = materialByRole || materialNameById
    ? parts.map((p) => {
        // a per-part override (F2) wins over the role → decor name
        const m = (p.materialId ? materialNameById?.[p.materialId] : undefined) ?? (p.role ? materialByRole?.[p.role] : undefined);
        return m ? { ...p, material: m } : p;
      })
    : parts;
  const project: Project = { id: model.id, name: model.name, parts: named };
  return exportSWJ008(project);
}
