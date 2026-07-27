import * as THREE from "three";
import { mm10ToMeters } from "../engine/units";
import type { Panel } from "../engine/block";
import { ldspMaterial, edgeMaterial } from "./materials";

export function buildBlockGroup(panels: Panel[]): THREE.Group {
  const group = new THREE.Group();
  const material = ldspMaterial();
  const edge = edgeMaterial();

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of panels) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + p.width);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z + p.depth);
  }
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;

  for (const p of panels) {
    const geometry = new THREE.BoxGeometry(
      mm10ToMeters(p.width),
      mm10ToMeters(p.height),
      mm10ToMeters(p.depth),
    );
    const px = mm10ToMeters(p.x + p.width / 2 - midX);
    const py = mm10ToMeters(p.y + p.height / 2);
    const pz = mm10ToMeters(p.z + p.depth / 2 - midZ);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edge);
    edges.position.set(px, py, pz);

    group.add(mesh);
    group.add(edges);
  }
  return group;
}
