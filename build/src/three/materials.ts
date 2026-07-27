import * as THREE from "three";

export function ldspMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xe9e4da,
    roughness: 0.72,
    metalness: 0,
  });
}

export function edgeMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0x9a9284 });
}
