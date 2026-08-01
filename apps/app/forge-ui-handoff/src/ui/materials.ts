import * as THREE from "three";

const textureLoader = new THREE.TextureLoader();
const ldspTex = textureLoader.load("/ldsp_texture.jpg");
ldspTex.wrapS = THREE.RepeatWrapping;
ldspTex.wrapT = THREE.RepeatWrapping;
ldspTex.repeat.set(1, 1);

export function ldspMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: ldspTex,
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.05
  });
}

const hdfTex = textureLoader.load("/hdf_texture.jpg");
hdfTex.wrapS = THREE.RepeatWrapping;
hdfTex.wrapT = THREE.RepeatWrapping;
hdfTex.repeat.set(1, 1);

export function edgeMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0x9a9284 });
}

export function hdfMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: hdfTex,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0
  });
}
