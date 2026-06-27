// Editable 2D floor plan (IKEA-style). Tap a wall to select it (highlights it,
// shows that wall + the next one with inside & outside dims, hides the rest).
// Drag corners / wall edges to reshape; drag a door/window onto any wall; tap any
// dimension number to edit it inline. Pinch / wheel / drag to zoom & pan (the
// room scales; labels stay a constant on-screen size).
import { useEffect, useRef, useState } from "react";
import {
  polygonBoundsMm,
  offsetPolygon,
  centroidOf,
  openingSpan,
  wallSegments,
  type Pt,
  type Opening,
  type Fitting,
} from "../model/room";
import { subAreas } from "../model/subareas";

const T = 100; // wall thickness (mm)
const MARGIN = 1500;
const FONT = 160;
const IN_OFF = 300;
const OUT_OFF = 380;

const len = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";

function outwardNormal(a: Pt, b: Pt, c: Pt) {
  let nx = b.y - a.y;
  let ny = -(b.x - a.x);
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((mx - c.x) * nx + (my - c.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

function dim(key: string, a: Pt, b: Pt, nx: number, ny: number, off: number, label: string, s: number, strong: boolean, onEdit: (x: number, y: number) => void) {
  const e1 = { x: a.x + nx * off * s, y: a.y + ny * off * s };
  const e2 = { x: b.x + nx * off * s, y: b.y + ny * off * s };
  const mx = (e1.x + e2.x) / 2;
  const my = (e1.y + e2.y) / 2;
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  const F = FONT * s;
  const chipW = label.length * F * 0.58 + 90 * s;
  const chipH = F + 70 * s;
  const tx = nx * 50 * s;
  const ty = ny * 50 * s;
  const col = strong ? "#2a6df0" : "#333";
  return (
    <g key={key}>
      <g pointerEvents="none">
        <line x1={a.x} y1={a.y} x2={e1.x} y2={e1.y} stroke="#a8a8a8" strokeWidth={4 * s} />
        <line x1={b.x} y1={b.y} x2={e2.x} y2={e2.y} stroke="#a8a8a8" strokeWidth={4 * s} />
        <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={col} strokeWidth={5 * s} />
        <line x1={e1.x - tx} y1={e1.y - ty} x2={e1.x + tx} y2={e1.y + ty} stroke={col} strokeWidth={5 * s} />
        <line x1={e2.x - tx} y1={e2.y - ty} x2={e2.x + tx} y2={e2.y + ty} stroke={col} strokeWidth={5 * s} />
      </g>
      <g transform={`translate(${mx} ${my}) rotate(${ang})`} style={{ cursor: "pointer" }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => onEdit(e.clientX, e.clientY)}>
        <rect x={-chipW / 2} y={-chipH / 2} width={chipW} height={chipH} rx={30 * s} fill="#fff" stroke={strong ? "#2a6df0" : "#d6d6d6"} strokeWidth={(strong ? 8 : 5) * s} />
        <text x={0} y={F * 0.34} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={F} fontWeight={strong ? 600 : 400} fill="#222">
          {label}
        </text>
      </g>
    </g>
  );
}

function openingSymbol(kind: Opening["kind"], p1: Pt, p2: Pt, nx: number, ny: number, width: number, coveringColor: string, flip?: boolean) {
  if (kind === "window") {
    return (
      <g pointerEvents="none">
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={T + 8} />
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8fc7e8" strokeWidth={26} />
      </g>
    );
  }
  if (kind === "opening") {
    // a rectangular hole through the wall: the floor shows through the cut, and
    // only the two jamb faces (short sides) are drawn — the wall opens up here
    const q1 = { x: p1.x - nx * (T + 4), y: p1.y - ny * (T + 4) };
    const q2 = { x: p2.x - nx * (T + 4), y: p2.y - ny * (T + 4) };
    const o1 = { x: p1.x + nx * 4, y: p1.y + ny * 4 };
    const o2 = { x: p2.x + nx * 4, y: p2.y + ny * 4 };
    const poly = `${o1.x},${o1.y} ${o2.x},${o2.y} ${q2.x},${q2.y} ${q1.x},${q1.y}`;
    return (
      <g pointerEvents="none">
        <polygon points={poly} fill={coveringColor} />
        <polygon points={poly} fill="url(#planks)" />
        <line x1={o1.x} y1={o1.y} x2={q1.x} y2={q1.y} stroke="#8a8a8a" strokeWidth={16} strokeLinecap="round" />
        <line x1={o2.x} y1={o2.y} x2={q2.x} y2={q2.y} stroke="#8a8a8a" strokeWidth={16} strokeLinecap="round" />
      </g>
    );
  }
  const ax = -nx;
  const ay = -ny;
  // hinge on p1 by default; flip puts it on p2
  const h = flip ? p2 : p1;
  const sweep = flip ? 0 : 1;
  const o = flip ? p1 : p2;
  return (
    <g pointerEvents="none">
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={T + 8} />
      <line x1={h.x} y1={h.y} x2={h.x + ax * width} y2={h.y + ay * width} stroke="#8a8a8a" strokeWidth={10} />
      <path d={`M${h.x + ax * width} ${h.y + ay * width} A${width} ${width} 0 0 ${sweep} ${o.x} ${o.y}`} fill="none" stroke="#8a8a8a" strokeWidth={8} />
    </g>
  );
}

// A wall fitting drawn at a constant on-screen size (uses *s like the corner
// handles) so it stays tappable at any zoom. Glyph varies by category/kind:
// sockets & switches (electric), a finned radiator (heating), a grille (vent).
function fittingSymbol(it: Fitting, cx: number, cy: number, ang: number, s: number, selected: boolean) {
  const stroke = selected ? "#2a6df0" : "#6f6f6f";
  const sw = (selected ? 22 : 13) * s;
  let glyph: React.ReactNode;
  let W: number;
  const H = 230 * s;

  if (it.category === "heating") {
    W = 470 * s; // radiators read wider
    const fins = 5;
    glyph = Array.from({ length: fins }, (_, i) => {
      const x = (-W / 2 + (W / (fins + 1)) * (i + 1));
      return <line key={i} x1={x} y1={-72 * s} x2={x} y2={72 * s} stroke={stroke} strokeWidth={14 * s} strokeLinecap="round" />;
    });
  } else if (it.category === "vent") {
    W = 280 * s;
    glyph = (
      <>
        <line x1={-70 * s} y1={-50 * s} x2={70 * s} y2={-50 * s} stroke={stroke} strokeWidth={13 * s} strokeLinecap="round" />
        <line x1={-70 * s} y1={0} x2={70 * s} y2={0} stroke={stroke} strokeWidth={13 * s} strokeLinecap="round" />
        <line x1={-70 * s} y1={50 * s} x2={70 * s} y2={50 * s} stroke={stroke} strokeWidth={13 * s} strokeLinecap="round" />
      </>
    );
  } else {
    W = 300 * s;
    const isSwitch = it.kind.startsWith("switch");
    const dbl = it.kind.endsWith("2");
    glyph = isSwitch ? (
      <>
        <rect x={(dbl ? -110 : -46) * s} y={-78 * s} width={(dbl ? 96 : 92) * s} height={156 * s} rx={20 * s} fill="none" stroke={stroke} strokeWidth={14 * s} />
        {dbl && <rect x={14 * s} y={-78 * s} width={96 * s} height={156 * s} rx={20 * s} fill="none" stroke={stroke} strokeWidth={14 * s} />}
      </>
    ) : (
      <>
        <circle cx={(dbl ? -120 : -52) * s} cy={0} r={26 * s} fill={stroke} />
        <circle cx={(dbl ? -56 : 52) * s} cy={0} r={26 * s} fill={stroke} />
        {dbl && <circle cx={56 * s} cy={0} r={26 * s} fill={stroke} />}
        {dbl && <circle cx={120 * s} cy={0} r={26 * s} fill={stroke} />}
      </>
    );
  }

  return (
    <g transform={`translate(${cx} ${cy}) rotate(${ang})`} pointerEvents="none">
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={46 * s} fill="#fff" stroke={stroke} strokeWidth={sw} />
      {glyph}
    </g>
  );
}

// A blue faucet/droplet marker at the inner face of the chosen water-supply wall.
function waterMarker(cx: number, cy: number, r: number) {
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill="#2a6df0" />
      <path
        d={`M${cx} ${cy - r * 0.52} C ${cx + r * 0.6} ${cy - r * 0.05} ${cx + r * 0.42} ${cy + r * 0.5} ${cx} ${cy + r * 0.5} C ${cx - r * 0.42} ${cy + r * 0.5} ${cx - r * 0.6} ${cy - r * 0.05} ${cx} ${cy - r * 0.52} Z`}
        fill="#fff"
      />
    </g>
  );
}

type Drag =
  | { kind: "corner"; i: number; cx0: number; cy0: number; committed: boolean }
  | { kind: "wall"; i: number; oa: Pt; ob: Pt; nx: number; ny: number; sx: number; sy: number; cx0: number; cy0: number; moved: boolean; committed: boolean }
  | { kind: "opening"; id: string; cx0: number; cy0: number; moved: boolean; committed: boolean }
  | { kind: "fitting"; id: string; cx0: number; cy0: number; moved: boolean; committed: boolean }
  | { kind: "draft"; pi: number; cx0: number; cy0: number }
  | { kind: "interior"; wi: number; pi: number; cx0: number; cy0: number; committed: boolean }
  | { kind: "iwall"; g: number; cx0: number; cy0: number; moved: boolean };

export function FloorPlan({
  points,
  openings,
  selectedWall,
  coveringColor,
  roomName,
  interiorWalls,
  fittings,
  selectedFitting,
  selectedOpening,
  waterWall,
  addWall,
  draft,
  onAddPoint,
  onMoveDraftPoint,
  onMoveInteriorPoint,
  onEditName,
  onSelectWall,
  onSelectFloor,
  onSelectFitting,
  onDragFittingTo,
  onMoveFitting,
  onSetFittingWidth,
  onSelectOpening,
  onSetDrawnWallLength,
  onMoveCorner,
  onMoveWall,
  onDragOpeningTo,
  onBeginEdit,
  onSetWallLength,
  onMoveOpening,
  onSetOpeningWidth,
  onEditNumber,
}: {
  points: Pt[];
  openings: Opening[];
  selectedWall: number | null;
  coveringColor: string;
  roomName: string;
  interiorWalls: Pt[][];
  fittings: Fitting[];
  selectedFitting: string | null;
  selectedOpening: string | null;
  waterWall: number | null;
  addWall: boolean;
  draft: Pt[];
  onAddPoint: (x: number, y: number) => void;
  onMoveDraftPoint: (pi: number, x: number, y: number) => void;
  onMoveInteriorPoint: (wi: number, pi: number, x: number, y: number) => void;
  onEditName: (clientX: number, clientY: number) => void;
  onSelectWall: (i: number | null) => void;
  onSelectFloor: () => void;
  onSelectFitting: (id: string | null) => void;
  onDragFittingTo: (id: string, x: number, y: number) => void;
  onMoveFitting: (id: string, t: number) => void;
  onSetFittingWidth: (id: string, width: number) => void;
  onSelectOpening: (id: string | null) => void;
  onSetDrawnWallLength: (globalSeg: number, length: number) => void;
  onMoveCorner: (i: number, x: number, y: number) => void;
  onMoveWall: (i: number, a: Pt, b: Pt) => void;
  onDragOpeningTo: (id: string, x: number, y: number) => void;
  onBeginEdit: () => void;
  onSetWallLength: (i: number, length: number, endpoint: "a" | "b") => void;
  onMoveOpening: (id: string, t: number) => void;
  onSetOpeningWidth: (id: string, width: number) => void;
  onEditNumber: (clientX: number, clientY: number, value: number, apply: (v: number) => void) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinchD = useRef(0);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);

  const fit = () => {
    const b = polygonBoundsMm(points);
    return { x: b.minX - MARGIN, y: b.minY - MARGIN, w: b.w + 2 * MARGIN, h: b.h + 2 * MARGIN };
  };
  const [vb, setVb] = useState(fit);
  const baseW = useRef(vb.w);
  useEffect(() => {
    const f = fit();
    baseW.current = f.w;
    setVb(f);
  }, [points.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = vb.w / baseW.current;

  const n = points.length;
  const c = centroidOf(points);
  const inner = offsetPolygon(points, T);
  const selW = selectedWall != null && selectedWall < n ? selectedWall : null;
  // all wall segments (room edges + drawn-wall segments) an item can attach to
  const segs = wallSegments(points, interiorWalls);
  const segEnds = (wall: number): { a: Pt; b: Pt } => segs[wall] ?? { a: points[0], b: points[0] };

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };
  const commit = (dr: { committed: boolean }) => {
    if (!dr.committed) {
      onBeginEdit();
      dr.committed = true;
    }
  };

  // magnet: snap a dragged corner so adjacent walls hit 90° (axis) or 45° (diagonal)
  const snapCorner = (i: number, x0: number, y0: number) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const SNAP = 170 * s;
    let x = x0;
    let y = y0;
    if (Math.abs(x - prev.x) < SNAP) x = prev.x;
    else if (Math.abs(x - next.x) < SNAP) x = next.x;
    if (Math.abs(y - prev.y) < SNAP) y = prev.y;
    else if (Math.abs(y - next.y) < SNAP) y = next.y;
    for (const nb of [prev, next]) {
      const dx = x - nb.x;
      const dy = y - nb.y;
      if (Math.abs(dx) > 5 && Math.abs(dy) > 5 && Math.abs(Math.abs(dx) - Math.abs(dy)) < SNAP) {
        const m = (Math.abs(dx) + Math.abs(dy)) / 2;
        x = nb.x + Math.sign(dx) * m;
        y = nb.y + Math.sign(dy) * m;
        break;
      }
    }
    return { x, y };
  };

  const snap100 = (v: number) => Math.round(v / 100) * 100;
  // snap to a room corner or onto the nearest wall edge (null if far)
  const snapRoomOnly = (x: number, y: number): Pt | null => {
    const SNAP = 300 * s;
    for (const p of points) if (Math.hypot(x - p.x, y - p.y) < SNAP) return { x: p.x, y: p.y };
    let bx = x;
    let by = y;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < bd) {
        bd = d;
        bx = px;
        by = py;
      }
    }
    return bd < SNAP ? { x: snap100(bx), y: snap100(by) } : null;
  };
  const snapToRoom = (x: number, y: number) => snapRoomOnly(x, y) ?? { x: snap100(x), y: snap100(y) };
  // add-wall: draft-start / corner / edge, plus a 90°/45° lock from the last point
  const snapAdd = (x: number, y: number) => {
    if (draft.length >= 2 && Math.hypot(x - draft[0].x, y - draft[0].y) < 220 * s) return { x: draft[0].x, y: draft[0].y };
    const r = snapRoomOnly(x, y);
    if (r) return r;
    if (draft.length >= 1) {
      const last = draft[draft.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.PI / 4;
        const ang = Math.atan2(dy, dx);
        const snapAng = Math.round(ang / step) * step;
        let diff = Math.abs(ang - snapAng);
        diff = Math.min(diff, 2 * Math.PI - diff);
        if (diff < 0.2) return { x: snap100(last.x + Math.cos(snapAng) * dist), y: snap100(last.y + Math.sin(snapAng) * dist) };
      }
    }
    return { x: snap100(x), y: snap100(y) };
  };

  const onCornerDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "corner", i, cx0: e.clientX, cy0: e.clientY, committed: false };
    setActiveCorner(i);
  };
  const onWallDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const a = points[i];
    const b = points[(i + 1) % n];
    const nn = outwardNormal(a, b, c);
    const p = toSvg(e.clientX, e.clientY);
    dragRef.current = { kind: "wall", i, oa: a, ob: b, nx: nn.nx, ny: nn.ny, sx: p.x, sy: p.y, cx0: e.clientX, cy0: e.clientY, moved: false, committed: false };
  };
  const onOpeningDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "opening", id, cx0: e.clientX, cy0: e.clientY, moved: false, committed: false };
  };
  const onFittingDown = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "fitting", id, cx0: e.clientX, cy0: e.clientY, moved: false, committed: false };
  };
  const onDraftDown = (pi: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "draft", pi, cx0: e.clientX, cy0: e.clientY };
  };
  const onInteriorDown = (wi: number, pi: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "interior", wi, pi, cx0: e.clientX, cy0: e.clientY, committed: false };
  };
  const onIWallDown = (g: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = { kind: "iwall", g, cx0: e.clientX, cy0: e.clientY, moved: false };
  };

  const twoDist = () => {
    const v = [...ptrs.current.values()];
    return Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y);
  };
  const twoMid = () => {
    const v = [...ptrs.current.values()];
    return { x: (v[0].x + v[1].x) / 2, y: (v[0].y + v[1].y) / 2 };
  };
  const zoomAt = (cx: number, cy: number, factor: number) => {
    const p = toSvg(cx, cy);
    setVb((v) => {
      const fx = (p.x - v.x) / v.w;
      const fy = (p.y - v.y) / v.h;
      const nw = Math.min(60000, Math.max(1200, v.w * factor));
      const nh = nw * (v.h / v.w);
      return { x: p.x - fx * nw, y: p.y - fy * nh, w: nw, h: nh };
    });
  };

  // pan / pinch live on the svg; corner/wall/opening presses stopPropagation
  const onDown = (e: React.PointerEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (ptrs.current.size === 2) pinchD.current = twoDist();
  };
  const onMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (dr) {
      if (Math.hypot(e.clientX - dr.cx0, e.clientY - dr.cy0) <= 4) return;
      const p = toSvg(e.clientX, e.clientY);
      if (dr.kind === "corner") {
        commit(dr);
        const sp = snapCorner(dr.i, p.x, p.y);
        onMoveCorner(dr.i, sp.x, sp.y);
      } else if (dr.kind === "wall") {
        commit(dr);
        dr.moved = true;
        const proj = (p.x - dr.sx) * dr.nx + (p.y - dr.sy) * dr.ny;
        onMoveWall(dr.i, { x: dr.oa.x + dr.nx * proj, y: dr.oa.y + dr.ny * proj }, { x: dr.ob.x + dr.nx * proj, y: dr.ob.y + dr.ny * proj });
      } else if (dr.kind === "opening") {
        commit(dr);
        dr.moved = true;
        onDragOpeningTo(dr.id, p.x, p.y);
      } else if (dr.kind === "fitting") {
        commit(dr);
        dr.moved = true;
        onDragFittingTo(dr.id, p.x, p.y);
      } else if (dr.kind === "draft") {
        const sp = snapToRoom(p.x, p.y);
        onMoveDraftPoint(dr.pi, sp.x, sp.y);
      } else if (dr.kind === "iwall") {
        dr.moved = true; // tap selects; vertices handle reshaping
      } else {
        commit(dr);
        const sp = snapToRoom(p.x, p.y);
        onMoveInteriorPoint(dr.wi, dr.pi, sp.x, sp.y);
      }
      return;
    }
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size >= 2) {
      const nd = twoDist();
      if (pinchD.current > 0) {
        const m = twoMid();
        zoomAt(m.x, m.y, pinchD.current / (nd || 1));
      }
      pinchD.current = nd;
    } else {
      const rect = svgRef.current!.getBoundingClientRect();
      const k = vb.w / (rect.width || 1);
      setVb((v) => ({ ...v, x: v.x - (e.clientX - prev.x) * k, y: v.y - (e.clientY - prev.y) * k }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (dr) {
      if (dr.kind === "wall" && !dr.moved) onSelectWall(dr.i);
      if (dr.kind === "fitting" && !dr.moved) onSelectFitting(dr.id);
      if (dr.kind === "opening" && !dr.moved) onSelectOpening(dr.id);
      if (dr.kind === "iwall" && !dr.moved) onSelectWall(dr.g);
      dragRef.current = null;
      setActiveCorner(null);
      return;
    }
    const moved = downPos.current ? Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) : 99;
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchD.current = 0;
    if (addWall && ptrs.current.size === 0 && moved < 6) {
      const p = toSvg(e.clientX, e.clientY);
      const sp = snapAdd(p.x, p.y);
      onAddPoint(sp.x, sp.y);
    }
    downPos.current = null;
  };
  const onWheel = (e: React.WheelEvent) => zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 0.9);

  const wallApply = (i: number, diff: number) => (v: number) => {
    onBeginEdit();
    onSetWallLength(i, v + diff, "b");
  };
  const gapApply = (op: Opening, side: "left" | "right") => (v: number) => {
    onBeginEdit();
    const a = points[op.wall];
    const b = points[(op.wall + 1) % n];
    const wl = len(a, b) || 1;
    onMoveOpening(op.id, side === "left" ? (v + op.width / 2) / wl : 1 - (v + op.width / 2) / wl);
  };
  const widthApply = (op: Opening) => (v: number) => {
    onBeginEdit();
    onSetOpeningWidth(op.id, v);
  };

  // left-gap / width / right-gap chips for a selected wall item (opening or fitting)
  const itemGapDims = (wall: number, t: number, width: number, moveTo: (t: number) => void, setWidth: (w: number) => void): React.ReactNode[] => {
    if (wall >= segs.length) return [];
    const { a, b } = segEnds(wall);
    const nn = outwardNormal(a, b, c);
    const sp = openingSpan(a, b, t, width);
    const wl = len(a, b) || 1;
    const lg = Math.round(len(a, sp.p1));
    const rg = Math.round(len(sp.p2, b));
    const moveLeft = (v: number) => { onBeginEdit(); moveTo((v + width / 2) / wl); };
    const moveRight = (v: number) => { onBeginEdit(); moveTo(1 - (v + width / 2) / wl); };
    const applyW = (v: number) => { onBeginEdit(); setWidth(v); };
    return [
      dim("sgl", a, sp.p1, -nn.nx, -nn.ny, IN_OFF, `${lg} мм`, s, false, (x, y) => onEditNumber(x, y, lg, moveLeft)),
      dim("sgw", sp.p1, sp.p2, -nn.nx, -nn.ny, IN_OFF, `${width} мм`, s, false, (x, y) => onEditNumber(x, y, width, applyW)),
      dim("sgr", sp.p2, b, -nn.nx, -nn.ny, IN_OFF, `${rg} мм`, s, false, (x, y) => onEditNumber(x, y, rg, moveRight)),
    ];
  };

  const selOpening = selectedOpening ? openings.find((o) => o.id === selectedOpening) : undefined;
  const selFitting = selectedFitting ? fittings.find((f) => f.id === selectedFitting) : undefined;
  // a selected drawn-wall segment (global index >= room edge count)
  const selDrawnSeg = selectedWall != null && selectedWall >= n && selectedWall < segs.length ? selectedWall : null;

  const openingByWall = new Map<number, Opening>();
  openings.forEach((o) => {
    if (!openingByWall.has(o.wall)) openingByWall.set(o.wall, o);
  });

  const dims: React.ReactNode[] = [];
  if (selOpening) {
    dims.push(...itemGapDims(selOpening.wall, selOpening.t, selOpening.width, (t) => onMoveOpening(selOpening.id, t), (w) => onSetOpeningWidth(selOpening.id, w)));
  } else if (selFitting) {
    dims.push(...itemGapDims(selFitting.wall, selFitting.t, selFitting.width, (t) => onMoveFitting(selFitting.id, t), (w) => onSetFittingWidth(selFitting.id, w)));
  } else if (selDrawnSeg != null) {
    // mirror a room wall: show the wall's two faces (inside + outside), both editable
    const { a, b } = segEnds(selDrawnSeg);
    const nn = outwardNormal(a, b, c);
    const apply = (v: number) => {
      onBeginEdit();
      onSetDrawnWallLength(selDrawnSeg, v);
    };
    const oa = { x: a.x + nn.nx * (T / 2), y: a.y + nn.ny * (T / 2) };
    const ob = { x: b.x + nn.nx * (T / 2), y: b.y + nn.ny * (T / 2) };
    const ia = { x: a.x - nn.nx * (T / 2), y: a.y - nn.ny * (T / 2) };
    const ib = { x: b.x - nn.nx * (T / 2), y: b.y - nn.ny * (T / 2) };
    const ol = Math.round(len(oa, ob));
    const il = Math.round(len(ia, ib));
    dims.push(dim("dwo", oa, ob, nn.nx, nn.ny, OUT_OFF, `${ol} мм`, s, true, (x, y) => onEditNumber(x, y, ol, apply)));
    dims.push(dim("dwi", ia, ib, -nn.nx, -nn.ny, IN_OFF, `${il} мм`, s, true, (x, y) => onEditNumber(x, y, il, apply)));
  } else if (selW != null) {
    for (const i of [selW, (selW + 1) % n]) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const ia = inner[i];
      const ib = inner[(i + 1) % n];
      const nn = outwardNormal(a, b, c);
      const outer = Math.round(len(a, b));
      const ins = Math.round(len(ia, ib));
      const strong = i === selW;
      dims.push(dim(`out${i}`, a, b, nn.nx, nn.ny, OUT_OFF, `${outer} мм`, s, strong, (x, y) => onEditNumber(x, y, outer, wallApply(i, 0))));
      dims.push(dim(`in${i}`, ia, ib, -nn.nx, -nn.ny, IN_OFF, `${ins} мм`, s, strong, (x, y) => onEditNumber(x, y, ins, wallApply(i, outer - ins))));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      const nn = outwardNormal(a, b, c);
      const op = openingByWall.get(i);
      if (op) {
        const sp = openingSpan(a, b, op.t, op.width);
        const lg = Math.round(len(a, sp.p1));
        const rg = Math.round(len(sp.p2, b));
        dims.push(dim(`gl${i}`, a, sp.p1, -nn.nx, -nn.ny, IN_OFF, `${lg} мм`, s, false, (x, y) => onEditNumber(x, y, lg, gapApply(op, "left"))));
        dims.push(dim(`gw${i}`, sp.p1, sp.p2, -nn.nx, -nn.ny, IN_OFF, `${op.width} мм`, s, false, (x, y) => onEditNumber(x, y, op.width, widthApply(op))));
        dims.push(dim(`gr${i}`, sp.p2, b, -nn.nx, -nn.ny, IN_OFF, `${rg} мм`, s, false, (x, y) => onEditNumber(x, y, rg, gapApply(op, "right"))));
      } else {
        const wl = Math.round(len(a, b));
        dims.push(dim(`wl${i}`, a, b, -nn.nx, -nn.ny, IN_OFF, `${wl} мм`, s, false, (x, y) => onEditNumber(x, y, wl, wallApply(i, 0))));
      }
    }
    // drawn-wall segment lengths — measure the inside of any sections you've drawn
    let gseg = n;
    interiorWalls.forEach((poly) => {
      for (let si = 0; si < poly.length - 1; si++) {
        const g = gseg++;
        const a = poly[si];
        const b = poly[si + 1];
        if (len(a, b) < 1) continue;
        const nn = outwardNormal(a, b, c);
        const wl = Math.round(len(a, b));
        const apply = (v: number) => {
          onBeginEdit();
          onSetDrawnWallLength(g, v);
        };
        dims.push(dim(`iwl${g}`, a, b, -nn.nx, -nn.ny, IN_OFF, `${wl} мм`, s, false, (x, y) => onEditNumber(x, y, wl, apply)));
      }
    });
  }

  const d = path(points);
  const dInner = path(inner);
  let area = 0;
  for (let i = 0; i < n; i++) area += points[i].x * points[(i + 1) % n].y - points[(i + 1) % n].x * points[i].y;
  const m2 = Math.round((Math.abs(area) / 2 / 1e6) * 10) / 10;

  return (
    <svg
      ref={svgRef}
      className="floor-plan"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
    >
      <defs>
        <pattern id="planks" width="640" height="170" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="640" y2="0" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="0" y1="85" x2="640" y2="85" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="320" y1="0" x2="320" y2="85" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
          <line x1="160" y1="85" x2="160" y2="170" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
          <line x1="480" y1="85" x2="480" y2="170" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* pan / deselect surface */}
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" onClick={() => onSelectWall(null)} />

      <g pointerEvents="none">
        <path d={`${d} ${dInner}`} fillRule="evenodd" fill="#d6d6d6" />
        <path d={dInner} fill={coveringColor} />
        <path d={dInner} fill="url(#planks)" />
        <path d={d} fill="none" stroke="#b4b4b4" strokeWidth={6} />
        <path d={dInner} fill="none" stroke="#c7c7c7" strokeWidth={4} />
        {interiorWalls.map((poly, wi) => {
          const pp = poly.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={`iw${wi}`}>
              {/* match the room wall band; square corners (miter) + square caps so
                  corners are complete and the ends meet the room wall cleanly */}
              <polyline points={pp} fill="none" stroke="#d6d6d6" strokeWidth={T} strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit={6} />
              <polyline points={pp} fill="none" stroke="#b4b4b4" strokeWidth={5} strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit={6} />
            </g>
          );
        })}
        {openings.map((o) => {
          const { a, b } = segEnds(o.wall);
          const sp = openingSpan(a, b, o.t, o.width);
          const nn = outwardNormal(a, b, c);
          return <g key={`os${o.id}`}>{openingSymbol(o.kind, sp.p1, sp.p2, nn.nx, nn.ny, o.width, coveringColor, o.flip)}</g>;
        })}
        {/* water-supply marker on the chosen wall's inner face (room or drawn) */}
        {waterWall != null && waterWall < segs.length && (() => {
          const { a, b } = segEnds(waterWall);
          const nn = outwardNormal(a, b, c);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return waterMarker(mx - nn.nx * 300 * s, my - nn.ny * 300 * s, 220 * s);
        })()}
        {/* wall fittings (electric / heating / vent) */}
        {fittings.map((it) => {
          if (it.wall >= segs.length) return null;
          const { a, b } = segEnds(it.wall);
          const sp = openingSpan(a, b, it.t, it.width);
          let ang = (Math.atan2(sp.uy, sp.ux) * 180) / Math.PI;
          if (ang > 90) ang -= 180;
          if (ang < -90) ang += 180;
          return <g key={`el${it.id}`}>{fittingSymbol(it, sp.cx, sp.cy, ang, s, selectedFitting === it.id)}</g>;
        })}
        {selW != null && (
          <line x1={points[selW].x} y1={points[selW].y} x2={points[(selW + 1) % n].x} y2={points[(selW + 1) % n].y} stroke="#2a6df0" strokeWidth={70 * s} strokeLinecap="round" />
        )}
        {selDrawnSeg != null && (
          <line x1={segEnds(selDrawnSeg).a.x} y1={segEnds(selDrawnSeg).a.y} x2={segEnds(selDrawnSeg).b.x} y2={segEnds(selDrawnSeg).b.y} stroke="#2a6df0" strokeWidth={T + 30 * s} strokeLinecap="round" opacity={0.55} />
        )}
      </g>

      {/* add-wall draft — solid wall band + small ring handles (line drawn over the
          handles so segments read as one continuous wall, not broken at each point) */}
      {addWall && (
        <g>
          {draft.map((p, pi) => (
            <circle key={`dh${pi}`} cx={p.x} cy={p.y} r={70 * s} fill="#fff" stroke="#2a6df0" strokeWidth={16 * s} style={{ cursor: "grab" }} onPointerDown={onDraftDown(pi)} />
          ))}
          {draft.length >= 2 && (
            <polyline points={draft.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2a6df0" strokeWidth={T} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} pointerEvents="none" />
          )}
          {draft.map((p, pi) => (
            <circle key={`dd${pi}`} cx={p.x} cy={p.y} r={22 * s} fill="#2a6df0" pointerEvents="none" />
          ))}
        </g>
      )}

      {/* floor hit: tap to select the floor (drag still pans) */}
      {!addWall && <path d={dInner} fill="transparent" style={{ cursor: "pointer" }} onClick={onSelectFloor} />}

      {/* area labels (room name + sub-area areas); the first name is editable */}
      {(() => {
        const list = subAreas(points, interiorWalls);
        const labels = list.length
          ? list.map((a, ai) => ({ c: a.centroid, name: ai === 0 ? roomName : `Зона ${ai + 1}`, area: a.areaM2, editable: ai === 0 }))
          : [{ c, name: roomName, area: m2, editable: true }];
        return labels.map((l, li) => (
          <g key={`lab${li}`}>
            <text
              x={l.c.x}
              y={l.c.y - 30}
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
              fontSize={170}
              fill="#555"
              style={{ cursor: l.editable ? "pointer" : "default" }}
              onPointerDown={l.editable ? (e) => e.stopPropagation() : undefined}
              onClick={l.editable ? (e) => onEditName(e.clientX, e.clientY) : undefined}
            >
              {l.name}
            </text>
            <text x={l.c.x} y={l.c.y + 220} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={240} fontWeight={600} fill="#222" pointerEvents="none">
              {`${Number.isInteger(l.area) ? l.area : l.area.toFixed(1)} м²`}
            </text>
          </g>
        ));
      })()}

      {/* dims: selected item → its own gap/width chips; selected wall → wall dims; else all */}
      {!addWall && dims}

      {/* live corner angle while dragging */}
      {activeCorner != null &&
        (() => {
          const i = activeCorner;
          const C = points[i];
          const P = points[(i - 1 + n) % n];
          const N = points[(i + 1) % n];
          let deg = Math.abs((Math.atan2(N.y - C.y, N.x - C.x) - Math.atan2(P.y - C.y, P.x - C.x)) * 180) / Math.PI;
          if (deg > 180) deg = 360 - deg;
          const ox = C.x - c.x;
          const oy = C.y - c.y;
          const ol = Math.hypot(ox, oy) || 1;
          const lx = C.x + (ox / ol) * 300 * s;
          const ly = C.y + (oy / ol) * 300 * s;
          const snapped = Math.abs(deg - 90) < 0.6 || Math.abs(deg - 45) < 0.6 || Math.abs(deg - 135) < 0.6;
          return (
            <g pointerEvents="none">
              <rect x={lx - 150 * s} y={ly - 105 * s} width={300 * s} height={210 * s} rx={36 * s} fill={snapped ? "#2a6df0" : "#1c1b18"} />
              <text x={lx} y={ly + 60 * s} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={150 * s} fontWeight={600} fill="#fff">
                {`${Math.round(deg)}°`}
              </text>
            </g>
          );
        })()}

      {!addWall && (
        <>
          {/* wall edges: tap to select, drag to move */}
          {points.map((a, i) => {
            const b = points[(i + 1) % n];
            return <line key={`hit${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={T + 120 * s} strokeLinecap="round" style={{ cursor: "move" }} onPointerDown={onWallDown(i)} />;
          })}

          {/* drawn-wall segment hit lines: tap to select. Rendered BEFORE openings/
              fittings so a door/socket on a drawn wall stays tappable (on top). */}
          {(() => {
            let gi = n;
            return interiorWalls.map((poly, wi) =>
              poly.slice(0, -1).map((p, si) => {
                const g = gi++;
                const b = poly[si + 1];
                return <line key={`iwh${wi}-${si}`} x1={p.x} y1={p.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={T + 80 * s} strokeLinecap="round" style={{ cursor: "pointer" }} onPointerDown={onIWallDown(g)} />;
              }),
            );
          })()}

          {/* openings: tap to select, drag onto any wall (edit/duplicate/delete live in the toolbar) */}
          {openings.map((o) => {
            const { a, b } = segEnds(o.wall);
            const sp = openingSpan(a, b, o.t, o.width);
            const sel = selectedOpening === o.id;
            return (
              <g key={`oh${o.id}`}>
                {sel && <line x1={sp.p1.x} y1={sp.p1.y} x2={sp.p2.x} y2={sp.p2.y} stroke="#2a6df0" strokeWidth={T + 40 * s} strokeLinecap="round" opacity={0.5} pointerEvents="none" />}
                <line x1={sp.p1.x} y1={sp.p1.y} x2={sp.p2.x} y2={sp.p2.y} stroke="transparent" strokeWidth={T + 240 * s} strokeLinecap="round" style={{ cursor: "move" }} onPointerDown={onOpeningDown(o.id)} />
              </g>
            );
          })}

          {/* wall fittings: tap to select, drag onto any wall (edit/duplicate/delete live in the toolbar) */}
          {fittings.map((it) => {
            if (it.wall >= segs.length) return null;
            const { a, b } = segEnds(it.wall);
            const sp = openingSpan(a, b, it.t, it.width);
            return <circle key={`eh${it.id}`} cx={sp.cx} cy={sp.cy} r={220 * s} fill="transparent" style={{ cursor: "move" }} onPointerDown={onFittingDown(it.id)} />;
          })}

          {/* corner handles */}
          {points.map((p, i) => (
            <rect key={`h${i}`} x={p.x - 90 * s} y={p.y - 90 * s} width={180 * s} height={180 * s} rx={24 * s} fill="#fff" stroke="#2a6df0" strokeWidth={16 * s} style={{ cursor: "grab" }} onPointerDown={onCornerDown(i)} />
          ))}

          {/* interior wall point handles (editable in the main scene) */}
          {interiorWalls.map((poly, wi) =>
            poly.map((p, pi) => (
              <circle key={`iwp${wi}-${pi}`} cx={p.x} cy={p.y} r={60 * s} fill="transparent" stroke="#2a6df0" strokeWidth={14 * s} style={{ cursor: "grab" }} onPointerDown={onInteriorDown(wi, pi)} />
            )),
          )}
        </>
      )}
    </svg>
  );
}
