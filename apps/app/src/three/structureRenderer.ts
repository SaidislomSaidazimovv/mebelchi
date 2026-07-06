// three/structureRenderer.ts — Scene (from structureScene) → three.js meshes. Plain three.js
// (NOT react-three-fiber): our app renders with three directly, so we build a THREE.Group of box
// meshes here instead of porting karkas's r3f CanvasScene. Each mesh carries its part id in
// userData for raycast selection, mirroring kitchen3d.ts's `userData.cabId` convention.

import * as THREE from "three";
import type { Scene } from "./structureScene";

const WOOD = 0xe7ddc9; // carcass face (matches the kitchen runStyle default)
const EDGE = 0xc9bd9e; // panel edge outline
const SELECTED = 0x2a6df0; // blue emissive tint (same as kitchen selection)
const WIRE_EDGE = 0x334155; // dark outline for wireframe (contrast against the light backdrop)
const SHADED = 0xcfcabd; // uniform clay grey for the "shaded" mode (form without decor colour)

/** 3D visual style (imos Visual Styles). `realistic` = solid decor-coloured (default), `wireframe`
 *  = edges only / see-through, `shaded` = solid but a single uniform matte colour (no decor). */
export type RenderMode = "realistic" | "wireframe" | "shaded";

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
    mesh.userData.baseColor = colorOf?.(b.id) ?? WOOD; // remembered so realistic/shaded can restore it
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    // Inclined shelf (imos AS_O_Angle): tilt the board so the FRONT stays LOW at its mount and the
    // BACK rises toward the back panel — exactly as imos does. We pivot about the shelf's FRONT-TOP
    // edge (front = local −z since the back panel sits at the larger z; top = local +y). Pinning the
    // TOP-front (not the bottom-front) keeps the board's FRONTMOST point flush in the front plane:
    // a bottom-front pivot would swing the front-top corner forward by thickness·sin θ (~7mm at 25°),
    // poking out of the carcass. A centred BoxGeometry rotates about its centre, so after rotating we
    // shift the mesh by (e − R·e) to pin that edge. The edge outline is a child, so it follows. (rotX
    // is radians; only set when actually inclined, so flat shelves are untouched.)
    if (b.rotX) {
      const ang = -b.rotX; // negative raises the back edge (front stays low)
      const ey = b.size[1] / 2; // TOP, local y
      const ez = -b.size[2] / 2; // front, local z (back panel is at +z)
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const ry = ey * cos - ez * sin;
      const rz = ey * sin + ez * cos;
      mesh.rotation.x = ang;
      mesh.position.y += ey - ry; // pin the front-top edge: position += (e − R·e)
      mesh.position.z += ez - rz;
    }
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
      const col = colorOf(mesh.userData.partId as string) ?? WOOD;
      mesh.userData.baseColor = col; // keep the remembered decor in sync so mode switches stay correct
      mat.color = new THREE.Color(col);
      mat.needsUpdate = true;
    }
  }
}

/** Apply a Visual Style (imos) to every board: `realistic` = solid decor colour, `shaded` = solid
 *  uniform clay, `wireframe` = faces hidden so only the edge outlines remain (see-through). Mutates
 *  the shared materials in place; re-assert fade/selection after, and re-render. Never touches
 *  geometry, so it composes with recolour / fade / highlight. */
export function applyRenderMode(group: THREE.Group, mode: RenderMode): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || !("opacity" in mat)) continue;
    const edge = mesh.children[0] as THREE.LineSegments | undefined;
    const edgeMat = edge?.material as THREE.LineBasicMaterial | undefined;
    if (mode === "wireframe") {
      mat.transparent = true;
      mat.opacity = 0; // faces vanish; the edge outline (a child) carries the wireframe
      mat.depthWrite = false;
    } else {
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.color = new THREE.Color(mode === "shaded" ? SHADED : ((mesh.userData.baseColor as number) ?? WOOD));
    }
    mat.needsUpdate = true;
    if (edgeMat) {
      edgeMat.color = new THREE.Color(mode === "wireframe" ? WIRE_EDGE : EDGE);
      edgeMat.needsUpdate = true;
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
