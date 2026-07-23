// three/karkasAr.ts — «AR» tab: stand the solved cabinet in the real room, and export it as a portable
// .glb. Deliberately SELF-CONTAINED: the AR session builds its own renderer/scene/camera on a throwaway
// canvas instead of borrowing the editor's, so nothing here can disturb the main viewport (its render
// loop, its camera framing, its OrbitControls) — and a failed/cancelled session leaves no trace.
//
// PLATFORM REALITY (why the UI has three paths): immersive AR on the web is WebXR, and WebXR turned out
// to be a promise Android does not always keep — the founder's own phone reports `immersive-ar`
// supported and then refuses every session (Google's own WebXR sample fails there too). What DOES work
// on that phone is Google's Scene Viewer, the viewer behind "view in 3D" in Search. So the chain is:
//   WebXR  →  (on refusal, not just on "unsupported")  Scene Viewer  →  .glb download.
// Scene Viewer is an Android intent that fetches the model over HTTPS, which is why the middle path
// needs `uploadGlbForAr` — a browser-made blob: URL is invisible to it.

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { isAndroid, sceneViewerUrl } from "./arLink";

// The link builder lives in its own three-free module so it can be tested in plain Node; callers still
// reach it through this one AR entry point.
export { isAndroid, sceneViewerUrl, SCENE_VIEWER_PACKAGE } from "./arLink";

/** What this device can do with the model, best path first. */
export type ArSupport = "checking" | "webxr" | "sceneviewer" | "download";

interface XrNavigator { xr?: { isSessionSupported(mode: string): Promise<boolean> } }

/** Does this browser/device actually offer immersive AR? Never throws — a missing API is just "no". */
export async function detectArSupport(): Promise<ArSupport> {
  const fallback: ArSupport = isAndroid() ? "sceneviewer" : "download";
  const xr = (navigator as unknown as XrNavigator).xr;
  if (!xr?.isSessionSupported) return fallback;
  try {
    return (await xr.isSessionSupported("immersive-ar")) ? "webxr" : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Put the model where Scene Viewer can reach it: POST the .glb to our own function, which stores it in
 * Vercel Blob and returns a public https:// address. Rejects with the server's own words — "Blob
 * saqlagichi ulanmagan" is a setup problem, not something to hide behind a generic failure.
 */
export async function uploadGlbForAr(blob: Blob): Promise<string> {
  const res = await fetch("/api/ar-upload", {
    method: "POST",
    headers: { "content-type": "model/gltf-binary" },
    body: blob,
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `Yuklashda xato (${res.status})`);
  return data.url;
}

/** One refused `requestSession` attempt, kept so a failure can explain itself instead of guessing. */
export interface ArAttempt { required: string[]; optional: string[]; error: string }

/**
 * Every config was refused. Carries the per-attempt log and the LAST error's DOMException name, because
 * `name` is what distinguishes "no permission" from "device can't do it" — and this class would otherwise
 * mask it.
 */
export class ArSessionError extends Error {
  readonly reason: string;
  readonly attempts: ArAttempt[];
  constructor(last: unknown, attempts: ArAttempt[]) {
    super(last instanceof Error ? last.message : String(last));
    this.name = "ArSessionError";
    this.reason = last instanceof Error ? last.name : "";
    this.attempts = attempts;
  }
}

/**
 * What this device actually reports about WebXR. Read-only and never throws — meant to be shown to the
 * master (and copied to us) when AR refuses to start, so we diagnose from facts rather than guesses.
 */
export async function arDiagnostics(): Promise<Record<string, string>> {
  const xr = (navigator as unknown as { xr?: any }).xr;
  const out: Record<string, string> = {};
  out["Brauzer"] = navigator.userAgent;
  out["HTTPS"] = window.isSecureContext ? "ha" : "YO'Q — AR faqat HTTPS da ishlaydi";
  out["Asosiy oyna"] = window.top === window.self ? "ha" : "YO'Q — ilova ichidagi brauzer (Telegram/Instagram)";
  out["navigator.xr"] = xr ? "bor" : "yo'q — brauzerda WebXR yo'q";
  // The zaxira path matters more than WebXR on the phones that brought us here, so it is reported too.
  out["Android"] = isAndroid() ? "ha" : "yo'q";
  out["Scene Viewer"] = isAndroid() ? "mumkin (Google ilovasi orqali)" : "yo'q — faqat Android'da";
  if (xr?.isSessionSupported) {
    for (const mode of ["immersive-ar", "immersive-vr", "inline"]) {
      try { out[mode] = (await xr.isSessionSupported(mode)) ? "ha" : "yo'q"; }
      catch (e) { out[mode] = `xato: ${e instanceof Error ? e.name : String(e)}`; }
    }
  }
  return out;
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
 * M7.2 — the two neutral 3-D formats a workshop meets outside this app: `.stl` goes to a 3-D printer or
 * a machinist, `.obj` opens in every CAD and renderer there is. `.glb` above stays the one for phones
 * and AR. All three describe the SOLVED model at 1 unit = 1 m, so a part measured in another program
 * measures the same as in the cut list.
 *
 * STL is written BINARY on purpose: the ASCII form of the same model is roughly five times the size and
 * a wardrobe would run to tens of megabytes on a phone.
 */
export async function exportStl(group: THREE.Object3D): Promise<Blob> {
  const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
  const data = new STLExporter().parse(group, { binary: true }) as unknown as DataView;
  // Copy through a plain byte view: the DataView's buffer is typed ArrayBufferLike (it could be shared),
  // which Blob will not take.
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)], { type: "model/stl" });
}

export async function exportObj(group: THREE.Object3D): Promise<Blob> {
  const { OBJExporter } = await import("three/examples/jsm/exporters/OBJExporter.js");
  return new Blob([new OBJExporter().parse(group)], { type: "model/obj" });
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
  /** Did the device grant floor hit-test? false = no reticle, a tap drops the model in front instead. */
  hitTest: boolean;
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

  // Ask for the richest session the device will actually grant, degrading one demand at a time. A device
  // can report immersive-ar support and STILL refuse a specific config ("the specified session
  // configuration is not supported") — typically because hit-test was DEMANDED but ARCore is old/absent,
  // or because the dom-overlay root was not rendered when the request went out. Failing outright there
  // told the usta nothing useful, so each step drops one requirement instead.
  const configs: Record<string, unknown>[] = [];
  if (overlay) configs.push({ requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay"], domOverlay: { root: overlay } });
  configs.push({ requiredFeatures: ["hit-test"] });
  if (overlay) configs.push({ optionalFeatures: ["hit-test", "dom-overlay"], domOverlay: { root: overlay } });
  configs.push({ optionalFeatures: ["hit-test"] });
  configs.push({});
  let session: any = null;
  let lastErr: unknown = null;
  const attempts: ArAttempt[] = [];
  for (const opts of configs) {
    try { session = await xr.requestSession("immersive-ar", opts); break; }
    catch (e) {
      lastErr = e;
      attempts.push({
        required: (opts.requiredFeatures as string[]) ?? [],
        optional: (opts.optionalFeatures as string[]) ?? [],
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  }
  if (!session) {
    renderer.domElement.remove();
    renderer.dispose();
    throw new ArSessionError(lastErr, attempts);
  }
  await renderer.xr.setSession(session);

  const localSpace = await session.requestReferenceSpace("local");
  // hit-test may not have been granted (it is only optional in the later configs). Without it there is
  // no floor reticle, so a tap plants the cabinet a short way in front of the camera instead.
  let hitSource: any = null;
  try {
    if (typeof session.requestHitTestSource === "function") {
      const viewerSpace = await session.requestReferenceSpace("viewer");
      hitSource = await session.requestHitTestSource({ space: viewerSpace });
    }
  } catch { hitSource = null; }

  const onSelect = (): void => {
    if (reticle.visible) {
      model.position.setFromMatrixPosition(reticle.matrix); // plant it where the reticle sits
    } else {
      // No floor detection on this device — drop it a step in front of where the phone is pointing, at
      // roughly floor level (a phone is held ~1.3 m up), so the tap still does something sensible.
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      model.position.copy(camera.position).addScaledVector(fwd, 1.5);
      model.position.y = camera.position.y - 1.3;
    }
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

  return { end: () => { try { session.end(); } catch { cleanup(); } }, hitTest: !!hitSource };
}
