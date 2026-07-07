// three/karkasLayer.ts — build a positioned THREE.Group of the project's karkas blocks (Phase D2),
// to drop into the room scene ALONGSIDE the kitchen (never replacing it). Each block's project JSON
// is solved to a structure scene (structureScene/Renderer, already in METRES like the room world),
// then translated so its base sits on the floor (y=0) and the blocks lay out in a centred row along
// X. Isolated + pure: it only reads engine + the karkas renderers, and touches no kitchen code.

import * as THREE from "three";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import { layoutToScene, sceneDimsMm } from "./structureScene";
import { buildStructureGroup } from "./structureRenderer";
import { partColorLookup, planThickness, DEFAULT_PLAN, type MaterialPlan } from "./materials";

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

/** Footprint dimensions (mm) of a project block's solved model — so the room can build a `Foot` for
 *  it (collision + snap + gizmo) exactly like a cabinet. Memoised by JSON string: the karkasJson is
 *  stable per block (changes only on edit), so this is O(1) across the many geom rebuilds per drag. */
const dimsCache = new Map<string, { w: number; depth: number; h: number } | null>();
export function blockDimsMm(json: string): { w: number; depth: number; h: number } | null {
  const hit = dimsCache.get(json);
  if (hit !== undefined) return hit;
  const parsed = parseBlock(json);
  let res: { w: number; depth: number; h: number } | null = null;
  if (parsed) {
    try {
      const d = sceneDimsMm(layoutToScene(solveLayout(parsed.model)));
      res = { w: d.w, depth: d.d, h: d.h };
    } catch {
      res = null;
    }
  }
  dimsCache.set(json, res);
  return res;
}

/**
 * Build a group holding every project block, each floored (base at y=0) and centred at its own room
 * position (block-centre X/Z in mm, relative to the room origin). Blocks without a position fall back
 * to an auto-row. Returns an empty group when there are no (valid) blocks. Caller owns disposal.
 */
export function buildProjectBlocksGroup(
  blocks: readonly { karkasJson: string; x?: number; z?: number; id?: string; rot?: number }[],
): THREE.Group {
  const root = new THREE.Group();
  root.name = "karkasLayer";
  blocks.forEach((b, i) => {
    const parsed = parseBlock(b.karkasJson);
    if (!parsed) return;
    const { model, plan } = parsed;
    // A parseable-but-malformed model (bad zones/sections) can throw in solve/build. This group
    // is built during the SHARED room scene init, so one bad block must not tank the kitchen —
    // skip it and keep going.
    try {
      // F1 — colour each board by its decor (part role → plan → colour), via the SAME shared lookup
      // the editor uses so a placed block matches its karkas exactly (incl. doubled 32mm / glazed
      // parts, whose split ids would otherwise miss the single render board → bare WOOD).
      const tk = planThickness(plan);
      const parts = solveStructure(model, tk);
      const colorOf = partColorLookup(parts, plan);
      const g = buildStructureGroup(layoutToScene(solveLayout(model, tk)), colorOf);
      // «Ichini ko'rish» — mark the FRONT (facade: doors + drawer fronts) boards so the room can fade
      // them out to reveal the interior (imos shows the whole carcass semi-transparent while editing).
      tagFacades(g, parts);
      const box = new THREE.Box3().setFromObject(g);
      if (box.isEmpty()) return;
      const ctr = new THREE.Vector3();
      box.getCenter(ctr);
      const xMm = b.x ?? i * (800 + GAP_M * 1000);
      const zMm = b.z ?? 0;
      const rot = b.rot ?? 0;
      // Inner group: centre the block's meshes on the origin (base on the floor). The OUTER pivot then
      // carries the room position + Y rotation, so the block spins about its own centre like a cabinet.
      g.position.set(-ctr.x, -box.min.y, -ctr.z);
      const pivot = new THREE.Group();
      pivot.add(g);
      pivot.position.set(xMm / 1000, 0, zMm / 1000); // block centre → (x, z)
      pivot.rotation.y = -(rot * Math.PI) / 180; // room uses cabinet convention (child.rotation.y = -rot)
      if (b.id) pivot.userData.karkasBlockId = b.id; // D3b — pick id (mirrors kitchen3d userData.cabId)
      pivot.userData.blockCenterX = 0; // meshes are centred inside the pivot → no bbox offset to undo
      pivot.userData.blockCenterZ = 0;
      pivot.userData.karkasX = xMm; // logical room x/z (mm) at drag start
      pivot.userData.karkasZ = zMm;
      pivot.userData.karkasRot = rot;
      // half-extents (mm) of the footprint — lets the room drag snap/clamp the block like a cabinet
      pivot.userData.blockHalfX = Math.round(((box.max.x - box.min.x) / 2) * 1000);
      pivot.userData.blockHalfZ = Math.round(((box.max.z - box.min.z) / 2) * 1000);
      root.add(pivot);
    } catch {
      /* skip an unrenderable block rather than break the shared room scene */
    }
  });
  return root;
}

/** Tag every FRONT (facade: doors + drawer faces) mesh in a solved structure group with
 *  `userData.isFacade`, from its parts list — so «Ichini ko'rish» knows which boards to fade. */
export function tagFacades(group: THREE.Object3D, parts: readonly { id: string; role?: string | null }[]): void {
  const facadeBase = new Set(parts.filter((p) => p.role === "facade").map((p) => p.id.replace(/__(a|b|front)$/, "")));
  group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.userData.isFacade = facadeBase.has(String(m.userData.partId).replace(/__(a|b|front)$/, "")); });
}

/** «Ichini ko'rish» — fade the FRONT panels (tagged `isFacade`) of a structure group to a low opacity
 *  so the interior (shelves, drawer boxes, dividers) shows through, else restore them to solid.
 *  Mirrors imos's transparent Article-Designer view. Works on any tagged group (editor or room). */
export function fadeFacades(group: THREE.Object3D, on: boolean): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.userData.isFacade) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of mats) {
      const m = mm as THREE.MeshStandardMaterial;
      m.transparent = on;
      m.opacity = on ? 0.16 : 1;
      m.depthWrite = !on; // let the interior render through the faded fronts
      m.needsUpdate = true;
    }
  });
}

/** Fade one placed block's fronts by id (room layer of pivots). `blockId === null` restores all. */
export function setBlockInsideView(root: THREE.Object3D, blockId: string | null, on: boolean): void {
  for (const child of root.children) {
    if (blockId && child.userData.karkasBlockId !== blockId) continue;
    fadeFacades(child, on);
  }
}
