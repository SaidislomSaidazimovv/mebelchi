// three/karkasLayer.ts — build a positioned THREE.Group of the project's karkas blocks (Phase D2),
// to drop into the room scene ALONGSIDE the kitchen (never replacing it). Each block's project JSON
// is solved to a structure scene (structureScene/Renderer, already in METRES like the room world),
// then translated so its base sits on the floor (y=0) and the blocks lay out in a centred row along
// X. Isolated + pure: it only reads engine + the karkas renderers, and touches no kitchen code.

import * as THREE from "three";
import { solveLayout } from "../../../../engine/structure/layout.js";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import { layoutToScene } from "./structureScene";
import { buildStructureGroup } from "./structureRenderer";

const GAP_M = 0.06; // 6 cm between placed blocks

/** Parse a project block's JSON and return its StructuralModel, or null if malformed. */
function modelOf(json: string): StructuralModel | null {
  try {
    const m = (JSON.parse(json) as { model?: StructuralModel }).model;
    return m && Array.isArray(m.blocks) && m.blocks.length ? m : null;
  } catch {
    return null;
  }
}

/**
 * Build a group holding every project block, floored and laid out in a centred row on X. Returns an
 * empty group when there are no (valid) blocks. Caller owns disposal (the room scene disposes it).
 */
export function buildProjectBlocksGroup(blocks: readonly { karkasJson: string }[]): THREE.Group {
  const root = new THREE.Group();
  root.name = "karkasLayer";
  let cursorX = 0;
  for (const b of blocks) {
    const model = modelOf(b.karkasJson);
    if (!model) continue;
    const g = buildStructureGroup(layoutToScene(solveLayout(model)));
    const box = new THREE.Box3().setFromObject(g);
    if (box.isEmpty()) continue;
    const size = new THREE.Vector3();
    const ctr = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(ctr);
    // min.x → cursorX (row), min.y → 0 (base on floor), centre.z → 0 (room centre line)
    g.position.set(cursorX - box.min.x, -box.min.y, -ctr.z);
    root.add(g);
    cursorX += size.x + GAP_M;
  }
  const totalW = Math.max(0, cursorX - GAP_M);
  root.position.x = -totalW / 2; // centre the whole row on the room origin
  return root;
}
