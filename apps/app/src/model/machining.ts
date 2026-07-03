// Bridge: the app's Cabinet run → the engine's Layer-2 drilling solver → a machining
// plan, a safety report, and the SWJ008 machine file. Reuses the SAME engine the cut
// list/pricing use, so the holes are the real spec-driven operations (cams, dowels,
// shelf pins, hinge cups) gated by the engine's safety validator — nothing exports dirty.
//
// We import the engine SOURCE directly (Vite resolves the .js specifiers to .ts, exactly
// as @mebelchi/pricing already does) and load the hardware spec as a plain JSON import,
// avoiding the engine index's JSON import-attribute path.

import { solveBaseCabinet } from "../../../../engine/solver/baseCabinet.js";
import { exportSWJ008 } from "../../../../engine/postprocessors/swj008.js";
import { validateParts } from "../../../../engine/core/validate.js";
import hardwareSpecRaw from "../../../../engine/catalogs/hardware_specs.dummy.json";
import type { HardwareSpec } from "../../../../engine/primitives/types.js";
import type { Cabinet } from "./cabinet";

export type { Part, Operation, DrillOp, ValidationFinding } from "../../../../engine/contracts/types.js";
import type { Part, ValidationFinding } from "../../../../engine/contracts/types.js";

const spec = hardwareSpecRaw as unknown as HardwareSpec;
const DEPTH: Record<Cabinet["kind"], number> = { base: 560, tall: 560, upper: 350 };

/** One cabinet → solver input (carcass + adjustable shelves + optional hinged door). */
function cabInput(c: Cabinet) {
  const shelves = c.fill === "shelves" ? Math.max(0, c.count) : 0;
  // a hinged door exists on a closed cabinet whose door style isn't "Без" (index 3);
  // drawers carry fronts (no hinges) and open units have no door — both skip the cup step
  const hasDoor = c.fill !== "drawers" && c.fill !== "open" && c.door !== 3;
  return {
    id: c.id,
    height_mm: c.h,
    width_mm: c.w,
    depth_mm: c.depth ?? DEPTH[c.kind] ?? 560,
    shelves,
    hasDoor,
    hingeEdge: "left" as const,
  };
}

/** Solve the whole run into engine Parts WITH drill operations. Furniture excluded. */
export function solveRun(cabs: Cabinet[]): Part[] {
  const real = cabs.filter((c) => !c.furniture);
  const parts: Part[] = [];
  for (const c of real) parts.push(...solveBaseCabinet(cabInput(c), spec));
  return parts;
}

export interface MachiningReport {
  parts: Part[];
  ok: boolean;
  findings: ValidationFinding[];
  holeCount: number;
  partCount: number;
}

/** Solve + run the safety gate. The UI shows this before unlocking the machine file. */
export function machiningReport(cabs: Cabinet[]): MachiningReport | null {
  const real = cabs.filter((c) => !c.furniture);
  if (!real.length) return null;
  const parts = solveRun(real);
  const v = validateParts(parts);
  const holeCount = parts.reduce((n, p) => n + p.operations.length, 0);
  return { parts, ok: v.ok, findings: v.findings, holeCount, partCount: parts.length };
}

/** SWJ008 machine file — ONLY if the safety gate passes (mirrors solveAndExportSWJ008). */
export function runSWJ008(cabs: Cabinet[]): string | null {
  const rep = machiningReport(cabs);
  if (!rep || !rep.ok) return null;
  return exportSWJ008({ id: "mebelchi", name: "Mebelchi kitchen", parts: rep.parts });
}
