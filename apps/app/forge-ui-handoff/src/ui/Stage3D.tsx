import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { Panel, Hole } from "../contract/types";
import { buildBlockGroup } from "./renderBlock";
import { mm10ToMeters, mm10ToMm } from "../contract/types";
import { MeasureChip } from "./MeasureChip";
import { Numpad } from "./Numpad";
import { toCm } from "./measure";

/** One draggable side of a panel. Position is the centre of that side's face plane. */
export interface SideHandle {
  id: string;
  x: number;
  y: number;
  z: number;
  axis: "x" | "y" | "z";
}

/** The scene is centred on these, in mm10 — see buildBlockGroup. */
const MID_X = 3000;
const MID_Z = 2800;

/**
 * The four corners of a panel's MAIN face — the face `orientation` names (width→X,
 * height→Y, depth→Z), the remaining axis being the profile thickness — taken at
 * mid-thickness. These are what a corner modifier (round / chamfer) would attach to.
 * With no orientation the thinnest extent is assumed to be the thickness.
 */
function panelCorners(p: Panel): { id: string; x: number; y: number; z: number }[] {
  const AX = ["width", "height", "depth"] as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy
    ? AX.find((a) => a !== ox && a !== oy)!
    : p.width <= p.height && p.width <= p.depth ? "width"
      : p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  const fa = face[0]!;
  const fb = face[1]!;
  const lo = { width: p.x, height: p.y, depth: p.z };
  const hi = { width: p.x + p.width, height: p.y + p.height, depth: p.z + p.depth };
  const ctr = { width: p.x + p.width / 2, height: p.y + p.height / 2, depth: p.z + p.depth / 2 };
  const euler = (p.rx || p.ry || p.rz) ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const out: { id: string; x: number; y: number; z: number }[] = [];
  for (const sa of [0, 1]) {
    for (const sb of [0, 1]) {
      const pos = { width: ctr.width, height: ctr.height, depth: ctr.depth };
      pos[fa] = sa ? hi[fa] : lo[fa];
      pos[fb] = sb ? hi[fb] : lo[fb];
      let cx = pos.width, cy = pos.height, cz = pos.depth;
      if (euler) {
        const v = new THREE.Vector3(cx - ctr.width, cy - ctr.height, cz - ctr.depth).applyEuler(euler);
        cx = ctr.width + v.x; cy = ctr.height + v.y; cz = ctr.depth + v.z;
      }
      out.push({ id: `c${sa}${sb}`, x: cx, y: cy, z: cz });
    }
  }
  return out;
}

/**
 * The polyline of a rounded corner — a 90° arc of radius R in the main-face plane,
 * tangent to the two edges meeting at `cornerId`. Points are mm10 world (rotated by
 * rx/ry/rz if the panel is turned). This is the GUIDE only; the model owns the cut.
 */
function cornerArc(p: Panel, cornerId: string, radius: number): { x: number; y: number; z: number }[] {
  const sa = cornerId[1] === "1" ? 1 : 0;
  const sb = cornerId[2] === "1" ? 1 : 0;
  const AX = ["width", "height", "depth"] as const;
  const AXVEC = { width: [1, 0, 0], height: [0, 1, 0], depth: [0, 0, 1] } as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy
    ? AX.find((a) => a !== ox && a !== oy)!
    : p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
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
  const euler = (p.rx || p.ry || p.rz) ? new THREE.Euler(p.rx || 0, p.ry || 0, p.rz || 0) : null;
  const pc = new THREE.Vector3(ctr.width, ctr.height, ctr.depth);
  const N = 16;
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * (Math.PI / 2);
    const pt = O.clone().addScaledVector(D2, -radius * Math.cos(t)).addScaledVector(D1, -radius * Math.sin(t));
    if (euler) pt.sub(pc).applyEuler(euler).add(pc);
    out.push({ x: pt.x, y: pt.y, z: pt.z });
  }
  return out;
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
  annotations,
  onLiveDragPanel,
  overlays,
  rotationGizmo,
  groundY_mm10 = 0,
  showTargets = false,
  onPickTarget,
  onApplyRound,
  appliedRounds,
}: {
  panels: Panel[];
  holes: Hole[];
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  onDragPanel: (id: string, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;
  onUpdateDim: (dim: "width" | "height" | "depth", val: number) => void;
  transformMode?: "translate" | "rotate";
  /** Optional габарит wireframe (mm10) — Forge draws inside one, and its faces are
   *  the magnet targets, so they have to be visible. */
  envelope?: { w_mm10: number; h_mm10: number; d_mm10: number };
  /** Dimensions the floating card must show read-only (Forge: thickness is the
   *  profile's answer, not an editable field). */
  lockedDims?: ReadonlyArray<"width" | "height" | "depth">;
  /** Draggable side handles (mm10 world positions), for resizing from one side. */
  handles?: ReadonlyArray<SideHandle>;
  selectedHandleId?: string | null;
  onSelectHandle?: (id: string | null) => void;
  /** New world coordinate (mm10) of the dragged side's plane. */
  onDragHandle?: (id: string, coord_mm10: number) => void;
  /**
   * Chips pinned to a point in the scene (mm10 world). Projected every frame, so a
   * measurement stays glued to the geometry it describes while the camera orbits.
   * Every tool F1–F7 hangs its numbers here.
   */
  annotations?: ReadonlyArray<{ id: string; x: number; y: number; z: number; node: ReactNode }>;
  /**
   * Fires on EVERY frame of a move drag, not just on release. The universal rule wants
   * the number visible while the finger is still down, and `dragging-changed` is too
   * late for that.
   */
  onLiveDragPanel?: (id: string, x: number, y: number, z: number) => void;
  /**
   * F3's rotation read-out: a transparent disc in the plane of the turn, a translucent
   * wedge covering the angle that was swept, and faint rings on the other two axes so
   * you can see which one moved. Centre and radius are mm10 world.
   */
  /**
   * Modifier outlines (F4–F7). Drawn as line loops ON the panel — DB/35 §2 forbids
   * cutting the base mesh, so a hole is an outline plus its chips, not a boolean.
   */
  overlays?: ReadonlyArray<{
    id: string;
    points: ReadonlyArray<{ x: number; y: number; z: number }>;
    color: number;
    closed?: boolean;
    /** Measurement leaders are dashed, per F1. */
    dashed?: boolean;
  }>;
  rotationGizmo?: {
    cx: number; cy: number; cz: number;
    axis: "x" | "y" | "z";
    sweepDeg: number;
    radius: number;
  } | null;
  /**
   * F1's vertical readout is a HEIGHT above a floor, like Moblo's "put on ground".
   * The floor is y=0 by default; a host with a real room floor sends its level here.
   * Horizontal moves ignore it — they read as travel from the drag's start.
   */
  groundY_mm10?: number;
  /** F4: show the ⬡⊕ corner target-pins — the entry to a corner modifier. */
  showTargets?: boolean;
  onPickTarget?: (cornerId: string) => void;
  /** F03: apply a corner round — the actual cut is the model's; the UI emits the spec. */
  onApplyRound?: (cornerIds: string[], radius_mm10: number) => void;
  /** F03: rounds already applied to the selected panel — drawn as persistent arcs. */
  appliedRounds?: ReadonlyArray<{ cornerId: string; radius: number }>;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const [annPos, setAnnPos] = useState<Record<string, { x: number; y: number }>>({});

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const onDragPanelRef = useRef(onDragPanel);
  onDragPanelRef.current = onDragPanel;
  const onDragHandleRef = useRef(onDragHandle);
  onDragHandleRef.current = onDragHandle;
  const onLiveDragPanelRef = useRef(onLiveDragPanel);
  onLiveDragPanelRef.current = onLiveDragPanel;
  const onSelectHandleRef = useRef(onSelectHandle);
  onSelectHandleRef.current = onSelectHandle;
  const handlesRef = useRef(handles);
  handlesRef.current = handles;
  const dragRef = useRef<{ id: string; axisVec: THREE.Vector3; grabOffset: number } | null>(null);
  const justDraggedRef = useRef(false);
  /** True for the whole life of a move-gizmo drag. */
  const gizmoDraggingRef = useRef(false);
  const selectedHandleIdRef = useRef(selectedHandleId);
  selectedHandleIdRef.current = selectedHandleId;

  // ── F1 MOVE: the live green pill + dashed leader, and its resting/typed number ──
  // The universal rule wants a number the whole time a panel is dragged, then a number
  // that STAYS and is tappable. All of it lives here so shipping ui/ ships F1.
  const moveDragRef = useRef<{ id: string; axis: "x" | "y" | "z"; startPanel: { x: number; y: number; z: number }; sign: number } | null>(null);
  const moveLeaderRef = useRef<THREE.Line | null>(null);
  const moveAnchorRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const groundYRef = useRef(groundY_mm10);
  groundYRef.current = groundY_mm10;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const transformModeRef = useRef(transformMode);
  transformModeRef.current = transformMode;
  const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moveChip, setMoveChip] = useState<{ value: number; kind: "travel" | "height"; resting: boolean } | null>(null);
  const [moveNumpad, setMoveNumpad] = useState<{ value: number; label: string } | null>(null);
  const moveNumpadRef = useRef(moveNumpad);
  moveNumpadRef.current = moveNumpad;

  const clearAutoHide = () => {
    if (autoHideRef.current) { clearTimeout(autoHideRef.current); autoHideRef.current = null; }
  };
  /** Drop the whole F1 read-out — chip, anchor and the drag it belonged to. */
  const clearMoveIndicator = () => {
    clearAutoHide();
    moveDragRef.current = null;
    moveAnchorRef.current = null;
    setMoveChip(null);
  };
  /** Numpad committed: move the panel to the EXACT value, measured from the drag start. */
  const commitMove = (v_mm10: number) => {
    const d = moveDragRef.current;
    setMoveNumpad(null);
    if (!d) { clearMoveIndicator(); return; }
    const next = { x: d.startPanel.x, y: d.startPanel.y, z: d.startPanel.z };
    if (d.axis === "y") next.y = groundYRef.current + v_mm10;    // height above the floor
    else next[d.axis] = d.startPanel[d.axis] + d.sign * v_mm10;  // travel, in the dragged direction
    onDragPanelRef.current(d.id, Math.round(next.x), Math.round(next.y), Math.round(next.z));
    clearMoveIndicator();
  };

  // ── F2 RESIZE: the size chip + leader that ride the existing side-handle drag ──
  // The handle drag already reports the dragged face's plane; F2 hangs the resulting
  // DIMENSION off it — a red size chip and a dashed span between the two faces — then
  // lets the number be typed exactly, all in ui/ so shipping ui/ ships F2 too.
  const resizeMetaRef = useRef<{ id: string; axis: "x" | "y" | "z"; oppositeCoord: number; sign: number; center: { x: number; y: number; z: number } } | null>(null);
  const resizeLeaderRef = useRef<THREE.Line | null>(null);
  const resizeAnchorRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const resizeAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resizeChip, setResizeChip] = useState<{ value: number; resting: boolean } | null>(null);
  const [resizeNumpad, setResizeNumpad] = useState<{ value: number } | null>(null);
  const resizeNumpadRef = useRef(resizeNumpad);
  resizeNumpadRef.current = resizeNumpad;

  /** Drop the whole F2 read-out — leader, chip, anchor and the drag it belonged to. */
  const clearResizeIndicator = () => {
    if (resizeAutoHideRef.current) { clearTimeout(resizeAutoHideRef.current); resizeAutoHideRef.current = null; }
    if (resizeLeaderRef.current) {
      sceneRef.current?.remove(resizeLeaderRef.current);
      resizeLeaderRef.current.geometry.dispose();
      resizeLeaderRef.current = null;
    }
    resizeMetaRef.current = null;
    resizeAnchorRef.current = null;
    setResizeChip(null);
  };
  /** Numpad committed: move the dragged face so the dimension is EXACTLY this. */
  const commitResize = (v_mm10: number) => {
    const rm = resizeMetaRef.current;
    setResizeNumpad(null);
    if (!rm) { clearResizeIndicator(); return; }
    const newCoord = rm.oppositeCoord + rm.sign * v_mm10;
    onDragHandleRef.current?.(rm.id, Math.round(newCoord));
    clearResizeIndicator();
  };

  // ── F3 ROTATE: the blue angle chip + swept wedge that ride the rotate gizmo ──
  // TransformControls (in rotate mode) draws the three coloured rings itself; this adds
  // the swept sector that fills the turned angle and the blue number, all in ui/.
  const rotDragRef = useRef<{ id: string; axis: "x" | "y" | "z"; startRot: { x: number; y: number; z: number }; center: { x: number; y: number; z: number }; radius: number } | null>(null);
  const rotWedgeRef = useRef<THREE.Group | null>(null);
  const rotWedgeMeshRef = useRef<THREE.Mesh | null>(null);
  const rotAnchorRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const rotAutoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rotChip, setRotChip] = useState<{ value: number; resting: boolean } | null>(null);
  const [rotNumpad, setRotNumpad] = useState<{ value: number } | null>(null);
  const rotNumpadRef = useRef(rotNumpad);
  rotNumpadRef.current = rotNumpad;

  /** Drop the whole F3 read-out — wedge, disc, chip and the drag it belonged to. */
  const clearRotIndicator = () => {
    if (rotAutoHideRef.current) { clearTimeout(rotAutoHideRef.current); rotAutoHideRef.current = null; }
    const grp = rotWedgeRef.current;
    if (grp) {
      sceneRef.current?.remove(grp);
      grp.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      rotWedgeRef.current = null;
      rotWedgeMeshRef.current = null;
    }
    rotDragRef.current = null;
    rotAnchorRef.current = null;
    setRotChip(null);
  };
  /** Numpad committed: turn the panel to EXACTLY this angle from where the drag began,
   *  snapped to a quarter turn — the contract's orientation only holds principal planes. */
  const commitRot = (deg: number) => {
    const d = rotDragRef.current;
    setRotNumpad(null);
    if (!d) { clearRotIndicator(); return; }
    const snapped = Math.round(deg / 90) * 90;
    const rot = { x: d.startRot.x, y: d.startRot.y, z: d.startRot.z };
    rot[d.axis] = d.startRot[d.axis] + (snapped * Math.PI) / 180;
    const p = panelsRef.current.find((x) => x.id === d.id);
    if (p) onDragPanelRef.current(d.id, p.x, p.y, p.z, rot.x, rot.y, rot.z);
    clearRotIndicator();
  };

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) || null;

  // F4 target-pins for the selected panel's main-face corners (empty unless armed).
  const pins = showTargets && selectedPanel ? panelCorners(selectedPanel) : [];
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const [pickedPin, setPickedPin] = useState<string | null>(null);
  const onPickTargetRef = useRef(onPickTarget);
  onPickTargetRef.current = onPickTarget;

  // ── F03 ROUND: the corner-round editor opened by a target-pin ──
  const allCornerIds = pins.map((c) => c.id);
  const ROUND_DEFAULT = 150; // 15 mm — a visible starting radius
  const [round, setRound] = useState<{ corners: string[]; radius: number; linked: boolean } | null>(null);
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
    setRound(null); setRoundNumpad(false);
  };
  const deleteRound = () => {
    const r = roundRef.current;
    if (r) onApplyRoundRef.current?.(r.corners, 0);
    setRound(null); setRoundNumpad(false);
  };
  const startRoundDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startR = roundRef.current?.radius ?? 0;
    const onMove = (ev: PointerEvent) => {
      const nr = Math.max(0, Math.round(startR + (ev.clientX - startX) * 5));
      setRound((r) => (r ? { ...r, radius: nr } : r));
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** The radius shown at a corner right now: the one being edited wins, else applied. */
  const cornerRadius = (cid: string): number => {
    if (round && round.corners.includes(cid)) return round.radius;
    const ap = (appliedRounds ?? []).find((a) => a.cornerId === cid);
    return ap ? ap.radius : 0;
  };
  /** Which way the corner bracket points, so each pin reads as its own corner (⌜⌝⌞⌟). */
  const cornerRotation = (px: number, py: number): number => {
    const pts = pins.map((c) => annPos[`__pin_${c.id}__`]).filter((q): q is { x: number; y: number } => !!q);
    if (pts.length < 2) return 0;
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    const left = px < cx;
    const top = py < cy;
    if (top && left) return 0;      // top-left  ⌜
    if (top && !left) return 90;    // top-right ⌝
    if (!top && !left) return 180;  // bottom-right ⌟
    return 270;                     // bottom-left ⌞
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
      new THREE.ShadowMaterial({ opacity: 0.12 }),
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
    // Smaller arrows: at the default size they blanket a small panel and its edge
    // handles end up underneath them.
    transformControls.size = 0.6;
    transformControls.addEventListener("objectChange", () => {
      const mesh = transformControls.object;
      if (!mesh || !mesh.name || mesh.name.startsWith("handle:")) return;
      const p = panelsRef.current.find((x) => x.id === mesh.name);
      if (!p) return;
      const curX = Math.round(mesh.position.x * 10000 + MID_X - p.width / 2);
      const curY = Math.round(mesh.position.y * 10000 - p.height / 2);
      const curZ = Math.round(mesh.position.z * 10000 + MID_Z - p.depth / 2);
      onLiveDragPanelRef.current?.(mesh.name, curX, curY, curZ);

      // F1 live read-out: refresh the dashed leader and the green pill every frame.
      const d = moveDragRef.current;
      const leader = moveLeaderRef.current;
      if (d && leader && d.id === mesh.name) {
        const halfH = mm10ToMeters(p.height) / 2;
        let a: THREE.Vector3, b: THREE.Vector3, value: number;
        let anchor: { x: number; y: number; z: number };
        if (d.axis === "y") {
          // panel bottom → floor; the number is the height above the floor
          const groundW = mm10ToMeters(groundYRef.current);
          a = new THREE.Vector3(mesh.position.x, mesh.position.y - halfH, mesh.position.z);
          b = new THREE.Vector3(mesh.position.x, groundW, mesh.position.z);
          value = curY - groundYRef.current;
          anchor = { x: curX + p.width / 2, y: (curY + groundYRef.current) / 2, z: curZ + p.depth / 2 };
        } else {
          // drag start → now, along the one axis the arrow allows; the number is the travel
          const s = d.startPanel;
          a = new THREE.Vector3(
            mm10ToMeters(s.x + p.width / 2 - MID_X),
            mm10ToMeters(s.y + p.height / 2),
            mm10ToMeters(s.z + p.depth / 2 - MID_Z),
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

      // F3 live read-out: grow the swept wedge and update the blue angle chip.
      const rd = rotDragRef.current;
      const wm = rotWedgeMeshRef.current;
      if (rd && wm && rd.id === mesh.name) {
        const sweptRad = mesh.rotation[rd.axis] - rd.startRot[rd.axis];
        const r = mm10ToMeters(rd.radius);
        wm.geometry.dispose();
        wm.geometry = new THREE.CircleGeometry(r, 48, sweptRad < 0 ? sweptRad : 0, Math.abs(sweptRad) || 0.0001);
        rotAnchorRef.current = rd.center;
        setRotChip({ value: Math.round((sweptRad * 180) / Math.PI), resting: false });
      }
    });

    transformControls.addEventListener("dragging-changed", (event) => {
      controls.enabled = !event.value;
      gizmoDraggingRef.current = Boolean(event.value);

      // F1 START: begin a move read-out — record where it started, drop a dashed leader.
      if (event.value) {
        const startMesh = transformControls.object;
        const axisChar = transformControls.axis;
        const axis = axisChar === "X" ? "x" : axisChar === "Y" ? "y" : axisChar === "Z" ? "z" : null;
        if (transformModeRef.current === "translate" && axis && startMesh && startMesh.name && !startMesh.name.startsWith("handle:")) {
          const p = panelsRef.current.find((x) => x.id === startMesh.name);
          if (p) {
            clearMoveIndicator();
            if (moveLeaderRef.current) { scene.remove(moveLeaderRef.current); moveLeaderRef.current.geometry.dispose(); moveLeaderRef.current = null; }
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

      // F3 START: begin a rotate read-out — the coloured rings are the gizmo's own; add
      // the swept wedge (a pie slice that grows to the turned angle) and the blue chip.
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
              center, radius,
            };
            const grp = new THREE.Group();
            grp.position.set(mm10ToMeters(center.x - MID_X), mm10ToMeters(center.y), mm10ToMeters(center.z - MID_Z));
            if (axis === "y") grp.rotation.x = -Math.PI / 2;
            else if (axis === "x") grp.rotation.y = Math.PI / 2;
            const r = mm10ToMeters(radius);
            const disc = new THREE.LineLoop(
              new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(64)),
              new THREE.LineBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.85, depthTest: false }),
            );
            disc.renderOrder = 4;
            grp.add(disc);
            const wedge = new THREE.Mesh(
              new THREE.CircleGeometry(r, 48, 0, 0.0001),
              new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, depthTest: false }),
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
        // A gizmo drag ends with a click. Without this the click raycasts empty space
        // (the panel has moved out from under the cursor) and deselects what you just
        // moved — `transformControls.dragging` is already false by then, so the guard
        // in the click handler cannot catch it.
        justDraggedRef.current = true;
        const mesh = transformControls.object;

        // A side handle carries a single coordinate: the plane its face sits on.
        if (mesh && mesh.name.startsWith("handle:")) {
          const id = mesh.name.slice("handle:".length);
          const h = (handlesRef.current ?? []).find((x) => x.id === id);
          if (h) {
            const coord = h.axis === "x" ? mesh.position.x * 10000 + MID_X
              : h.axis === "y" ? mesh.position.y * 10000
                : mesh.position.z * 10000 + MID_Z;
            if (isFinite(coord)) onDragHandleRef.current?.(id, Math.round(coord));
          }
          return;
        }

        if (mesh && mesh.name) {
          const p = panelsRef.current.find((x) => x.id === mesh.name);
          if (p) {
            const rawX = mesh.position.x * 10000 + midX - p.width / 2;
            const rawY = mesh.position.y * 10000 - p.height / 2;
            const rawZ = mesh.position.z * 10000 + midZ - p.depth / 2;

            const snapAngle = (val: number) => {
              const step = Math.PI / 2;
              return Math.round(val / step) * step;
            };
            const rx = snapAngle(mesh.rotation.x);
            const ry = snapAngle(mesh.rotation.y);
            const rz = snapAngle(mesh.rotation.z);

            // RAW coordinates. The stage used to run its own snapBox here, so a drop
            // was snapped twice by two different rules — which is most of why the
            // magnet felt unpredictable. Snapping belongs to whoever owns the model.
            if (isFinite(rawX) && isFinite(rawY) && isFinite(rawZ)) {
              onDragPanelRef.current(mesh.name, Math.round(rawX), Math.round(rawY), Math.round(rawZ), rx, ry, rz);
            }
          }
        }

        // F1 RELEASE: pull the leader, leave the number resting + tappable.
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
            const cur = dRel.axis === "x" ? Math.round(panelMesh.position.x * 10000 + MID_X - pp.width / 2)
              : dRel.axis === "y" ? Math.round(panelMesh.position.y * 10000 - pp.height / 2)
                : Math.round(panelMesh.position.z * 10000 + MID_Z - pp.depth / 2);
            dRel.sign = Math.sign(cur - dRel.startPanel[dRel.axis]) || 1;
          }
          setMoveChip((c) => (c ? { ...c, resting: true } : null));
          clearAutoHide();
          autoHideRef.current = setTimeout(() => {
            if (!moveNumpadRef.current) clearMoveIndicator();
          }, 4000);
        }

        // F3 RELEASE: the gizmo snapped the rotation; pull the wedge, rest the chip.
        if (rotWedgeRef.current) {
          scene.remove(rotWedgeRef.current);
          rotWedgeRef.current.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
          rotWedgeRef.current = null;
          rotWedgeMeshRef.current = null;
        }
        if (rotDragRef.current) {
          setRotChip((c) => (c ? { ...c, resting: true } : null));
          if (rotAutoHideRef.current) clearTimeout(rotAutoHideRef.current);
          rotAutoHideRef.current = setTimeout(() => { if (!rotNumpadRef.current) clearRotIndicator(); }, 4000);
        }
      }
    });
    // All three arrows, always — but the PLANE handles (XY/YZ/XZ) and the centre
    // handle (XYZ/E) move two or three axes in one drag, which is how a panel ends up
    // "nearly" flush. Removing them from the tree beats hiding them: the gizmo
    // recomputes `visible` every frame, so anything still parented comes back.
    const helper = (transformControls as any).getHelper() as THREE.Object3D;
    const twoAxis: THREE.Object3D[] = [];
    helper.traverse((o) => {
      if (["XY", "YZ", "XZ", "XYZ", "XYZE", "E"].includes(o.name)) twoAxis.push(o);
    });
    for (const o of twoAxis) o.parent?.remove(o);

    scene.add(helper);
    transformRef.current = transformControls;

    // ── side handles: grab and drag in ONE gesture ──────────────────────────────
    // Not TransformControls. A gizmo would need attaching first (the extra click) and
    // only reports on release, so the panel could not follow the cursor. This drags a
    // ray against a plane through the handle, reporting every move.
    const dragPlane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const pointerRay = new THREE.Raycaster();
    const setRay = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRay.setFromCamera(new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      ), camera);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (transformControls.dragging) return;
      if (!groupRef.current) return;
      setRay(e);
      const hits = pointerRay.intersectObjects(groupRef.current.children, true);

      // MOVE still has priority over the panel body and empty space. But a hit on a
      // side CUBE is a small, deliberate target, and on a compact panel those cubes
      // sit under the arrows — so a cube hit outranks the gizmo. Anywhere else, the
      // gizmo keeps the gesture.
      const cubeHit = hits.find((i) => i.object.name.startsWith("handle:"));
      if (!cubeHit && transformControls.axis !== null) return;

      // Resizing is deliberately TWO steps: the first press on a side selects it, and
      // only a press on the ALREADY-selected side starts dragging. Nothing about
      // touching the panel body resizes it.
      const onCube = cubeHit;
      if (!onCube) return;
      const id = onCube.object.name.slice("handle:".length);
      const h = (handlesRef.current ?? []).find((x) => x.id === id);
      if (!h) return;

      if (selectedHandleIdRef.current !== id) {
        onSelectHandleRef.current?.(id); // arm this side; no resize yet
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      const anchor = onCube.object.position.clone();

      const axisVec = new THREE.Vector3(+(h.axis === "x"), +(h.axis === "y"), +(h.axis === "z"));
      // A plane that contains the drag axis and faces the camera as squarely as it can.
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const normal = camDir.clone().sub(axisVec.clone().multiplyScalar(camDir.dot(axisVec)));
      if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0); // sighting straight down the axis
      dragPlane.setFromNormalAndCoplanarPoint(normal.normalize(), anchor);

      // Hold the grab offset so the edge does not jump to the cursor on contact.
      const grabbed = pointerRay.ray.intersectPlane(dragPlane, hit)
        ? anchor.dot(axisVec) - hit.dot(axisVec)
        : 0;

      dragRef.current = { id, axisVec, grabOffset: grabbed };

      // F2: begin a size read-out — fix the opposite face, drop a red dashed span.
      const opp = (handlesRef.current ?? []).find((o) => o.axis === h.axis && o.id !== h.id);
      const oppositeCoord = opp ? (h.axis === "x" ? opp.x : h.axis === "y" ? opp.y : opp.z)
        : (h.axis === "x" ? h.x : h.axis === "y" ? h.y : h.z);
      const startCoord = h.axis === "x" ? h.x : h.axis === "y" ? h.y : h.z;
      resizeMetaRef.current = {
        id, axis: h.axis, oppositeCoord,
        sign: Math.sign(startCoord - oppositeCoord) || 1,
        center: { x: h.x, y: h.y, z: h.z },
      };
      if (resizeAutoHideRef.current) { clearTimeout(resizeAutoHideRef.current); resizeAutoHideRef.current = null; }
      if (resizeLeaderRef.current) { scene.remove(resizeLeaderRef.current); resizeLeaderRef.current.geometry.dispose(); resizeLeaderRef.current = null; }
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
      transformControls.enabled = false; // for the duration of this one drag only
      e.stopPropagation();
      e.preventDefault();
    };

    const mm10Vec = (x: number, y: number, z: number) =>
      new THREE.Vector3(mm10ToMeters(x - MID_X), mm10ToMeters(y), mm10ToMeters(z - MID_Z));

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setRay(e);
      if (!pointerRay.ray.intersectPlane(dragPlane, hit)) return;
      const along = hit.dot(d.axisVec) + d.grabOffset;
      const coord = d.axisVec.x ? along * 10000 + MID_X
        : d.axisVec.y ? along * 10000
          : along * 10000 + MID_Z;
      if (!isFinite(coord)) return;
      const live = Math.round(coord);
      onDragHandleRef.current?.(d.id, live);

      // F2 live read-out: span the two faces, show the resulting dimension in a red chip.
      const rm = resizeMetaRef.current;
      const rl = resizeLeaderRef.current;
      if (rm && rl && rm.id === d.id) {
        const c = rm.center;
        let a: THREE.Vector3, b: THREE.Vector3, anchor: { x: number; y: number; z: number };
        if (rm.axis === "x") { a = mm10Vec(rm.oppositeCoord, c.y, c.z); b = mm10Vec(live, c.y, c.z); anchor = { x: (rm.oppositeCoord + live) / 2, y: c.y, z: c.z }; }
        else if (rm.axis === "y") { a = mm10Vec(c.x, rm.oppositeCoord, c.z); b = mm10Vec(c.x, live, c.z); anchor = { x: c.x, y: (rm.oppositeCoord + live) / 2, z: c.z }; }
        else { a = mm10Vec(c.x, c.y, rm.oppositeCoord); b = mm10Vec(c.x, c.y, live); anchor = { x: c.x, y: c.y, z: (rm.oppositeCoord + live) / 2 }; }
        rl.geometry.setFromPoints([a, b]);
        rl.computeLineDistances();
        resizeAnchorRef.current = anchor;
        setResizeChip({ value: Math.abs(live - rm.oppositeCoord), resting: false });
      }
    };

    const onPointerUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      justDraggedRef.current = true; // swallow the click this releases
      controls.enabled = true;
      transformControls.enabled = true;

      // F2 RELEASE: pull the leader, leave the size number resting + tappable.
      if (resizeLeaderRef.current) {
        scene.remove(resizeLeaderRef.current);
        resizeLeaderRef.current.geometry.dispose();
        resizeLeaderRef.current = null;
      }
      if (resizeMetaRef.current) {
        setResizeChip((c) => (c ? { ...c, resting: true } : null));
        if (resizeAutoHideRef.current) clearTimeout(resizeAutoHideRef.current);
        resizeAutoHideRef.current = setTimeout(() => { if (!resizeNumpadRef.current) clearResizeIndicator(); }, 4000);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    camera.position.set(0.8, 0.5, 1.8);
    controls.target.set(0, 0, 0);
    controls.update();

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
      // A handle drag ends in a click; it must not be read as "select something else".
      if (justDraggedRef.current) { justDraggedRef.current = false; return; }

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      if (groupRef.current) {
        const intersects = raycaster.intersectObjects(groupRef.current.children, true);
        const picked = intersects.find((int) => int.object instanceof THREE.Mesh && int.object.name);
        // Handles sit in front of their panel and win the pick — that is what makes
        // "select the side, then drag it" work at all.
        const handleHit = intersects.find(
          (int) => int.object instanceof THREE.Mesh && int.object.name.startsWith("handle:"),
        );
        if (handleHit) {
          onSelectHandleRef.current?.(handleHit.object.name.slice("handle:".length));
        } else if (picked) {
          onSelectHandleRef.current?.(null);
          onSelectPanel(picked.object.name);
        } else {
          // Ask TransformControls which handle is hovered. Raycasting its helper
          // instead always hits the gizmo's huge invisible drag plane, so EVERY
          // click read as "on the gizmo" and nothing could ever be deselected.
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

  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformRef.current;
    if (!scene || !transformControls) return;

    // Bail BEFORE touching the group. During a move-gizmo drag `panels` changes every
    // frame (the host echoes the live position back), so removing the old group here
    // and then returning would make the block — and its edges — vanish for the whole
    // drag. TransformControls moves the attached mesh itself; leave the group intact.
    // A side-handle (resize) drag keeps gizmoDraggingRef false and DOES rebuild every
    // frame — that is what makes the resize follow your finger.
    if (gizmoDraggingRef.current) return;

    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current = null;
    }

    const group = buildBlockGroup(panels, holes, selectedPanelId);

    for (const h of handles ?? []) {
      const isOn = h.id === selectedHandleId;
      // Generous targets: these are the only way to resize now, so they have to be
      // easy to hit. The armed one grows again so it reads as "this is what will move".
      const size = isOn ? 0.05 : 0.035;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color: isOn ? 0x1d4ed8 : 0xf59e0b, roughness: 0.4 }),
      );
      mesh.name = `handle:${h.id}`;
      mesh.position.set(
        mm10ToMeters(h.x - MID_X),
        mm10ToMeters(h.y),
        mm10ToMeters(h.z - MID_Z),
      );
      mesh.renderOrder = 2;
      group.add(mesh);
    }

    if (envelope) {
      // Габарит wireframe. Unnamed on purpose: raycasting picks meshes by name, and
      // the envelope must never be selectable.
      const midX = MID_X, midZ = MID_Z;
      const ew = mm10ToMeters(envelope.w_mm10);
      const eh = mm10ToMeters(envelope.h_mm10);
      const ed = mm10ToMeters(envelope.d_mm10);
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(ew, eh, ed)),
        new THREE.LineBasicMaterial({ color: 0x9aa6b5, transparent: true, opacity: 0.55 }),
      );
      box.position.set(
        mm10ToMeters(envelope.w_mm10 / 2 - midX),
        mm10ToMeters(envelope.h_mm10 / 2),
        mm10ToMeters(envelope.d_mm10 / 2 - midZ),
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

    // The gizmo always belongs to the PANEL: moving and resizing are both live at once,
    // so there is no mode to switch and no handle to arm first. Side handles carry
    // their own drag.
    const target = selectedPanelId ? group.children.find((c) => c.name === selectedPanelId) : undefined;
    if (target && !showTargets) transformControls.attach(target);
    else transformControls.detach();
  }, [panels, holes, selectedPanelId, envelope, handles, selectedHandleId, showTargets]);

  // ── the LIVE layer ──────────────────────────────────────────────────────────
  // Measurement lines, modifier outlines and the rotation disc live in their own
  // group. They change on every frame of a drag; the panels do not. Keeping them in
  // the main group meant the whole scene was torn down and rebuilt ~60×/sec, which is
  // what made a moving panel flash back to its old position.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const live = new THREE.Group();
    for (const o of overlays ?? []) {
      if (o.points.length < 2) continue;
      const pts = o.points.map((p) => new THREE.Vector3(
        mm10ToMeters(p.x - MID_X), mm10ToMeters(p.y), mm10ToMeters(p.z - MID_Z),
      ));
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = o.dashed
        ? new THREE.LineDashedMaterial({ color: o.color, dashSize: 0.012, gapSize: 0.010, transparent: true, opacity: 0.95 })
        : new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.95 });
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
      // A disc is authored in XY (normal +Z); tip it so its normal is the turn axis.
      if (axis === "y") rot.rotation.x = -Math.PI / 2;
      else if (axis === "x") rot.rotation.y = Math.PI / 2;

      // the two axes that did NOT turn, drawn faint (F3 shows them ghosted)
      for (const other of [0, 1]) {
        const faint = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            new THREE.EllipseCurve(0, 0, r * 0.82, r * 0.82, 0, Math.PI * 2, false, 0).getPoints(48),
          ),
          new THREE.LineBasicMaterial({
            color: other === 0 ? 0x22c55e : 0xe5342b, transparent: true, opacity: 0.22,
          }),
        );
        faint.rotation[other === 0 ? "x" : "y"] = Math.PI / 2;
        rot.add(faint);
      }

      // the swept wedge — translucent blue, from 0 to the angle turned
      const sweep = (sweepDeg * Math.PI) / 180;
      if (Math.abs(sweep) > 1e-4) {
        const wedge = new THREE.Mesh(
          new THREE.CircleGeometry(r, 48, sweep < 0 ? sweep : 0, Math.abs(sweep)),
          new THREE.MeshBasicMaterial({
            color: 0x2f8bff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
          }),
        );
        rot.add(wedge);
      }

      // the disc outline
      rot.add(new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2, false, 0).getPoints(64),
        ),
        new THREE.LineBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.85 }),
      ));

      live.add(rot);
    }

    scene.add(live);
    return () => {
      scene.remove(live);
      live.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    };
  }, [overlays, rotationGizmo]);

  // Project every pinned chip to screen space, once per frame, so measurements stay
  // glued to their geometry while the camera moves.
  useEffect(() => {
    let frame = 0;
    const v = new THREE.Vector3();
    const tick = () => {
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) { frame = requestAnimationFrame(tick); return; }
      const rect = renderer.domElement.getBoundingClientRect();
      // Before the ResizeObserver fires the canvas is 0×0 and the projection divides
      // by zero — that produced a NaN `left` on every chip on first paint.
      if (rect.width === 0 || rect.height === 0) { frame = requestAnimationFrame(tick); return; }
      const next: Record<string, { x: number; y: number }> = {};
      const project = (id: string, x: number, y: number, z: number) => {
        v.set(mm10ToMeters(x - MID_X), mm10ToMeters(y), mm10ToMeters(z - MID_Z));
        v.project(camera);
        if (v.z > 1) return; // behind the camera
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
      for (const pin of pinsRef.current) project(`__pin_${pin.id}__`, pin.x, pin.y, pin.z);
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

  // Selecting a different panel drops any lingering F1 read-out — leader, chip, numpad.
  useEffect(() => {
    if (moveLeaderRef.current) {
      sceneRef.current?.remove(moveLeaderRef.current);
      moveLeaderRef.current.geometry.dispose();
      moveLeaderRef.current = null;
    }
    if (autoHideRef.current) { clearTimeout(autoHideRef.current); autoHideRef.current = null; }
    moveDragRef.current = null;
    moveAnchorRef.current = null;
    setMoveChip(null);
    setMoveNumpad(null);
    // F2 read-out too.
    if (resizeLeaderRef.current) {
      sceneRef.current?.remove(resizeLeaderRef.current);
      resizeLeaderRef.current.geometry.dispose();
      resizeLeaderRef.current = null;
    }
    if (resizeAutoHideRef.current) { clearTimeout(resizeAutoHideRef.current); resizeAutoHideRef.current = null; }
    resizeMetaRef.current = null;
    resizeAnchorRef.current = null;
    setResizeChip(null);
    setResizeNumpad(null);
    // F3 read-out too.
    if (rotWedgeRef.current) {
      sceneRef.current?.remove(rotWedgeRef.current);
      rotWedgeRef.current.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      rotWedgeRef.current = null;
      rotWedgeMeshRef.current = null;
    }
    if (rotAutoHideRef.current) { clearTimeout(rotAutoHideRef.current); rotAutoHideRef.current = null; }
    rotDragRef.current = null;
    rotAnchorRef.current = null;
    setRotChip(null);
    setRotNumpad(null);
    setPickedPin(null);
    setRound(null);
    setRoundNumpad(false);
  }, [selectedPanelId]);

  // Leaving modifier mode drops any open round editor.
  useEffect(() => {
    if (!showTargets) { setRound(null); setRoundNumpad(false); setPickedPin(null); }
  }, [showTargets]);

  // F03 arc guide — grey quarter-circles: the rounds already applied to this panel
  // (persistent, so a re-selected panel still shows them) plus the one being edited
  // right now, whose live radius wins over any applied value on the same corner.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const sel = panels.find((p) => p.id === selectedPanelId) || null;
    const mat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.95 });
    mat.depthTest = false;
    let grp: THREE.Group | null = null;
    if (sel) {
      const editing = new Set(round ? round.corners : []);
      const draw: { cid: string; r: number }[] = [];
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
        grp.traverse((o) => { const m = o as THREE.Line; if (m.geometry) m.geometry.dispose(); });
      }
      mat.dispose();
      if (roundArcGroupRef.current === grp) roundArcGroupRef.current = null;
    };
  }, [round, appliedRounds, panels, selectedPanelId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {(annotations ?? []).map((a) => {
        const p = annPos[a.id];
        if (!p) return null;
        return (
          <div key={a.id} className="stage-annotation" style={{ left: p.x, top: p.y }}>
            {a.node}
          </div>
        );
      })}
      {moveChip && annPos["__move__"] && (
        <div className="stage-annotation" style={{ left: annPos["__move__"].x, top: annPos["__move__"].y }}>
          <MeasureChip
            value={moveChip.value}
            tone="live"
            live={!moveChip.resting}
            title={moveChip.kind === "height" ? "Высота над полом" : "Сдвиг"}
            onEdit={
              moveChip.resting
                ? () => { clearAutoHide(); setMoveNumpad({ value: moveChip.value, label: moveChip.kind === "height" ? "Высота, см" : "Сдвиг, см" }); }
                : undefined
            }
          />
        </div>
      )}
      {resizeChip && annPos["__resize__"] && (
        <div className="stage-annotation" style={{ left: annPos["__resize__"].x, top: annPos["__resize__"].y }}>
          <MeasureChip
            value={resizeChip.value}
            tone="size"
            live={!resizeChip.resting}
            title="Размер"
            onEdit={
              resizeChip.resting
                ? () => { if (resizeAutoHideRef.current) clearTimeout(resizeAutoHideRef.current); setResizeNumpad({ value: resizeChip.value }); }
                : undefined
            }
          />
        </div>
      )}
      {rotChip && annPos["__rot__"] && (
        <div className="stage-annotation" style={{ left: annPos["__rot__"].x, top: annPos["__rot__"].y }}>
          <MeasureChip
            value={rotChip.value}
            tone="angle"
            unit="deg"
            live={!rotChip.resting}
            title="Угол поворота"
            onEdit={
              rotChip.resting
                ? () => { if (rotAutoHideRef.current) clearTimeout(rotAutoHideRef.current); setRotNumpad({ value: rotChip.value }); }
                : undefined
            }
          />
        </div>
      )}
      {pins.map((pin) => {
        const pos = annPos[`__pin_${pin.id}__`];
        if (!pos) return null;
        const r = cornerRadius(pin.id);
        const rounded = r > 0;
        const rot = cornerRotation(pos.x, pos.y);
        return (
          <button
            key={pin.id}
            className={`target-pin${rounded ? " rounded" : ""}${pickedPin === pin.id ? " on" : ""}`}
            style={{ left: pos.x, top: pos.y }}
            onClick={() => { setPickedPin(pin.id); onPickTargetRef.current?.(pin.id); openRound(pin.id); }}
            title={rounded ? "Скруглённый угол — нажмите, чтобы изменить" : "Скруглить этот угол"}
          >
            <svg className="tp-corner" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${rot}deg)` }}>
              <path d="M6 18 L6 11 A5 5 0 0 1 11 6 L18 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {rounded ? <span className="tp-radius">{toCm(r)}</span> : <span className="tp-plus">+</span>}
          </button>
        );
      })}
      {round && pickedPin && annPos[`__pin_${pickedPin}__`] && (
        <div
          className="round-editor"
          style={{ left: annPos[`__pin_${pickedPin}__`]!.x, top: annPos[`__pin_${pickedPin}__`]!.y - 52 }}
        >
          <button
            className={`re-link${round.linked ? " on" : ""}`}
            onClick={toggleRoundLink}
            title={round.linked ? "4 угла связаны — нажмите, чтобы разъединить" : "Связать все 4 угла одним радиусом"}
          >🔗</button>
          <MeasureChip value={round.radius} tone="radius" onEdit={() => setRoundNumpad(true)} title="Радиус угла" />
          <button className="re-drag" onPointerDown={startRoundDrag} title="Тяните вбок, чтобы менять радиус">↔</button>
          <button className="re-ok" onClick={applyRound} title="Применить">✓</button>
          <button className="re-del" onClick={deleteRound} title="Удалить">✕</button>
        </div>
      )}
      {selectedPanel && (
        <div className="floating-dims-card" style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", background: "white", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", border: "1px solid #e5e7eb", display: "flex", gap: "24px", zIndex: 10 }}>
          <div className="float-field">
            <span className="float-lbl">En (X)</span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.width))}
              readOnly={lockedDims?.includes("width")}
              onChange={(e) => onUpdateDim("width", Number(e.target.value) || 0)}
            />
          </div>
          <div className="float-field">
            <span className="float-lbl">Bo'y (Y)</span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.height))}
              readOnly={lockedDims?.includes("height")}
              onChange={(e) => onUpdateDim("height", Number(e.target.value) || 0)}
            />
          </div>
          <div className="float-field">
            <span className="float-lbl">
              {lockedDims?.includes("depth") ? "Толщина ← профиль" : "Chuqurlik (Z)"}
            </span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.depth))}
              readOnly={lockedDims?.includes("depth")}
              onChange={(e) => onUpdateDim("depth", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      )}
      {moveNumpad && (
        <Numpad
          initial={moveNumpad.value}
          label={moveNumpad.label}
          mode="cm"
          onCommit={commitMove}
          onCancel={() => { setMoveNumpad(null); clearMoveIndicator(); }}
        />
      )}
      {resizeNumpad && (
        <Numpad
          initial={resizeNumpad.value}
          label="Размер, см"
          mode="cm"
          onCommit={commitResize}
          onCancel={() => { setResizeNumpad(null); clearResizeIndicator(); }}
        />
      )}
      {rotNumpad && (
        <Numpad
          initial={rotNumpad.value}
          label="Угол, °"
          mode="deg"
          onCommit={commitRot}
          onCancel={() => { setRotNumpad(null); clearRotIndicator(); }}
        />
      )}
      {roundNumpad && round && (
        <Numpad
          initial={round.radius}
          label="Радиус, см"
          mode="cm"
          onCommit={(v) => { setRound((r) => (r ? { ...r, radius: v } : r)); setRoundNumpad(false); }}
          onCancel={() => setRoundNumpad(false)}
        />
      )}
    </div>
  );
}
