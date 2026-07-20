// three/karkasAr.ts — «AR» tab: stand the solved cabinet in the real room, and export it as a portable
// .glb. Deliberately SELF-CONTAINED: the AR session builds its own renderer/scene/camera on a throwaway
// canvas instead of borrowing the editor's, so nothing here can disturb the main viewport (its render
// loop, its camera framing, its OrbitControls) — and a failed/cancelled session leaves no trace.
//
// PLATFORM REALITY (why the UI has two paths): immersive AR on the web is WebXR, which Android Chrome
// supports and iOS Safari does not. So this module reports what the device can actually do and the tab
// offers the .glb download as the universal fallback (any phone/desktop can open it in a 3D viewer, and
// it doubles as a way to send the cabinet to a client).

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/** What this device can do with the model. */
export type ArSupport = "checking" | "webxr" | "unsupported";

interface XrNavigator { xr?: { isSessionSupported(mode: string): Promise<boolean> } }

/** Does this browser/device actually offer immersive AR? Never throws — a missing API is just "no". */
export async function detectArSupport(): Promise<ArSupport> {
  const xr = (navigator as unknown as XrNavigator).xr;
  if (!xr?.isSessionSupported) return "unsupported";
  try {
    return (await xr.isSessionSupported("immersive-ar")) ? "webxr" : "unsupported";
  } catch {
    return "unsupported";
  }
}

/** Export a built structure group as a binary glTF (.glb) blob — the portable, universal fallback. */
export function exportGlb(group: THREE.Object3D): Promise<Blob> {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      group,
      (result) => resolve(new Blob([result as ArrayBuffer], { type: "model/gltf-binary" })),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    );
  });
}

/**
 * Re-seat a clone of the model so its FOOTPRINT CENTRE sits at the origin and its base at y=0. A hit-test
 * gives us a point on the floor, so the model must grow upward from that point rather than straddling it.
 */
function groundedClone(group: THREE.Object3D): THREE.Object3D {
  const model = group.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  const wrap = new THREE.Group(); // wrap so callers can move/rotate the whole thing by the wrapper
  wrap.add(model);
  return wrap;
}

export interface ArSession {
  /** End the AR session (also called automatically when the user exits from the headset/browser UI). */
  end: () => void;
}

/**
 * Start an immersive-AR session showing `group`. A reticle rides the detected floor; a tap plants the
 * cabinet there (tap again to re-place). `overlay` is a DOM node shown over the camera feed (the exit
 * button + hint) via the dom-overlay feature — optional, so a device without it still works.
 *
 * Resolves once the session is running; rejects if the device refuses it. Everything created here is
 * torn down on session end.
 */
export async function startArSession(group: THREE.Object3D, overlay?: HTMLElement, onEnd?: () => void): Promise<ArSession> {
  const xr = (navigator as unknown as { xr?: any }).xr;
  if (!xr) throw new Error("AR_UNSUPPORTED");

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:200";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(1, 2, 1);
  scene.add(key);

  const model = groundedClone(group);
  model.visible = false; // hidden until the master taps a spot on the floor
  scene.add(model);

  // floor reticle — a flat ring laid in the XZ plane, driven straight from the hit-test pose matrix
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x2f6bff }),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40);

  const opts: Record<string, unknown> = { requiredFeatures: ["hit-test"] };
  if (overlay) { opts.optionalFeatures = ["dom-overlay"]; opts.domOverlay = { root: overlay }; }
  const session = await xr.requestSession("immersive-ar", opts);
  await renderer.xr.setSession(session);

  const viewerSpace = await session.requestReferenceSpace("viewer");
  const localSpace = await session.requestReferenceSpace("local");
  const hitSource = await session.requestHitTestSource({ space: viewerSpace });

  const onSelect = (): void => {
    if (!reticle.visible) return;
    model.position.setFromMatrixPosition(reticle.matrix); // plant it where the reticle sits
    model.visible = true;
  };
  session.addEventListener("select", onSelect);

  renderer.setAnimationLoop((_t: number, frame?: any) => {
    if (frame && hitSource) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(localSpace);
        if (pose) { reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); }
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });

  const cleanup = (): void => {
    renderer.setAnimationLoop(null);
    try { hitSource?.cancel?.(); } catch { /* already gone */ }
    session.removeEventListener("select", onSelect);
    renderer.domElement.remove();
    renderer.dispose();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
    onEnd?.(); // let the tab drop back out of AR mode (also fires when the user exits from browser UI)
  };
  session.addEventListener("end", cleanup);

  return { end: () => { try { session.end(); } catch { cleanup(); } } };
}
