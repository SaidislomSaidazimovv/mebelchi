// three/karkasLayer.ts — build a positioned THREE.Group of the project's karkas blocks (Phase D2),
// to drop into the room scene ALONGSIDE the kitchen (never replacing it). Each block's project JSON
// is solved to a structure scene (structureScene/Renderer, already in METRES like the room world),
// then translated so its base sits on the floor (y=0) and the blocks lay out in a centred row along
// X. Isolated + pure: it only reads engine + the karkas renderers, and touches no kitchen code.

import * as THREE from "three";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import { layoutToScene } from "./structureScene";
import { buildStructureGroup } from "./structureRenderer";
import { partColor, DEFAULT_PLAN, type MaterialPlan } from "./materials";

const GAP_M = 0.06; // 6 cm between placed blocks

/** Parse a project block's JSON → its model + material plan, or null if malformed. */
function parseBlock(json: string): { model: StructuralModel; plan: MaterialPlan } | null {
  try {
    const d = JSON.parse(json) as { model?: StructuralModel; plan?: MaterialPlan };
    return d.model && Array.isArray(d.model.blocks) && d.model.blocks.length ? { model: d.model, plan: d.plan ?? DEFAULT_PLAN } : null;
  } catch {
    return null;
  }
}

/**
 * Build a group holding every project block, each floored (base at y=0) and centred at its own room
 * position (block-centre X/Z in mm, relative to the room origin). Blocks without a position fall back
 * to an auto-row. Returns an empty group when there are no (valid) blocks. Caller owns disposal.
 */
export function buildProjectBlocksGroup(
  blocks: readonly { karkasJson: string; x?: number; z?: number }[],
): THREE.Group {
  const root = new THREE.Group();
  root.name = "karkasLayer";
  blocks.forEach((b, i) => {
    const parsed = parseBlock(b.karkasJson);
    if (!parsed) return;
    const { model, plan } = parsed;
    // F1 — colour each board by its decor (part role → plan → colour)
    const cmap = new Map(solveStructure(model).map((p) => [p.id, partColor(plan, p.role)]));
    const g = buildStructureGroup(layoutToScene(solveLayout(model)), (id) => cmap.get(id));
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) return;
    const ctr = new THREE.Vector3();
    box.getCenter(ctr);
    const x = (b.x ?? i * (800 + GAP_M * 1000)) / 1000; // mm → metres
    const z = (b.z ?? 0) / 1000;
    g.position.set(x - ctr.x, -box.min.y, z - ctr.z); // block centre → (x, z), base on floor
    root.add(g);
  });
  return root;
}
