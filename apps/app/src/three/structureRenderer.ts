// three/structureRenderer.ts — Scene (from structureScene) → three.js meshes. Plain three.js
// (NOT react-three-fiber): our app renders with three directly, so we build a THREE.Group of box
// meshes here instead of porting karkas's r3f CanvasScene. Each mesh carries its part id in
// userData for raycast selection, mirroring kitchen3d.ts's `userData.cabId` convention.

import * as THREE from "three";
import type { Scene } from "./structureScene";

const WOOD = 0xe7ddc9; // carcass face (matches the kitchen runStyle default)
const EDGE = 0xc9bd9e; // panel edge outline
const SELECTED = 0x2a6df0; // blue emissive tint (same as kitchen selection)

/** Build the assembled cabinet as a THREE.Group of box meshes — one per render board. `colorOf`
 *  (Phase F1) maps a part id → its decor colour (int); absent / undefined falls back to WOOD. */
export function buildStructureGroup(scene: Scene, colorOf?: (id: string) => number | undefined): THREE.Group {
  const group = new THREE.Group();
  for (const b of scene.boards) {
    const geom = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: colorOf?.(b.id) ?? WOOD, roughness: 0.82, metalness: 0 }),
    );
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    mesh.userData.partId = b.id;
    // thin edge outline so adjacent panels read as separate boards
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: EDGE }),
    );
    // Lines raycast with a default 1-unit (= 1 METRE here) threshold, so a click up to ~1m off a
    // board would still "hit" its outline — grabbing/selecting the block from empty space. The
    // outline is purely decorative → exclude it from raycasts so only the solid boards are pickable.
    edges.raycast = () => {};
    mesh.add(edges);
    group.add(mesh);
  }
  return group;
}

/** Tint the board whose id matches (selection). Pass null to clear every tint. */
export function highlightBoard(group: THREE.Group, id: string | null): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && "emissive" in mat) {
      const on = id != null && mesh.userData.partId === id;
      mat.emissive = new THREE.Color(on ? SELECTED : 0x000000);
      mat.emissiveIntensity = on ? 0.5 : 0;
      mat.needsUpdate = true;
    }
  }
}

/** Re-colour every board from `colorOf` (Phase F1 — decor changed, no geometry rebuild). Leaves the
 *  selection emissive untouched, so re-apply highlightBoard after if a part is selected. */
export function recolorBoards(group: THREE.Group, colorOf: (id: string) => number | undefined): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && "color" in mat) {
      mat.color = new THREE.Color(colorOf(mesh.userData.partId as string) ?? WOOD);
      mat.needsUpdate = true;
    }
  }
}

/** Free the GPU resources of a structure group (call on unmount / before rebuild). */
export function disposeStructureGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else if (m) m.dispose();
  });
}
