// 3D variant preview — the room the user designed, furnished with the selected
// layout. Reuses makeRoom/makeWoodTexture from ThreeScene so the room looks
// identical to the editor, then drops in the kitchen via kitchen3d. ONE canvas,
// render-on-demand, wall culling; switching variants swaps only the kitchen group
// (the perf path the R-M7 render spike already gated at 60fps on the floor device).
//
// In the constructor it also carries a direct-manipulation gizmo: a selected
// module shows a move handle (slide it on the floor) and a rotate handle (spin it
// horizontally, with a circular progress ring) — mirrors the 2D plan. Both write
// the SAME px/pz/rot free transform the plan uses (via onMovePlan / onBeginEdit),
// so 2D ⇄ 3D stay in sync and undo/redo "just works".

import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeRoom, makeWoodTexture, type WallInfo } from "./ThreeScene";
import { PBR, applyPbrFloor, onTexturesReady } from "./pbr";
import { buildKitchen } from "./kitchen3d";
import { buildProjectBlocksGroup } from "./karkasLayer";
import { planRuns, type KitchenLayout } from "../model/runPlan";
import { polygonBoundsMm, offsetPolygon, type Pt, type Opening, type Fitting } from "../model/room";
import { cabFootprints, halfExtents, footsOverlap, objectOverlapIds, type Foot } from "../model/footprint";
import type { Surface } from "../model/walls";
import type { KitchenStyle } from "../model/layout";
import type { Cabinet } from "../model/cabinet";
import { ICON_DRAG_PATH, ICON_ROTATE_PATH, ICON_VMOVE_PATH } from "../components/icons";
import { registerCapture } from "../lib/thumbnailCapture";

export interface SceneApi {
  setKitchen: (cabs: Cabinet[], style: KitchenStyle) => void;
  /** Phase D2 — (re)build the parallel karkas-blocks layer, alongside the kitchen (never replacing). */
  setKarkasBlocks: (blocks: readonly { karkasJson: string; x?: number; z?: number; id?: string }[]) => void;
  setView: (v: KitchenView) => void;
  syncGizmo: () => void;
  invalidate: () => void;
  /** render the current frame and return it as a PNG data URL (for the AI render) */
  captureDataUrl: () => string;
  /** screen point → horizontal plane at height yM (metres) → world x/z, or null */
  floorMetres: (clientX: number, clientY: number, yM?: number) => { x: number; z: number } | null;
  /** world point (metres) → screen px (relative to the canvas) */
  project: (x: number, y: number, z: number) => { x: number; y: number };
  /** move/rotate the live selected module group (px/pz absolute mm, rot degrees) */
  applyTransform: (id: string, pxMm: number, pzMm: number, rotDeg: number, depthM: number) => void;
  /** D3b.4 — live-move a karkas block group to room-centre-relative x/z (mm). */
  applyBlockTransform: (id: string, xMm: number, zMm: number) => void;
  /** live-resize preview: rebuild the kitchen with one module's width/height overridden
   *  (real geometry via buildKitchen, so it matches the commit exactly — no jump) */
  previewResize: (id: string, wMm?: number, hMm?: number) => void;
  /** shift a wall-unit group up/down by dyM metres (live vertical drag) */
  setUpperY: (id: string, dyM: number) => void;
  /** tint a module's meshes: a hex colour (red warn / blue selected) or null to clear */
  setTint: (id: string, color: number | null) => void;
  /** screen pixels per world metre (vertical) at a world point — for the up/down drag */
  pxPerMeterY: (x: number, y: number, z: number) => number;
  rect: () => DOMRect;
  dispose: () => void;
}

function disposeGroup(gr: THREE.Object3D) {
  gr.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/** Camera framing for the kitchen stage. */
export type KitchenView = "3d" | "plan";

/** Render style for the kitchen group:
 *  - real  → freshly built materials, unchanged.
 *  - xray  → translucent facades (see the carcass / interior through them).
 *  - wire  → edges only (wireframe).
 *  Both are GPU rasterisation flags — no extra geometry/RAM, cheap to toggle. */
export type RenderMode = "real" | "xray" | "wire";
function applyMode(group: THREE.Object3D, mode: RenderMode) {
  if (mode === "real") return; // materials are rebuilt each swap, so nothing to undo
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mm of mats) {
      const m = mm as THREE.MeshStandardMaterial;
      if (mode === "wire") {
        m.wireframe = true;
      } else {
        // xray: keep already-glassy parts as-is, frost the solids
        if (!m.transparent) {
          m.transparent = true;
          m.opacity = 0.42;
        }
      }
      m.needsUpdate = true;
    }
  });
}

/** Tint the selected module's meshes so it reads as picked (across render modes). */
function highlightCab(root: THREE.Object3D, id: string | null) {
  if (!id) return;
  for (const child of root.children) {
    if (child.userData.cabId !== id) continue;
    child.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        const m = mm as THREE.MeshStandardMaterial;
        if ("emissive" in m) {
          m.emissive = new THREE.Color(0x2a6df0);
          m.emissiveIntensity = 0.5;
          m.needsUpdate = true;
        }
      }
    });
  }
}

/** D3b — blue emissive tint on the selected karkas block group (matches highlightCab). */
function highlightBlock(root: THREE.Object3D, id: string | null) {
  if (!id) return;
  for (const child of root.children) {
    if (child.userData.karkasBlockId !== id) continue;
    child.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mm of mats) {
        const m = mm as THREE.MeshStandardMaterial;
        if ("emissive" in m) {
          m.emissive = new THREE.Color(0x2a6df0);
          m.emissiveIntensity = 0.5;
          m.needsUpdate = true;
        }
      }
    });
  }
}

// gizmo geometry (CSS px / metres) — handle radius, ring radius, icon scale, lift
const HANDLE_R = 17;
const RING = 66;
const ICON_S = 0.78;
const GIZMO_Y = 0.45; // base/tall handle height (m) — mid-base so it reads as "on" the module
const SNAP_MM = 130; // magnet catch distance
const ROT_SNAP_DEG = 9; // rotation catch zone around each 45°
const UPPER_BOTTOM_MM = 1520; // default wall-unit bottom above floor (matches kitchen3d)
const COUNTER_TOP_MM = 860; // worktop surface (BASE_TOP + WORKTOP) — gap reference for uppers
const DEG = 180 / Math.PI;
const RED = 0xe53935;
const BLUE = 0x2a6df0;
// module resize (drag the face arrows) — 5 cm steps, sane cabinet bounds (mm)
const RESIZE_STEP = 50;
const W_MIN = 150;
const W_MAX = 1200;
const H_MIN = 200;
const H_MAX = 1200;
const snapStep = (mm: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(mm / RESIZE_STEP) * RESIZE_STEP));

// nearest room-wall edge to a point, with its inward normal + foot point (all mm).
// `pts` is the inner-wall polygon; (cx,cy) is a room-interior reference for the normal.
function nearestWall(px: number, pz: number, pts: Pt[], cx: number, cy: number) {
  let best = { d: Infinity, nx: 0, nz: 1, fx: px, fz: pz };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1) continue;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.y) * dz) / l2));
    const fx = a.x + dx * t;
    const fz = a.y + dz * t;
    const d = Math.hypot(px - fx, pz - fz);
    if (d < best.d) {
      let nx = dz, nz = -dx;
      const ln = Math.hypot(nx, nz) || 1;
      nx /= ln; nz /= ln;
      const mx = (a.x + b.x) / 2, mz = (a.y + b.y) / 2;
      if ((cx - mx) * nx + (cy - mz) * nz < 0) { nx = -nx; nz = -nz; } // point into the room
      best = { d, nx, nz, fx, fz };
    }
  }
  return best;
}

interface Geom {
  cx: number; // room centre (absolute mm) — world origin in metres
  cy: number;
  foots: Foot[];
  selFoot?: Foot;
  inner: Pt[];
  selMountY: number; // selected wall-unit bottom (mm)
  selH: number; // selected module height (mm)
  selW: number; // selected module width (mm)
  selUpper: boolean; // selected is a wall unit (only these have a c.h-driven 3D height)
  selResizable: boolean; // resize handles allowed (not a corner unit)
  selFree: boolean; // free (px/pz) placement → resize grows about the centre
  selCenterY: number; // handle height for the selected module (m)
  upperLevels: number[]; // other wall units' snap heights (mm) for the up/down drag
}

type Drag = {
  mode: "move" | "rotate" | "vertical" | "resizeW" | "resizeH";
  id: string;
  depthM: number;
  px: number; // live centre (absolute mm)
  pz: number;
  rot: number; // live rotation (deg)
  moved: boolean;
  // move
  px0: number;
  pz0: number;
  downX: number;
  downZ: number;
  // rotate
  startRot: number;
  prevA: number;
  accum: number;
  a0Screen: number;
  // vertical (wall units)
  mountY: number; // live bottom (mm)
  mountY0: number;
  vy0: number; // pointer clientY at down
  pxPerM: number; // screen px per world metre (vertical)
  // resize (width along the module's local X, height along Y) — snapped to 5 cm
  w0: number; // width at grab (mm)
  h0: number; // height at grab (mm)
  liveW: number; // last committed preview width (mm)
  liveH: number; // last committed preview height (mm)
  axX: number; // module local +x world unit (XZ), for width drag
  axZ: number;
  startMmX: number; // grab point on the handle-height plane (absolute mm)
  startMmZ: number;
  free: boolean; // free (px/pz) module → grows about its centre (factor 2), else left-anchored
};

// snap a dragged footprint centre to walls + neighbours (magnet), then ALWAYS clamp
// it back inside the room so a module can never be pushed through a wall
function snapMove(f: Foot, px: number, pz: number, g: Geom, cb: { magnet: boolean }) {
  const xs = g.inner.map((p) => p.x);
  const ys = g.inner.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  let sx = px;
  let sy = pz;
  if (cb.magnet) {
    // candidate centres: flush to a wall, or align/abut a neighbour
    const candX = [minX + f.hbx, maxX - f.hbx];
    const candY = [minY + f.hby, maxY - f.hby];
    for (const o of g.foots) {
      if (o.id === f.id) continue;
      candX.push(o.cx, o.cx - o.hbx - f.hbx, o.cx + o.hbx + f.hbx);
      candY.push(o.cy, o.cy - o.hby - f.hby, o.cy + o.hby + f.hby);
    }
    let bx = SNAP_MM;
    for (const v of candX) { const d = Math.abs(px - v); if (d < bx) { bx = d; sx = v; } }
    let by = SNAP_MM;
    for (const v of candY) { const d = Math.abs(pz - v); if (d < by) { by = d; sy = v; } }
  }
  // wall push-back — keep the whole footprint inside the room walls
  const loX = minX + f.hbx, hiX = maxX - f.hbx;
  const loY = minY + f.hby, hiY = maxY - f.hby;
  if (loX <= hiX) sx = Math.min(hiX, Math.max(loX, sx));
  if (loY <= hiY) sy = Math.min(hiY, Math.max(loY, sy));
  return { x: sx, y: sy };
}

/** a Foot for the live dragged module at (px,pz,rotDeg), reusing the selected dims */
function dragFoot(sel: Foot, px: number, pz: number, rotDeg: number): Foot {
  const r = rotDeg / DEG;
  const ux = Math.cos(r), uy = Math.sin(r), ix = -Math.sin(r), iy = Math.cos(r);
  return { ...sel, cx: px, cy: pz, ux, uy, ix, iy, rotDeg, ...halfExtents(ux, uy, ix, iy, sel.w, sel.depth) };
}

export function VariantScene({
  points,
  ceiling,
  openings,
  coveringColor,
  floorId,
  interiorWalls,
  fittings,
  wallSurfaces,
  waterWall,
  layout,
  style,
  cabs,
  projectBlocks = [],
  mode = "real",
  view = "3d",
  magnet = true,
  nav = false,
  openIds,
  selectedId = null,
  selectedBlockId = null,
  onSelectCab,
  onSelectBlock,
  onBlockMove,
  onMovePlan,
  onBeginEdit,
  onMountY,
  onResize,
  onApi,
  onReady,
}: {
  points: Pt[];
  ceiling: number;
  openings: Opening[];
  coveringColor: string;
  floorId?: string;
  interiorWalls: Pt[][];
  fittings: Fitting[];
  wallSurfaces: Record<number, Surface>;
  waterWall: number | null;
  layout: KitchenLayout;
  style: KitchenStyle;
  cabs: Cabinet[];
  /** Phase D — karkas blocks placed into the project, rendered as a parallel layer (optional). */
  projectBlocks?: readonly { karkasJson: string; x?: number; z?: number; id?: string }[];
  /** constructor render style — defaults to realistic (other screens omit it) */
  mode?: RenderMode;
  /** camera framing — 3/4 orbit or top-down plan (constructor only) */
  view?: KitchenView;
  /** snap moves/rotations to walls, neighbours and 45°/90° (constructor only) */
  magnet?: boolean;
  /** show the on-screen joystick to walk the camera around the room (constructor only) */
  nav?: boolean;
  /** ids of modules whose doors/drawers are currently open (animated) */
  openIds?: string[];
  /** highlighted module id (constructor only) */
  selectedId?: string | null;
  /** D3b — the selected karkas project block id (blue-highlighted in the room). */
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  /** D3b.4 — commit a dragged block to a new room-centre-relative x/z (mm). */
  onBlockMove?: (id: string, xMm: number, zMm: number) => void;
  /** tap a module → its id (or null when tapping empty space) */
  onSelectCab?: (id: string | null) => void;
  /** commit a free plan transform (move/rotate) — same path the 2D plan uses */
  onMovePlan?: (id: string, patch: { px?: number; pz?: number; rot?: number }) => void;
  /** snapshot before a gesture so the whole move/rotate is one undo step */
  onBeginEdit?: () => void;
  /** commit a wall-unit's bottom height (mm) — vertical handle drag */
  onMountY?: (id: string, mountY: number) => void;
  /** commit a module resize (width / height in mm, snapped to 5 cm) — face-arrow drag */
  onResize?: (id: string, patch: { w?: number; h?: number }) => void;
  /** hands the imperative scene API to the parent (used by the Preview/Render step) */
  onApi?: (api: SceneApi | null) => void;
  /** fired ONCE when the scene has settled (first render + textures) — the constructor
   *  uses it to grab a single, consistent project thumbnail on entry */
  onReady?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  // overlay handles (positioned imperatively each frame to track the 3D module)
  const moveHRef = useRef<SVGGElement>(null);
  const rotHRef = useRef<SVGGElement>(null);
  const connRef = useRef<SVGLineElement>(null);
  const ringRef = useRef<SVGGElement>(null);
  const ringCircleRef = useRef<SVGCircleElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const rotLabelRef = useRef<SVGGElement>(null);
  const rotTextRef = useRef<SVGTextElement>(null);
  const vertHRef = useRef<SVGGElement>(null);
  // resize DIMENSION lines (like the front view's measurements, but draggable + arrowed):
  // width runs along the bottom edge, height up the right edge of a wall unit
  const resizeWRef = useRef<SVGGElement>(null);
  const resizeHRef = useRef<SVGGElement>(null);
  const dimWLineRef = useRef<SVGLineElement>(null);
  const dimWHitRef = useRef<SVGLineElement>(null);
  const dimWChipRef = useRef<SVGGElement>(null);
  const dimWTextRef = useRef<SVGTextElement>(null);
  const dimHLineRef = useRef<SVGLineElement>(null);
  const dimHHitRef = useRef<SVGLineElement>(null);
  const dimHChipRef = useRef<SVGGElement>(null);
  const dimHTextRef = useRef<SVGTextElement>(null);
  const vertDimRef = useRef<SVGGElement>(null);
  const vertDimLineRef = useRef<SVGLineElement>(null);
  const vertDimChipRef = useRef<SVGGElement>(null);
  const vertDimTextRef = useRef<SVGTextElement>(null);
  const vertGuideRef = useRef<SVGLineElement>(null);
  const gizmoScreenRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const blockDragRef = useRef<{ id: string; downX: number; downZ: number; x0: number; z0: number; lastX?: number; lastZ?: number } | null>(null); // D3b.4
  // camera-walk joystick: the live push vector (−1..1) the render loop reads each frame
  const navRef = useRef({ x: 0, z: 0 });
  const joyRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<SVGGElement>(null);
  const joyCenter = useRef({ cx: 0, cy: 0 });
  // door/drawer open animation: target (0|1) + current amount per module
  const openTargetRef = useRef<Map<string, number>>(new Map());
  const openCurRef = useRef<Map<string, number>>(new Map());

  const cbRef = useRef({ onSelectCab, onSelectBlock, onBlockMove, onMovePlan, onBeginEdit, onMountY, onResize, magnet });
  cbRef.current = { onSelectCab, onSelectBlock, onBlockMove, onMovePlan, onBeginEdit, onMountY, onResize, magnet };
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // keep latest room inputs without re-initialising the scene
  const propsRef = useRef({ points, ceiling, openings, coveringColor, floorId, interiorWalls, fittings, wallSurfaces, waterWall, layout, mode, view, selectedId, selectedBlockId });
  propsRef.current = { points, ceiling, openings, coveringColor, floorId, interiorWalls, fittings, wallSurfaces, waterWall, layout, mode, view, selectedId, selectedBlockId };

  // footprints + selection geometry, recomputed when the run/selection changes
  const geomRef = useRef<Geom | null>(null);
  {
    const b = polygonBoundsMm(points);
    const foots = cabFootprints(cabs, points, waterWall, layout, openings);
    const selFoot = selectedId ? foots.find((f) => f.id === selectedId) : undefined;
    const selCab = selectedId ? cabs.find((c) => c.id === selectedId) : undefined;
    const selMountY = selCab?.mountY ?? UPPER_BOTTOM_MM;
    const selH = selCab?.h ?? 720;
    // candidate snap heights for the up/down drag: align the dragged unit's bottom to
    // other wall units' bottoms (and its top to their tops), plus the default level
    const upperLevels: number[] = [];
    if (selFoot?.upper) {
      for (const c of cabs) {
        if (c.id === selectedId || c.kind !== "upper") continue;
        const b = c.mountY ?? UPPER_BOTTOM_MM;
        upperLevels.push(b); // bottom ↔ bottom
        upperLevels.push(b + (c.h ?? 720) - selH); // top ↔ top (as a bottom value)
      }
      upperLevels.push(UPPER_BOTTOM_MM); // the default mounting level
    }
    geomRef.current = {
      cx: b.cx,
      cy: b.cy,
      foots,
      selFoot,
      inner: offsetPolygon(points, 100),
      selMountY,
      selH,
      selW: selFoot?.w ?? selCab?.w ?? 600,
      selUpper: selCab?.kind === "upper",
      // corner units have bespoke diagonal geometry → don't offer resize on them
      selResizable: !!selCab && !selCab.corner,
      selFree: selCab?.px != null && selCab?.pz != null,
      // handle height (m): mid-height of a wall unit, else mid-base
      selCenterY: selFoot?.upper ? (selMountY + selH / 2) / 1000 : GIZMO_Y,
      upperLevels,
    };
  }

  // ---- gizmo drag (move / rotate) — handlers live in component scope and reach
  // the Three internals via apiRef; gesture state lives in dragRef ----
  const showRing = (on: boolean) => {
    if (ringRef.current) ringRef.current.style.display = on ? "" : "none";
    if (rotLabelRef.current) rotLabelRef.current.style.display = on ? "" : "none";
  };
  const drawArc = (a0: number, a1: number) => {
    const sc = gizmoScreenRef.current;
    const arc = arcRef.current;
    if (!sc || !arc) return;
    const sweep = (((a1 - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const large = sweep > Math.PI ? 1 : 0;
    const p0 = { x: sc.x + RING * Math.cos(a0), y: sc.y + RING * Math.sin(a0) };
    const p1 = { x: sc.x + RING * Math.cos(a1), y: sc.y + RING * Math.sin(a1) };
    arc.setAttribute("d", `M${p0.x} ${p0.y} A${RING} ${RING} 0 ${large} 1 ${p1.x} ${p1.y}`);
  };
  // angle readout in the ring centre — accent + bold when locked on a 45°/90° step
  const showAngle = (rot: number) => {
    const sc = gizmoScreenRef.current;
    const lbl = rotLabelRef.current;
    const txt = rotTextRef.current;
    if (!sc || !lbl || !txt) return;
    const deg = (((Math.round(rot) % 360) + 360) % 360);
    const snapped = Math.abs(deg - Math.round(deg / 45) * 45) < 0.5;
    txt.textContent = `${deg}°`;
    lbl.setAttribute("transform", `translate(${sc.x} ${sc.y})`);
    const bg = lbl.firstElementChild as SVGRectElement | null;
    if (bg) bg.setAttribute("fill", snapped ? "#2a6df0" : "#1c1b18");
  };
  // live overlap warning: tint the dragged module red when it clashes with another
  // same-layer module, else blue (selected). Wall clashes can't happen (push-back).
  const tintClash = (g: Geom, id: string, df: Foot) => {
    // furniture (tables/chairs) is free decor → never a clash (a chair under a table is fine)
    const clash = !df.furniture && g.foots.some((o) => o.id !== id && !o.furniture && o.upper === df.upper && footsOverlap(df, o));
    apiRef.current?.setTint(id, clash ? RED : BLUE);
  };
  // vertical gap dimension (counter worktop → wall-unit bottom) while dragging height
  const showVertDim = (on: boolean) => {
    if (vertDimRef.current) vertDimRef.current.style.display = on ? "" : "none";
    if (!on && vertGuideRef.current) vertGuideRef.current.style.display = "none";
  };
  const updateVertDim = (g: Geom, dr: Drag) => {
    const api = apiRef.current;
    const line = vertDimLineRef.current;
    const chip = vertDimChipRef.current;
    const txt = vertDimTextRef.current;
    if (!api || !line || !chip || !txt) return;
    const xW = (dr.px - g.cx) / 1000;
    const zW = (dr.pz - g.cy) / 1000;
    const top = api.project(xW, COUNTER_TOP_MM / 1000, zW); // worktop level
    const bot = api.project(xW, dr.mountY / 1000, zW); // unit bottom
    line.setAttribute("x1", `${top.x}`); line.setAttribute("y1", `${top.y}`);
    line.setAttribute("x2", `${bot.x}`); line.setAttribute("y2", `${bot.y}`);
    chip.setAttribute("transform", `translate(${(top.x + bot.x) / 2} ${(top.y + bot.y) / 2})`);
    txt.textContent = `${Math.max(0, Math.round(dr.mountY - COUNTER_TOP_MM))} мм`;
  };

  // a move/rotate/vertical step from absolute client coords — driven by window
  // listeners (NOT the handle's own pointermove) so the gesture keeps tracking even
  // when the cursor leaves the handle. Mouse has no implicit pointer-capture, so
  // listening on the tiny handle alone stalls after a few px; window never does.
  const moveTo = (clientX: number, clientY: number) => {
    const dr = dragRef.current;
    const g = geomRef.current;
    const api = apiRef.current;
    if (!dr || dr.mode !== "move" || !g?.selFoot || !api) return;
    // raycast onto a plane at the HANDLE's height, not the floor — for a wall unit
    // (handle ~1.5m up) a floor raycast is grazing and a tiny drag flings it away
    const fl = api.floorMetres(clientX, clientY, g.selCenterY);
    if (!fl) return;
    let px = dr.px0 + (fl.x * 1000 + g.cx - dr.downX);
    let pz = dr.pz0 + (fl.z * 1000 + g.cy - dr.downZ);
    let rot = dr.startRot;
    if (cbRef.current.magnet) {
      // near a wall → orient the back to that wall + seat the back flush against it
      const w = nearestWall(px, pz, g.inner, g.cx, g.cy);
      if (w.d < g.selFoot.depth + 250) {
        rot = Math.atan2(-w.nx, w.nz) * DEG;
        const half = g.selFoot.depth / 2;
        px = w.fx + w.nx * half;
        pz = w.fz + w.nz * half;
      }
    }
    // snap along the wall to neighbours + clamp inside, using the (re-oriented) extents
    const sn = snapMove(dragFoot(g.selFoot, px, pz, rot), px, pz, g, cbRef.current);
    dr.px = sn.x;
    dr.pz = sn.y;
    dr.rot = rot;
    dr.moved = true;
    api.applyTransform(dr.id, dr.px, dr.pz, dr.rot, dr.depthM);
    tintClash(g, dr.id, dragFoot(g.selFoot, dr.px, dr.pz, dr.rot));
    api.invalidate();
  };
  const rotateTo = (clientX: number, clientY: number) => {
    const dr = dragRef.current;
    const g = geomRef.current;
    const api = apiRef.current;
    if (!dr || dr.mode !== "rotate" || !g?.selFoot || !api) return;
    const fl = api.floorMetres(clientX, clientY, g.selCenterY);
    if (!fl) return;
    const aWorld = Math.atan2(fl.z * 1000 + g.cy - dr.pz, fl.x * 1000 + g.cx - dr.px);
    let d = aWorld - dr.prevA;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    dr.accum += d;
    dr.prevA = aWorld;
    let rot = dr.startRot + dr.accum * DEG;
    if (cbRef.current.magnet) {
      const n = Math.round(rot / 45) * 45;
      if (Math.abs(rot - n) < ROT_SNAP_DEG) rot = n; // detent at every 45° / 90°
    }
    dr.rot = rot;
    dr.moved = true;
    api.applyTransform(dr.id, dr.px, dr.pz, rot, dr.depthM);
    const rect = api.rect();
    const sc = gizmoScreenRef.current;
    if (sc) drawArc(dr.a0Screen, Math.atan2(clientY - rect.top - sc.y, clientX - rect.left - sc.x));
    showAngle(rot);
    tintClash(g, dr.id, dragFoot(g.selFoot, dr.px, dr.pz, rot));
    api.invalidate();
  };
  const verticalTo = (clientY: number) => {
    const dr = dragRef.current;
    const g = geomRef.current;
    const api = apiRef.current;
    if (!dr || dr.mode !== "vertical" || !g || !api) return;
    const lo = 200;
    const hi = Math.max(lo, propsRef.current.ceiling - g.selH);
    let mountY = Math.min(hi, Math.max(lo, dr.mountY0 + (dr.vy0 - clientY) * (1000 / dr.pxPerM)));
    // snap the bottom to align with another wall unit's bottom/top (magnet)
    let aligned = false;
    if (cbRef.current.magnet) {
      let best = 45; // mm catch
      for (const lvl of g.upperLevels) {
        const d = Math.abs(mountY - lvl);
        if (d < best) { best = d; mountY = lvl; aligned = true; }
      }
    }
    dr.mountY = Math.round(Math.min(hi, Math.max(lo, mountY)));
    dr.moved = true;
    api.setUpperY(dr.id, (dr.mountY - dr.mountY0) / 1000); // shift the group up/down live
    updateVertDim(g, dr); // live gap readout (worktop → unit bottom)
    // alignment guide: a horizontal accent line at the snapped level
    const guide = vertGuideRef.current;
    if (guide) {
      if (aligned) {
        const sy = api.project((dr.px - g.cx) / 1000, dr.mountY / 1000, (dr.pz - g.cy) / 1000).y;
        const w = api.rect().width;
        guide.setAttribute("x1", "0");
        guide.setAttribute("x2", `${w}`);
        guide.setAttribute("y1", `${sy}`);
        guide.setAttribute("y2", `${sy}`);
        guide.style.display = "";
      } else {
        guide.style.display = "none";
      }
    }
    api.invalidate();
  };

  // width resize: drag the bottom dimension line along the module's local X, snap to 5 cm.
  // A free (px/pz) module grows about its centre (the finger tracks the face → ×2);
  // a run module is left-anchored (right face follows the finger → ×1). The live preview
  // rebuilds real geometry (previewResize) only when the snapped value crosses a 5 cm step.
  const resizeWTo = (clientX: number, clientY: number) => {
    const dr = dragRef.current;
    const g = geomRef.current;
    const api = apiRef.current;
    if (!dr || dr.mode !== "resizeW" || !g || !api) return;
    const fl = api.floorMetres(clientX, clientY, g.selCenterY);
    if (!fl) return;
    const dxMm = fl.x * 1000 + g.cx - dr.startMmX;
    const dzMm = fl.z * 1000 + g.cy - dr.startMmZ;
    const along = dxMm * dr.axX + dzMm * dr.axZ; // displacement along the width axis (mm)
    const w = snapStep(dr.w0 + (dr.free ? 2 : 1) * along, W_MIN, W_MAX);
    if (w !== dr.liveW) {
      dr.liveW = w;
      dr.moved = true;
      api.previewResize(dr.id, w, undefined);
    }
    api.invalidate(); // repositions the arrow + chip (updateGizmo)
  };
  // height resize (wall units only): drag the top arrow, snap to 5 cm, bottom stays put
  const resizeHTo = (clientY: number) => {
    const dr = dragRef.current;
    const g = geomRef.current;
    const api = apiRef.current;
    if (!dr || dr.mode !== "resizeH" || !g?.selFoot || !api) return;
    const hi = Math.min(H_MAX, Math.max(H_MIN, propsRef.current.ceiling - dr.mountY));
    const h = snapStep(dr.h0 + (dr.vy0 - clientY) * (1000 / dr.pxPerM), H_MIN, hi);
    if (h !== dr.liveH) {
      dr.liveH = h;
      dr.moved = true;
      api.previewResize(dr.id, undefined, h);
    }
    api.invalidate();
  };

  const beginDrag = (e: React.PointerEvent, mode: Drag["mode"]) => {
    const g = geomRef.current;
    const api = apiRef.current;
    if (!g?.selFoot || !api) return;
    e.preventDefault();
    e.stopPropagation();
    // capture keeps the stream on the handle (and off the canvas/OrbitControls);
    // the window listeners below are the real driver, capture is just insurance
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const f = g.selFoot;
    const fl = api.floorMetres(e.clientX, e.clientY, g.selCenterY); // plane at handle height
    const base = { id: f.id, depthM: f.depth / 1000, px: f.cx, pz: f.cy, rot: f.rotDeg, moved: false, px0: f.cx, pz0: f.cy, downX: 0, downZ: 0, startRot: f.rotDeg, prevA: 0, accum: 0, a0Screen: 0, mountY: g.selMountY, mountY0: g.selMountY, vy0: e.clientY, pxPerM: 200, w0: g.selW, h0: g.selH, liveW: g.selW, liveH: g.selH, axX: f.ux, axZ: f.uy, startMmX: fl ? fl.x * 1000 + g.cx : f.cx, startMmZ: fl ? fl.z * 1000 + g.cy : f.cy, free: g.selFree };
    if (mode === "move") {
      dragRef.current = { ...base, mode: "move", downX: fl ? fl.x * 1000 + g.cx : f.cx, downZ: fl ? fl.z * 1000 + g.cy : f.cy };
    } else if (mode === "rotate") {
      const aWorld = fl ? Math.atan2(fl.z * 1000 + g.cy - f.cy, fl.x * 1000 + g.cx - f.cx) : 0;
      const rect = api.rect();
      const sc = gizmoScreenRef.current ?? { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const aScreen = Math.atan2(e.clientY - rect.top - sc.y, e.clientX - rect.left - sc.x);
      dragRef.current = { ...base, mode: "rotate", prevA: aWorld, a0Screen: aScreen };
      showRing(true);
      drawArc(aScreen, aScreen);
      showAngle(f.rotDeg);
    } else if (mode === "resizeW") {
      dragRef.current = { ...base, mode: "resizeW" };
    } else if (mode === "resizeH") {
      // vertical pixels per world-metre at the module top, for screen→mm
      const pxPerM = api.pxPerMeterY((f.cx - g.cx) / 1000, g.selCenterY, (f.cy - g.cy) / 1000);
      dragRef.current = { ...base, mode: "resizeH", pxPerM: pxPerM || 200 };
    } else {
      // vertical (wall units): pixels per world-metre at the module, for screen→mm
      const pxPerM = api.pxPerMeterY((f.cx - g.cx) / 1000, g.selCenterY, (f.cy - g.cy) / 1000);
      const drv: Drag = { ...base, mode: "vertical", pxPerM: pxPerM || 200 };
      dragRef.current = drv;
      showVertDim(true);
      updateVertDim(g, drv);
    }
    const onWinMove = (ev: PointerEvent) => {
      const dr = dragRef.current;
      if (!dr) return;
      ev.preventDefault();
      if (dr.mode === "move") moveTo(ev.clientX, ev.clientY);
      else if (dr.mode === "rotate") rotateTo(ev.clientX, ev.clientY);
      else if (dr.mode === "resizeW") resizeWTo(ev.clientX, ev.clientY);
      else if (dr.mode === "resizeH") resizeHTo(ev.clientY);
      else verticalTo(ev.clientY);
    };
    // hard block of touch-scroll for the duration of the gesture (some WebViews
    // ignore touch-action on SVG, then fire pointercancel and kill the drag)
    const blockTouch = (ev: TouchEvent) => ev.preventDefault();
    const onWinUp = () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      window.removeEventListener("touchmove", blockTouch);
      const dr = dragRef.current;
      const cb2 = cbRef.current;
      if (dr && dr.moved) {
        if (dr.mode === "vertical") cb2.onMountY?.(dr.id, dr.mountY); // patchCab → own undo step
        else if (dr.mode === "resizeW") cb2.onResize?.(dr.id, { w: dr.liveW });
        else if (dr.mode === "resizeH") cb2.onResize?.(dr.id, { h: dr.liveH });
        else if (cb2.onMovePlan) {
          cb2.onBeginEdit?.(); // one undo step for the whole gesture
          cb2.onMovePlan(dr.id, { px: dr.px, pz: dr.pz, rot: dr.rot });
        }
      }
      dragRef.current = null;
      showRing(false);
      showVertDim(false);
      apiRef.current?.invalidate();
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    window.addEventListener("touchmove", blockTouch, { passive: false });
  };
  const onMoveDown = (e: React.PointerEvent) => beginDrag(e, "move");
  const onRotDown = (e: React.PointerEvent) => beginDrag(e, "rotate");
  const onVertDown = (e: React.PointerEvent) => beginDrag(e, "vertical");
  const onResizeWDown = (e: React.PointerEvent) => beginDrag(e, "resizeW");
  const onResizeHDown = (e: React.PointerEvent) => beginDrag(e, "resizeH");

  // ---- camera-walk joystick: drag the knob, the render loop walks the camera ----
  const JOY_R = 28; // knob travel radius (px, == svg units at 1:1)
  const setNavFrom = (clientX: number, clientY: number) => {
    let dx = clientX - joyCenter.current.cx;
    let dy = clientY - joyCenter.current.cy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
    joyKnobRef.current?.setAttribute("transform", `translate(${dx} ${dy})`);
    navRef.current = { x: dx / JOY_R, z: -dy / JOY_R }; // push up = walk forward
  };
  const onJoyDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = joyRef.current?.getBoundingClientRect();
    if (!rect) return;
    joyCenter.current = { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    const onWinMove = (ev: PointerEvent) => { ev.preventDefault(); setNavFrom(ev.clientX, ev.clientY); };
    const blockTouch = (ev: TouchEvent) => ev.preventDefault();
    const onWinUp = () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      window.removeEventListener("touchmove", blockTouch);
      navRef.current = { x: 0, z: 0 };
      joyKnobRef.current?.setAttribute("transform", "translate(0 0)");
      apiRef.current?.invalidate();
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    window.addEventListener("touchmove", blockTouch, { passive: false });
    setNavFrom(e.clientX, e.clientY);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w0 = mount.clientWidth || 320;
    const h0 = mount.clientHeight || 420;
    renderer.setSize(w0, h0);
    renderer.shadowMap.enabled = true; // soft shadows add depth/contrast
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.2;
    controls.maxDistance = 22;
    controls.target.set(0, 0.9, 0);

    // matches the room editor's readable look (no env map / tone mapping that
    // washed it out), plus a stronger key + soft shadows for depth & contrast
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 25;
    const sc = key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    sc.updateProjectionMatrix();
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.2);
    fill.position.set(-4, 3, -3);
    scene.add(fill);

    let needs = true;
    const invalidate = () => {
      needs = true;
    };
    controls.addEventListener("change", invalidate);

    let wood: THREE.Texture | null = null;
    let room: THREE.Group | null = null;
    let walls: WallInfo[] = [];
    let kitchen: THREE.Group | null = null;
    let karkasLayer: THREE.Group | null = null; // Phase D2 — parallel karkas-blocks layer

    const buildRoom = () => {
      const s = propsRef.current;
      if (room) {
        scene.remove(room);
        disposeGroup(room);
      }
      wood?.dispose();
      wood = makeWoodTexture(s.coveringColor);
      const b = polygonBoundsMm(s.points);
      const innerMm = offsetPolygon(s.points, 100);
      const toM = (p: Pt) => ({ x: (p.x - b.cx) / 1000, z: (p.y - b.cy) / 1000 });
      const built = makeRoom(
        s.points.map(toM),
        innerMm.map(toM),
        s.ceiling / 1000,
        wood,
        s.openings,
        s.interiorWalls.map((poly) => poly.map(toM)),
        s.fittings,
        s.wallSurfaces,
        null,
        null,
        null,
        false,
      );
      room = built.group;
      walls = built.walls;
      room.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.receiveShadow = true; // floor + walls catch the kitchen's shadow
      });
      applyPbrFloor(room, s.coveringColor, s.floorId); // real floor material (shared with the room editor)
      scene.add(room);
      invalidate();
    };

    // emissive tint of one module: red = overlap warning, blue = selected, null = clear
    const REDC = new THREE.Color(RED);
    const BLUEC = new THREE.Color(BLUE);
    const BLACKC = new THREE.Color(0, 0, 0);
    const tintCab = (id: string, color: number | null) => {
      if (!kitchen) return;
      for (const child of kitchen.children) {
        if (child.userData.cabId !== id) continue;
        child.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mm of mats) {
            const m = mm as THREE.MeshStandardMaterial;
            if ("emissive" in m) {
              m.emissive = color === RED ? REDC : color === BLUE ? BLUEC : BLACKC;
              m.emissiveIntensity = color == null ? 0 : 0.5;
              m.needsUpdate = true;
            }
          }
        });
      }
    };

    // open/close a module's doors + drawers (amount 0..1): hinge doors, slide drawers
    const applyOpen = (id: string, amount: number) => {
      const grp = kitchen?.children.find((o) => o.userData.cabId === id);
      if (!grp) return;
      grp.traverse((o) => {
        const od = o.userData.openable as { kind: string; axis?: string; rad?: number; maxRad?: number; maxZ?: number } | undefined;
        if (!od) return;
        if (od.kind === "door") {
          const rad = od.rad ?? -(od.maxRad ?? 0); // legacy maxRad = left hinge (−y)
          if (od.axis === "x") o.rotation.x = amount * rad; // top/bottom hydraulic lift
          else o.rotation.y = amount * rad;
        } else o.position.z = amount * (od.maxZ ?? 0);
      });
    };

    // last kitchen inputs — so a live resize preview can rebuild off the real cabs/style
    let lastCabs: Cabinet[] = cabs;
    let lastStyle: KitchenStyle = style;
    const setKitchen = (next: Cabinet[], nextStyle: KitchenStyle) => {
      lastCabs = next;
      lastStyle = nextStyle;
      if (kitchen) {
        scene.remove(kitchen);
        disposeGroup(kitchen);
      }
      const s = propsRef.current;
      const { runs } = planRuns(s.points, s.waterWall, s.layout, s.openings);
      const rb = polygonBoundsMm(s.points);
      kitchen = buildKitchen(next, runs.map((r) => ({ placement: r.placement, kind: r.kind })), nextStyle, { cx: rb.cx, cy: rb.cy });
      kitchen.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      applyMode(kitchen, propsRef.current.mode); // honour the current render style
      highlightCab(kitchen, propsRef.current.selectedId); // tint the picked module blue
      // red overlap warning (editor only) for modules clashing with a same-layer one
      if (cbRef.current.onMovePlan) {
        const foots = cabFootprints(next, s.points, s.waterWall, s.layout, s.openings);
        for (const id of objectOverlapIds(foots)) tintCab(id, RED);
      }
      // re-apply any in-progress open state so a rebuild doesn't slam doors shut
      for (const [id, cur] of openCurRef.current) if (cur > 0.001) applyOpen(id, cur);
      scene.add(kitchen);
      invalidate();
    };

    // Phase D2 — (re)build the karkas-blocks layer. Fully parallel to setKitchen: it only swaps its
    // OWN group, never touching `kitchen` / `room`, so the kitchen render path is unaffected.
    const setKarkasBlocks = (blocks: readonly { karkasJson: string; x?: number; z?: number; id?: string }[]) => {
      if (karkasLayer) {
        scene.remove(karkasLayer);
        disposeGroup(karkasLayer);
        karkasLayer = null;
      }
      if (!blocks.length) { invalidate(); return; }
      karkasLayer = buildProjectBlocksGroup(blocks);
      karkasLayer.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      highlightBlock(karkasLayer, propsRef.current.selectedBlockId); // D3b — re-tint the selected block
      scene.add(karkasLayer);
      invalidate();
    };

    // camera framing — 3/4 orbit, or a top-down plan ("2D") view
    const fitD = () => {
      const b = polygonBoundsMm(propsRef.current.points);
      return Math.max(b.w, b.h) / 1000;
    };
    const setView = (v: KitchenView) => {
      const d = fitD();
      if (v === "plan") {
        camera.position.set(0, d * 2.4, 0.001);
        controls.enableRotate = false;
        controls.target.set(0, 0, 0);
      } else {
        camera.position.set(d * 0.95, d * 0.85, d * 0.95);
        controls.enableRotate = true;
        controls.target.set(0, 0.9, 0);
      }
      camera.lookAt(controls.target);
      controls.update();
      invalidate();
    };

    const updateCull = () => {
      for (const wll of walls) {
        const dot = (camera.position.x - wll.mx) * wll.nx + (camera.position.z - wll.mz) * wll.nz;
        wll.mesh.visible = dot <= 0.001;
      }
    };

    // ---- gizmo helpers (project the module centre to screen, position handles) ----
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const tmpV = new THREE.Vector3();
    const tmpFloor = new THREE.Vector3();
    const ndcAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    };
    const project = (v: THREE.Vector3) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const p = v.clone().project(camera);
      return { x: (p.x * 0.5 + 0.5) * rect.width, y: (-p.y * 0.5 + 0.5) * rect.height };
    };
    const setDisp = (el: SVGElement | null, on: boolean) => { if (el) el.style.display = on ? "" : "none"; };
    const setLine = (el: SVGLineElement | null, x1: number, y1: number, x2: number, y2: number) => {
      if (!el) return;
      el.setAttribute("x1", `${x1}`); el.setAttribute("y1", `${y1}`);
      el.setAttribute("x2", `${x2}`); el.setAttribute("y2", `${y2}`);
    };
    const updateGizmo = () => {
      const cb = cbRef.current;
      const g = geomRef.current;
      const dr = dragRef.current;
      const center = dr ? { cx: dr.px, cy: dr.pz } : g?.selFoot ? { cx: g.selFoot.cx, cy: g.selFoot.cy } : null;
      const active = !!(center && g && cb.onMovePlan && propsRef.current.view !== "plan");
      const upper = !!g?.selFoot?.upper;
      setDisp(moveHRef.current, active);
      setDisp(rotHRef.current, active);
      setDisp(connRef.current, active);
      setDisp(vertHRef.current, active && upper); // up/down handle: wall units only
      const resizable = active && !!g?.selResizable && !!cb.onResize;
      setDisp(resizeWRef.current, resizable); // width arrow: every resizable module
      setDisp(resizeHRef.current, resizable && upper); // height arrow: wall units only (c.h drives their 3D height)
      if (!active || !center || !g) {
        gizmoScreenRef.current = null;
        if (!dr) {
          setDisp(ringRef.current, false);
          setDisp(rotLabelRef.current, false);
        }
        return;
      }
      // handle height follows the module (and the live vertical drag for wall units)
      const yC = dr?.mode === "vertical" ? (dr.mountY + g.selH / 2) / 1000 : g.selCenterY;
      tmpV.set((center.cx - g.cx) / 1000, yC, (center.cy - g.cy) / 1000);
      const sp = project(tmpV);
      gizmoScreenRef.current = sp;
      const rx = sp.x;
      const ry = sp.y - RING;
      moveHRef.current?.setAttribute("transform", `translate(${sp.x} ${sp.y})`);
      rotHRef.current?.setAttribute("transform", `translate(${rx} ${ry})`);
      vertHRef.current?.setAttribute("transform", `translate(${sp.x - RING} ${sp.y})`);
      const ln = connRef.current;
      if (ln) {
        ln.setAttribute("x1", `${sp.x}`);
        ln.setAttribute("y1", `${sp.y}`);
        ln.setAttribute("x2", `${rx}`);
        ln.setAttribute("y2", `${ry}`);
      }
      ringCircleRef.current?.setAttribute("cx", `${sp.x}`);
      ringCircleRef.current?.setAttribute("cy", `${sp.y}`);

      // resize DIMENSION lines — like the front view's measurements but drawn in the 3D
      // scene (arrow line + number), draggable to resize. Width runs along the bottom
      // edge (offset down), height up the right edge of a wall unit (offset right).
      const DIM_OFF = 24; // screen-px offset so the line sits just outside the box
      if (resizable && g.selFoot) {
        const f = g.selFoot;
        const wNow = dr?.mode === "resizeW" ? dr.liveW : g.selW;
        const yBotW = upper ? g.selMountY / 1000 : 0; // bottom of the module (floor for base)
        const lp = project(tmpV.set((f.cx - f.ux * (wNow / 2) - g.cx) / 1000, yBotW, (f.cy - f.uy * (wNow / 2) - g.cy) / 1000));
        const rp = project(tmpV.set((f.cx + f.ux * (wNow / 2) - g.cx) / 1000, yBotW, (f.cy + f.uy * (wNow / 2) - g.cy) / 1000));
        setLine(dimWLineRef.current, lp.x, lp.y + DIM_OFF, rp.x, rp.y + DIM_OFF);
        setLine(dimWHitRef.current, lp.x, lp.y + DIM_OFF, rp.x, rp.y + DIM_OFF);
        dimWChipRef.current?.setAttribute("transform", `translate(${(lp.x + rp.x) / 2} ${(lp.y + rp.y) / 2 + DIM_OFF})`);
        if (dimWTextRef.current) dimWTextRef.current.textContent = `${wNow}`;
        if (upper) {
          const hNow = dr?.mode === "resizeH" ? dr.liveH : g.selH;
          const mnt = dr?.mode === "resizeH" ? dr.mountY : g.selMountY;
          const rxM = (f.cx + f.ux * (g.selW / 2) - g.cx) / 1000; // right edge (width fixed during a height drag)
          const rzM = (f.cy + f.uy * (g.selW / 2) - g.cy) / 1000;
          const bp = project(tmpV.set(rxM, mnt / 1000, rzM));
          const tp = project(tmpV.set(rxM, (mnt + hNow) / 1000, rzM));
          setLine(dimHLineRef.current, bp.x + DIM_OFF, bp.y, tp.x + DIM_OFF, tp.y);
          setLine(dimHHitRef.current, bp.x + DIM_OFF, bp.y, tp.x + DIM_OFF, tp.y);
          dimHChipRef.current?.setAttribute("transform", `translate(${(bp.x + tp.x) / 2 + DIM_OFF} ${(bp.y + tp.y) / 2})`);
          if (dimHTextRef.current) dimHTextRef.current.textContent = `${hNow}`;
        }
      }
    };

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w && h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        invalidate();
      }
    });
    ro.observe(mount);

    // walk the camera (and its orbit target) horizontally on the floor plane — moving
    // both by the same vector keeps the orbit pivot, so rotate/zoom still work after
    const navFwd = new THREE.Vector3();
    const navRight = new THREE.Vector3();
    const NAV_UP = new THREE.Vector3(0, 1, 0);
    const applyNav = (jx: number, jz: number) => {
      camera.getWorldDirection(navFwd);
      navFwd.y = 0;
      if (navFwd.lengthSq() < 1e-6) return;
      navFwd.normalize();
      navRight.crossVectors(navFwd, NAV_UP).normalize();
      const b = polygonBoundsMm(propsRef.current.points);
      const room = Math.max(b.w, b.h) / 1000;
      const speed = Math.max(0.02, room * 0.011);
      const mx = (navRight.x * jx + navFwd.x * jz) * speed;
      const mz = (navRight.z * jx + navFwd.z * jz) * speed;
      camera.position.x += mx;
      camera.position.z += mz;
      // soft-clamp the target to the room + a generous margin so you can't get lost
      const halfW = b.w / 2000 + room;
      const halfH = b.h / 2000 + room;
      const tx = Math.min(halfW, Math.max(-halfW, controls.target.x + mx));
      const tz = Math.min(halfH, Math.max(-halfH, controls.target.z + mz));
      camera.position.x += tx - (controls.target.x + mx);
      camera.position.z += tz - (controls.target.z + mz);
      controls.target.x = tx;
      controls.target.z = tz;
    };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nav = navRef.current;
      if (nav.x !== 0 || nav.z !== 0) {
        applyNav(nav.x, nav.z);
        needs = true;
      }
      // ease open/close any door/drawer toward its target (slow, soft-close feel)
      for (const [id, tgt] of openTargetRef.current) {
        const cur = openCurRef.current.get(id) ?? 0;
        if (cur === tgt) continue;
        const next = Math.abs(tgt - cur) < 0.004 ? tgt : cur + (tgt - cur) * 0.09;
        openCurRef.current.set(id, next);
        applyOpen(id, next);
        needs = true;
      }
      controls.update();
      if (needs) {
        updateCull();
        renderer.render(scene, camera);
        updateGizmo();
        needs = false;
      }
    };
    raf = requestAnimationFrame(loop);

    // picking: a tap (not an orbit-drag) on a module selects it; empty space clears
    const downXY = { x: 0, y: 0 };
    // walk a hit's parents for a userData key → the owning object's id
    const resolveHit = (hits: THREE.Intersection[], key: string): string | null => {
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData[key]) return o.userData[key] as string;
          o = o.parent;
        }
      }
      return null;
    };
    // screen point → floor-plane world x/z (metres)
    const floorAt = (clientX: number, clientY: number): { x: number; z: number } | null => {
      raycaster.setFromCamera(ndcAt(clientX, clientY), camera);
      floorPlane.constant = 0;
      const hit = raycaster.ray.intersectPlane(floorPlane, tmpFloor);
      return hit ? { x: tmpFloor.x, z: tmpFloor.z } : null;
    };
    const onDown = (e: PointerEvent) => {
      downXY.x = e.clientX;
      downXY.y = e.clientY;
      // D3b.4 — grabbing the SELECTED karkas block starts a drag (orbit off while dragging)
      const selId = propsRef.current.selectedBlockId;
      if (selId && karkasLayer && cbRef.current.onBlockMove) {
        raycaster.setFromCamera(ndcAt(e.clientX, e.clientY), camera);
        if (resolveHit(raycaster.intersectObjects(karkasLayer.children, true), "karkasBlockId") === selId) {
          const child = karkasLayer.children.find((o) => o.userData.karkasBlockId === selId);
          const w = floorAt(e.clientX, e.clientY);
          if (child && w) {
            blockDragRef.current = { id: selId, downX: w.x, downZ: w.z, x0: (child.userData.karkasX as number) ?? 0, z0: (child.userData.karkasZ as number) ?? 0 };
            controls.enabled = false;
            // capture the pointer so a release OFF the canvas still fires onUp (else the drag
            // strands: controls stay disabled + the move never commits). Mirrors the gizmo's
            // window-listener trick, done via the Pointer Events API.
            try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* unsupported → falls back to canvas-only */ }
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = blockDragRef.current;
      if (!d) return;
      const w = floorAt(e.clientX, e.clientY);
      if (!w) return;
      d.lastX = Math.round(d.x0 + (w.x - d.downX) * 1000);
      d.lastZ = Math.round(d.z0 + (w.z - d.downZ) * 1000);
      apiRef.current?.applyBlockTransform(d.id, d.lastX, d.lastZ);
    };
    const onUp = (e: PointerEvent) => {
      // D3b.4 — commit a block drag and swallow the pick
      const d = blockDragRef.current;
      if (d) {
        blockDragRef.current = null;
        controls.enabled = true;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* was never captured */ }
        if (d.lastX != null && d.lastZ != null) cbRef.current.onBlockMove?.(d.id, d.lastX, d.lastZ);
        return;
      }
      if (dragRef.current) return; // a gizmo move is in progress
      if (Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 6) return; // was an orbit
      raycaster.setFromCamera(ndcAt(e.clientX, e.clientY), camera);
      // cabinet pick — unchanged path
      if (cbRef.current.onSelectCab && kitchen) {
        cbRef.current.onSelectCab(resolveHit(raycaster.intersectObjects(kitchen.children, true), "cabId"));
      }
      // D3b — karkas-block pick, additive + independent (its own userData key + callback)
      if (cbRef.current.onSelectBlock && karkasLayer) {
        cbRef.current.onSelectBlock(resolveHit(raycaster.intersectObjects(karkasLayer.children, true), "karkasBlockId"));
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    buildRoom();
    setKitchen(cabs, style);
    setKarkasBlocks(projectBlocks); // Phase D2 — initial karkas layer
    setView(propsRef.current.view);

    apiRef.current = {
      setKitchen,
      setKarkasBlocks,
      setView,
      syncGizmo: updateGizmo,
      invalidate,
      captureDataUrl: () => {
        renderer.render(scene, camera); // force a fresh frame into the (preserved) buffer
        // downscale straight from the WebGL canvas — a canvas source draws SYNCHRONOUSLY
        // and correctly (an <img> data-URL would load async → draw blank). JPEG has no
        // alpha, so paint the app backdrop first (the alpha:true bg would go black).
        const src = renderer.domElement;
        const W = 400, H = 300;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const ctx = c.getContext("2d");
        if (!ctx) return src.toDataURL("image/jpeg", 0.6);
        ctx.fillStyle = "#f4f2ee";
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(src, 0, 0, W, H);
        return c.toDataURL("image/jpeg", 0.6);
      },
      floorMetres: (clientX, clientY, yM = 0) => {
        raycaster.setFromCamera(ndcAt(clientX, clientY), camera);
        floorPlane.constant = -yM; // horizontal plane at y = yM
        const hit = raycaster.ray.intersectPlane(floorPlane, tmpFloor);
        return hit ? { x: tmpFloor.x, z: tmpFloor.z } : null;
      },
      project: (x, y, z) => project(tmpV.set(x, y, z)),
      applyTransform: (id, pxMm, pzMm, rotDeg, depthM) => {
        if (!kitchen) return;
        const child = kitchen.children.find((o) => o.userData.cabId === id);
        if (!child) return;
        const b = polygonBoundsMm(propsRef.current.points);
        const rotRad = (rotDeg * Math.PI) / 180;
        child.rotation.y = -rotRad;
        const fwdX = -Math.sin(rotRad);
        const fwdZ = Math.cos(rotRad);
        const vx = (pxMm - b.cx) / 1000;
        const vz = (pzMm - b.cy) / 1000;
        child.position.set(vx - fwdX * (depthM / 2), 0, vz - fwdZ * (depthM / 2));
      },
      applyBlockTransform: (id, xMm, zMm) => {
        if (!karkasLayer) return;
        const child = karkasLayer.children.find((o) => o.userData.karkasBlockId === id);
        if (!child) return;
        // x/z are room-centre-relative mm (world origin); re-place the block centre there
        child.position.x = xMm / 1000 - (child.userData.blockCenterX ?? 0);
        child.position.z = zMm / 1000 - (child.userData.blockCenterZ ?? 0);
        invalidate();
      },
      previewResize: (id, wMm, hMm) => {
        // rebuild off the real cabs with just this module's w/h overridden — the run
        // layout then reflows exactly as it will on commit, so there's no jump on release
        const patched = lastCabs.map((c) =>
          c.id === id ? { ...c, ...(wMm != null ? { w: wMm } : {}), ...(hMm != null ? { h: hMm } : {}) } : c,
        );
        setKitchen(patched, lastStyle);
      },
      setUpperY: (id, dyM) => {
        if (!kitchen) return;
        const child = kitchen.children.find((o) => o.userData.cabId === id);
        if (child) child.position.y = dyM;
      },
      setTint: tintCab,
      pxPerMeterY: (x, y, z) => {
        const a = project(tmpV.set(x, y, z));
        const b = project(tmpV.set(x, y + 1, z));
        return Math.abs(a.y - b.y);
      },
      rect: () => renderer.domElement.getBoundingClientRect(),
      dispose: () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.removeEventListener("change", invalidate);
        controls.dispose();
        if (kitchen) disposeGroup(kitchen);
        if (karkasLayer) disposeGroup(karkasLayer);
        if (room) disposeGroup(room);
        wood?.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      },
    };
    onApi?.(apiRef.current);
    // fire onReady ONCE the scene has settled — a fresh render + (with PBR) the textures
    // loaded — so the constructor grabs a single, consistent, good-looking thumbnail on
    // entry (capturing the very first frame risks a blank / untextured shot).
    let readyFired = false;
    const fireReady = () => {
      if (readyFired) return;
      readyFired = true;
      onReadyRef.current?.();
    };
    // re-render once the PBR textures finish loading (render-on-demand → first frame draws
    // before they arrive, leaving the floor/worktop black until the next redraw); that's
    // also our cue that the scene is ready to capture
    const offTextures = PBR ? onTexturesReady(() => { invalidate(); fireReady(); }) : null;
    // fallback so onReady still fires without PBR (or if textures never load)
    const readyTimer = setTimeout(fireReady, PBR ? 1200 : 500);

    // Register this scene as the thumbnail capture source for project saves
    registerCapture(() => apiRef.current?.captureDataUrl() ?? null);

    return () => {
      clearTimeout(readyTimer);
      offTextures?.();
      registerCapture(null);
      onApi?.(null);
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // built once; the kitchen swaps via the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching variant / render style / selection → rebuild the kitchen group (the
  // fresh materials pick up the current render mode + highlight)
  useEffect(() => {
    apiRef.current?.setKitchen(cabs, style);
  }, [cabs, style, layout, mode, selectedId]);

  // Phase D2/D3b — rebuild the karkas-blocks layer when the blocks OR the selected block change
  useEffect(() => {
    apiRef.current?.setKarkasBlocks(projectBlocks);
  }, [projectBlocks, selectedBlockId]);

  // 3D ⇄ plan camera framing
  useEffect(() => {
    apiRef.current?.setView(view);
  }, [view]);

  // open/close: set each module's target (1 = open, 0 = closed) and kick the loop
  useEffect(() => {
    const set = new Set(openIds ?? []);
    const ids = new Set<string>([...openTargetRef.current.keys(), ...openCurRef.current.keys(), ...set]);
    for (const id of ids) openTargetRef.current.set(id, set.has(id) ? 1 : 0);
    apiRef.current?.invalidate();
  }, [openIds]);

  // keep the handles glued to the selected module after any re-render (selection /
  // commit / toggle) — runs before paint so there's no flash
  useLayoutEffect(() => {
    apiRef.current?.syncGizmo();
  });

  return (
    <div ref={mountRef} className="scene-canvas cab3d-wrap">
      <svg className="cab3d-overlay">
        <defs>
          {/* outward-pointing arrowhead for the resize dimension lines */}
          <marker id="dimArrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#00a961" />
          </marker>
        </defs>
        {/* horizontal alignment guide when a wall unit's height lines up with another */}
        <line ref={vertGuideRef} stroke="#2a6df0" strokeWidth={1.5} strokeDasharray="7 5" pointerEvents="none" style={{ display: "none" }} />
        {/* wall-unit height gap (worktop → unit bottom), shown while dragging up/down */}
        <g ref={vertDimRef} pointerEvents="none" style={{ display: "none" }}>
          <line ref={vertDimLineRef} stroke="#2a6df0" strokeWidth={2} strokeDasharray="5 4" />
          <g ref={vertDimChipRef}>
            <rect x={-26} y={-12} width={52} height={24} rx={6} fill="#2a6df0" />
            <text ref={vertDimTextRef} x={0} y={5} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={13} fontWeight={700} fill="#fff" />
          </g>
        </g>
        <line ref={connRef} stroke="#2a6df0" strokeWidth={2.5} pointerEvents="none" style={{ display: "none" }} />
        <g ref={ringRef} pointerEvents="none" style={{ display: "none" }}>
          <circle ref={ringCircleRef} r={RING} fill="none" stroke="#fff" strokeWidth={3} />
          <path ref={arcRef} fill="none" stroke="#2a6df0" strokeWidth={4} strokeLinecap="round" />
        </g>
        {/* live rotation angle readout (accent + bold on a 45°/90° detent) */}
        <g ref={rotLabelRef} pointerEvents="none" style={{ display: "none" }}>
          <rect x={-26} y={-15} width={52} height={30} rx={8} fill="#1c1b18" />
          <text ref={rotTextRef} x={0} y={5} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={15} fontWeight={700} fill="#fff" />
        </g>
        {/* wall-unit up/down handle (left of centre) */}
        <g
          ref={vertHRef}
          className="cab3d-handle"
          style={{ display: "none" }}
          onPointerDown={onVertDown}
        >
          <circle r={HANDLE_R} fill="#fff" stroke="#cfcfcf" strokeWidth={2} />
          <g transform={`translate(${-12 * ICON_S} ${-16 * ICON_S}) scale(${ICON_S})`}>
            <path d={ICON_VMOVE_PATH} fill="#1c1b18" />
          </g>
        </g>
        <g
          ref={moveHRef}
          className="cab3d-handle"
          style={{ display: "none" }}
          onPointerDown={onMoveDown}
        >
          <circle r={HANDLE_R} fill="#fff" stroke="#cfcfcf" strokeWidth={2} />
          <g transform={`translate(${-16 * ICON_S} ${-16 * ICON_S}) scale(${ICON_S})`}>
            <path d={ICON_DRAG_PATH} fill="#1c1b18" />
          </g>
        </g>
        <g
          ref={rotHRef}
          className="cab3d-handle"
          style={{ display: "none" }}
          onPointerDown={onRotDown}
        >
          <circle r={HANDLE_R} fill="#fff" stroke="#cfcfcf" strokeWidth={2} />
          <g transform={`translate(${-16 * ICON_S} ${-16 * ICON_S}) scale(${ICON_S})`}>
            <path d={ICON_ROTATE_PATH} fill="#1c1b18" />
          </g>
        </g>
        {/* width resize DIMENSION (bottom edge) — draggable arrow line + number, 5 cm steps */}
        <g
          ref={resizeWRef}
          className="cab3d-handle resize-dim"
          style={{ display: "none" }}
          onPointerDown={onResizeWDown}
        >
          <line ref={dimWHitRef} stroke="rgba(255,255,255,0.01)" strokeWidth={26} strokeLinecap="round" />
          <line ref={dimWLineRef} stroke="#00a961" strokeWidth={2.5} markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
          <g ref={dimWChipRef}>
            <rect x={-27} y={-13} width={54} height={26} rx={7} fill="#fff" stroke="#00a961" strokeWidth={1.5} />
            <text ref={dimWTextRef} x={0} y={5} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={13} fontWeight={700} fill="#1c1b18" />
          </g>
        </g>
        {/* height resize DIMENSION (right edge, wall units) — draggable arrow line + number */}
        <g
          ref={resizeHRef}
          className="cab3d-handle resize-dim"
          style={{ display: "none" }}
          onPointerDown={onResizeHDown}
        >
          <line ref={dimHHitRef} stroke="rgba(255,255,255,0.01)" strokeWidth={26} strokeLinecap="round" />
          <line ref={dimHLineRef} stroke="#00a961" strokeWidth={2.5} markerStart="url(#dimArrow)" markerEnd="url(#dimArrow)" />
          <g ref={dimHChipRef}>
            <rect x={-27} y={-13} width={54} height={26} rx={7} fill="#fff" stroke="#00a961" strokeWidth={1.5} />
            <text ref={dimHTextRef} x={0} y={5} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={13} fontWeight={700} fill="#1c1b18" />
          </g>
        </g>
      </svg>

      {/* camera-walk joystick — drag the knob to move around the room */}
      {nav && (
        <div ref={joyRef} className="nav-joy" onPointerDown={onJoyDown}>
          <svg viewBox="0 0 104 104" width="104" height="104">
            <circle cx={52} cy={52} r={47} fill="rgba(255,255,255,0.55)" stroke="#d4d4d4" strokeWidth={1.25} />
            <polygon points="52,11 46,22 58,22" fill="#bcbcbc" />
            <polygon points="52,93 46,82 58,82" fill="#bcbcbc" />
            <polygon points="93,52 82,46 82,58" fill="#bcbcbc" />
            <polygon points="11,52 22,46 22,58" fill="#bcbcbc" />
            <g ref={joyKnobRef}>
              <circle cx={52} cy={52} r={18} fill="#fff" stroke="#d4d4d4" strokeWidth={1.25} />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
