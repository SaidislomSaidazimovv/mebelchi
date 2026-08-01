import * as THREE from "three";
import { mm10ToMeters } from "../contract/types";
import type { Panel, Hole } from "../contract/types";
import { ldspMaterial, edgeMaterial, hdfMaterial } from "./materials";

/** A physical axis name → the renderer's own axis. Panel.width is X, height Y, depth Z. */
const RENDER_AXIS = { width: "x", height: "y", depth: "z" } as const;

/** BoxGeometry material-group order is [+X, −X, +Y, −Y, +Z, −Z]. */
const BOX_FACES = {
  x: { max: 0, min: 1 },
  y: { max: 2, min: 3 },
  z: { max: 4, min: 5 },
} as const;

export function buildBlockGroup(
  panels: Panel[],
  holes: Hole[],
  selectedPanelId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  const ldspMat = ldspMaterial();
  const hdfMat = hdfMaterial();
  const edge = edgeMaterial();
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.95 });

  const selectedMaterial = new THREE.MeshStandardMaterial({
    color: 0xbed6f5,
    roughness: 0.5,
    metalness: 0.1,
  });
  const selectedEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x3b82f6,
  });

  const midX = 3000;
  const midZ = 2800;

  for (const p of panels) {
    const w = Math.max(mm10ToMeters(p.width), 0.001);
    const h = Math.max(mm10ToMeters(p.height), 0.001);
    const d = Math.max(mm10ToMeters(p.depth), 0.001);
    
    const geometry = new THREE.BoxGeometry(w, h, d);
    const px = mm10ToMeters(p.x + p.width / 2 - midX);
    const py = mm10ToMeters(p.y + p.height / 2);
    const pz = mm10ToMeters(p.z + p.depth / 2 - midZ);

    const isSelected = p.id === selectedPanelId;
    const baseMat = p.material === "hdf" ? hdfMat : ldspMat;
    const meshMat = isSelected ? selectedMaterial : baseMat;
    const edgeMatToUse = isSelected ? selectedEdgeMaterial : edge;

    const k1Mat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.8 });
    const k2Mat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.8 });
    const getBMat = (thick: number) => {
      if (thick <= 0) return meshMat;
      if (thick <= 5) return k2Mat; // Thin banding (<= 0.5mm)
      return k1Mat; // Thick banding (> 0.5mm)
    };

    // Banding is placed by ORIENTATION, not by role. `bands` are SWJ008 machine faces
    // [face1, face2, face3, face4] = [Y max, Y 0, X max, X 0] in the PART's frame;
    // `orientation` says which physical axis that part-X and part-Y are, and the
    // renderer's own axes are fixed (width→X, height→Y, depth→Z). One mapping, no
    // per-role special cases — a new role can never be silently mis-banded again.
    let faceMaterials: THREE.Material | THREE.Material[] = meshMat;
    if (p.bands && p.orientation && !isSelected) {
      const mats: THREE.Material[] = [meshMat, meshMat, meshMat, meshMat, meshMat, meshMat];
      const xf = BOX_FACES[RENDER_AXIS[p.orientation.xAxis]];
      const yf = BOX_FACES[RENDER_AXIS[p.orientation.yAxis]];
      mats[yf.max] = getBMat(p.bands[0] ?? 0);
      mats[yf.min] = getBMat(p.bands[1] ?? 0);
      mats[xf.max] = getBMat(p.bands[2] ?? 0);
      mats[xf.min] = getBMat(p.bands[3] ?? 0);
      faceMaterials = mats;
    }

    const mesh = new THREE.Mesh(geometry, faceMaterials);
    mesh.name = p.id;
    mesh.position.set(px, py, pz);
    if (p.rx) mesh.rotation.x = p.rx;
    if (p.ry) mesh.rotation.y = p.ry;
    if (p.rz) mesh.rotation.z = p.rz;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMatToUse);
    edges.position.set(px, py, pz);
    if (p.rx) edges.rotation.x = p.rx;
    if (p.ry) edges.rotation.y = p.ry;
    if (p.rz) edges.rotation.z = p.rz;

    group.add(mesh);
    group.add(edges);
  }

  for (const h of holes) {
    const r = mm10ToMeters(h.diameter / 2);
    const len = mm10ToMeters(h.depth) + 0.0004;
    const geom = new THREE.CylinderGeometry(r, r, len, 16);
    const mesh = new THREE.Mesh(geom, holeMat);
    const hx = mm10ToMeters(h.x - midX);
    const hy = mm10ToMeters(h.y);
    const hz = mm10ToMeters(h.z - midZ);
    mesh.position.set(hx, hy, hz);
    if (h.direction === "x") {
      mesh.rotation.z = Math.PI / 2;
    } else if (h.direction === "z") {
      mesh.rotation.x = Math.PI / 2;
    }
    group.add(mesh);
  }

  return group;
}
