// Phase 0.4b — the 3D scene. Mirrors the render-spike foundation (already proven at
// 44 fps on the founder's Redmi): ONE InstancedMesh of a unit box, transformed per
// panel; mm→metre scale on the world root; orbit camera; cheap lighting.
//
// RENDER RULES (14_RUNTIME_AND_BUILD.md, non-negotiable):
//  - Panels = one shared box geometry, transformed. Never rebuilt on an edit.
//  - Live edit = matrix updates only (setMatrixAt + needsUpdate).
//  - No CSG. mm → metre = 0.001.
//
// The mesh is allocated once with a generous capacity; add/remove just changes
// `.count` and re-stamps matrices — geometry is never rebuilt, so a shelf can be
// added mid-session without a GPU reallocation.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PlacedPanel, Vec3 } from "./layout.ts";

const MM = 0.001; // locked mm → metre scale
const MAX_PANELS = 1024; // capacity; a cabinet is ~10 panels, a kitchen ~100

export interface Scene {
  /** Re-stamp the instanced matrices from a new panel list. Matrix-only; never
   *  rebuilds geometry. Returns the draw-call count for the overlay. */
  setPanels(panels: PlacedPanel[]): void;
  /** Frame the camera on the current panels' bounding box. */
  frame(panels: PlacedPanel[]): void;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  dispose(): void;
}

export function createScene(): Scene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202428);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
  camera.position.set(1.4, 1.1, 1.7);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0.3, 0.36, 0.28);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x404044, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(3, 5, 2);
  scene.add(sun);

  // World root carries the mm→metre scale so all layout math stays in millimetres.
  const root = new THREE.Group();
  root.scale.setScalar(MM);
  scene.add(root);

  // ONE InstancedMesh of a unit box. One draw call for the whole cabinet.
  const panelGeo = new THREE.BoxGeometry(1, 1, 1);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.7, metalness: 0.02 });
  const panelMesh = new THREE.InstancedMesh(panelGeo, panelMat, MAX_PANELS);
  panelMesh.count = 0;
  root.add(panelMesh);

  // Reused scratch objects — no per-frame allocation.
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _basis = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const v3 = (a: Vec3, out: THREE.Vector3) => out.set(a[0], a[1], a[2]);

  function panelMatrix(p: PlacedPanel, out: THREE.Matrix4): THREE.Matrix4 {
    _basis.makeBasis(v3(p.u, _u), v3(p.v, _v), v3(p.n, _n));
    _q.setFromRotationMatrix(_basis);
    // Box centre = origin + u·L/2 + v·W/2 − n·th/2 (body sits behind Face A).
    v3(p.origin, _p)
      .addScaledVector(_u, p.length / 2)
      .addScaledVector(_v, p.width / 2)
      .addScaledVector(_n, -p.thickness / 2);
    _s.set(p.length, p.width, p.thickness);
    return out.compose(_p, _q, _s);
  }

  let overflowWarned = false;
  function setPanels(panels: PlacedPanel[]): void {
    if (panels.length > MAX_PANELS && !overflowWarned) {
      overflowWarned = true;
      console.warn(
        `[scene] ${panels.length} panels exceeds capacity ${MAX_PANELS}; ` +
          `the extra panels are not drawn. Raise MAX_PANELS if real projects get this large.`,
      );
    }
    const count = Math.min(panels.length, MAX_PANELS);
    for (let i = 0; i < count; i++) panelMesh.setMatrixAt(i, panelMatrix(panels[i]!, _m));
    panelMesh.count = count; // shrink/grow without touching geometry
    panelMesh.instanceMatrix.needsUpdate = true;
    panelMesh.computeBoundingSphere();
  }

  function frame(panels: PlacedPanel[]): void {
    if (panels.length === 0) return;
    const box = new THREE.Box3();
    const c = new THREE.Vector3();
    for (const p of panels) {
      v3(p.origin, c).multiplyScalar(MM);
      box.expandByPoint(c);
      // opposite corner
      c.set(
        p.origin[0] + p.u[0] * p.length + p.v[0] * p.width,
        p.origin[1] + p.u[1] * p.length + p.v[1] * p.width,
        p.origin[2] + p.u[2] * p.length + p.v[2] * p.width,
      ).multiplyScalar(MM);
      box.expandByPoint(c);
    }
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    controls.target.copy(centre);
    camera.position.copy(centre).add(new THREE.Vector3(size * 0.8, size * 0.6, size * 0.9));
    controls.update();
  }

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  return {
    setPanels, frame, renderer, camera,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      panelGeo.dispose();
      panelMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
