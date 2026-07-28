import * as THREE from "three";
import { mm10ToMeters } from "../engine/units";
import type { Panel, Hole } from "../engine/block";
import { ldspMaterial, edgeMaterial } from "./materials";

export function buildBlockGroup(
  panels: Panel[],
  holes: Hole[],
  selectedPanelId: string | null,
): THREE.Group {
  const group = new THREE.Group();
  const material = ldspMaterial();
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
    const meshMat = isSelected ? selectedMaterial : material;
    const edgeMatToUse = isSelected ? selectedEdgeMaterial : edge;

    const mesh = new THREE.Mesh(geometry, meshMat);
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
