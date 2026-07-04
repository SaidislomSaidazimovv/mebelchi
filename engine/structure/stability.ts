// engine/structure/stability.ts — the L5 stability / load-bearing check (blocker #9 / E7).
//
// CONSTRUCTION_FRAME_v3 L5 (§2:77): "Declare any cabinet/panel load-bearing → stability check → ⚠
// flag. Warns, never blocks." Ledger #9 (:224) is the span-needs-support case and says the span
// rule "needs wiring" — v3 defers the NUMBER to the physics docs. This module wires that number.
//
// GROUNDING (numbers are NOT invented — cited per 16_JOINT_INTELLIGENCE.md:69 "no number is a literal"):
//   • Shelf sag = classical beam deflection δ = 5·w·L⁴ / (384·E·I),  I = b·h³/12
//         — 16_JOINT_INTELLIGENCE.md:64 + Researches/-r4 UI Further.md §1.2
//   • E (ЛДСП, 700–750 kg/m³) = 1600 MPa conservative — -r4 §1.1
//   • Deflection tiers: ≤1.5mm ok · 1.5–3.0mm ⚠ warn · >3.0mm ⚠ risk — -r4 §1.3
//   • 16mm worst-case safe span ≈ 580mm; Enforcement Rule #1: span>580 & 16mm → FLAG
//         "insert a vertical divider / mid-support" — -r4 §1.4
//   • Default load 15 kg/m (light) ≈ 0.147 N/mm — -r4 §1.4 baseline (the one tunable judgement call;
//     worst-case pin joint ×1.0 assumed, so the ⚠ stays conservative).
//
// This check is NON-BLOCKING by construction: it is NOT part of validateParts or the SWJ008 export
// gate (L5 "never blocks"). The UI (U13) surfaces the findings as a ⚠ badge. Pure + Metro-safe.

import type {
  Block,
  BlockId,
  InstanceId,
  Section,
  StructuralModel,
} from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";
import { BOARD_MM10 } from "./solve.js";

// --- grounded constants (see header for sources) ---
const E_LDSP_MPA = 1600; // -r4 §1.1
const DEFAULT_LOAD_N_PER_MM = 0.147; // 15 kg/m light default, -r4 §1.4
const WARN_DEFLECTION_MM = 1.5; // -r4 §1.3 (kept for reference / message thresholds)
const RISK_DEFLECTION_MM = 3.0; // -r4 §1.3 — escalates the copy above this
/** 16mm ЛДСП worst-case safe span (mm10). Enforcement Rule #1, -r4 §1.4. */
export const SPAN_LIMIT_16MM_MM10: mm10 = 5800;

export type StabilityLevel = "warn" | "risk";

/** One non-blocking stability ⚠ against a load-bearing shelf whose span is over the grounded limit. */
export interface StabilityFinding {
  readonly blockId: BlockId;
  readonly instanceId: InstanceId;
  readonly span_mm10: mm10;
  readonly limit_mm10: mm10;
  /** Estimated midpoint deflection at the default 15 kg/m load (mm), for the message. */
  readonly deflection_mm: number;
  readonly level: StabilityLevel;
  readonly message_ru: string;
}

/** Midpoint deflection (mm) of a simply-supported 16mm shelf: δ = 5·w·L⁴/(384·E·I), I = b·h³/12. */
function shelfDeflectionMm(span_mm10: mm10, depth_mm10: mm10): number {
  const L = span_mm10 / 10; // mm
  const b = depth_mm10 / 10; // mm (shelf depth = beam width)
  const h = BOARD_MM10 / 10; // 16 mm (beam height)
  const I = (b * h * h * h) / 12; // mm⁴
  if (I <= 0) return 0;
  return (5 * DEFAULT_LOAD_N_PER_MM * L * L * L * L) / (384 * E_LDSP_MPA * I);
}

/** Map every section id in a block to its section (all zones, depth-first). */
function sectionsById(block: Block): Map<string, Section> {
  const map = new Map<string, Section>();
  const walk = (s: Section): void => {
    map.set(s.id, s);
    for (const c of s.children) walk(c);
  };
  for (const z of block.zones) walk(z.root);
  return map;
}

/**
 * Stability check (L5, non-blocking): every load-bearing shelf whose unsupported span exceeds the
 * grounded 16mm limit (580mm) raises a ⚠. Severity escalates to "risk" once the estimated deflection
 * passes 3.0mm. A shelf's span is the width of the section that holds it (between its two supports),
 * so inserting a divider — which narrows the section — is exactly what clears the flag.
 */
export function checkStability(model: StructuralModel): StabilityFinding[] {
  const findings: StabilityFinding[] = [];

  for (const block of model.blocks) {
    const byId = sectionsById(block);

    for (const inst of block.instances) {
      const comp = block.components.find((c) => c.id === inst.componentId);
      if (!comp) continue;
      // Auto-check internal shelves (default) OR any component the user DECLARED load-bearing (L5).
      const isShelf = comp.role === "internal_shelf";
      const declared = comp.loadBearing === true;
      if (!isShelf && !declared) continue;
      const section = byId.get(inst.sectionId);
      if (!section) continue;

      const span = section.box.w; // horizontal distance between the shelf's two supports
      if (span <= SPAN_LIMIT_16MM_MM10) continue;

      const deflection = shelfDeflectionMm(span, section.box.d);
      const level: StabilityLevel = deflection > RISK_DEFLECTION_MM ? "risk" : "warn";
      const spanMm = Math.round(span / 10);
      const limitMm = Math.round(SPAN_LIMIT_16MM_MM10 / 10);
      const deflMm = Math.round(deflection * 10) / 10;
      const tail =
        level === "risk"
          ? "Высокий риск прогиба — вставьте вертикальную стойку или среднюю опору."
          : "Вставьте вертикальную стойку/опору или увеличьте толщину.";

      findings.push({
        blockId: block.id,
        instanceId: inst.id,
        span_mm10: span,
        limit_mm10: SPAN_LIMIT_16MM_MM10,
        deflection_mm: deflMm,
        level,
        message_ru: `«${comp.name}»: пролёт ${spanMm}мм превышает предел для ЛДСП 16мм (${limitMm}мм). Прогиб ≈ ${deflMm}мм. ${tail}`,
      });
    }
  }

  return findings;
}

// WARN_DEFLECTION_MM is exported-adjacent documentation of the ok/warn boundary; referenced here so
// the grounded tier is not dead code and stays visible to the next reader.
export const STABILITY_TIERS_MM = { warn: WARN_DEFLECTION_MM, risk: RISK_DEFLECTION_MM } as const;
