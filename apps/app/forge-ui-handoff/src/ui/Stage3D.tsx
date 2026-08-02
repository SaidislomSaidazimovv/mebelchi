import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { Panel, Hole } from "../contract/types";
import { buildBlockGroup } from "./renderBlock";
import { mm10ToMeters, mm10ToMm } from "../contract/types";
import { MeasureChip } from "./MeasureChip";
import { Numpad } from "./Numpad";
import { toCm, roundMm10 } from "./measure";

export interface SideHandle {
  id: string;
  x: number;
  y: number;
  z: number;
  axis: "x" | "y" | "z";
}

const MID_X = 3000;
const MID_Z = 2800;

function panelCorners(p: Panel): {id: string;x: number;y: number;z: number;}[] {
  const AX = ["width", "height", "depth"] as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ?
  AX.find((a) => a !== ox && a !== oy)! :
  p.width <= p.height && p.width <= p.depth ? "width" :
  p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  const fa = face[0]!;
  const fb = face[1]!;
  const lo = { width: p.x, height: p.y, depth: p.z };
  const hi = { width: p.x + p.width, height: p.y + p.height, depth: p.z + p.depth };
  const ctr = { width: p.x + p.width / 2, height: p.y + p.height / 2, depth: p.z + p.depth / 2 };
  const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const out: {id: string;x: number;y: number;z: number;}[] = [];
  for (const sa of [0, 1]) {
    for (const sb of [0, 1]) {
      const pos = { width: ctr.width, height: ctr.height, depth: ctr.depth };
      pos[fa] = sa ? hi[fa] : lo[fa];
      pos[fb] = sb ? hi[fb] : lo[fb];
      let cx = pos.width,cy = pos.height,cz = pos.depth;
      if (euler) {
        const v = new THREE.Vector3(cx - ctr.width, cy - ctr.height, cz - ctr.depth).applyEuler(euler);
        cx = ctr.width + v.x;cy = ctr.height + v.y;cz = ctr.depth + v.z;
      }
      out.push({ id: `c${sa}${sb}`, x: cx, y: cy, z: cz });
    }
  }
  return out;
}

function cornerArc(p: Panel, cornerId: string, radius: number): {x: number;y: number;z: number;}[] {
  const sa = cornerId[1] === "1" ? 1 : 0;
  const sb = cornerId[2] === "1" ? 1 : 0;
  const AX = ["width", "height", "depth"] as const;
  const AXVEC = { width: [1, 0, 0], height: [0, 1, 0], depth: [0, 0, 1] } as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ?
  AX.find((a) => a !== ox && a !== oy)! :
  p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  const fa = face[0]!;
  const fb = face[1]!;
  const lo = { width: p.x, height: p.y, depth: p.z };
  const hi = { width: p.x + p.width, height: p.y + p.height, depth: p.z + p.depth };
  const ctr = { width: p.x + p.width / 2, height: p.y + p.height / 2, depth: p.z + p.depth / 2 };
  const cpos = { width: ctr.width, height: ctr.height, depth: ctr.depth };
  cpos[fa] = sa ? hi[fa] : lo[fa];
  cpos[fb] = sb ? hi[fb] : lo[fb];
  const C = new THREE.Vector3(cpos.width, cpos.height, cpos.depth);
  const va = AXVEC[fa];
  const vb = AXVEC[fb];
  const D1 = new THREE.Vector3(va[0], va[1], va[2]).multiplyScalar(sa ? -1 : 1);
  const D2 = new THREE.Vector3(vb[0], vb[1], vb[2]).multiplyScalar(sb ? -1 : 1);
  const O = C.clone().addScaledVector(D1, radius).addScaledVector(D2, radius);
  const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const pc = new THREE.Vector3(ctr.width, ctr.height, ctr.depth);
  const N = 16;
  const out: {x: number;y: number;z: number;}[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N * (Math.PI / 2);
    const pt = O.clone().addScaledVector(D2, -radius * Math.cos(t)).addScaledVector(D1, -radius * Math.sin(t));
    if (euler) pt.sub(pc).applyEuler(euler).add(pc);
    out.push({ x: pt.x, y: pt.y, z: pt.z });
  }
  return out;
}

function panelThickMm10(p: Panel): number {
  const AX = ["width", "height", "depth"] as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ? AX.find((a) => a !== ox && a !== oy)! : p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
  return p[thick];
}

function panelBoxCorners(p: Panel): THREE.Vector3[] {
  const cx = p.x + p.width / 2,cy = p.y + p.height / 2,cz = p.z + p.depth / 2;
  const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const out: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const o = new THREE.Vector3(sx * p.width / 2, sy * p.height / 2, sz * p.depth / 2);
    if (euler) o.applyEuler(euler);
    out.push(new THREE.Vector3(mm10ToMeters(cx + o.x - MID_X), mm10ToMeters(cy + o.y), mm10ToMeters(cz + o.z - MID_Z)));
  }
  return out;
}

const BOX_EDGES: [number, number][] = [[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]];

function snapMeasure(p: Panel, hit: THREE.Vector3, tx: number, ty: number, camera: THREE.PerspectiveCamera, rect: DOMRect): THREE.Vector3 {
  const corners = panelBoxCorners(p);
  const toPx = (v: THREE.Vector3) => {
    const q = v.clone().project(camera);
    return { x: (q.x * 0.5 + 0.5) * rect.width, y: (-(q.y * 0.5) + 0.5) * rect.height };
  };
  let best: THREE.Vector3 | null = null,bestD = 22;
  for (const c of corners) {
    const s = toPx(c);
    const d = Math.hypot(s.x - tx, s.y - ty);
    if (d < bestD) {bestD = d;best = c;}
  }
  if (best) return best;
  let bestE: THREE.Vector3 | null = null,bestED = 16;
  for (const [a, b] of BOX_EDGES) {
    const A = corners[a],B = corners[b];
    const AB = B.clone().sub(A);
    const t = Math.max(0, Math.min(1, hit.clone().sub(A).dot(AB) / AB.lengthSq()));
    const pt = A.clone().addScaledVector(AB, t);
    const s = toPx(pt);
    const d = Math.hypot(s.x - tx, s.y - ty);
    if (d < bestED) {bestED = d;bestE = pt;}
  }
  return bestE ?? hit;
}

function panelEdges(p: Panel): {id: string;x: number;y: number;z: number;ax: number;ay: number;az: number;ix: number;iy: number;iz: number;len: number;}[] {
  const AX = ["width", "height", "depth"] as const;
  const AXVEC: Record<"width" | "height" | "depth", [number, number, number]> = { width: [1, 0, 0], height: [0, 1, 0], depth: [0, 0, 1] };
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ? AX.find((a) => a !== ox && a !== oy)! : p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  const fa = face[0]!;
  const fb = face[1]!;
  const lo = { width: p.x, height: p.y, depth: p.z };
  const hi = { width: p.x + p.width, height: p.y + p.height, depth: p.z + p.depth };
  const ctr = { width: p.x + p.width / 2, height: p.y + p.height / 2, depth: p.z + p.depth / 2 };
  const ext = { width: p.width, height: p.height, depth: p.depth };
  const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const pc = new THREE.Vector3(ctr.width, ctr.height, ctr.depth);
  const make = (edgeAxis: "width" | "height" | "depth", otherAxis: "width" | "height" | "depth", side: 0 | 1, id: string) => {
    const mid = { width: ctr.width, height: ctr.height, depth: ctr.depth };
    mid[otherAxis] = side ? hi[otherAxis] : lo[otherAxis];
    const along = new THREE.Vector3(...AXVEC[edgeAxis]);
    const inward = new THREE.Vector3(...AXVEC[otherAxis]).multiplyScalar(side ? -1 : 1);
    let m = new THREE.Vector3(mid.width, mid.height, mid.depth);
    if (euler) {m = m.sub(pc).applyEuler(euler).add(pc);along.applyEuler(euler);inward.applyEuler(euler);}
    return { id, x: m.x, y: m.y, z: m.z, ax: along.x, ay: along.y, az: along.z, ix: inward.x, iy: inward.y, iz: inward.z, len: ext[edgeAxis] };
  };
  return [make(fa, fb, 0, "e0"), make(fa, fb, 1, "e1"), make(fb, fa, 0, "e2"), make(fb, fa, 1, "e3")];
}

function panelFace(p: Panel): {ox: number;oy: number;oz: number;uax: number;uay: number;uaz: number;ubx: number;uby: number;ubz: number;w: number;h: number;} {
  const AX = ["width", "height", "depth"] as const;
  const AXVEC: Record<"width" | "height" | "depth", [number, number, number]> = { width: [1, 0, 0], height: [0, 1, 0], depth: [0, 0, 1] };
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ? AX.find((a) => a !== ox && a !== oy)! : p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  const fa = face[0]!;
  const fb = face[1]!;
  const lo = { width: p.x, height: p.y, depth: p.z };
  const ctr = { width: p.x + p.width / 2, height: p.y + p.height / 2, depth: p.z + p.depth / 2 };
  const ext = { width: p.width, height: p.height, depth: p.depth };
  const origin = { width: ctr.width, height: ctr.height, depth: ctr.depth };
  origin[fa] = lo[fa];
  origin[fb] = lo[fb];
  const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const pc = new THREE.Vector3(ctr.width, ctr.height, ctr.depth);
  let O = new THREE.Vector3(origin.width, origin.height, origin.depth);
  const ua = new THREE.Vector3(...AXVEC[fa]);
  const ub = new THREE.Vector3(...AXVEC[fb]);
  if (euler) {O = O.sub(pc).applyEuler(euler).add(pc);ua.applyEuler(euler);ub.applyEuler(euler);}
  return { ox: O.x, oy: O.y, oz: O.z, uax: ua.x, uay: ua.y, uaz: ua.z, ubx: ub.x, uby: ub.y, ubz: ub.z, w: ext[fa], h: ext[fb] };
}

export function Stage3D({
  panels,
  holes,
  selectedPanelId,
  onSelectPanel,
  onDragPanel,
  onUpdateDim,
  transformMode = "translate",
  envelope,
  lockedDims,
  handles,
  selectedHandleId = null,
  onSelectHandle,
  onDragHandle,
  showResizeGrips = false,
  onEnterResize,
  snapHint,
  annotations,
  onLiveDragPanel,
  overlays,
  rotationGizmo,
  groundY_mm10 = 0,
  showTargets = false,
  showGizmo = true,
  showMeasure = false,
  onPickTarget,
  onApplyRound,
  appliedRounds,
  onApplyChamfer,
  appliedChamfers,
  onApplyNotch,
  appliedNotches,
  onApplyWindow,
  appliedWindows,
  panelCuts

}: {panels: Panel[];holes: Hole[];selectedPanelId: string | null;onSelectPanel: (id: string | null) => void;onDragPanel: (id: string, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;onUpdateDim: (dim: "width" | "height" | "depth", val: number) => void;transformMode?: "translate" | "rotate";envelope?: {w_mm10: number;h_mm10: number;d_mm10: number;};lockedDims?: ReadonlyArray<"width" | "height" | "depth">;handles?: ReadonlyArray<SideHandle>;selectedHandleId?: string | null;onSelectHandle?: (id: string | null) => void;onDragHandle?: (id: string, patch: {x: number;y: number;z: number;width?: number;height?: number;depth?: number;}) => void;showResizeGrips?: boolean;onEnterResize?: () => void;snapHint?: {box: {x: number;y: number;z: number;w: number;h: number;d: number;};axes: {x: boolean;y: boolean;z: boolean;};gap: number;contact: {x: number;y: number;z: number;};} | null;annotations?: ReadonlyArray<{id: string;x: number;y: number;z: number;node: ReactNode;}>;onLiveDragPanel?: (id: string, x: number, y: number, z: number) => void;overlays?: ReadonlyArray<{id: string;points: ReadonlyArray<{x: number;y: number;z: number;}>;color: number;closed?: boolean;dashed?: boolean;}>;rotationGizmo?: {cx: number;cy: number;cz: number;axis: "x" | "y" | "z";sweepDeg: number;radius: number;} | null;groundY_mm10?: number;showTargets?: boolean;showGizmo?: boolean;showMeasure?: boolean;onPickTarget?: (cornerId: string) => void;onApplyRound?: (cornerIds: string[], radius_mm10: number) => void;appliedRounds?: ReadonlyArray<{cornerId: string;radius: number;}>;onApplyChamfer?: (edgeIds: string[], width_mm10: number, depth_mm10: number) => void;appliedChamfers?: ReadonlyArray<{edgeId: string;width: number;depth: number;}>;onApplyNotch?: (edgeId: string, width_mm10: number, depth_mm10: number, radius_mm10: number, pos_mm10: number, lockL: boolean, lockR: boolean) => void;appliedNotches?: ReadonlyArray<{edgeId: string;width: number;depth: number;radius: number;pos: number;lockL: boolean;lockR: boolean;}>;onApplyWindow?: (idx: number, width_mm10: number, height_mm10: number, radius_mm10: number, cx_mm10: number, cy_mm10: number, lockT: boolean, lockR: boolean, lockB: boolean, lockL: boolean) => void;appliedWindows?: ReadonlyArray<{w: number;h: number;radius: number;cx: number;cy: number;lockT: boolean;lockR: boolean;lockB: boolean;lockL: boolean;}>;panelCuts?: Record<string, {windows?: ReadonlyArray<{w: number;h: number;radius: number;cx: number;cy: number;}>;rounds?: ReadonlyArray<{cornerId: string;radius: number;}>;notches?: ReadonlyArray<{edgeId: string;width: number;depth: number;radius: number;pos: number;}>;chamfers?: ReadonlyArray<{edgeId: string;width: number;depth: number;}>;}>;}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [overlayPos, setOverlayPos] = useState<{x: number;y: number;} | null>(null);
  const [annPos, setAnnPos] = useState<Record<string, {x: number;y: number;}>>({});

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const selectedPanelIdRef = useRef(selectedPanelId);
  selectedPanelIdRef.current = selectedPanelId;
  const onDragPanelRef = useRef(onDragPanel);
  onDragPanelRef.current = onDragPanel;
  const onDragHandleRef = useRef(onDragHandle);
  onDragHandleRef.current = onDragHandle;
  const onLiveDragPanelRef = useRef(onLiveDragPanel);
  onLiveDragPanelRef.current = onLiveDragPanel;
  const onSelectHandleRef = useRef(onSelectHandle);
  onSelectHandleRef.current = onSelectHandle;
  const onEnterResizeRef = useRef(onEnterResize);
  onEnterResizeRef.current = onEnterResize;
  const snapHintRef = useRef(snapHint);
  snapHintRef.current = snapHint;
  const handlesRef = useRef(handles);
  handlesRef.current = handles;
  const dragRef = useRef<{id: string;axisVec: THREE.Vector3;grabOffset: number;} | null>(null);
  const resizeFrameRef = useRef<{axis: "x" | "y" | "z";O: THREE.Vector3;dir: THREE.Vector3;grab: number;dims: {width: number;height: number;depth: number;};centerM: THREE.Vector3;origExt: number;other: {axis: "x" | "y" | "z";origExt: number;} | null;} | null>(null);
  const justDraggedRef = useRef(false);

  const gizmoDraggingRef = useRef(false);
  const selectedHandleIdRef = useRef(selectedHandleId);
  selectedHandleIdRef.current = selectedHandleId;

  const moveDragRef = useRef<{id: string;axis: "x" | "y" | "z";startPanel: {x: number;y: number;z: number;};sign: number;} | null>(null);
  const moveLeaderRef = useRef<THREE.Line | null>(null);
  const moveAnchorRef = useRef<{x: number;y: number;z: number;} | null>(null);
  const groundYRef = useRef(groundY_mm10);
  groundYRef.current = groundY_mm10;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const transformModeRef = useRef(transformMode);
  transformModeRef.current = transformMode;
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moveChip, setMoveChip] = useState<{value: number;kind: "travel" | "height";resting: boolean;} | null>(null);
  const [moveNumpad, setMoveNumpad] = useState<{value: number;label: string;} | null>(null);
  const moveNumpadRef = useRef(moveNumpad);
  moveNumpadRef.current = moveNumpad;

  const clearAutoHide = () => {
    if (autoHideRef.current) {clearTimeout(autoHideRef.current);autoHideRef.current = null;}
  };

  const clearMoveIndicator = () => {
    clearAutoHide();
    moveDragRef.current = null;
    moveAnchorRef.current = null;
    setMoveChip(null);
  };

  const commitMove = (v_mm10: number) => {
    const d = moveDragRef.current;
    setMoveNumpad(null);
    if (!d) {clearMoveIndicator();return;}
    const next = { x: d.startPanel.x, y: d.startPanel.y, z: d.startPanel.z };
    if (d.axis === "y") next.y = groundYRef.current + v_mm10;else
    next[d.axis] = d.startPanel[d.axis] + d.sign * v_mm10;
    onDragPanelRef.current(d.id, roundMm10(next.x), roundMm10(next.y), roundMm10(next.z));
    clearMoveIndicator();
  };

  const resizeMetaRef = useRef<{id: string;axis: "x" | "y" | "z";oppositeCoord: number;sign: number;center: {x: number;y: number;z: number;};oldW: number;oldH: number;panelX: number;panelY: number;} | null>(null);
  const [uniform, setUniform] = useState(false);
  const uniformRef = useRef(uniform);
  uniformRef.current = uniform;
  const resizeLeaderRef = useRef<THREE.Line | null>(null);
  const resizeAnchorRef = useRef<{x: number;y: number;z: number;} | null>(null);
  const resizeAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resizeChip, setResizeChip] = useState<{value: number;resting: boolean;axis: "x" | "y" | "z";} | null>(null);
  const [resizeNumpad, setResizeNumpad] = useState<{value: number;} | null>(null);
  const resizeNumpadRef = useRef(resizeNumpad);
  resizeNumpadRef.current = resizeNumpad;

  const clearResizeIndicator = () => {
    if (resizeAutoHideRef.current) {clearTimeout(resizeAutoHideRef.current);resizeAutoHideRef.current = null;}
    if (resizeLeaderRef.current) {
      sceneRef.current?.remove(resizeLeaderRef.current);
      resizeLeaderRef.current.geometry.dispose();
      resizeLeaderRef.current = null;
    }
    resizeMetaRef.current = null;
    resizeFrameRef.current = null;
    resizeAnchorRef.current = null;
    setResizeChip(null);
  };

  const commitResize = (v_mm10: number) => {
    const fr = resizeFrameRef.current;
    const rm = resizeMetaRef.current;
    setResizeNumpad(null);
    if (!fr || !rm) {clearResizeIndicator();return;}
    const ext = Math.max(50, roundMm10(v_mm10));
    const ext_m = ext / 10000;
    const cM = fr.O.clone().addScaledVector(fr.dir, ext_m / 2);
    const cx = cM.x * 10000 + MID_X,cy = cM.y * 10000,cz = cM.z * 10000 + MID_Z;
    const w = fr.axis === "x" ? ext : fr.dims.width;
    const hgt = fr.axis === "y" ? ext : fr.dims.height;
    const dep = fr.axis === "z" ? ext : fr.dims.depth;
    onDragHandleRef.current?.(rm.id, {
      x: roundMm10(cx - w / 2),
      y: roundMm10(cy - hgt / 2),
      z: roundMm10(cz - dep / 2),
      ...fr.axis === "x" ? { width: ext } : fr.axis === "y" ? { height: ext } : { depth: ext }
    });
    clearResizeIndicator();
  };

  const rotDragRef = useRef<{id: string;axis: "x" | "y" | "z";startRot: {x: number;y: number;z: number;};center: {x: number;y: number;z: number;};radius: number;} | null>(null);
  const rotWedgeRef = useRef<THREE.Group | null>(null);
  const rotWedgeMeshRef = useRef<THREE.Mesh | null>(null);
  const rotAnchorRef = useRef<{x: number;y: number;z: number;} | null>(null);
  const rotAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotChip, setRotChip] = useState<{value: number;resting: boolean;axis: "x" | "y" | "z";} | null>(null);
  const [rotAxis, setRotAxis] = useState<"x" | "y" | "z">("y");
  const [rotNumpad, setRotNumpad] = useState<{value: number;} | null>(null);
  const rotNumpadRef = useRef(rotNumpad);
  rotNumpadRef.current = rotNumpad;

  const clearRotIndicator = () => {
    if (rotAutoHideRef.current) {clearTimeout(rotAutoHideRef.current);rotAutoHideRef.current = null;}
    const grp = rotWedgeRef.current;
    if (grp) {
      sceneRef.current?.remove(grp);
      grp.traverse((o) => {const m = o as THREE.Mesh;if (m.geometry) m.geometry.dispose();});
      rotWedgeRef.current = null;
      rotWedgeMeshRef.current = null;
    }
    rotDragRef.current = null;
    rotAnchorRef.current = null;
    setRotChip(null);
  };

  const commitRot = (deg: number) => {
    const d = rotDragRef.current;
    setRotNumpad(null);
    if (!d) {clearRotIndicator();return;}
    const rot = { x: d.startRot.x, y: d.startRot.y, z: d.startRot.z };
    rot[d.axis] = d.startRot[d.axis] + deg * Math.PI / 180;
    const p = panelsRef.current.find((x) => x.id === d.id);
    if (p) onDragPanelRef.current(d.id, p.x, p.y, p.z, rot.x, rot.y, rot.z);
    clearRotIndicator();
  };

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) || null;

  const rotateBy = (deltaDeg: number) => {
    const p = selectedPanel;
    if (!p) return;
    const cur = { x: p.rx ?? 0, y: p.ry ?? 0, z: p.rz ?? 0 };
    let v = cur[rotAxis] + deltaDeg * Math.PI / 180;
    v = v % (Math.PI * 2);
    if (v > Math.PI) v -= Math.PI * 2;
    if (v < -Math.PI) v += Math.PI * 2;
    cur[rotAxis] = v;
    onDragPanelRef.current?.(p.id, p.x, p.y, p.z, cur.x, cur.y, cur.z);
  };

  const resetRotAxis = () => {
    const p = selectedPanel;
    if (!p) return;
    const cur = { x: p.rx ?? 0, y: p.ry ?? 0, z: p.rz ?? 0 };
    cur[rotAxis] = 0;
    onDragPanelRef.current?.(p.id, p.x, p.y, p.z, cur.x, cur.y, cur.z);
  };

  const focusSelected = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !selectedPanel) return;
    const f = panelFace(selectedPanel);
    const cxm = f.ox + f.uax * f.w / 2 + f.ubx * f.h / 2;
    const cym = f.oy + f.uay * f.w / 2 + f.uby * f.h / 2;
    const czm = f.oz + f.uaz * f.w / 2 + f.ubz * f.h / 2;
    const center = new THREE.Vector3(mm10ToMeters(cxm - MID_X), mm10ToMeters(cym), mm10ToMeters(czm - MID_Z));
    const ua = new THREE.Vector3(f.uax, f.uay, f.uaz);
    const ub = new THREE.Vector3(f.ubx, f.uby, f.ubz);
    const normal = new THREE.Vector3().crossVectors(ua, ub).normalize();
    const camDir = new THREE.Vector3().subVectors(camera.position, center);
    if (normal.dot(camDir) < 0) normal.negate();
    const half = mm10ToMeters(Math.max(f.w, f.h)) / 2;
    const dist = half / Math.tan(22.5 * Math.PI / 180) * 1.4;
    camera.position.copy(center).addScaledVector(normal, dist);
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
  };

  const putOnGround = () => {
    const p = selectedPanel;
    if (!p) return;
    const cy = p.y + p.height / 2;
    const hx = p.width / 2,hy = p.height / 2,hz = p.depth / 2;
    const euler = p.rx || p.ry || p.rz ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
    let minY = Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const v = new THREE.Vector3(sx * hx, sy * hy, sz * hz);
      if (euler) v.applyEuler(euler);
      minY = Math.min(minY, cy + v.y);
    }
    const shift = groundY_mm10 - minY;
    onDragPanelRef.current?.(p.id, p.x, roundMm10(p.y + shift), p.z, p.rx, p.ry, p.rz);
  };

  const showMeasureRef = useRef(showMeasure);
  showMeasureRef.current = showMeasure;
  const [measurePts, setMeasurePts] = useState<{x: number;y: number;z: number;panelId: string;}[]>([]);
  const measurePtsRef = useRef(measurePts);
  measurePtsRef.current = measurePts;
  const [measureNumpad, setMeasureNumpad] = useState<{value: number;} | null>(null);
  useEffect(() => {if (!showMeasure) {setMeasurePts([]);setMeasureNumpad(null);}}, [showMeasure]);

  const commitMeasure = (newDist: number) => {
    setMeasureNumpad(null);
    const pts = measurePtsRef.current;
    if (pts.length !== 2) return;
    const A = pts[0],B = pts[1];
    if (A.panelId === B.panelId) return;
    const dx = B.x - A.x,dy = B.y - A.y,dz = B.z - A.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    const nbx = A.x + dx / len * newDist,nby = A.y + dy / len * newDist,nbz = A.z + dz / len * newDist;
    const panel = panelsRef.current.find((p) => p.id === B.panelId);
    if (!panel) return;
    onDragPanelRef.current?.(panel.id, roundMm10(panel.x + (nbx - B.x)), roundMm10(panel.y + (nby - B.y)), roundMm10(panel.z + (nbz - B.z)), panel.rx, panel.ry, panel.rz);
    setMeasurePts([A, { x: roundMm10(nbx), y: roundMm10(nby), z: roundMm10(nbz), panelId: B.panelId }]);
  };

  const frameModel = (reposition: boolean) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const ps = panelsRef.current;
    const box = new THREE.Box3();
    if (ps && ps.length) {
      for (const p of ps) {
        const cx = mm10ToMeters(p.x + p.width / 2 - MID_X);
        const cy = mm10ToMeters(p.y + p.height / 2);
        const cz = mm10ToMeters(p.z + p.depth / 2 - MID_Z);
        const r = mm10ToMeters(Math.hypot(p.width, p.height, p.depth) / 2);
        box.expandByPoint(new THREE.Vector3(cx - r, cy - r, cz - r));
        box.expandByPoint(new THREE.Vector3(cx + r, cy + r, cz + r));
      }
    } else {
      box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    }
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.05);
    controls.target.copy(center);
    controls.minDistance = 0.03;
    controls.maxDistance = radius * 8;
    if (reposition) {
      const dir = new THREE.Vector3(0.8, 0.5, 1.8).normalize();
      const dist = radius / Math.sin(22.5 * Math.PI / 180) * 1.1;
      camera.position.copy(center).addScaledVector(dir, dist);
      camera.lookAt(center);
    }
    controls.update();
  };

  const panelIdsKey = panels.map((p) => p.id).join(",");
  useEffect(() => {
    if (dragRef.current || gizmoDraggingRef.current) return;
    frameModel(false);
  }, [panelIdsKey]);

  const [targetKind, setTargetKind] = useState<"corners" | "edges" | "notches" | "windows">("corners");

  const pins = showTargets && selectedPanel && targetKind === "corners" ? panelCorners(selectedPanel) : [];
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const [pickedPin, setPickedPin] = useState<string | null>(null);
  const onPickTargetRef = useRef(onPickTarget);
  onPickTargetRef.current = onPickTarget;

  const allCornerIds = pins.map((c) => c.id);
  const ROUND_DEFAULT = 150;
  const [round, setRound] = useState<{corners: string[];radius: number;linked: boolean;} | null>(null);
  const roundRef = useRef(round);
  roundRef.current = round;
  const onApplyRoundRef = useRef(onApplyRound);
  onApplyRoundRef.current = onApplyRound;
  const roundArcGroupRef = useRef<THREE.Group | null>(null);
  const [roundNumpad, setRoundNumpad] = useState(false);

  const openRound = (cornerId: string) => {
    setRound((r) => {
      const linked = r?.linked ?? false;
      const radius = r && r.radius > 0 ? r.radius : ROUND_DEFAULT;
      return { corners: linked ? allCornerIds : [cornerId], radius, linked };
    });
  };
  const toggleRoundLink = () => {
    setRound((r) => {
      if (!r) return r;
      const linked = !r.linked;
      return { ...r, linked, corners: linked ? allCornerIds : [pickedPin ?? r.corners[0] ?? "c00"] };
    });
  };
  const applyRound = () => {
    const r = roundRef.current;
    if (r) onApplyRoundRef.current?.(r.corners, r.radius);
    setRound(null);setRoundNumpad(false);
  };
  const deleteRound = () => {
    const r = roundRef.current;
    if (r) onApplyRoundRef.current?.(r.corners, 0);
    setRound(null);setRoundNumpad(false);
  };
  const startRoundDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startR = roundRef.current?.radius ?? 0;
    const onMove = (ev: PointerEvent) => {
      const nr = Math.max(0, roundMm10(startR + (ev.clientX - startX) * 5));
      setRound((r) => r ? { ...r, radius: nr } : r);
    };
    const onUp = () => {window.removeEventListener("pointermove", onMove);window.removeEventListener("pointerup", onUp);};
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const cornerRadius = (cid: string): number => {
    if (round && round.corners.includes(cid)) return round.radius;
    const ap = (appliedRounds ?? []).find((a) => a.cornerId === cid);
    return ap ? ap.radius : 0;
  };

  const cornerRotation = (px: number, py: number): number => {
    const pts = pins.map((c) => annPos[`__pin_${c.id}__`]).filter((q): q is {x: number;y: number;} => !!q);
    if (pts.length < 2) return 0;
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    const left = px < cx;
    const top = py < cy;
    if (top && left) return 0;
    if (top && !left) return 90;
    if (!top && !left) return 180;
    return 270;
  };

  const roundHandle = (() => {
    if (!round || !pickedPin || !selectedPanel) return null;
    const corner = panelCorners(selectedPanel).find((c) => c.id === pickedPin);
    if (!corner) return null;
    const f = panelFace(selectedPanel);
    const fcx = f.ox + f.uax * f.w / 2 + f.ubx * f.h / 2;
    const fcy = f.oy + f.uay * f.w / 2 + f.uby * f.h / 2;
    const fcz = f.oz + f.uaz * f.w / 2 + f.ubz * f.h / 2;
    let dx = fcx - corner.x,dy = fcy - corner.y,dz = fcz - corner.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;dy /= len;dz /= len;
    const off = Math.max(round.radius, 300);
    return { x: corner.x + dx * off, y: corner.y + dy * off, z: corner.z + dz * off, dx, dy, dz };
  })();
  const roundHandleRef = useRef(roundHandle);
  roundHandleRef.current = roundHandle;

  const startRoundHandleDrag = (ev0: ReactPointerEvent) => {
    ev0.preventDefault();
    ev0.stopPropagation();
    const rh = roundHandleRef.current;
    if (!rh) return;
    const LEN = 1000;
    const p0 = projectMm10(rh.x, rh.y, rh.z);
    const p1 = projectMm10(rh.x + rh.dx * LEN, rh.y + rh.dy * LEN, rh.z + rh.dz * LEN);
    if (!p0 || !p1) return;
    const sdx = p1.x - p0.x,sdy = p1.y - p0.y;
    const slen = Math.hypot(sdx, sdy);
    if (slen < 0.01) return;
    const ux = sdx / slen,uy = sdy / slen,scale = slen / LEN;
    const startX = ev0.clientX,startY = ev0.clientY;
    const startR = roundRef.current?.radius ?? 0;
    const onMove = (ev: PointerEvent) => {
      const mv = ((ev.clientX - startX) * ux + (ev.clientY - startY) * uy) / scale;
      const nr = Math.max(0, roundMm10(startR + mv));
      setRound((r) => r ? { ...r, radius: nr } : r);
    };
    const onUp = () => {window.removeEventListener("pointermove", onMove);window.removeEventListener("pointerup", onUp);};
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const edges = showTargets && selectedPanel && (targetKind === "edges" || targetKind === "notches") ? panelEdges(selectedPanel) : [];
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const allEdgeIds = edges.map((e) => e.id);
  const CHAMFER_W = 490;
  const CHAMFER_D = 80;
  const [chamfer, setChamfer] = useState<{edges: string[];width: number;depth: number;linked: boolean;} | null>(null);
  const chamferRef = useRef(chamfer);
  chamferRef.current = chamfer;
  const onApplyChamferRef = useRef(onApplyChamfer);
  onApplyChamferRef.current = onApplyChamfer;
  const chamferGroupRef = useRef<THREE.Group | null>(null);
  const [chamferNumpad, setChamferNumpad] = useState<"width" | "depth" | null>(null);
  const [pickedEdge, setPickedEdge] = useState<string | null>(null);

  const openChamfer = (edgeId: string) => {
    setChamfer((c) => {
      const linked = c?.linked ?? false;
      const width = c && c.width > 0 ? c.width : CHAMFER_W;
      const depth = c && c.depth > 0 ? c.depth : CHAMFER_D;
      return { edges: linked ? allEdgeIds : [edgeId], width, depth, linked };
    });
  };
  const toggleChamferLink = () => {
    setChamfer((c) => {
      if (!c) return c;
      const linked = !c.linked;
      return { ...c, linked, edges: linked ? allEdgeIds : [pickedEdge ?? c.edges[0] ?? "e0"] };
    });
  };
  const applyChamfer = () => {
    const c = chamferRef.current;
    setChamferNumpad(null);
    if (c) onApplyChamferRef.current?.(c.edges, c.width, c.depth);
    setChamfer(null);
  };
  const deleteChamfer = () => {
    const c = chamferRef.current;
    setChamferNumpad(null);
    if (c) onApplyChamferRef.current?.(c.edges, 0, 0);
    setChamfer(null);
  };

  const chamferHandle = (() => {
    if (!chamfer || !pickedEdge || !selectedPanel) return null;
    const e = edges.find((x) => x.id === pickedEdge);
    if (!e) return null;
    const off = Math.max(chamfer.width + 700, 900);
    return { x: e.x + e.ix * off, y: e.y + e.iy * off, z: e.z + e.iz * off, dx: e.ix, dy: e.iy, dz: e.iz };
  })();
  const chamferHandleRef = useRef(chamferHandle);
  chamferHandleRef.current = chamferHandle;

  const chamferDepthHandle = (() => {
    if (!chamfer || !pickedEdge || !selectedPanel) return null;
    const e = edges.find((x) => x.id === pickedEdge);
    if (!e) return null;
    let nx = e.ay * e.iz - e.az * e.iy;
    let ny = e.az * e.ix - e.ax * e.iz;
    let nz = e.ax * e.iy - e.ay * e.ix;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;ny /= nl;nz /= nl;
    const cam = cameraRef.current;
    if (cam) {
      const look = cam.getWorldDirection(new THREE.Vector3());
      if (nx * look.x + ny * look.y + nz * look.z > 0) {nx = -nx;ny = -ny;nz = -nz;}
    }
    const off = Math.max(chamfer.depth + 700, 900);
    return { x: e.x + nx * off, y: e.y + ny * off, z: e.z + nz * off, dx: nx, dy: ny, dz: nz };
  })();
  const chamferDepthHandleRef = useRef(chamferDepthHandle);
  chamferDepthHandleRef.current = chamferDepthHandle;

  const dragChamferHandle = (ev0: ReactPointerEvent, ref: typeof chamferHandleRef, depth: boolean) => {
    ev0.preventDefault();
    ev0.stopPropagation();
    const ch = ref.current;
    if (!ch) return;
    const LEN = 1000;
    const p0 = projectMm10(ch.x, ch.y, ch.z);
    const p1 = projectMm10(ch.x + ch.dx * LEN, ch.y + ch.dy * LEN, ch.z + ch.dz * LEN);
    if (!p0 || !p1) return;
    const sdx = p1.x - p0.x,sdy = p1.y - p0.y;
    const slen = Math.hypot(sdx, sdy);
    if (slen < 0.01) return;
    const ux = sdx / slen,uy = sdy / slen,scale = slen / LEN;
    const startX = ev0.clientX,startY = ev0.clientY;
    const startV = (depth ? chamferRef.current?.depth : chamferRef.current?.width) ?? 0;
    const maxDepth = depth && selectedPanel ? panelThickMm10(selectedPanel) : Infinity;
    const onMove = (ev: PointerEvent) => {
      const mv = ((ev.clientX - startX) * ux + (ev.clientY - startY) * uy) / scale;
      const nv = Math.min(maxDepth, Math.max(0, roundMm10(startV + mv)));
      setChamfer((c) => c ? depth ? { ...c, depth: nv } : { ...c, width: nv } : c);
    };
    const onUp = () => {window.removeEventListener("pointermove", onMove);window.removeEventListener("pointerup", onUp);};
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const startChamferHandleDrag = (ev0: ReactPointerEvent) => dragChamferHandle(ev0, chamferHandleRef, false);
  const startChamferDepthDrag = (ev0: ReactPointerEvent) => dragChamferHandle(ev0, chamferDepthHandleRef, true);

  const edgeMachining = (eid: string): {width: number;depth: number;} | null => {
    if (chamfer && chamfer.edges.includes(eid)) return { width: chamfer.width, depth: chamfer.depth };
    const ac = (appliedChamfers ?? []).find((a) => a.edgeId === eid);
    return ac ? { width: ac.width, depth: ac.depth } : null;
  };

  const NOTCH_W = 700;
  const NOTCH_D = 500;
  const NOTCH_R = 40;
  const [notch, setNotch] = useState<{edgeId: string;width: number;depth: number;radius: number;pos: number;lockL: boolean;lockR: boolean;} | null>(null);
  const notchRef = useRef(notch);
  notchRef.current = notch;
  const onApplyNotchRef = useRef(onApplyNotch);
  onApplyNotchRef.current = onApplyNotch;
  const notchGroupRef = useRef<THREE.Group | null>(null);
  const [notchNumpad, setNotchNumpad] = useState<"width" | "depth" | "radius" | "offL" | "offR" | null>(null);

  const openNotch = (edgeId: string) => {
    const e = edges.find((x) => x.id === edgeId);
    const len = e ? e.len : 2000;
    const ap = (appliedNotches ?? []).find((a) => a.edgeId === edgeId);
    setNotch(ap ?
    { edgeId, width: ap.width, depth: ap.depth, radius: ap.radius, pos: ap.pos, lockL: ap.lockL, lockR: ap.lockR } :
    { edgeId, width: Math.min(NOTCH_W, len * 0.6), depth: NOTCH_D, radius: NOTCH_R, pos: len / 2, lockL: false, lockR: false });
  };
  const applyNotch = () => {
    const n = notchRef.current;
    setNotchNumpad(null);
    if (n) onApplyNotchRef.current?.(n.edgeId, n.width, n.depth, n.radius, n.pos, n.lockL, n.lockR);
    setNotch(null);
  };
  const deleteNotch = () => {
    const n = notchRef.current;
    setNotchNumpad(null);
    if (n) onApplyNotchRef.current?.(n.edgeId, 0, 0, 0, 0, false, false);
    setNotch(null);
  };

  const notchOf = (eid: string): {width: number;depth: number;radius: number;pos: number;} | null => {
    if (notch && notch.edgeId === eid) return { width: notch.width, depth: notch.depth, radius: notch.radius, pos: notch.pos };
    const an = (appliedNotches ?? []).find((a) => a.edgeId === eid);
    return an ? { width: an.width, depth: an.depth, radius: an.radius, pos: an.pos } : null;
  };

  const projectMm10 = (x: number, y: number, z: number): {x: number;y: number;} | null => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(mm10ToMeters(x - MID_X), mm10ToMeters(y), mm10ToMeters(z - MID_Z)).project(camera);
    return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-(v.y * 0.5) + 0.5) * rect.height + rect.top };
  };

  const notchHandles = (() => {
    if (!notch || !pickedEdge) return [] as {id: "left" | "right" | "depth" | "pos";x: number;y: number;z: number;}[];
    const e = edges.find((x) => x.id === notch.edgeId);
    if (!e) return [];
    const at = (t: number) => ({ x: e.x + e.ax * (t - e.len / 2), y: e.y + e.ay * (t - e.len / 2), z: e.z + e.az * (t - e.len / 2) });
    const L = at(notch.pos - notch.width / 2);
    const R = at(notch.pos + notch.width / 2);
    const C = at(notch.pos);
    return [
    { id: "left" as const, ...L },
    { id: "right" as const, ...R },
    { id: "depth" as const, x: C.x + e.ix * notch.depth, y: C.y + e.iy * notch.depth, z: C.z + e.iz * notch.depth },
    { id: "pos" as const, x: C.x - e.ix * 300, y: C.y - e.iy * 300, z: C.z - e.iz * 300 }];

  })();
  const notchHandlesRef = useRef(notchHandles);
  notchHandlesRef.current = notchHandles;

  const notchAnchors = (() => {
    if (!notch || !pickedEdge) return [] as {id: string;x: number;y: number;z: number;}[];
    const e = edges.find((x) => x.id === notch.edgeId);
    if (!e) return [];
    const at = (t: number) => ({ x: e.x + e.ax * (t - e.len / 2), y: e.y + e.ay * (t - e.len / 2), z: e.z + e.az * (t - e.len / 2) });
    const inw = (p: {x: number;y: number;z: number;}, d: number) => ({ x: p.x + e.ix * d, y: p.y + e.iy * d, z: p.z + e.iz * d });
    const Lt = notch.pos - notch.width / 2,Rt = notch.pos + notch.width / 2;
    return [
    { id: "offL", ...inw(at(Lt / 2), -180) },
    { id: "offR", ...inw(at((Rt + e.len) / 2), -180) },
    { id: "w", ...inw(at(notch.pos), -820) },
    { id: "d", ...inw(at(Rt + 300), notch.depth * 0.5 + 150) },
    { id: "radius", ...inw(at(Lt - 300), notch.depth * 0.5 + 150) },
    { id: "ok", ...inw(at(notch.pos), notch.depth + 450) }];

  })();
  const notchAnchorsRef = useRef(notchAnchors);
  notchAnchorsRef.current = notchAnchors;

  const startNotchDrag = (ev0: ReactPointerEvent, handle: "left" | "right" | "depth" | "pos") => {
    ev0.preventDefault();
    ev0.stopPropagation();
    const n = notchRef.current;
    const e = edgesRef.current.find((x) => x.id === n?.edgeId);
    if (!n || !e) return;
    if (handle === "left" && n.lockL || handle === "right" && n.lockR) return;
    const inward = handle === "depth";
    const dir = inward ? { x: e.ix, y: e.iy, z: e.iz } : { x: e.ax, y: e.ay, z: e.az };
    const t = handle === "left" ? n.pos - n.width / 2 : handle === "right" ? n.pos + n.width / 2 : n.pos;
    const base = inward ?
    { x: e.x + e.ax * (n.pos - e.len / 2) + e.ix * n.depth, y: e.y + e.ay * (n.pos - e.len / 2) + e.iy * n.depth, z: e.z + e.az * (n.pos - e.len / 2) + e.iz * n.depth } :
    { x: e.x + e.ax * (t - e.len / 2), y: e.y + e.ay * (t - e.len / 2), z: e.z + e.az * (t - e.len / 2) };
    const LEN = 1000;
    const p0 = projectMm10(base.x, base.y, base.z);
    const p1 = projectMm10(base.x + dir.x * LEN, base.y + dir.y * LEN, base.z + dir.z * LEN);
    if (!p0 || !p1) return;
    const sdx = p1.x - p0.x,sdy = p1.y - p0.y;
    const slen = Math.hypot(sdx, sdy);
    if (slen < 0.01) return;
    const ux = sdx / slen,uy = sdy / slen;
    const scale = slen / LEN;
    const startX = ev0.clientX,startY = ev0.clientY;
    const s = { width: n.width, depth: n.depth, pos: n.pos, len: e.len };
    const sL = s.pos - s.width / 2,sR = s.pos + s.width / 2;
    const onMove = (ev: PointerEvent) => {
      const mv = ((ev.clientX - startX) * ux + (ev.clientY - startY) * uy) / scale;
      setNotch((cur) => {
        if (!cur) return cur;
        if (handle === "depth") return { ...cur, depth: Math.max(50, roundMm10(s.depth + mv)) };
        if (handle === "pos") return { ...cur, pos: Math.max(cur.width / 2, Math.min(s.len - cur.width / 2, roundMm10(s.pos + mv))) };
        if (handle === "left") {const nL = Math.min(sR - 100, sL + mv);return { ...cur, width: roundMm10(sR - nL), pos: roundMm10((nL + sR) / 2) };}
        const nR = Math.max(sL + 100, sR + mv);return { ...cur, width: roundMm10(nR - sL), pos: roundMm10((sL + nR) / 2) };
      });
    };
    const onUp = () => {window.removeEventListener("pointermove", onMove);window.removeEventListener("pointerup", onUp);};
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const winFace = showTargets && selectedPanel && targetKind === "windows" ? panelFace(selectedPanel) : null;
  const [win, setWin] = useState<{w: number;h: number;radius: number;cx: number;cy: number;lockT: boolean;lockR: boolean;lockB: boolean;lockL: boolean;idx: number;} | null>(null);
  const winRef = useRef(win);
  winRef.current = win;
  const onApplyWindowRef = useRef(onApplyWindow);
  onApplyWindowRef.current = onApplyWindow;
  const winGroupRef = useRef<THREE.Group | null>(null);
  const [winNumpad, setWinNumpad] = useState<"w" | "h" | "radius" | "offT" | "offR" | "offB" | "offL" | null>(null);

  const openWindow = (idx: number) => {
    if (!winFace) return;
    const ap = (appliedWindows ?? [])[idx] ?? null;
    setWin(ap ?
    { w: ap.w, h: ap.h, radius: ap.radius, cx: ap.cx, cy: ap.cy, lockT: ap.lockT, lockR: ap.lockR, lockB: ap.lockB, lockL: ap.lockL, idx } :
    { w: roundMm10(winFace.w * 0.4), h: roundMm10(winFace.h * 0.4), radius: 0, cx: roundMm10(winFace.w / 2), cy: roundMm10(winFace.h / 2), lockT: false, lockR: false, lockB: false, lockL: false, idx: -1 });
  };
  const applyWindow = () => {
    const w = winRef.current;
    setWinNumpad(null);
    if (w) onApplyWindowRef.current?.(w.idx, w.w, w.h, w.radius, w.cx, w.cy, w.lockT, w.lockR, w.lockB, w.lockL);
    setWin(null);
  };
  const deleteWindow = () => {
    const w = winRef.current;
    setWinNumpad(null);
    if (w) onApplyWindowRef.current?.(w.idx, 0, 0, 0, 0, 0, false, false, false, false);
    setWin(null);
  };
  const duplicateWindow = () => {
    const w = winRef.current;
    if (!w || !winFace) return;
    setWinNumpad(null);
    onApplyWindowRef.current?.(w.idx, w.w, w.h, w.radius, w.cx, w.cy, w.lockT, w.lockR, w.lockB, w.lockL);
    const ncx = roundMm10(Math.max(w.w / 2, Math.min(winFace.w - w.w / 2, w.cx + w.w * 1.2)));
    const ncy = roundMm10(Math.max(w.h / 2, Math.min(winFace.h - w.h / 2, w.cy)));
    onApplyWindowRef.current?.(-1, w.w, w.h, w.radius, ncx, ncy, false, false, false, false);
    setWin(null);
  };

  const winAnchors = (() => {
    if (!win || !winFace) return [] as {id: string;x: number;y: number;z: number;}[];
    const wp = (u: number, v: number) => ({ x: winFace.ox + winFace.uax * u + winFace.ubx * v, y: winFace.oy + winFace.uay * u + winFace.uby * v, z: winFace.oz + winFace.uaz * u + winFace.ubz * v });
    const x0 = win.cx - win.w / 2,x1 = win.cx + win.w / 2,y0 = win.cy - win.h / 2,y1 = win.cy + win.h / 2;
    return [
    { id: "offT", ...wp(win.cx, winFace.h) },
    { id: "offB", ...wp(win.cx, 0) },
    { id: "offL", ...wp(0, win.cy) },
    { id: "offR", ...wp(winFace.w, win.cy) },
    { id: "w", ...wp(win.cx, y0) },
    { id: "h", ...wp(x0, win.cy) },
    { id: "radius", ...wp(x1, y1) },
    { id: "ok", ...wp(x0, y1) },
    { id: "del", ...wp(x1, y0) }];
  })();
  const winAnchorsRef = useRef(winAnchors);
  winAnchorsRef.current = winAnchors;

  const winPins = (() => {
    if (win || !winFace) return [] as {id: string;active: boolean;x: number;y: number;z: number;}[];
    const wp = (u: number, v: number) => ({ x: winFace.ox + winFace.uax * u + winFace.ubx * v, y: winFace.oy + winFace.uay * u + winFace.uby * v, z: winFace.oz + winFace.uaz * u + winFace.ubz * v });
    const aw = appliedWindows ?? [];
    if (aw.length === 0) return [{ id: "add", active: false, ...wp(winFace.w / 2, winFace.h / 2) }];
    return aw.map((w, i) => ({ id: `${i}`, active: true, ...wp(w.cx, w.cy) }));
  })();
  const winPinsRef = useRef(winPins);
  winPinsRef.current = winPins;

  const winHandles = (() => {
    if (!win || !winFace) return [] as {id: "L" | "R" | "T" | "B" | "C";x: number;y: number;z: number;}[];
    const wp = (u: number, v: number) => ({ x: winFace.ox + winFace.uax * u + winFace.ubx * v, y: winFace.oy + winFace.uay * u + winFace.uby * v, z: winFace.oz + winFace.uaz * u + winFace.ubz * v });
    const x0 = win.cx - win.w / 2,x1 = win.cx + win.w / 2,y0 = win.cy - win.h / 2,y1 = win.cy + win.h / 2;
    return [
    { id: "L" as const, ...wp(x0, win.cy) },
    { id: "R" as const, ...wp(x1, win.cy) },
    { id: "T" as const, ...wp(win.cx, y1) },
    { id: "B" as const, ...wp(win.cx, y0) },
    { id: "C" as const, ...wp(win.cx, win.cy) }];
  })();
  const winHandlesRef = useRef(winHandles);
  winHandlesRef.current = winHandles;

  const WIN_MIN = 200;
  const WIN_M = 20;
  const startWindowDrag = (ev0: ReactPointerEvent, handle: "L" | "R" | "T" | "B" | "C") => {
    ev0.preventDefault();
    ev0.stopPropagation();
    const w0 = winRef.current;
    const f = winFace;
    if (!w0 || !f) return;
    if (handle === "L" && w0.lockL || handle === "R" && w0.lockR || handle === "T" && w0.lockT || handle === "B" && w0.lockB) return;
    const base = { x: f.ox + f.uax * w0.cx + f.ubx * w0.cy, y: f.oy + f.uay * w0.cx + f.uby * w0.cy, z: f.oz + f.uaz * w0.cx + f.ubz * w0.cy };
    const LEN = 1000;
    const p0 = projectMm10(base.x, base.y, base.z);
    const pa = projectMm10(base.x + f.uax * LEN, base.y + f.uay * LEN, base.z + f.uaz * LEN);
    const pb = projectMm10(base.x + f.ubx * LEN, base.y + f.uby * LEN, base.z + f.ubz * LEN);
    if (!p0 || !pa || !pb) return;
    const Uax = (pa.x - p0.x) / LEN,Uay = (pa.y - p0.y) / LEN;
    const Ubx = (pb.x - p0.x) / LEN,Uby = (pb.y - p0.y) / LEN;
    const det = Uax * Uby - Ubx * Uay;
    const startX = ev0.clientX,startY = ev0.clientY;
    const s = { w: w0.w, h: w0.h, cx: w0.cx, cy: w0.cy };
    const onMove = (ev: PointerEvent) => {
      const dsx = ev.clientX - startX,dsy = ev.clientY - startY;
      let du = 0,dv = 0;
      if (Math.abs(det) > 1e-6) {du = (Uby * dsx - Ubx * dsy) / det;dv = (-Uay * dsx + Uax * dsy) / det;}
      setWin((cur) => {
        if (!cur) return cur;
        if (handle === "C") {
          const ncx = cur.lockL || cur.lockR ? cur.cx : Math.max(cur.w / 2 + WIN_M, Math.min(f.w - cur.w / 2 - WIN_M, roundMm10(s.cx + du)));
          const ncy = cur.lockT || cur.lockB ? cur.cy : Math.max(cur.h / 2 + WIN_M, Math.min(f.h - cur.h / 2 - WIN_M, roundMm10(s.cy + dv)));
          return { ...cur, cx: ncx, cy: ncy };
        }
        if (handle === "L") {const x1 = s.cx + s.w / 2;const nx0 = Math.min(x1 - WIN_MIN, Math.max(WIN_M, s.cx - s.w / 2 + du));return { ...cur, w: roundMm10(x1 - nx0), cx: roundMm10((nx0 + x1) / 2) };}
        if (handle === "R") {const x0 = s.cx - s.w / 2;const nx1 = Math.max(x0 + WIN_MIN, Math.min(f.w - WIN_M, s.cx + s.w / 2 + du));return { ...cur, w: roundMm10(nx1 - x0), cx: roundMm10((x0 + nx1) / 2) };}
        if (handle === "T") {const y0 = s.cy - s.h / 2;const ny1 = Math.max(y0 + WIN_MIN, Math.min(f.h - WIN_M, s.cy + s.h / 2 + dv));return { ...cur, h: roundMm10(ny1 - y0), cy: roundMm10((y0 + ny1) / 2) };}
        const y1 = s.cy + s.h / 2;const ny0 = Math.min(y1 - WIN_MIN, Math.max(WIN_M, s.cy - s.h / 2 + dv));return { ...cur, h: roundMm10(y1 - ny0), cy: roundMm10((ny0 + y1) / 2) };
      });
    };
    const onUp = () => {window.removeEventListener("pointermove", onMove);window.removeEventListener("pointerup", onUp);};
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    const transformControls = transformRef.current;
    if (transformControls) {
      transformControls.mode = transformMode;
    }
  }, [transformMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f6f8);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1.4, 2.2, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1.6, 1, -1.2);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2;
    controlsRef.current = controls;

    const midX = 3000;
    const midZ = 2800;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.mode = transformMode;

    transformControls.size = 0.6;
    transformControls.addEventListener("objectChange", () => {
      const mesh = transformControls.object;
      if (!mesh || !mesh.name || mesh.name.startsWith("handle:")) return;
      const p = panelsRef.current.find((x) => x.id === mesh.name);
      if (!p) return;
      const curX = roundMm10(mesh.position.x * 10000 + MID_X - p.width / 2);
      const curY = roundMm10(mesh.position.y * 10000 - p.height / 2);
      const curZ = roundMm10(mesh.position.z * 10000 + MID_Z - p.depth / 2);
      onLiveDragPanelRef.current?.(mesh.name, curX, curY, curZ);

      const d = moveDragRef.current;
      const leader = moveLeaderRef.current;
      if (d && leader && d.id === mesh.name) {
        const halfH = mm10ToMeters(p.height) / 2;
        let a: THREE.Vector3, b: THREE.Vector3, value: number;
        let anchor: {x: number;y: number;z: number;};
        if (d.axis === "y") {

          const groundW = mm10ToMeters(groundYRef.current);
          a = new THREE.Vector3(mesh.position.x, mesh.position.y - halfH, mesh.position.z);
          b = new THREE.Vector3(mesh.position.x, groundW, mesh.position.z);
          value = curY - groundYRef.current;
          anchor = { x: curX + p.width / 2, y: (curY + groundYRef.current) / 2, z: curZ + p.depth / 2 };
        } else {

          const s = d.startPanel;
          a = new THREE.Vector3(
            mm10ToMeters(s.x + p.width / 2 - MID_X),
            mm10ToMeters(s.y + p.height / 2),
            mm10ToMeters(s.z + p.depth / 2 - MID_Z)
          );
          b = new THREE.Vector3(mesh.position.x, mesh.position.y, mesh.position.z);
          value = Math.abs((d.axis === "x" ? curX : curZ) - (d.axis === "x" ? s.x : s.z));
          anchor = { x: curX + p.width / 2, y: curY + p.height / 2, z: curZ + p.depth / 2 };
        }
        leader.geometry.setFromPoints([a, b]);
        leader.computeLineDistances();
        moveAnchorRef.current = anchor;
        setMoveChip({ value, kind: d.axis === "y" ? "height" : "travel", resting: false });
      }

      const rd = rotDragRef.current;
      const wm = rotWedgeMeshRef.current;
      if (rd && wm && rd.id === mesh.name) {
        const sweptRad = mesh.rotation[rd.axis] - rd.startRot[rd.axis];
        const r = mm10ToMeters(rd.radius);
        wm.geometry.dispose();
        wm.geometry = new THREE.CircleGeometry(r, 48, sweptRad < 0 ? sweptRad : 0, Math.abs(sweptRad) || 0.0001);
        rotAnchorRef.current = rd.center;
        setRotChip({ value: Math.round(sweptRad * 180 / Math.PI), resting: false, axis: rd.axis });
      }
    });

    transformControls.addEventListener("dragging-changed", (event) => {
      controls.enabled = !event.value;
      gizmoDraggingRef.current = Boolean(event.value);

      if (event.value) {
        const startMesh = transformControls.object;
        const axisChar = transformControls.axis;
        const axis = axisChar === "X" ? "x" : axisChar === "Y" ? "y" : axisChar === "Z" ? "z" : null;
        if (transformModeRef.current === "translate" && axis && startMesh && startMesh.name && !startMesh.name.startsWith("handle:")) {
          const p = panelsRef.current.find((x) => x.id === startMesh.name);
          if (p) {
            clearMoveIndicator();
            if (moveLeaderRef.current) {scene.remove(moveLeaderRef.current);moveLeaderRef.current.geometry.dispose();moveLeaderRef.current = null;}
            moveDragRef.current = { id: startMesh.name, axis, startPanel: { x: p.x, y: p.y, z: p.z }, sign: 1 };
            const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
            const mat = new THREE.LineDashedMaterial({ color: 0x16a34a, dashSize: 0.012, gapSize: 0.010, transparent: true, opacity: 0.95 });
            mat.depthTest = false;
            const line = new THREE.Line(geom, mat);
            line.renderOrder = 4;
            line.computeLineDistances();
            scene.add(line);
            moveLeaderRef.current = line;
          }
        }
      }

      if (event.value) {
        const startMesh = transformControls.object;
        const axisChar = transformControls.axis;
        const axis = axisChar === "X" ? "x" : axisChar === "Y" ? "y" : axisChar === "Z" ? "z" : null;
        if (transformModeRef.current === "rotate" && axis && startMesh && startMesh.name && !startMesh.name.startsWith("handle:")) {
          const p = panelsRef.current.find((x) => x.id === startMesh.name);
          if (p) {
            clearRotIndicator();
            const center = { x: p.x + p.width / 2, y: p.y + p.height / 2, z: p.z + p.depth / 2 };
            const radius = Math.max(p.width, p.height, p.depth) * 0.42;
            rotDragRef.current = {
              id: startMesh.name, axis,
              startRot: { x: startMesh.rotation.x, y: startMesh.rotation.y, z: startMesh.rotation.z },
              center, radius
            };
            const grp = new THREE.Group();
            grp.position.set(mm10ToMeters(center.x - MID_X), mm10ToMeters(center.y), mm10ToMeters(center.z - MID_Z));
            if (axis === "y") grp.rotation.x = -Math.PI / 2;else
            if (axis === "x") grp.rotation.y = Math.PI / 2;
            const r = mm10ToMeters(radius);
            const disc = new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(64)),
              new THREE.LineBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.85, depthTest: false })
            );
            disc.renderOrder = 4;
            grp.add(disc);
            const wedge = new THREE.Mesh(
              new THREE.CircleGeometry(r, 48, 0, 0.0001),
              new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
            );
            wedge.renderOrder = 3;
            grp.add(wedge);
            scene.add(grp);
            rotWedgeRef.current = grp;
            rotWedgeMeshRef.current = wedge;
          }
        }
      }

      if (!event.value) {

        justDraggedRef.current = true;
        const mesh = transformControls.object;

        if (mesh && mesh.name.startsWith("handle:")) return;

        if (mesh && mesh.name) {
          const p = panelsRef.current.find((x) => x.id === mesh.name);
          if (p) {
            const rawX = mesh.position.x * 10000 + midX - p.width / 2;
            const rawY = mesh.position.y * 10000 - p.height / 2;
            const rawZ = mesh.position.z * 10000 + midZ - p.depth / 2;

            const SNAP_TOL = 4 * Math.PI / 180;
            const snapAngle = (val: number) => {
              const step = Math.PI / 2;
              const nearest = Math.round(val / step) * step;
              return Math.abs(val - nearest) < SNAP_TOL ? nearest : val;
            };
            const rx = snapAngle(mesh.rotation.x);
            const ry = snapAngle(mesh.rotation.y);
            const rz = snapAngle(mesh.rotation.z);

            if (isFinite(rawX) && isFinite(rawY) && isFinite(rawZ)) {
              onDragPanelRef.current(mesh.name, roundMm10(rawX), roundMm10(rawY), roundMm10(rawZ), rx, ry, rz);
            }
          }
        }

        if (moveLeaderRef.current) {
          scene.remove(moveLeaderRef.current);
          moveLeaderRef.current.geometry.dispose();
          moveLeaderRef.current = null;
        }
        const dRel = moveDragRef.current;
        if (dRel) {
          const panelMesh = transformControls.object;
          const pp = panelsRef.current.find((x) => x.id === dRel.id);
          if (panelMesh && pp) {
            const cur = dRel.axis === "x" ? roundMm10(panelMesh.position.x * 10000 + MID_X - pp.width / 2) :
            dRel.axis === "y" ? roundMm10(panelMesh.position.y * 10000 - pp.height / 2) :
            roundMm10(panelMesh.position.z * 10000 + MID_Z - pp.depth / 2);
            dRel.sign = Math.sign(cur - dRel.startPanel[dRel.axis]) || 1;
          }
          setMoveChip((c) => c ? { ...c, resting: true } : null);
          clearAutoHide();
          autoHideRef.current = setTimeout(() => {
            if (!moveNumpadRef.current) clearMoveIndicator();
          }, 4000);
        }

        if (rotWedgeRef.current) {
          scene.remove(rotWedgeRef.current);
          rotWedgeRef.current.traverse((o) => {const m = o as THREE.Mesh;if (m.geometry) m.geometry.dispose();});
          rotWedgeRef.current = null;
          rotWedgeMeshRef.current = null;
        }
        if (rotDragRef.current) {
          setRotChip((c) => c ? { ...c, resting: true } : null);
          if (rotAutoHideRef.current) clearTimeout(rotAutoHideRef.current);
          rotAutoHideRef.current = setTimeout(() => {if (!rotNumpadRef.current) clearRotIndicator();}, 4000);
        }
      }
    });

    const helper = (transformControls as any).getHelper() as THREE.Object3D;
    const twoAxis: THREE.Object3D[] = [];
    helper.traverse((o) => {
      if (["XY", "YZ", "XZ", "XYZ", "XYZE", "E"].includes(o.name)) twoAxis.push(o);
    });
    for (const o of twoAxis) o.parent?.remove(o);

    scene.add(helper);
    transformRef.current = transformControls;

    const dragPlane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const pointerRay = new THREE.Raycaster();
    const setRay = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRay.setFromCamera(new THREE.Vector2(
        (e.clientX - rect.left) / rect.width * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      ), camera);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (transformControls.dragging) return;
      if (!groupRef.current) return;
      setRay(e);
      const hits = pointerRay.intersectObjects(groupRef.current.children, true);

      const cubeHit = hits.find((i) => i.object.name.startsWith("handle:"));
      if (!cubeHit && transformControls.axis !== null) return;

      const onCube = cubeHit;
      if (!onCube) return;
      const id = onCube.object.name.slice("handle:".length);
      const h = (handlesRef.current ?? []).find((x) => x.id === id);
      if (!h) return;

      if (selectedHandleIdRef.current !== id) {
        onSelectHandleRef.current?.(id);
      }
      const anchor = onCube.object.position.clone();

      const opp = (handlesRef.current ?? []).find((o) => o.axis === h.axis && o.id !== h.id);
      const oppMesh = opp ? groupRef.current?.children.find((o) => o.name === `handle:${opp.id}`) : null;
      const O = oppMesh ? oppMesh.position.clone() : anchor.clone();
      const dir = anchor.clone().sub(O);
      const fullLen = dir.length();
      if (fullLen < 1e-6) dir.set(+(h.axis === "x"), +(h.axis === "y"), +(h.axis === "z"));else
      dir.normalize();

      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const normal = camDir.clone().sub(dir.clone().multiplyScalar(camDir.dot(dir)));
      if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
      dragPlane.setFromNormalAndCoplanarPoint(normal.normalize(), anchor);

      const grabbed = pointerRay.ray.intersectPlane(dragPlane, hit) ?
      fullLen - hit.clone().sub(O).dot(dir) :
      0;

      dragRef.current = { id, axisVec: dir, grabOffset: grabbed };

      const selPnl = panelsRef.current.find((x) => x.id === selectedPanelIdRef.current);
      const dimOf = { x: "width", y: "height", z: "depth" } as const;
      const otherHandle = (handlesRef.current ?? []).find((o) => o.axis !== h.axis);
      resizeFrameRef.current = {
        axis: h.axis, O, dir, grab: grabbed,
        dims: selPnl ? { width: selPnl.width, height: selPnl.height, depth: selPnl.depth } : { width: 0, height: 0, depth: 0 },
        centerM: selPnl ? new THREE.Vector3(
          mm10ToMeters(selPnl.x + selPnl.width / 2 - MID_X),
          mm10ToMeters(selPnl.y + selPnl.height / 2),
          mm10ToMeters(selPnl.z + selPnl.depth / 2 - MID_Z)
        ) : anchor.clone().add(O).multiplyScalar(0.5),
        origExt: selPnl ? selPnl[dimOf[h.axis]] : fullLen * 10000,
        other: otherHandle && selPnl ? { axis: otherHandle.axis, origExt: selPnl[dimOf[otherHandle.axis]] } : null
      };
      resizeMetaRef.current = {
        id, axis: h.axis, oppositeCoord: 0, sign: 1,
        center: { x: h.x, y: h.y, z: h.z }, oldW: 0, oldH: 0, panelX: 0, panelY: 0
      };
      if (resizeAutoHideRef.current) {clearTimeout(resizeAutoHideRef.current);resizeAutoHideRef.current = null;}
      if (resizeLeaderRef.current) {scene.remove(resizeLeaderRef.current);resizeLeaderRef.current.geometry.dispose();resizeLeaderRef.current = null;}
      {
        const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const mat = new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 0.012, gapSize: 0.010, transparent: true, opacity: 0.95 });
        mat.depthTest = false;
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 4;
        line.computeLineDistances();
        scene.add(line);
        resizeLeaderRef.current = line;
      }

      controls.enabled = false;
      transformControls.enabled = false;
      e.stopPropagation();
      e.preventDefault();
    };

    const keyOf = (a: "x" | "y" | "z") => a === "x" ? "width" : a === "y" ? "height" : "depth" as "width" | "height" | "depth";

    const framePatch = (fr: NonNullable<typeof resizeFrameRef.current>, ext: number) => {
      const dimKey = keyOf(fr.axis);
      const patch: {x: number;y: number;z: number;width?: number;height?: number;depth?: number;} = { x: 0, y: 0, z: 0 };

      if (uniformRef.current && fr.other && fr.origExt > 0) {
        const otherKey = keyOf(fr.other.axis);
        const otherExt = Math.max(50, roundMm10(fr.other.origExt * (ext / fr.origExt)));
        const w = dimKey === "width" ? ext : otherKey === "width" ? otherExt : fr.dims.width;
        const hgt = dimKey === "height" ? ext : otherKey === "height" ? otherExt : fr.dims.height;
        const dep = dimKey === "depth" ? ext : otherKey === "depth" ? otherExt : fr.dims.depth;
        const cx = fr.centerM.x * 10000 + MID_X,cy = fr.centerM.y * 10000,cz = fr.centerM.z * 10000 + MID_Z;
        patch.x = roundMm10(cx - w / 2);patch.y = roundMm10(cy - hgt / 2);patch.z = roundMm10(cz - dep / 2);
        patch[dimKey] = ext;patch[otherKey] = otherExt;
        return patch;
      }

      const cM = fr.O.clone().addScaledVector(fr.dir, ext / 10000 / 2);
      const w = dimKey === "width" ? ext : fr.dims.width;
      const hgt = dimKey === "height" ? ext : fr.dims.height;
      const dep = dimKey === "depth" ? ext : fr.dims.depth;
      const cx = cM.x * 10000 + MID_X,cy = cM.y * 10000,cz = cM.z * 10000 + MID_Z;
      patch.x = roundMm10(cx - w / 2);patch.y = roundMm10(cy - hgt / 2);patch.z = roundMm10(cz - dep / 2);
      patch[dimKey] = ext;
      return patch;
    };

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const fr = resizeFrameRef.current;
      if (!d || !fr) return;
      setRay(e);
      if (!pointerRay.ray.intersectPlane(dragPlane, hit)) return;
      const newLen_m = Math.max(0.005, hit.clone().sub(fr.O).dot(fr.dir) + fr.grab);
      const ext = roundMm10(newLen_m * 10000);
      if (!isFinite(ext)) return;
      onDragHandleRef.current?.(d.id, framePatch(fr, ext));

      const rl = resizeLeaderRef.current;
      if (rl) {
        const edge = fr.O.clone().addScaledVector(fr.dir, ext / 10000);
        rl.geometry.setFromPoints([fr.O.clone(), edge]);
        rl.computeLineDistances();
        const mid = fr.O.clone().add(edge).multiplyScalar(0.5);
        resizeAnchorRef.current = { x: mid.x * 10000 + MID_X, y: mid.y * 10000, z: mid.z * 10000 + MID_Z };
        setResizeChip({ value: ext, resting: false, axis: fr.axis });
      }
    };

    const onPointerUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      justDraggedRef.current = true;
      controls.enabled = true;
      transformControls.enabled = true;

      if (resizeLeaderRef.current) {
        scene.remove(resizeLeaderRef.current);
        resizeLeaderRef.current.geometry.dispose();
        resizeLeaderRef.current = null;
      }
      if (resizeMetaRef.current) {
        setResizeChip((c) => c ? { ...c, resting: true } : null);
        if (resizeAutoHideRef.current) clearTimeout(resizeAutoHideRef.current);
        resizeAutoHideRef.current = setTimeout(() => {if (!resizeNumpadRef.current) clearResizeIndicator();}, 4000);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    frameModel(true);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const raycaster = new THREE.Raycaster();
    const handleCanvasClick = (e: MouseEvent) => {
      if (transformControls.dragging) return;

      if (justDraggedRef.current) {justDraggedRef.current = false;return;}

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        (e.clientX - rect.left) / rect.width * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);

      if (showMeasureRef.current) {
        if (!groupRef.current) return;
        const hits = raycaster.intersectObjects(groupRef.current.children, true);
        const hit = hits.find((int) => int.object instanceof THREE.Mesh && int.object.name && !int.object.name.startsWith("handle:"));
        if (!hit) return;
        const panel = panelsRef.current.find((pp) => pp.id === hit.object.name);
        if (!panel) return;
        const sn = snapMeasure(panel, hit.point, e.clientX - rect.left, e.clientY - rect.top, camera, rect);
        const pt = { x: sn.x * 10000 + MID_X, y: sn.y * 10000, z: sn.z * 10000 + MID_Z, panelId: panel.id };
        setMeasurePts((prev) => prev.length >= 2 ? [pt] : [...prev, pt]);
        return;
      }

      if (groupRef.current) {
        const intersects = raycaster.intersectObjects(groupRef.current.children, true);

        const gripHit = intersects.find(
          (int) => int.object instanceof THREE.Mesh && int.object.name.startsWith("grip:")
        );
        if (gripHit) {
          onEnterResizeRef.current?.();
          return;
        }

        const picked = intersects.find((int) => int.object instanceof THREE.Mesh && int.object.name && !int.object.name.startsWith("grip:"));

        const handleHit = intersects.find(
          (int) => int.object instanceof THREE.Mesh && int.object.name.startsWith("handle:")
        );
        if (handleHit) {
          onSelectHandleRef.current?.(handleHit.object.name.slice("handle:".length));
        } else if (picked) {
          onSelectHandleRef.current?.(null);
          onSelectPanel(picked.object.name);
        } else {

          const isGizmoIntersect = transformControls.axis !== null;
          if (!isGizmoIntersect) {
            onSelectHandleRef.current?.(null);
            onSelectPanel(null);
          }
        }
      }
    };
    renderer.domElement.addEventListener("click", handleCanvasClick, true);

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      transformControls.dispose();
      renderer.domElement.removeEventListener("click", handleCanvasClick, true);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      scene.traverse((object) => {
        const holder = object as THREE.Mesh & THREE.LineSegments;
        if (holder.geometry) holder.geometry.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const panelCutsLive = useMemo(() => {
    if (!selectedPanelId) return panelCuts;
    const base = panelCuts?.[selectedPanelId] ?? {};
    const roundsMap = new Map((base.rounds ?? []).map((r) => [r.cornerId, r.radius] as [string, number]));
    if (round) for (const c of round.corners) roundsMap.set(c, round.radius);
    const chamMap = new Map((base.chamfers ?? []).map((c) => [c.edgeId, { width: c.width, depth: c.depth }] as [string, {width: number;depth: number;}]));
    if (chamfer) for (const e of chamfer.edges) chamMap.set(e, { width: chamfer.width, depth: chamfer.depth });
    const notchMap = new Map((base.notches ?? []).map((n) => [n.edgeId, { edgeId: n.edgeId, width: n.width, depth: n.depth, radius: n.radius, pos: n.pos }] as [string, {edgeId: string;width: number;depth: number;radius: number;pos: number;}]));
    if (notch) notchMap.set(notch.edgeId, { edgeId: notch.edgeId, width: notch.width, depth: notch.depth, radius: notch.radius, pos: notch.pos });
    const windowsCut = (() => {
      const arr = (base.windows ?? []).map((w) => ({ w: w.w, h: w.h, radius: w.radius, cx: w.cx, cy: w.cy }));
      if (win) {
        const editing = { w: win.w, h: win.h, radius: win.radius, cx: win.cx, cy: win.cy };
        if (win.idx >= 0 && win.idx < arr.length) arr[win.idx] = editing;else arr.push(editing);
      }
      return arr;
    })();
    return {
      ...panelCuts ?? {},
      [selectedPanelId]: {
        rounds: [...roundsMap].map(([cornerId, radius]) => ({ cornerId, radius })),
        chamfers: [...chamMap].map(([edgeId, val]) => ({ edgeId, width: val.width, depth: val.depth })),
        notches: [...notchMap.values()],
        windows: windowsCut
      }
    };
  }, [panelCuts, selectedPanelId, round, chamfer, notch, win]);

  const geoCacheRef = useRef(new Map<string, {key: string;geo: THREE.BufferGeometry;edgesGeo: THREE.BufferGeometry;}>());

  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformRef.current;
    if (!scene || !transformControls) return;

    if (gizmoDraggingRef.current) return;

    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current = null;
    }

    const group = buildBlockGroup(panels, holes, selectedPanelId, panelCutsLive, geoCacheRef.current);

    const selP = selectedPanelId ? panels.find((p) => p.id === selectedPanelId) : null;
    const selEuler = selP && (selP.rx || selP.ry || selP.rz) ?
    new THREE.Euler(selP.rx || 0, selP.ry || 0, selP.rz || 0) : null;
    const selCenter = selP ? new THREE.Vector3(
      mm10ToMeters(selP.x + selP.width / 2 - MID_X),
      mm10ToMeters(selP.y + selP.height / 2),
      mm10ToMeters(selP.z + selP.depth / 2 - MID_Z)
    ) : null;

    for (const h of handles ?? []) {
      const isOn = h.id === selectedHandleId;

      const side = isOn ? 0.075 : 0.06;
      const thin = 0.014;
      const geo = h.axis === "x" ? new THREE.BoxGeometry(thin, side, side) :
      h.axis === "y" ? new THREE.BoxGeometry(side, thin, side) :
      new THREE.BoxGeometry(side, side, thin);
      const color = h.axis === "x" ? 0xef4444 : h.axis === "y" ? 0x22c55e : 0x3b82f6;
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: isOn ? 0.5 : 0.18 })
      );
      mesh.name = `handle:${h.id}`;
      const pos = new THREE.Vector3(
        mm10ToMeters(h.x - MID_X),
        mm10ToMeters(h.y),
        mm10ToMeters(h.z - MID_Z)
      );
      if (selEuler && selCenter) {
        pos.sub(selCenter).applyEuler(selEuler).add(selCenter);
        mesh.rotation.copy(selEuler);
      }
      mesh.position.copy(pos);
      mesh.renderOrder = 2;
      group.add(mesh);
    }

    if (showResizeGrips && selP && selCenter) {
      const AXV = { width: new THREE.Vector3(1, 0, 0), height: new THREE.Vector3(0, 1, 0), depth: new THREE.Vector3(0, 0, 1) };
      const dimVal = { width: selP.width, height: selP.height, depth: selP.depth };
      const faces: ("width" | "height" | "depth")[] = selP.orientation ?
      [selP.orientation.xAxis, selP.orientation.yAxis] :
      (() => {
        const ds = [["width", selP.width], ["height", selP.height], ["depth", selP.depth]] as const;
        const thin = ds.reduce((a, c) => c[1] < a[1] ? c : a)[0];
        return (["width", "height", "depth"] as const).filter((d) => d !== thin);
      })();
      const uA = AXV[faces[0]],eA = mm10ToMeters(dimVal[faces[0]]) / 2;
      const uB = AXV[faces[1]],eB = mm10ToMeters(dimVal[faces[1]]) / 2;
      for (const [sA, sB] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        const grip = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.05, 0.05),
          new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, emissive: 0x94a3b8, emissiveIntensity: 0.35 })
        );
        grip.name = `grip:${sA}${sB}`;
        const off = uA.clone().multiplyScalar(sA * eA).add(uB.clone().multiplyScalar(sB * eB));
        if (selEuler) off.applyEuler(selEuler);
        grip.position.copy(selCenter.clone().add(off));
        if (selEuler) grip.rotation.copy(selEuler);
        grip.renderOrder = 2;
        group.add(grip);
      }
    }

    if (envelope) {

      const midX = MID_X,midZ = MID_Z;
      const ew = mm10ToMeters(envelope.w_mm10);
      const eh = mm10ToMeters(envelope.h_mm10);
      const ed = mm10ToMeters(envelope.d_mm10);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(ew, eh, ed)),
        new THREE.LineBasicMaterial({ color: 0x9aa6b5, transparent: true, opacity: 0.55 })
      );
      box.position.set(
        mm10ToMeters(envelope.w_mm10 / 2 - midX),
        mm10ToMeters(envelope.h_mm10 / 2),
        mm10ToMeters(envelope.d_mm10 / 2 - midZ)
      );
      group.add(box);
    }

    scene.add(group);
    groupRef.current = group;

    const bounds = new THREE.Box3().setFromObject(group);
    if (isFinite(bounds.min.y)) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.PlaneGeometry) {
          obj.position.y = bounds.min.y;
        }
      });
    }

    const target = selectedPanelId ? group.children.find((c) => c.name === selectedPanelId) : undefined;
    if (target && !showTargets && showGizmo) transformControls.attach(target);else
    transformControls.detach();
  }, [panels, holes, selectedPanelId, envelope, handles, selectedHandleId, showTargets, showGizmo, panelCutsLive, showResizeGrips]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const live = new THREE.Group();
    for (const o of overlays ?? []) {
      if (o.points.length < 2) continue;
      const pts = o.points.map((p) => new THREE.Vector3(
        mm10ToMeters(p.x - MID_X), mm10ToMeters(p.y), mm10ToMeters(p.z - MID_Z)
      ));
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = o.dashed ?
      new THREE.LineDashedMaterial({ color: o.color, dashSize: 0.012, gapSize: 0.010, transparent: true, opacity: 0.95 }) :
      new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.95 });
      mat.depthTest = false;
      const line = o.closed === false ? new THREE.Line(geom, mat) : new THREE.LineLoop(geom, mat);
      if (o.dashed) line.computeLineDistances();
      line.renderOrder = 999;
      line.renderOrder = 3;
      live.add(line);
    }

    if (rotationGizmo) {
      const { cx, cy, cz, axis, sweepDeg, radius } = rotationGizmo;
      const r = mm10ToMeters(radius);
      const rot = new THREE.Group();
      rot.position.set(mm10ToMeters(cx - MID_X), mm10ToMeters(cy), mm10ToMeters(cz - MID_Z));

      if (axis === "y") rot.rotation.x = -Math.PI / 2;else
      if (axis === "x") rot.rotation.y = Math.PI / 2;

      for (const other of [0, 1]) {
        const faint = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            new THREE.EllipseCurve(0, 0, r * 0.82, r * 0.82, 0, Math.PI * 2, false, 0).getPoints(48)
          ),
          new THREE.LineBasicMaterial({
            color: other === 0 ? 0x22c55e : 0xe5342b, transparent: true, opacity: 0.22
          })
        );
        faint.rotation[other === 0 ? "x" : "y"] = Math.PI / 2;
        rot.add(faint);
      }

      const sweep = sweepDeg * Math.PI / 180;
      if (Math.abs(sweep) > 1e-4) {
        const wedge = new THREE.Mesh(
          new THREE.CircleGeometry(r, 48, sweep < 0 ? sweep : 0, Math.abs(sweep)),
          new THREE.MeshBasicMaterial({
            color: 0x2f8bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false
          })
        );
        rot.add(wedge);
      }

      rot.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(64)
        ),
        new THREE.LineBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.85 })
      ));

      live.add(rot);
    }

    if (snapHint) {
      const bx = snapHint.box;
      const ghostMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.95 });
      ghostMat.depthTest = false;
      const ghost = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(mm10ToMeters(bx.w), mm10ToMeters(bx.h), mm10ToMeters(bx.d))),
        ghostMat
      );
      ghost.position.set(
        mm10ToMeters(bx.x + bx.w / 2 - MID_X),
        mm10ToMeters(bx.y + bx.h / 2),
        mm10ToMeters(bx.z + bx.d / 2 - MID_Z)
      );
      ghost.renderOrder = 990;
      live.add(ghost);

      const nubMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      nubMat.depthTest = false;
      const nub = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 16, 12),
        nubMat
      );
      nub.position.set(
        mm10ToMeters(snapHint.contact.x - MID_X),
        mm10ToMeters(snapHint.contact.y),
        mm10ToMeters(snapHint.contact.z - MID_Z)
      );
      nub.renderOrder = 991;
      live.add(nub);
    }

    scene.add(live);
    return () => {
      scene.remove(live);
      live.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    };
  }, [overlays, rotationGizmo, snapHint]);

  useEffect(() => {
    let frame = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) {frame = requestAnimationFrame(tick);return;}
      const rect = renderer.domElement.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {frame = requestAnimationFrame(tick);return;}
      const next: Record<string, {x: number;y: number;}> = {};
      const project = (id: string, x: number, y: number, z: number) => {
        v.set(mm10ToMeters(x - MID_X), mm10ToMeters(y), mm10ToMeters(z - MID_Z));
        v.project(camera);
        if (v.z > 1) return;
        const sx = (v.x * 0.5 + 0.5) * rect.width;
        const sy = (-(v.y * 0.5) + 0.5) * rect.height;
        if (!isFinite(sx) || !isFinite(sy)) return;
        next[id] = { x: sx, y: sy };
      };
      for (const a of annotationsRef.current ?? []) project(a.id, a.x, a.y, a.z);
      const m = moveAnchorRef.current;
      if (m) project("__move__", m.x, m.y, m.z);
      const rz = resizeAnchorRef.current;
      if (rz) project("__resize__", rz.x, rz.y, rz.z);
      const ra = rotAnchorRef.current;
      if (ra) project("__rot__", ra.x, ra.y, ra.z);
      const sh = snapHintRef.current;
      if (sh) project("__snap__", sh.contact.x, sh.contact.y, sh.contact.z);
      for (const pin of pinsRef.current) project(`__pin_${pin.id}__`, pin.x, pin.y, pin.z);
      for (const e of edgesRef.current) project(`__edge_${e.id}__`, e.x, e.y, e.z);
      for (const h of notchHandlesRef.current) project(`__nh_${h.id}__`, h.x, h.y, h.z);
      for (const a of notchAnchorsRef.current) project(`__notch_${a.id}__`, a.x, a.y, a.z);
      for (const a of winAnchorsRef.current) project(`__win_${a.id}__`, a.x, a.y, a.z);
      for (const h of winHandlesRef.current) project(`__wh_${h.id}__`, h.x, h.y, h.z);
      for (const wpin of winPinsRef.current) project(`__winpin_${wpin.id}__`, wpin.x, wpin.y, wpin.z);
      const rh = roundHandleRef.current;
      if (rh) project("__rh__", rh.x, rh.y, rh.z);
      const chh = chamferHandleRef.current;
      if (chh) project("__ch__", chh.x, chh.y, chh.z);
      const cdh = chamferDepthHandleRef.current;
      if (cdh) project("__cd__", cdh.x, cdh.y, cdh.z);
      measurePtsRef.current.forEach((mp, i) => project(`__mpt${i}__`, mp.x, mp.y, mp.z));
      setAnnPos(next);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return;

    let frame = 0;
    const updateOverlay = () => {
      if (selectedPanelId && groupRef.current) {
        const selectedMesh = groupRef.current.children.find((child) => child.name === selectedPanelId);
        if (selectedMesh) {
          const center = new THREE.Vector3();
          selectedMesh.getWorldPosition(center);
          center.project(camera);

          const rect = renderer.domElement.getBoundingClientRect();
          const x = (center.x * 0.5 + 0.5) * rect.width;
          const y = (-(center.y * 0.5) + 0.5) * rect.height;
          setOverlayPos({ x, y });
        } else {
          setOverlayPos(null);
        }
      } else {
        setOverlayPos(null);
      }
      frame = requestAnimationFrame(updateOverlay);
    };
    updateOverlay();

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [selectedPanelId, panels]);

  useEffect(() => {
    if (moveLeaderRef.current) {
      sceneRef.current?.remove(moveLeaderRef.current);
      moveLeaderRef.current.geometry.dispose();
      moveLeaderRef.current = null;
    }
    if (autoHideRef.current) {clearTimeout(autoHideRef.current);autoHideRef.current = null;}
    moveDragRef.current = null;
    moveAnchorRef.current = null;
    setMoveChip(null);
    setMoveNumpad(null);

    if (resizeLeaderRef.current) {
      sceneRef.current?.remove(resizeLeaderRef.current);
      resizeLeaderRef.current.geometry.dispose();
      resizeLeaderRef.current = null;
    }
    if (resizeAutoHideRef.current) {clearTimeout(resizeAutoHideRef.current);resizeAutoHideRef.current = null;}
    resizeMetaRef.current = null;
    resizeAnchorRef.current = null;
    setResizeChip(null);
    setResizeNumpad(null);

    if (rotWedgeRef.current) {
      sceneRef.current?.remove(rotWedgeRef.current);
      rotWedgeRef.current.traverse((o) => {const m = o as THREE.Mesh;if (m.geometry) m.geometry.dispose();});
      rotWedgeRef.current = null;
      rotWedgeMeshRef.current = null;
    }
    if (rotAutoHideRef.current) {clearTimeout(rotAutoHideRef.current);rotAutoHideRef.current = null;}
    rotDragRef.current = null;
    rotAnchorRef.current = null;
    setRotChip(null);
    setRotNumpad(null);
    setPickedPin(null);
    setRound(null);
    setRoundNumpad(false);
    setChamfer(null);
    setChamferNumpad(null);
    setPickedEdge(null);
    setNotch(null);
    setNotchNumpad(null);
    setWin(null);
    setWinNumpad(null);
  }, [selectedPanelId]);

  useEffect(() => {
    if (!showTargets) {
      setRound(null);setRoundNumpad(false);setPickedPin(null);
      setChamfer(null);setChamferNumpad(null);setPickedEdge(null);
      setNotch(null);setNotchNumpad(null);
      setWin(null);setWinNumpad(null);
    }
  }, [showTargets]);

  useEffect(() => {
    setRound(null);setRoundNumpad(false);setPickedPin(null);
    setChamfer(null);setChamferNumpad(null);setPickedEdge(null);
    setNotch(null);setNotchNumpad(null);
    setWin(null);setWinNumpad(null);
  }, [targetKind]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sel = panels.find((p) => p.id === selectedPanelId) || null;
    const mat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.95 });
    mat.depthTest = false;
    let grp: THREE.Group | null = null;
    if (sel) {
      const editing = new Set(round ? round.corners : []);
      const draw: {cid: string;r: number;}[] = [];
      for (const ar of appliedRounds ?? []) if (!editing.has(ar.cornerId) && ar.radius > 0) draw.push({ cid: ar.cornerId, r: ar.radius });
      if (round && round.radius > 0) for (const c of round.corners) draw.push({ cid: c, r: round.radius });
      if (draw.length) {
        grp = new THREE.Group();
        for (const { cid, r } of draw) {
          const pts = cornerArc(sel, cid, r).map((q) =>
          new THREE.Vector3(mm10ToMeters(q.x - MID_X), mm10ToMeters(q.y), mm10ToMeters(q.z - MID_Z)));
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
          line.renderOrder = 5;
          grp.add(line);
        }
        scene.add(grp);
      }
    }
    roundArcGroupRef.current = grp;
    return () => {
      if (grp) {
        scene.remove(grp);
        grp.traverse((o) => {const m = o as THREE.Line;if (m.geometry) m.geometry.dispose();});
      }
      mat.dispose();
      if (roundArcGroupRef.current === grp) roundArcGroupRef.current = null;
    };
  }, [round, appliedRounds, panels, selectedPanelId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sel = panels.find((p) => p.id === selectedPanelId) || null;
    const mat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.9 });
    mat.depthTest = false;
    let grp: THREE.Group | null = null;
    if (sel) {
      const eds = panelEdges(sel);
      const editing = new Set(chamfer ? chamfer.edges : []);
      const draw: {eid: string;w: number;}[] = [];
      for (const ac of appliedChamfers ?? []) if (!editing.has(ac.edgeId) && ac.width > 0) draw.push({ eid: ac.edgeId, w: ac.width });
      if (chamfer && chamfer.width > 0) for (const eid of chamfer.edges) draw.push({ eid, w: chamfer.width });
      if (draw.length) {
        grp = new THREE.Group();
        const wm = (mx: number, my: number, mz: number) => new THREE.Vector3(mm10ToMeters(mx - MID_X), mm10ToMeters(my), mm10ToMeters(mz - MID_Z));
        for (const { eid, w } of draw) {
          const e = eds.find((x) => x.id === eid);
          if (!e) continue;
          const half = e.len / 2;
          const a = wm(e.x - e.ax * half, e.y - e.ay * half, e.z - e.az * half);
          const b = wm(e.x + e.ax * half, e.y + e.ay * half, e.z + e.az * half);
          const c = wm(e.x + e.ax * half + e.ix * w, e.y + e.ay * half + e.iy * w, e.z + e.az * half + e.iz * w);
          const d = wm(e.x - e.ax * half + e.ix * w, e.y - e.ay * half + e.iy * w, e.z - e.az * half + e.iz * w);
          const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([a, b, c, d]), mat);
          loop.renderOrder = 5;
          grp.add(loop);
        }
        scene.add(grp);
      }
    }
    chamferGroupRef.current = grp;
    return () => {
      if (grp) {scene.remove(grp);grp.traverse((o) => {const m = o as THREE.Line;if (m.geometry) m.geometry.dispose();});}
      mat.dispose();
      if (chamferGroupRef.current === grp) chamferGroupRef.current = null;
    };
  }, [chamfer, appliedChamfers, panels, selectedPanelId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sel = panels.find((p) => p.id === selectedPanelId) || null;
    const mat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95 });
    mat.depthTest = false;
    let grp: THREE.Group | null = null;
    if (sel) {
      const eds = panelEdges(sel);
      const draw: {eid: string;n: {width: number;depth: number;radius: number;pos: number;};}[] = [];
      const editingId = notch ? notch.edgeId : null;
      for (const an of appliedNotches ?? []) if (an.edgeId !== editingId && an.width > 0) draw.push({ eid: an.edgeId, n: an });
      if (notch && notch.width > 0) draw.push({ eid: notch.edgeId, n: notch });
      if (draw.length) {
        grp = new THREE.Group();
        const wm = (mx: number, my: number, mz: number) => new THREE.Vector3(mm10ToMeters(mx - MID_X), mm10ToMeters(my), mm10ToMeters(mz - MID_Z));
        for (const { eid, n } of draw) {
          const e = eds.find((x) => x.id === eid);
          if (!e) continue;
          const leftT = Math.max(0, n.pos - n.width / 2) - e.len / 2;
          const rightT = Math.min(e.len, n.pos + n.width / 2) - e.len / 2;
          const W = rightT - leftT;
          const D = n.depth;
          const rr = Math.max(0, Math.min(n.radius, W / 2, D));
          const Ax = e.x + e.ax * leftT,Ay = e.y + e.ay * leftT,Az = e.z + e.az * leftT;
          const uv = (u: number, v: number) => wm(Ax + e.ax * u + e.ix * v, Ay + e.ay * u + e.iy * v, Az + e.az * u + e.iz * v);
          const pts: THREE.Vector3[] = [uv(0, 0), uv(0, D - rr)];
          for (let i = 0; i <= 6; i++) {const a = Math.PI - i / 6 * (Math.PI / 2);pts.push(uv(rr + rr * Math.cos(a), D - rr + rr * Math.sin(a)));}
          pts.push(uv(W - rr, D));
          for (let i = 0; i <= 6; i++) {const a = Math.PI / 2 - i / 6 * (Math.PI / 2);pts.push(uv(W - rr + rr * Math.cos(a), D - rr + rr * Math.sin(a)));}
          pts.push(uv(W, 0));
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
          line.renderOrder = 6;
          grp.add(line);
        }
        scene.add(grp);
      }
    }
    notchGroupRef.current = grp;
    return () => {
      if (grp) {scene.remove(grp);grp.traverse((o) => {const m = o as THREE.Line;if (m.geometry) m.geometry.dispose();});}
      mat.dispose();
      if (notchGroupRef.current === grp) notchGroupRef.current = null;
    };
  }, [notch, appliedNotches, panels, selectedPanelId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sel = panels.find((p) => p.id === selectedPanelId) || null;
    const mat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95 });
    mat.depthTest = false;
    let grp: THREE.Group | null = null;
    const list = (appliedWindows ?? []).map((wn) => ({ w: wn.w, h: wn.h, radius: wn.radius, cx: wn.cx, cy: wn.cy }));
    if (win) {
      const editing = { w: win.w, h: win.h, radius: win.radius, cx: win.cx, cy: win.cy };
      if (win.idx >= 0 && win.idx < list.length) list[win.idx] = editing;else list.push(editing);
    }
    const draw = list.filter((wn) => wn.w > 0 && wn.h > 0);
    if (sel && draw.length) {
      const f = panelFace(sel);
      const wm = (mx: number, my: number, mz: number) => new THREE.Vector3(mm10ToMeters(mx - MID_X), mm10ToMeters(my), mm10ToMeters(mz - MID_Z));
      const uv = (u: number, v: number) => wm(f.ox + f.uax * u + f.ubx * v, f.oy + f.uay * u + f.uby * v, f.oz + f.uaz * u + f.ubz * v);
      grp = new THREE.Group();
      for (const w of draw) {
        const x0 = w.cx - w.w / 2,x1 = w.cx + w.w / 2,y0 = w.cy - w.h / 2,y1 = w.cy + w.h / 2;
        const rr = Math.max(0, Math.min(w.radius, w.w / 2, w.h / 2));
        const pts: THREE.Vector3[] = [];
        const arc = (ccx: number, ccy: number, a0: number, a1: number) => {for (let i = 0; i <= 6; i++) {const a = a0 + (a1 - a0) * (i / 6);pts.push(uv(ccx + rr * Math.cos(a), ccy + rr * Math.sin(a)));}};
        arc(x1 - rr, y0 + rr, -Math.PI / 2, 0);
        arc(x1 - rr, y1 - rr, 0, Math.PI / 2);
        arc(x0 + rr, y1 - rr, Math.PI / 2, Math.PI);
        arc(x0 + rr, y0 + rr, Math.PI, Math.PI * 1.5);
        const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
        loop.renderOrder = 6;
        grp.add(loop);
      }
      scene.add(grp);
    }
    winGroupRef.current = grp;
    return () => {
      if (grp) {scene.remove(grp);grp.traverse((o) => {const m = o as THREE.Line;if (m.geometry) m.geometry.dispose();});}
      mat.dispose();
      if (winGroupRef.current === grp) winGroupRef.current = null;
    };
  }, [win, appliedWindows, panels, selectedPanelId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {selectedPanel &&
      <button className="focus-btn" onClick={focusSelected} title="Навести камеру на панель">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22" />
          </svg>
        </button>
      }
      {selectedPanel && !showTargets &&
      <button className="ground-btn" onClick={putOnGround} title="Поставить на пол">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 V13 M8 9 L12 13 L16 9 M4 20 H20" />
          </svg>
        </button>
      }
      {selectedPanel && (handles?.length ?? 0) > 0 && !showTargets &&
      <button
        className={`link-toggle${uniform ? " on" : ""}`}
        onClick={() => setUniform((u) => !u)}
        title={uniform ? "Пропорционально — вкл" : "Пропорционально — выкл"}>

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 12 H15 M8.5 8 H7 a4 4 0 0 0 0 8 H8.5 M15.5 8 H17 a4 4 0 0 1 0 8 H15.5" />
          </svg>
        </button>
      }
      {showTargets && selectedPanel && !round && !chamfer && !notch && !win &&
      <div className="target-toggle">
          <button className={targetKind === "corners" ? "on" : ""} onClick={() => setTargetKind("corners")}>⌜ Углы</button>
          <button className={targetKind === "edges" ? "on" : ""} onClick={() => setTargetKind("edges")}>⌐ Кромки</button>
          <button className={targetKind === "notches" ? "on" : ""} onClick={() => setTargetKind("notches")}>⊔ Вырез</button>
          <button className={targetKind === "windows" ? "on" : ""} onClick={() => setTargetKind("windows")}>▢ Окно</button>
        </div>
      }
      {transformMode === "rotate" && selectedPanel &&
      <div className="rot-bar">
          <div className="rot-axes">
            <button className={`rot-axis ax-x${rotAxis === "x" ? " on" : ""}`} onClick={() => setRotAxis("x")} title="Ось X"><i /></button>
            <button className={`rot-axis ax-y${rotAxis === "y" ? " on" : ""}`} onClick={() => setRotAxis("y")} title="Ось Y"><i /></button>
            <button className={`rot-axis ax-z${rotAxis === "z" ? " on" : ""}`} onClick={() => setRotAxis("z")} title="Ось Z"><i /></button>
          </div>
          <div className="rot-steps">
            <button onClick={() => rotateBy(90)} title="Повернуть на 90°">+90°</button>
            <button onClick={() => rotateBy(180)} title="Повернуть на 180°">180°</button>
            <button onClick={() => rotateBy(270)} title="Повернуть на 270°">+270°</button>
            <button className="rot-reset" onClick={resetRotAxis} title="Сбросить эту ось">⟲ 0°</button>
          </div>
        </div>
      }
      {(round || chamfer || notch || win) &&
      <div className="mod-sheet">
          {win &&
        <button className="ms-dup" onClick={duplicateWindow} title="Дублировать окно">⧉ Дублировать</button>
        }
          <button
          className="ms-del"
          onClick={() => {if (round) deleteRound();else if (chamfer) deleteChamfer();else if (notch) deleteNotch();else deleteWindow();}}
          title="Удалить">
          🗑 Удалить</button>
        </div>
      }
      {(annotations ?? []).map((a) => {
        const p = annPos[a.id];
        if (!p) return null;
        return (
          <div key={a.id} className="stage-annotation" style={{ left: p.x, top: p.y }}>
            {a.node}
          </div>);

      })}
      {moveChip && annPos["__move__"] &&
      <div className="stage-annotation" style={{ left: annPos["__move__"].x, top: annPos["__move__"].y }}>
          <MeasureChip
          value={moveChip.value}
          tone="live"
          live={!moveChip.resting}
          title={moveChip.kind === "height" ? "Высота над полом" : "Сдвиг"}
          onEdit={
          moveChip.resting ?
          () => {clearAutoHide();setMoveNumpad({ value: moveChip.value, label: moveChip.kind === "height" ? "Высота, см" : "Сдвиг, см" });} :
          undefined
          } />

        </div>
      }
      {resizeChip && annPos["__resize__"] &&
      <div className="stage-annotation" style={{ left: annPos["__resize__"].x, top: annPos["__resize__"].y }}>
          <MeasureChip
          value={resizeChip.value}
          tone={resizeChip.axis === "x" ? "axisX" : resizeChip.axis === "y" ? "axisY" : "axisZ"}
          live={!resizeChip.resting}
          title="Размер"
          onEdit={
          resizeChip.resting ?
          () => {if (resizeAutoHideRef.current) clearTimeout(resizeAutoHideRef.current);setResizeNumpad({ value: resizeChip.value });} :
          undefined
          } />

        </div>
      }
      {snapHint && annPos["__snap__"] &&
      <div className="snap-chip" style={{ left: annPos["__snap__"].x, top: annPos["__snap__"].y }}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4 H10 V13 a2 2 0 0 0 4 0 V4 H18 V13 a6 6 0 0 1 -12 0 Z" />
          </svg>
          {toCm(snapHint.gap)}
        </div>
      }
      {rotChip && annPos["__rot__"] &&
      <div className="stage-annotation" style={{ left: annPos["__rot__"].x, top: annPos["__rot__"].y }}>
          <MeasureChip
          value={rotChip.value}
          tone={rotChip.axis === "x" ? "axisX" : rotChip.axis === "y" ? "axisY" : "axisZ"}
          unit="deg"
          live={!rotChip.resting}
          title="Угол поворота"
          onEdit={
          rotChip.resting ?
          () => {if (rotAutoHideRef.current) clearTimeout(rotAutoHideRef.current);setRotNumpad({ value: rotChip.value });} :
          undefined
          } />

        </div>
      }
      {pins.map((pin) => {
        const pos = annPos[`__pin_${pin.id}__`];
        if (!pos) return null;
        if (round) return null;
        const r = cornerRadius(pin.id);
        const rounded = r > 0;
        const rot = cornerRotation(pos.x, pos.y);
        return (
          <button
            key={pin.id}
            className={`target-pin${rounded ? " rounded" : ""}${pickedPin === pin.id ? " on" : ""}`}
            style={{ left: pos.x, top: pos.y }}
            onClick={() => {setPickedPin(pin.id);onPickTargetRef.current?.(pin.id);openRound(pin.id);}}
            title={rounded ? "Скруглённый угол — нажмите, чтобы изменить" : "Скруглить этот угол"}>

            <svg className="tp-corner" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
              <path d="M6 18 L6 11 A5 5 0 0 1 11 6 L18 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {rounded ? <span className="tp-radius">{toCm(r)}</span> : <span className="tp-plus">+</span>}
          </button>);

      })}
      {round && pickedPin && annPos[`__pin_${pickedPin}__`] &&
      <div
        className="round-editor"
        style={{ left: annPos[`__pin_${pickedPin}__`]!.x, top: annPos[`__pin_${pickedPin}__`]!.y - 52 }}>

          <button
          className={`re-link${round.linked ? " on" : ""}`}
          onClick={toggleRoundLink}
          title={round.linked ? "4 угла связаны — нажмите, чтобы разъединить" : "Связать все 4 угла одним радиусом"}>
          🔗</button>
          <MeasureChip value={round.radius} tone="radius" onEdit={() => setRoundNumpad(true)} title="Радиус угла" />
          <button className="re-drag" onPointerDown={startRoundDrag} title="Тяните вбок, чтобы менять радиус">↔</button>
          <button className="re-ok" onClick={applyRound} title="Применить">✓</button>
        </div>
      }
      {edges.map((edge) => {
        const pos = annPos[`__edge_${edge.id}__`];
        if (!pos) return null;
        if (chamfer || notch) return null;
        const isNotch = targetKind === "notches";
        const state = isNotch ? notchOf(edge.id) : edgeMachining(edge.id);
        const active = !!state;
        return (
          <button
            key={edge.id}
            className={`edge-pin${active ? " machined" : ""}${pickedEdge === edge.id ? " on" : ""}`}
            style={{ left: pos.x, top: pos.y }}
            onClick={() => {setPickedEdge(edge.id);if (isNotch) openNotch(edge.id);else openChamfer(edge.id);}}
            title={isNotch ? "Вырез на кромке" : "Обработать эту кромку"}>

            <svg className="ep-glyph" viewBox="0 0 24 24" aria-hidden="true">
              {isNotch ?
              <path d="M3 9 H9 V13 H15 V9 H21" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /> :
              <path d="M4 8 H14 V14 H20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
            </svg>
            {state ? <span className="ep-val">{toCm(state.width)}</span> : <span className="ep-plus">+</span>}
          </button>);

      })}
      {chamfer && pickedEdge && annPos[`__edge_${pickedEdge}__`] &&
      <div
        className="round-editor"
        style={{ left: annPos[`__edge_${pickedEdge}__`]!.x, top: annPos[`__edge_${pickedEdge}__`]!.y - 52 }}>

          <button
          className={`re-link${chamfer.linked ? " on" : ""}`}
          onClick={toggleChamferLink}
          title={chamfer.linked ? "Кромки связаны — нажмите, чтобы разъединить" : "Связать все кромки"}>
          🔗</button>
          <button className="re-ok" onClick={applyChamfer} title="Применить">✓</button>
        </div>
      }
      {chamfer && pickedEdge && annPos["__ch__"] &&
      <div className="stage-annotation" style={{ left: annPos["__ch__"].x, top: annPos["__ch__"].y - 40 }}>
          <MeasureChip value={chamfer.width} tone="size" onEdit={() => setChamferNumpad("width")} title="Ширина (вдоль лица)" />
        </div>
      }
      {chamfer && pickedEdge && annPos["__cd__"] &&
      <div className="stage-annotation" style={{ left: annPos["__cd__"].x, top: annPos["__cd__"].y - 40 }}>
          <MeasureChip value={chamfer.depth} tone="offset" onEdit={() => setChamferNumpad("depth")} title="Глубина" />
        </div>
      }
      {notch && pickedEdge && (() => {
        const ne = edges.find((x) => x.id === notch.edgeId);
        const len = ne ? ne.len : 0;
        const offL = Math.max(0, roundMm10(notch.pos - notch.width / 2));
        const offR = Math.max(0, roundMm10(len - notch.pos - notch.width / 2));
        const nchip = (id: string, node: ReactNode) => {
          const p = annPos[`__notch_${id}__`];
          return p ? <div key={id} className="stage-annotation" style={{ left: p.x, top: p.y }}>{node}</div> : null;
        };
        return (
          <>
            {nchip("offL", <MeasureChip value={offL} tone="offset" locked={notch.lockL} onToggleLock={() => setNotch((n) => n ? { ...n, lockL: !n.lockL } : n)} onEdit={notch.lockL ? undefined : () => setNotchNumpad("offL")} title="До левого края" />)}
            {nchip("offR", <MeasureChip value={offR} tone="offset" locked={notch.lockR} onToggleLock={() => setNotch((n) => n ? { ...n, lockR: !n.lockR } : n)} onEdit={notch.lockR ? undefined : () => setNotchNumpad("offR")} title="До правого края" />)}
            {nchip("w", <MeasureChip value={notch.width} tone="size" onEdit={() => setNotchNumpad("width")} title="Ширина выреза" />)}
            {nchip("d", <MeasureChip value={notch.depth} tone="size" onEdit={() => setNotchNumpad("depth")} title="Глубина выреза" />)}
            {nchip("radius", <MeasureChip value={notch.radius} tone="radius" onEdit={() => setNotchNumpad("radius")} title="Радиус углов" />)}
            {annPos["__notch_ok__"] && <div className="stage-annotation" style={{ left: annPos["__notch_ok__"].x, top: annPos["__notch_ok__"].y }}><button className="re-ok win-btn" onClick={applyNotch} title="Применить">✓</button></div>}
          </>);

      })()}
      {notchHandles.map((h) => {
        const p = annPos[`__nh_${h.id}__`];
        if (!p) return null;
        const locked = h.id === "left" && notch?.lockL || h.id === "right" && notch?.lockR;
        return (
          <button
            key={h.id}
            className={`notch-handle nh-${h.id}`}
            style={{ left: p.x, top: p.y, opacity: locked ? 0.4 : 1 }}
            onPointerDown={(e) => startNotchDrag(e, h.id)}
            title={locked ? "Заблокировано" : h.id === "left" ? "Левая сторона" : h.id === "right" ? "Правая сторона" : h.id === "depth" ? "Глубина" : "Двигать вырез"}>

            {h.id === "left" ? "◀" : h.id === "right" ? "▶" : h.id === "depth" ? "▲" : "↔"}
          </button>);

      })}
      {winPins.map((wpin) =>
      annPos[`__winpin_${wpin.id}__`] ?
      <button
        key={wpin.id}
        className={`window-pin${wpin.active ? " machined" : ""}`}
        style={{ left: annPos[`__winpin_${wpin.id}__`]!.x, top: annPos[`__winpin_${wpin.id}__`]!.y }}
        onClick={() => openWindow(wpin.id === "add" ? -1 : Number(wpin.id))}
        title={wpin.active ? "Окно — нажмите, чтобы изменить" : "Добавить окно"}>

          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="6" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
            {!wpin.active && <path d="M12 9 V15 M9 12 H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
          </svg>
        </button> :
      null
      )}
      {win && winFace && (() => {
        const offT = Math.max(0, roundMm10(winFace.h - (win.cy + win.h / 2)));
        const offB = Math.max(0, roundMm10(win.cy - win.h / 2));
        const offL = Math.max(0, roundMm10(win.cx - win.w / 2));
        const offR = Math.max(0, roundMm10(winFace.w - (win.cx + win.w / 2)));
        const chip = (id: string, node: ReactNode, dx = 0, dy = 0) => {
          const p = annPos[`__win_${id}__`];
          if (!p) return null;
          return <div key={id} className="stage-annotation" style={{ left: p.x + dx, top: p.y + dy }}>{node}</div>;
        };
        return (
          <>
            {chip("offT", <MeasureChip value={offT} tone="offset" locked={win.lockT} onToggleLock={() => setWin((w) => w ? { ...w, lockT: !w.lockT } : w)} onEdit={win.lockT ? undefined : () => setWinNumpad("offT")} title="До верхнего края" />)}
            {chip("offB", <MeasureChip value={offB} tone="offset" locked={win.lockB} onToggleLock={() => setWin((w) => w ? { ...w, lockB: !w.lockB } : w)} onEdit={win.lockB ? undefined : () => setWinNumpad("offB")} title="До нижнего края" />)}
            {chip("offL", <MeasureChip value={offL} tone="offset" locked={win.lockL} onToggleLock={() => setWin((w) => w ? { ...w, lockL: !w.lockL } : w)} onEdit={win.lockL ? undefined : () => setWinNumpad("offL")} title="До левого края" />)}
            {chip("offR", <MeasureChip value={offR} tone="offset" locked={win.lockR} onToggleLock={() => setWin((w) => w ? { ...w, lockR: !w.lockR } : w)} onEdit={win.lockR ? undefined : () => setWinNumpad("offR")} title="До правого края" />)}
            {chip("w", <MeasureChip value={win.w} tone="size" onEdit={() => setWinNumpad("w")} title="Ширина окна" />, 0, 62)}
            {chip("h", <MeasureChip value={win.h} tone="size" onEdit={() => setWinNumpad("h")} title="Высота окна" />, -82, 0)}
            {chip("radius", <MeasureChip value={win.radius} tone="radius" onEdit={() => setWinNumpad("radius")} title="Радиус углов" />, 30, -30)}
            {annPos["__win_ok__"] && <div className="stage-annotation" style={{ left: annPos["__win_ok__"].x - 30, top: annPos["__win_ok__"].y - 30 }}><button className="re-ok win-btn" onClick={applyWindow} title="Применить">✓</button></div>}
          </>);

      })()}
      {winHandles.map((h) => {
        const p = annPos[`__wh_${h.id}__`];
        if (!p) return null;
        const locked = h.id === "L" && win?.lockL || h.id === "R" && win?.lockR || h.id === "T" && win?.lockT || h.id === "B" && win?.lockB;
        return (
          <button
            key={h.id}
            className={`notch-handle${h.id === "C" ? " nh-pos" : ""}`}
            style={{ left: p.x, top: p.y, opacity: locked ? 0.4 : 1 }}
            onPointerDown={(e) => startWindowDrag(e, h.id)}
            title={h.id === "C" ? "Двигать окно" : h.id === "L" ? "Левая сторона" : h.id === "R" ? "Правая сторона" : h.id === "T" ? "Верх" : "Низ"}>

            {h.id === "L" ? "◀" : h.id === "R" ? "▶" : h.id === "T" ? "▲" : h.id === "B" ? "▼" : "✥"}
          </button>);

      })}
      {roundHandle && annPos["__rh__"] &&
      <button
        className="round-handle"
        style={{ left: annPos["__rh__"].x, top: annPos["__rh__"].y }}
        onPointerDown={startRoundHandleDrag}
        title="Радиус — тяните">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M19 7 A12 12 0 0 0 7 19" />
          </svg>
        </button>
      }
      {chamferHandle && annPos["__ch__"] &&
      <button
        className="chamfer-handle"
        style={{ left: annPos["__ch__"].x, top: annPos["__ch__"].y }}
        onPointerDown={startChamferHandleDrag}
        title="Ширина — тяните">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8 H14 V14 H20" />
          </svg>
        </button>
      }
      {chamferDepthHandle && annPos["__cd__"] &&
      <button
        className="chamfer-handle depth"
        style={{ left: annPos["__cd__"].x, top: annPos["__cd__"].y }}
        onPointerDown={startChamferDepthDrag}
        title="Глубина — тяните">

          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
          </svg>
        </button>
      }
      {showMeasure && measurePts.length === 2 && annPos["__mpt0__"] && annPos["__mpt1__"] &&
      <svg className="measure-svg" aria-hidden="true">
          <line
          x1={annPos["__mpt0__"].x} y1={annPos["__mpt0__"].y}
          x2={annPos["__mpt1__"].x} y2={annPos["__mpt1__"].y}
          stroke="#16a34a" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />
        </svg>
      }
      {showMeasure && measurePts.map((_, i) =>
      annPos[`__mpt${i}__`] ?
      <div key={i} className="measure-dot" style={{ left: annPos[`__mpt${i}__`]!.x, top: annPos[`__mpt${i}__`]!.y }} /> :
      null
      )}
      {showMeasure && measurePts.length === 2 && annPos["__mpt0__"] && annPos["__mpt1__"] && (() => {
        const d = roundMm10(Math.hypot(measurePts[1].x - measurePts[0].x, measurePts[1].y - measurePts[0].y, measurePts[1].z - measurePts[0].z));
        const editable = measurePts[0].panelId !== measurePts[1].panelId;
        return (
          <div className="stage-annotation" style={{ left: (annPos["__mpt0__"]!.x + annPos["__mpt1__"]!.x) / 2, top: (annPos["__mpt0__"]!.y + annPos["__mpt1__"]!.y) / 2 }}>
            <MeasureChip value={d} tone="live" title={editable ? "Расстояние — измените, чтобы сдвинуть" : "Расстояние (одна панель)"} onEdit={editable ? () => setMeasureNumpad({ value: d }) : undefined} />
          </div>);

      })()}
      {showMeasure && measurePts.length < 2 &&
      <div className="measure-hint">Коснитесь двух точек (углы/кромки)</div>
      }
      {selectedPanel &&
      <div className="floating-dims-card" style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", background: "white", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", display: "flex", gap: "24px", zIndex: 10 }}>
          <div className="float-field">
            <span className="float-lbl">En (X)</span>
            <input
            type="number"
            value={Math.round(mm10ToMm(selectedPanel.width))}
            readOnly={lockedDims?.includes("width")}
            onChange={(e) => onUpdateDim("width", Number(e.target.value) || 0)} />

          </div>
          <div className="float-field">
            <span className="float-lbl">Bo'y (Y)</span>
            <input
            type="number"
            value={Math.round(mm10ToMm(selectedPanel.height))}
            readOnly={lockedDims?.includes("height")}
            onChange={(e) => onUpdateDim("height", Number(e.target.value) || 0)} />

          </div>
          <div className="float-field">
            <span className="float-lbl">
              {lockedDims?.includes("depth") ? "Толщина ← профиль" : "Chuqurlik (Z)"}
            </span>
            <input
            type="number"
            value={Math.round(mm10ToMm(selectedPanel.depth))}
            readOnly={lockedDims?.includes("depth")}
            onChange={(e) => onUpdateDim("depth", Number(e.target.value) || 0)} />

          </div>
        </div>
      }
      {moveNumpad &&
      <Numpad
        initial={moveNumpad.value}
        label={moveNumpad.label}
        mode="cm"
        onCommit={commitMove}
        onCancel={() => {setMoveNumpad(null);clearMoveIndicator();}} />

      }
      {measureNumpad &&
      <Numpad
        initial={measureNumpad.value}
        label="Расстояние, см"
        mode="cm"
        onCommit={commitMeasure}
        onCancel={() => setMeasureNumpad(null)} />

      }
      {resizeNumpad &&
      <Numpad
        initial={resizeNumpad.value}
        label="Размер, см"
        mode="cm"
        onCommit={commitResize}
        onCancel={() => {setResizeNumpad(null);clearResizeIndicator();}} />

      }
      {rotNumpad &&
      <Numpad
        initial={rotNumpad.value}
        label="Угол, °"
        mode="deg"
        onCommit={commitRot}
        onCancel={() => {setRotNumpad(null);clearRotIndicator();}} />

      }
      {roundNumpad && round &&
      <Numpad
        initial={round.radius}
        label="Радиус, см"
        mode="cm"
        onCommit={(v) => {setRound((r) => r ? { ...r, radius: v } : r);setRoundNumpad(false);}}
        onCancel={() => setRoundNumpad(false)} />

      }
      {chamferNumpad && chamfer &&
      <Numpad
        initial={chamferNumpad === "width" ? chamfer.width : chamfer.depth}
        label={chamferNumpad === "width" ? "Ширина, см" : "Глубина, см"}
        mode="cm"
        onCommit={(v) => {setChamfer((c) => c ? chamferNumpad === "width" ? { ...c, width: v } : { ...c, depth: v } : c);setChamferNumpad(null);}}
        onCancel={() => setChamferNumpad(null)} />

      }
      {notchNumpad && notch && (() => {
        const ne = edges.find((x) => x.id === notch.edgeId);
        const len = ne ? ne.len : 0;
        const initial = notchNumpad === "offL" ? Math.max(0, notch.pos - notch.width / 2) :
        notchNumpad === "offR" ? Math.max(0, len - notch.pos - notch.width / 2) :
        notch[notchNumpad];
        const label = notchNumpad === "width" ? "Ширина, см" : notchNumpad === "depth" ? "Глубина, см" : notchNumpad === "radius" ? "Радиус, см" : "До края, см";
        return (
          <Numpad
            initial={initial}
            label={label}
            mode="cm"
            onCommit={(v) => {
              setNotch((n) => {
                if (!n) return n;
                if (notchNumpad === "offL") return { ...n, pos: Math.max(n.width / 2, Math.min(len - n.width / 2, v + n.width / 2)) };
                if (notchNumpad === "offR") return { ...n, pos: Math.max(n.width / 2, Math.min(len - n.width / 2, len - v - n.width / 2)) };
                return { ...n, [notchNumpad]: v };
              });
              setNotchNumpad(null);
            }}
            onCancel={() => setNotchNumpad(null)} />);

      })()}
      {winNumpad && win && winFace && (() => {
        const f = winFace;
        const initial = winNumpad === "w" ? win.w : winNumpad === "h" ? win.h : winNumpad === "radius" ? win.radius :
        winNumpad === "offT" ? Math.max(0, f.h - (win.cy + win.h / 2)) :
        winNumpad === "offB" ? Math.max(0, win.cy - win.h / 2) :
        winNumpad === "offL" ? Math.max(0, win.cx - win.w / 2) :
        Math.max(0, f.w - (win.cx + win.w / 2));
        const label = winNumpad === "w" ? "Ширина, см" : winNumpad === "h" ? "Высота, см" : winNumpad === "radius" ? "Радиус, см" : "До края, см";
        return (
          <Numpad
            initial={initial}
            label={label}
            mode="cm"
            onCommit={(v) => {
              setWin((w) => {
                if (!w) return w;
                const clampU = (u: number) => Math.max(w.w / 2, Math.min(f.w - w.w / 2, u));
                const clampV = (vv: number) => Math.max(w.h / 2, Math.min(f.h - w.h / 2, vv));
                if (winNumpad === "w") return { ...w, w: v };
                if (winNumpad === "h") return { ...w, h: v };
                if (winNumpad === "radius") return { ...w, radius: v };
                if (winNumpad === "offL") return { ...w, cx: clampU(v + w.w / 2) };
                if (winNumpad === "offR") return { ...w, cx: clampU(f.w - v - w.w / 2) };
                if (winNumpad === "offB") return { ...w, cy: clampV(v + w.h / 2) };
                return { ...w, cy: clampV(f.h - v - w.h / 2) };
              });
              setWinNumpad(null);
            }}
            onCancel={() => setWinNumpad(null)} />);

      })()}
    </div>);

}
