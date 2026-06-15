// Floor-device render spike (R-M7). Tests ONLY the GPU/render side of the shipping
// architecture: shared low-poly geometry transformed (never rebuilt), NO CSG, holes
// as InstancedMesh markers in an X-ray toggle, cheap lighting, draw-call discipline.
//
// The engine data layer is already proven fast (PERF_LEDGER). This file imports the
// engine's read-only data + solvePreview and renders it under the strict rules, then
// measures FPS / frame time / draw calls / triangles / memory on screen.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { solvePreview, type Project } from "../../../engine/index.js";
import {
  buildGKitchen,
  rebuildCabinet,
  type Marker,
  type MarkerType,
  type PlacedPanel,
  type Vec3,
} from "./kitchen.js";
import { Metrics, makeOverlay, renderOverlay } from "./metrics.js";

const T0 = performance.now(); // for cold-load → interactive timing

// ----------------------------------------------------------------- renderer/scene
const MM = 0.001; // locked mm → metre scale
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202428);

// Cheap baked-ish PBR environment (one generated map, no real-time GI).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(4.2, 2.4, 4.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(2.1, 1.0, 0.4);

// Lighting: one hemisphere fill + one shadow-casting directional. No GI.
scene.add(new THREE.HemisphereLight(0xffffff, 0x404044, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.near = 1; sc.far = 30; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
scene.add(sun);

// Ground (receives shadow only — keeps the kitchen grounded without extra draw cost).
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.ShadowMaterial({ opacity: 0.25 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// World root carries the mm→metre scale so all layout math stays in millimetres.
const root = new THREE.Group();
root.scale.setScalar(MM);
scene.add(root);

// ----------------------------------------------------------------- scene build
const kitchen = buildGKitchen();

// Panels: ONE InstancedMesh of a unit box, transformed per instance. 1 draw call
// for the whole kitchen. A box is 12 triangles.
const panelGeo = new THREE.BoxGeometry(1, 1, 1);
const panelMat = new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.7, metalness: 0.02 });
const panelMesh = new THREE.InstancedMesh(panelGeo, panelMat, kitchen.panels.length);
panelMesh.castShadow = true;
panelMesh.receiveShadow = true;
root.add(panelMesh);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

function panelMatrix(p: PlacedPanel, out: THREE.Matrix4): THREE.Matrix4 {
  const u = v3(p.u), v = v3(p.v), n = v3(p.n);
  _basis.makeBasis(u, v, n);
  _q.setFromRotationMatrix(_basis);
  // Box centre = origin + u·L/2 + v·W/2 − n·th/2 (body sits behind Face A).
  _p.copy(v3(p.origin))
    .addScaledVector(u, p.length / 2)
    .addScaledVector(v, p.width / 2)
    .addScaledVector(n, -p.thickness / 2);
  _s.set(p.length, p.width, p.thickness);
  return out.compose(_p, _q, _s);
}
for (const p of kitchen.panels) panelMesh.setMatrixAt(p.index, panelMatrix(p, _m));
panelMesh.instanceMatrix.needsUpdate = true;

// Markers: ONE InstancedMesh per marker TYPE (cup/cam/pin/dowel/confirmat/mark).
// Ten thousand holes = a handful of draw calls. Visible only in X-ray.
const MARKER_STYLE: Record<MarkerType, { color: number; len: number }> = {
  cup: { color: 0xff5544, len: 13 },
  cam: { color: 0xffcc33, len: 12 },
  pin: { color: 0x33ddff, len: 11 },
  dowel: { color: 0xffffff, len: 14 },
  confirmat: { color: 0xff44ff, len: 17 },
  mark: { color: 0x88ff88, len: 2 },
};
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const markersByType = new Map<MarkerType, Marker[]>();
for (const mk of kitchen.markers) (markersByType.get(mk.type) ?? markersByType.set(mk.type, []).get(mk.type)!).push(mk);

const markerMeshes = new Map<MarkerType, THREE.InstancedMesh>();
/** slot bookkeeping so the width-drag can rewrite only one cabinet's instances */
const markerSlotOf: Array<{ type: MarkerType; slot: number }> = []; // by global marker order
{
  const counter = new Map<MarkerType, number>();
  for (const mk of kitchen.markers) {
    const slot = counter.get(mk.type) ?? 0;
    counter.set(mk.type, slot + 1);
    markerSlotOf.push({ type: mk.type, slot });
  }
}

function markerMatrix(mk: Marker, out: THREE.Matrix4): THREE.Matrix4 {
  _q.setFromUnitVectors(Y_AXIS, v3(mk.dir));
  _p.copy(v3(mk.pos));
  const len = MARKER_STYLE[mk.type].len;
  _s.set(mk.diameter, len, mk.diameter); // cylinder: radius from diameter, height = drill depth
  return out.compose(_p, _q, _s);
}
for (const [type, list] of markersByType) {
  // Low-poly: 6-sided open cylinder (radius 0.5, height 1) scaled per instance.
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: MARKER_STYLE[type].color });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((mk, i) => mesh.setMatrixAt(i, markerMatrix(mk, _m)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = false; // X-ray off by default
  root.add(mesh);
  markerMeshes.set(type, mesh);
}

// Per-cabinet instance maps for the width-drag (transform-only update target).
const panelIdxByCab = new Map<number, number[]>();
kitchen.panels.forEach((p) => (panelIdxByCab.get(p.cabinetId) ?? panelIdxByCab.set(p.cabinetId, []).get(p.cabinetId)!).push(p.index));
const markerSlotByCab = new Map<number, Array<{ type: MarkerType; slot: number }>>();
kitchen.markers.forEach((mk, i) =>
  (markerSlotByCab.get(mk.cabinetId) ?? markerSlotByCab.set(mk.cabinetId, []).get(mk.cabinetId)!).push(markerSlotOf[i]!),
);

// ----------------------------------------------------------------- metrics + UI
const metrics = new Metrics();
const overlay = makeOverlay();
let xray = false;
let status = "ready";
let coldLoadMs = 0;

function drawCalls(): number { return renderer.info.render.calls; }
function memMB(): number {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / 1048576 : 0;
}

// ----------------------------------------------------------------- stress tests
interface StressWindow { run(now: number): void; readonly active: boolean; }
let stress: StressWindow | null = null;

const CENTRAL_CAB = 2; // a base-run cabinet in the middle of the G

function startOrbitStress(): void {
  const end = performance.now() + 30_000;
  metrics.reset();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 6;
  status = "ORBIT STRESS… 30s";
  stress = {
    get active() { return performance.now() < end; },
    run() {
      if (performance.now() >= end) {
        controls.autoRotate = false;
        results.orbit = { fps: metrics.avgFps(), low: metrics.onePercentLowFps(), calls: drawCalls() };
        status = `orbit done: ${results.orbit.fps.toFixed(0)} fps (1% low ${results.orbit.low.toFixed(0)}), ${results.orbit.calls} draws`;
        console.log("[orbit]", results.orbit);
        stress = null;
        renderVerdict();
      }
    },
  };
}

function startDragStress(): void {
  const end = performance.now() + 15_000;
  const base = 600;
  let updates = 0;
  let updateMsTotal = 0;
  let updateMsMax = 0;
  metrics.reset();
  status = "WIDTH-DRAG STRESS… 15s (transform only)";
  let lastUpdate = 0;
  stress = {
    get active() { return performance.now() < end; },
    run(now: number) {
      // ~30 Hz parametric edits.
      if (now - lastUpdate >= 33) {
        lastUpdate = now;
        const t0 = performance.now();
        const newW = base + Math.round(200 * Math.sin(now / 400)); // 400..800mm
        applyWidth(CENTRAL_CAB, newW);
        const dt = performance.now() - t0;
        updates++; updateMsTotal += dt; updateMsMax = Math.max(updateMsMax, dt);
      }
      if (now >= end) {
        results.drag = {
          fps: metrics.avgFps(),
          perUpdateMs: updates ? updateMsTotal / updates : 0,
          perUpdateMaxMs: updateMsMax,
        };
        status = `drag done: ${results.drag.fps.toFixed(0)} fps, ${results.drag.perUpdateMs.toFixed(2)}ms/update (max ${results.drag.perUpdateMaxMs.toFixed(2)})`;
        console.log("[width-drag]", results.drag);
        stress = null;
        renderVerdict();
      }
    },
  };
}

/**
 * Apply a new width to one cabinet. CRITICAL: this calls the engine (solvePreview on
 * the rebuilt cabinet — the same preview path the UI will use) and then updates ONLY
 * the affected instances' MATRICES. It NEVER creates geometry. That is the
 * transform-not-rebuild architecture the mobile-CAD red-team said was impossible.
 */
function applyWidth(cabinetId: number, newWidth: number): void {
  const { panels, markers } = rebuildCabinet(cabinetId, newWidth);

  // Exercise the real engine preview path (bounded, ~ms) — result drives nothing
  // here except proving the call is in the per-update budget.
  const project: Project = { id: `drag_${cabinetId}`, name: "drag", parts: panels.map((p) => p.part) };
  solvePreview(project);

  const idx = panelIdxByCab.get(cabinetId)!;
  panels.forEach((p, i) => panelMesh.setMatrixAt(idx[i]!, panelMatrix(p, _m)));
  panelMesh.instanceMatrix.needsUpdate = true;

  const slots = markerSlotByCab.get(cabinetId)!;
  markers.forEach((mk, i) => {
    const s = slots[i];
    if (!s) return; // count guard: never rebuild, skip if shape drifted
    markerMeshes.get(s.type)!.setMatrixAt(s.slot, markerMatrix(mk, _m));
  });
  for (const mesh of markerMeshes.values()) mesh.instanceMatrix.needsUpdate = true;
}

function toggleXray(): void {
  const before = (renderer.info.render.calls);
  xray = !xray;
  for (const mesh of markerMeshes.values()) mesh.visible = xray;
  // Measure on the next rendered frame.
  requestAnimationFrame(() => {
    results.xray = { on: xray, calls: drawCalls(), fps: metrics.avgFps(), delta: drawCalls() - before };
    status = `x-ray ${xray ? "ON" : "off"}: ${drawCalls()} draws, ${metrics.avgFps().toFixed(0)} fps`;
    console.log("[x-ray]", results.xray);
    renderVerdict();
  });
}

// ----------------------------------------------------------------- results/verdict
interface Results {
  orbit?: { fps: number; low: number; calls: number };
  drag?: { fps: number; perUpdateMs: number; perUpdateMaxMs: number };
  xray?: { on: boolean; calls: number; fps: number; delta: number };
}
const results: Results = {};

function renderVerdict(): void {
  const rows: Array<[string, string, boolean | null]> = [
    ["Sustained FPS during orbit ≥30", results.orbit ? `${results.orbit.fps.toFixed(0)} (1% low ${results.orbit.low.toFixed(0)})` : "—", results.orbit ? results.orbit.fps >= 30 : null],
    ["FPS during width-drag ≥30", results.drag ? results.drag.fps.toFixed(0) : "—", results.drag ? results.drag.fps >= 30 : null],
    ["Per parametric update ≤4ms", results.drag ? `${results.drag.perUpdateMs.toFixed(2)}ms (max ${results.drag.perUpdateMaxMs.toFixed(2)})` : "—", results.drag ? results.drag.perUpdateMaxMs <= 4 : null],
    ["Draw calls X-ray OFF (dozens)", `${baseDrawCalls}`, baseDrawCalls <= 60],
    ["X-ray ON still ≥30 fps", results.xray ? `${results.xray.fps.toFixed(0)} fps @ ${results.xray.calls} draws` : "—", results.xray ? (results.xray.on ? results.xray.fps >= 30 : null) : null],
    ["Cold load → interactive ≤3s", `${(coldLoadMs / 1000).toFixed(2)}s`, coldLoadMs <= 3000],
  ];
  const done = rows.filter((r) => r[2] !== null);
  const passed = done.filter((r) => r[2] === true).length;
  const lines = rows.map(([k, val, ok]) => `${ok === null ? "  …" : ok ? "  ✅" : "  ❌"} ${k.padEnd(34)} ${val}`);
  verdictEl.textContent =
    `VERDICT  (${passed}/${done.length} measured rows pass)\n` + lines.join("\n") +
    `\n\nscene: ${kitchen.cabinetCount} cabinets, ${kitchen.panels.length} panels, ${kitchen.markers.length} hole markers`;
  console.table(rows.map(([k, val, ok]) => ({ check: k, value: val, pass: ok })));
}

// ----------------------------------------------------------------- buttons + verdict panel
function button(label: string, x: number, fn: () => void): void {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = [
    "position:fixed", "bottom:12px", `left:${x}px`, "z-index:20",
    "font:600 15px/1 ui-monospace,monospace", "padding:14px 16px",
    "background:#0a4", "color:#fff", "border:0", "border-radius:8px",
  ].join(";");
  b.onclick = fn;
  document.body.appendChild(b);
}
button("Orbit 30s", 12, startOrbitStress);
button("Width-drag 15s", 120, startDragStress);
button("X-ray toggle", 268, toggleXray);

const verdictEl = document.createElement("div");
verdictEl.style.cssText = [
  "position:fixed", "bottom:64px", "left:12px", "right:12px", "z-index:15",
  "font:600 14px/1.45 ui-monospace,monospace", "color:#cde",
  "background:rgba(0,0,0,0.74)", "padding:10px 12px", "border-radius:8px",
  "white-space:pre-wrap", "pointer-events:none", "max-height:46vh", "overflow:hidden",
].join(";");
document.body.appendChild(verdictEl);

// ----------------------------------------------------------------- loop
let baseDrawCalls = 0;
let firstFrame = true;
function frame(): void {
  const now = performance.now();
  metrics.tick(now);
  controls.update();
  if (stress) stress.run(now);
  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    coldLoadMs = now - T0;
    baseDrawCalls = drawCalls(); // X-ray off baseline
    console.log(`[cold-load] first interactive frame at ${coldLoadMs.toFixed(0)}ms; base draw calls ${baseDrawCalls}`);
    renderVerdict();
  }
  renderOverlay(overlay, metrics, {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  }, memMB(), status);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Console summary of the scene shape (capturable over USB).
console.log(
  `[scene] ${kitchen.cabinetCount} cabinets, ${kitchen.panels.length} panels, ` +
  `${kitchen.markers.length} markers, ${markerMeshes.size} marker draw-call types`,
);
