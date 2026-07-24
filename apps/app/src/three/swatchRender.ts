// M10.2/M10.3 — PBR material swatches, rendered at runtime.
//
// Moblo shows each material as a lit sphere, so a glossy white reads glossy and marble reads marble.
// Ours were flat CSS squares: «Мрамор белый» was an ordinary white box, and the three sliders in the
// create dialog moved nothing you could see. This module renders the REAL material — the very same
// `materialForFinish` the 3D scene builds from — onto a ball (or a cube) and hands back a data URL.
//
// Runtime, not shipped PNGs: a user-created material has no PNG to ship, and the whole point of the
// M9U.3 creator is that what you slide is what you get. Renders are cached by a key derived from every
// property that changes the picture, so the ~25 catalog swatches cost one pass of a few milliseconds
// and every later paint is a cache hit (session-lifetime Map).
//
// It draws through the EDITOR'S OWN renderer, into an offscreen render target. A phone GPU keeps only
// a handful of WebGL contexts alive and evicts the oldest — opening a second one to make thumbnails
// could cost us the actual 3D view. Rendering to a target on the existing context cannot. The private
// fallback renderer below only ever runs where no host was registered (tests, a stray mount order).
//
// Nothing here touches the model, the cut list or the price.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import type { BoardMaterial } from "./materials";
import { materialForFinish } from "./structureRenderer";

/** what a swatch is drawn on: a ball reads a finish best, a cube reads a board's texture */
export type SwatchShape = "ball" | "cube";
/** the fields that change the picture — anything accepted here can be previewed, saved or not */
export type SwatchSpec = Pick<BoardMaterial, "hex" | "finish" | "texture" | "roughness" | "metalness" | "opacity">;

const SIZE = 128; // rendered once, drawn at ~20–120 CSS px — 128 stays crisp on a 2× phone screen
const cache = new Map<string, string>();

let host: THREE.WebGLRenderer | null = null; // the editor's renderer, when one is mounted
let hostEnv: THREE.Texture | null = null; // …and the PMREM environment its scene uses
let own: THREE.WebGLRenderer | null = null; // private fallback (tests); built at most once
let ownFailed = false;

interface Rig { scene: THREE.Scene; camera: THREE.PerspectiveCamera; ball: THREE.Mesh; cube: THREE.Mesh; target: THREE.WebGLRenderTarget; env: THREE.Texture | null }
let rig: Rig | null = null;

/**
 * Register the editor's renderer (and the environment map its scene uses) as the drawing surface for
 * swatches. Call with `null` on unmount. Changing the host drops the cache: the same material can look
 * different under a different environment, and a stale picture is worse than a re-render.
 */
export function setSwatchHost(renderer: THREE.WebGLRenderer | null, environment?: THREE.Texture | null): void {
  if (host === renderer && hostEnv === (environment ?? null)) return;
  host = renderer;
  hostEnv = environment ?? null;
  cache.clear();
  if (rig) { rig.target.dispose(); rig = null; } // the target belongs to the old context
}

/** The renderer we may draw with — the host if one is mounted, else a private context built on demand. */
function drawer(): THREE.WebGLRenderer | null {
  if (host) return host;
  if (own) return own;
  if (ownFailed) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE; canvas.height = SIZE;
    own = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    own.setSize(SIZE, SIZE, false);
    return own;
  } catch {
    ownFailed = true; // no WebGL here — every caller falls back to its flat colour swatch
    return null;
  }
}

function getRig(r: THREE.WebGLRenderer): Rig {
  if (rig) return rig;
  const scene = new THREE.Scene();
  // Prefer the editor's own environment so a swatch PREDICTS the 3D scene rather than merely looking
  // nice. Without a host we build the same RoomEnvironment the editor builds.
  let env = hostEnv;
  if (!env) {
    try {
      const pmrem = new THREE.PMREMGenerator(r);
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch { env = null; }
  }
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.42, 3.05);
  camera.lookAt(0, 0, 0);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 32), new THREE.MeshStandardMaterial());
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.16, 1.16), new THREE.MeshStandardMaterial());
  cube.rotation.set(-0.42, 0.72, 0);
  scene.add(ball, cube);

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
  rig = { scene, camera, ball, cube, target, env: hostEnv ? null : env }; // only dispose an env we made
  return rig;
}

/** Everything about a material that changes the picture. Two boards with the same key share a render. */
export function swatchKey(m: SwatchSpec, shape: SwatchShape): string {
  return [shape, m.hex, m.finish ?? "-", m.texture ?? "-", m.roughness ?? "-", m.metalness ?? "-", m.opacity ?? "-"].join("|");
}

/** RGBA bottom-up pixels → a PNG data URL (WebGL reads bottom-up; a −1 y-scale flips it). */
function pixelsToDataUrl(px: Uint8Array): string {
  const c = document.createElement("canvas");
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(SIZE, SIZE);
  img.data.set(px);
  const tmp = document.createElement("canvas");
  tmp.width = SIZE; tmp.height = SIZE;
  const tctx = tmp.getContext("2d");
  if (!tctx) return "";
  tctx.putImageData(img, 0, 0);
  ctx.translate(0, SIZE);
  ctx.scale(1, -1);
  ctx.drawImage(tmp, 0, 0);
  return c.toDataURL("image/png");
}

/**
 * Render one material to a PNG data URL. Returns "" when there is no WebGL to draw with — callers keep
 * their flat colour swatch in that case, so a swatch never renders blank.
 */
export function swatchDataUrl(m: SwatchSpec, shape: SwatchShape = "ball"): string {
  const key = swatchKey(m, shape);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const r = drawer();
  if (!r) return "";
  let mat: THREE.MeshStandardMaterial | null = null;
  const prevTarget = r.getRenderTarget();
  try {
    const rg = getRig(r);
    // A swatch is a small object, so pass a small `size`: the texture generators scale their grain to
    // the board, and a cabinet-sized grain on a 128 px ball would read as a flat wash.
    mat = materialForFinish(new THREE.Color(m.hex).getHex(), m.finish, m.texture, [0.35, 0.35, 0.35], {
      ...(m.roughness !== undefined ? { roughness: m.roughness } : {}),
      ...(m.metalness !== undefined ? { metalness: m.metalness } : {}),
      ...(m.opacity !== undefined ? { opacity: m.opacity } : {}),
    });
    const target = shape === "cube" ? rg.cube : rg.ball;
    rg.ball.visible = shape === "ball";
    rg.cube.visible = shape === "cube";
    const prevMat = target.material as THREE.Material;
    target.material = mat;
    r.setRenderTarget(rg.target);
    r.setClearColor(0x000000, 0); // transparent corners: the swatch sits on the sheet's own background
    r.clear();
    r.render(rg.scene, rg.camera);
    const px = new Uint8Array(SIZE * SIZE * 4);
    r.readRenderTargetPixels(rg.target, 0, 0, SIZE, SIZE, px);
    target.material = prevMat;
    const url = pixelsToDataUrl(px);
    cache.set(key, url);
    return url;
  } catch {
    cache.set(key, ""); // never retry a material that blew up — one flat swatch beats a render loop
    return "";
  } finally {
    r.setRenderTarget(prevTarget); // hand the host back exactly the target it was drawing to
    if (mat) { mat.map?.dispose(); mat.normalMap?.dispose(); mat.dispose(); }
  }
}

/** Test/HMR seam: drop the cache and the rig. */
export function resetSwatchCache(): void {
  cache.clear();
  if (rig) {
    rig.ball.geometry.dispose(); rig.cube.geometry.dispose();
    rig.env?.dispose();
    rig.target.dispose();
    rig = null;
  }
}
