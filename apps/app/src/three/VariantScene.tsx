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
import { buildKitchen } from "./kitchen3d";
import { planRuns, type KitchenLayout } from "../model/runPlan";
import { polygonBoundsMm, offsetPolygon, type Pt, type Opening, type Fitting } from "../model/room";
import { cabFootprints, halfExtents, footsOverlap, objectOverlapIds, type Foot } from "../model/footprint";
import type { Surface } from "../model/walls";
import type { KitchenStyle } from "../model/layout";
import type { Cabinet } from "../model/cabinet";
import { ICON_DRAG_PATH, ICON_ROTATE_PATH, ICON_VMOVE_PATH } from "../components/icons";

interface Api {
  setKitchen: (cabs: Cabinet[], style: KitchenStyle) => void;
  setView: (v: KitchenView) => void;
  syncGizmo: () => void;
  invalidate: () => void;
  /** screen point → horizontal plane at height yM (metres) → world x/z, or null */
  floorMetres: (clientX: number, clientY: number, yM?: number) => { x: number; z: number } | null;
  /** world point (metres) → screen px (relative to the canvas) */
  project: (x: number, y: number, z: number) => { x: number; y: number };
  /** move/rotate the live selected module group (px/pz absolute mm, rot degrees) */
  applyTransform: (id: string, pxMm: number, pzMm: number, rotDeg: number, depthM: number) => void;
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
  selCenterY: number; // handle height for the selected module (m)
  upperLevels: number[]; // other wall units' snap heights (mm) for the up/down drag
}

type Drag = {
  mode: "move" | "rotate" | "vertical";
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
  interiorWalls,
  fittings,
  wallSurfaces,
  waterWall,
  layout,
  style,
  cabs,
  mode = "real",
  view = "3d",
  magnet = true,
  nav = false,
  openIds,
  selectedId = null,
  onSelectCab,
  onMovePlan,
  onBeginEdit,
  onMountY,
}: {
  points: Pt[];
  ceiling: number;
  openings: Opening[];
  coveringColor: string;
  interiorWalls: Pt[][];
  fittings: Fitting[];
  wallSurfaces: Record<number, Surface>;
  waterWall: number | null;
  layout: KitchenLayout;
  style: KitchenStyle;
  cabs: Cabinet[];
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
  /** tap a module → its id (or null when tapping empty space) */
  onSelectCab?: (id: string | null) => void;
  /** commit a free plan transform (move/rotate) — same path the 2D plan uses */
  onMovePlan?: (id: string, patch: { px?: number; pz?: number; rot?: number }) => void;
  /** snapshot before a gesture so the whole move/rotate is one undo step */
  onBeginEdit?: () => void;
  /** commit a wall-unit's bottom height (mm) — vertical handle drag */
  onMountY?: (id: string, mountY: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
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
  const vertDimRef = useRef<SVGGElement>(null);
  const vertDimLineRef = useRef<SVGLineElement>(null);
  const vertDimChipRef = useRef<SVGGElement>(null);
  const vertDimTextRef = useRef<SVGTextElement>(null);
  const vertGuideRef = useRef<SVGLineElement>(null);
  const gizmoScreenRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // camera-walk joystick: the live push vector (−1..1) the render loop reads each frame
  const navRef = useRef({ x: 0, z: 0 });
  const joyRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<SVGGElement>(null);
  const joyCenter = useRef({ cx: 0, cy: 0 });
  // door/drawer open animation: target (0|1) + current amount per module
  const openTargetRef = useRef<Map<string, number>>(new Map());
  const openCurRef = useRef<Map<string, number>>(new Map());

  const cbRef = useRef({ onSelectCab, onMovePlan, onBeginEdit, onMountY, magnet });
  cbRef.current = { onSelectCab, onMovePlan, onBeginEdit, onMountY, magnet };

  // keep latest room inputs without re-initialising the scene
  const propsRef = useRef({ points, ceiling, openings, coveringColor, interiorWalls, fittings, wallSurfaces, waterWall, layout, mode, view, selectedId });
  propsRef.current = { points, ceiling, openings, coveringColor, interiorWalls, fittings, wallSurfaces, waterWall, layout, mode, view, selectedId };

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
    const clash = g.foots.some((o) => o.id !== id && o.upper === df.upper && footsOverlap(df, o));
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
    const base = { id: f.id, depthM: f.depth / 1000, px: f.cx, pz: f.cy, rot: f.rotDeg, moved: false, px0: f.cx, pz0: f.cy, downX: 0, downZ: 0, startRot: f.rotDeg, prevA: 0, accum: 0, a0Screen: 0, mountY: g.selMountY, mountY0: g.selMountY, vy0: e.clientY, pxPerM: 200 };
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
        const od = o.userData.openable as { kind: string; maxRad?: number; maxZ?: number } | undefined;
        if (!od) return;
        if (od.kind === "door") o.rotation.y = -amount * (od.maxRad ?? 0);
        else o.position.z = amount * (od.maxZ ?? 0);
      });
    };

    const setKitchen = (next: Cabinet[], nextStyle: KitchenStyle) => {
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
    const onDown = (e: PointerEvent) => {
      downXY.x = e.clientX;
      downXY.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current) return; // a gizmo move/rotate is in progress — don't re-pick
      if (!cbRef.current.onSelectCab) return;
      if (Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y) > 6) return; // was an orbit
      if (!kitchen) return;
      raycaster.setFromCamera(ndcAt(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(kitchen.children, true);
      let id: string | null = null;
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (o.userData.cabId) {
            id = o.userData.cabId as string;
            break;
          }
          o = o.parent;
        }
        if (id) break;
      }
      cbRef.current.onSelectCab(id);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    buildRoom();
    setKitchen(cabs, style);
    setView(propsRef.current.view);

    apiRef.current = {
      setKitchen,
      setView,
      syncGizmo: updateGizmo,
      invalidate,
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
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.removeEventListener("change", invalidate);
        controls.dispose();
        if (kitchen) disposeGroup(kitchen);
        if (room) disposeGroup(room);
        wood?.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      },
    };

    return () => {
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
