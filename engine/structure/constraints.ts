// Step 2.4 · Constraint warning (CONSTRUCTION_FRAME_v4 §4) — the amber flag when a division chain
// can't be satisfied. NON-BLOCKING by construction (like checkStability / checkMotionClearance): the
// UI surfaces it as a ⚠, the export never gates on it here. For every divided section, re-run the
// constraint solver against the section's box and flag a non-"ok" status:
//   • over-constrained — Fixed+Locked sizes exceed the section (they overflow).
//   • no-absorb        — leftover space but no Ratio/Flex zone to take it (a gap forms).
// A normal split (any Ratio, or Fixed+trailing Flex) resolves "ok" and raises nothing.

import type { Axis, Block, BlockId, Box3D, Section, SectionId, StructuralModel } from "../contracts/structure.js";
import { resolveChain, type ChainZone } from "./constraintSolver.js";

const extentOf = (box: Box3D, axis: Axis): number => (axis === "x" ? box.w : axis === "y" ? box.h : box.d);

/** One non-blocking ⚠ against a section whose division rules can't tile it. */
export interface ConstraintFinding {
  readonly blockId: BlockId;
  readonly sectionId: SectionId;
  readonly axis: Axis;
  readonly status: "over-constrained" | "no-absorb";
  readonly message_ru: string;
}

/**
 * Constraint check (§4, non-blocking): for every section split into child zones, resolve the chain
 * against the section's own extent and flag an over-constrained or unabsorbable configuration. Pure;
 * walks all zones depth-first. Returns [] for a healthy model.
 */
export function checkConstraints(model: StructuralModel): ConstraintFinding[] {
  const findings: ConstraintFinding[] = [];
  for (const block of model.blocks) {
    const lineAxisOf = new Map(block.lines.map((l) => [l.id, l.axis] as const));
    const walk = (section: Section): void => {
      if (section.children.length > 0 && section.dividers.length > 0) {
        const axis = lineAxisOf.get(section.dividers[0]!);
        if (axis) {
          const zones: ChainZone[] = section.children.map((c) => ({
            rule: c.rule ?? { kind: "flex" },
            currentSize: extentOf(c.box, axis),
          }));
          const { status } = resolveChain(extentOf(section.box, axis), zones);
          if (status !== "ok") {
            findings.push({
              blockId: block.id,
              sectionId: section.id,
              axis,
              status,
              message_ru:
                status === "over-constrained"
                  ? "⚠ Секция переполнена: фиксированные/заблокированные размеры не помещаются"
                  : "⚠ Секция не заполнена: нет гибкой (Flex) зоны, чтобы занять свободное место",
            });
          }
        }
      }
      for (const c of section.children) walk(c);
    };
    for (const z of block.zones) walk(z.root);
  }
  return findings;
}
