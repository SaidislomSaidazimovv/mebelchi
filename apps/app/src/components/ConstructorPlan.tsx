// 2D floor plan for the constructor. Draws the room (floor + walls + openings)
// like the room editor's plan, then overlays the kitchen footprints. A selected
// module shows its width + depth (tap to edit), a drag handle, and a rotate handle
// (press-rotate with a circular progress ring; snaps to 45°/90° when the magnet is
// on). Free drag/rotate is stored as a plan transform (px/pz/rot) the plan honours.
import { useRef, useState } from "react";
import {
  polygonBoundsMm,
  offsetPolygon,
  centroidOf,
  wallSegments,
  openingSpan,
  type Pt,
  type Opening,
} from "../model/room";
import { type KitchenLayout } from "../model/runPlan";
import type { Cabinet } from "../model/cabinet";
import { cabFootprints, type Foot } from "../model/footprint";
import { useSvgZoom } from "./useSvgZoom";
import { ICON_DRAG_PATH, ICON_ROTATE_PATH } from "./icons";

const T = 100; // wall thickness (mm)
const MARGIN = 500;
const GRID = 500; // visual + snap grid spacing (mm)

const C = {
  facade: "#e7ddc9",
  facadeLine: "#c4b79c",
  carcass: "#efe8da",
  steel: "#d6dadd",
  steelLine: "#a9afb4",
  sel: "#2a6df0",
};

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";
const DEG = 180 / Math.PI;

const SIGNS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
function rectCorners(cx: number, cy: number, ux: number, uy: number, ix: number, iy: number, w: number, depth: number) {
  const hw = w / 2;
  const hd = depth / 2;
  return SIGNS.map(([su, si]) => ({ x: cx + ux * su * hw + ix * si * hd, y: cy + uy * su * hw + iy * si * hd }));
}
// separating-axis test for two oriented rectangles (footprints)
function rectsOverlap(a: Foot, b: Foot): boolean {
  const ca = rectCorners(a.cx, a.cy, a.ux, a.uy, a.ix, a.iy, a.w, a.depth);
  const cb = rectCorners(b.cx, b.cy, b.ux, b.uy, b.ix, b.iy, b.w, b.depth);
  const axes = [{ x: a.ux, y: a.uy }, { x: a.ix, y: a.iy }, { x: b.ux, y: b.uy }, { x: b.ix, y: b.iy }];
  const EPS = 12; // touching (shared edge) is not an overlap
  for (const ax of axes) {
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const p of ca) { const dd = p.x * ax.x + p.y * ax.y; if (dd < amin) amin = dd; if (dd > amax) amax = dd; }
    for (const p of cb) { const dd = p.x * ax.x + p.y * ax.y; if (dd < bmin) bmin = dd; if (dd > bmax) bmax = dd; }
    if (amax <= bmin + EPS || bmax <= amin + EPS) return false;
  }
  return true;
}
function pointInPoly(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

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

function OpeningGlyph({ o, a, b, nx, ny, coveringColor }: { o: Opening; a: Pt; b: Pt; nx: number; ny: number; coveringColor: string }) {
  const sp = openingSpan(a, b, o.t, o.width);
  const { p1, p2 } = sp;
  if (o.kind === "window") {
    return (
      <g pointerEvents="none">
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={T + 8} />
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8fc7e8" strokeWidth={26} />
      </g>
    );
  }
  if (o.kind === "opening") {
    return (
      <g pointerEvents="none">
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={coveringColor} strokeWidth={T + 8} />
      </g>
    );
  }
  const ax = -nx;
  const ay = -ny;
  const h = o.flip ? p2 : p1;
  const sweep = o.flip ? 0 : 1;
  const op = o.flip ? p1 : p2;
  return (
    <g pointerEvents="none">
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={T + 8} />
      <line x1={h.x} y1={h.y} x2={h.x + ax * o.width} y2={h.y + ay * o.width} stroke="#8a8a8a" strokeWidth={10} />
      <path d={`M${h.x + ax * o.width} ${h.y + ay * o.width} A${o.width} ${o.width} 0 0 ${sweep} ${op.x} ${op.y}`} fill="none" stroke="#8a8a8a" strokeWidth={8} />
    </g>
  );
}

type DragRef =
  | { id: string; mode: "move"; startCx: number; startCy: number; rot: number; downX: number; downY: number }
  | { id: string; mode: "rotate"; cx: number; cy: number; startRot: number; startAngle: number; r: number; prevA: number; accum: number }
  | null;

export interface PlanEdit {
  clientX: number;
  clientY: number;
  value: number;
  cabId: string;
  kind: "w" | "depth";
}

export function ConstructorPlan({
  points,
  openings,
  interiorWalls,
  coveringColor,
  layout,
  waterWall,
  cabs,
  mode = "real",
  grid = false,
  magnet = true,
  selectedId,
  onSelectCab,
  onMovePlan,
  onBeginEdit,
  onEditDim,
}: {
  points: Pt[];
  openings: Opening[];
  interiorWalls: Pt[][];
  coveringColor: string;
  layout: KitchenLayout;
  waterWall: number | null;
  cabs: Cabinet[];
  /** furniture render style — real (filled) / xray (faded) / wire (outlines) */
  mode?: "real" | "xray" | "wire";
  grid?: boolean;
  magnet?: boolean;
  selectedId: string | null;
  onSelectCab: (id: string | null) => void;
  onMovePlan?: (id: string, patch: { px?: number; pz?: number; rot?: number }) => void;
  /** snapshot for undo before a drag/rotate gesture starts */
  onBeginEdit?: () => void;
  onEditDim?: (e: PlanEdit) => void;
}) {
  const [rotUI, setRotUI] = useState<{ cx: number; cy: number; r: number; a0: number; a1: number } | null>(null);
  const [moveGuide, setMoveGuide] = useState<{ vx?: number; vy?: number } | null>(null);
  const dragRef = useRef<DragRef>(null);
  const begun = useRef(false); // snapshot taken for the current gesture?

  const b = polygonBoundsMm(points);
  const boxW = b.w + 2 * MARGIN;
  const boxH = b.h + 2 * MARGIN;
  const box = { x: b.minX - MARGIN, y: b.minY - MARGIN, w: boxW, h: boxH };
  const zoom = useSvgZoom(box, `${b.minX},${b.minY},${b.w},${b.h}`);
  const U = boxW * zoom.scale; // constant-on-screen unit

  const inner = offsetPolygon(points, T);
  const c = centroidOf(points);
  const d = path(points);
  const dInner = path(inner);
  const segs = wallSegments(points, interiorWalls);

  // footprints — base/tall + appliances + uppers (wall units drawn dashed on top);
  // shared with the 3D editor so free transforms (px/pz/rot) read identically
  const foot = cabFootprints(cabs, points, waterWall, layout, openings);
  const selFoot = selectedId ? foot.find((f) => f.id === selectedId) : undefined;

  // overlap warning: same-layer footprints clashing, or a module pushed into a wall
  const overlap = new Set<string>();
  for (let i = 0; i < foot.length; i++) {
    for (let j = i + 1; j < foot.length; j++) {
      if (foot[i].furniture || foot[j].furniture) continue; // free decor — chair under table is fine
      if (foot[i].upper !== foot[j].upper) continue; // a wall unit over a base is fine
      if (rectsOverlap(foot[i], foot[j])) {
        overlap.add(foot[i].id);
        overlap.add(foot[j].id);
      }
    }
  }
  for (const f of foot) {
    if (f.furniture) continue; // furniture isn't pinned to the walls
    const corners = rectCorners(f.cx, f.cy, f.ux, f.uy, f.ix, f.iy, f.w * 0.9, f.depth * 0.9);
    if (corners.some((p) => !pointInPoly(p.x, p.y, inner))) overlap.add(f.id);
  }

  // snap a dragged footprint centre to walls + other footprints (magnet) and/or the
  // grid; returns the snapped centre + any guide lines to show
  const wallMinX = Math.min(...inner.map((p) => p.x));
  const wallMaxX = Math.max(...inner.map((p) => p.x));
  const wallMinY = Math.min(...inner.map((p) => p.y));
  const wallMaxY = Math.max(...inner.map((p) => p.y));
  const snapMove = (f: Foot, cx: number, cy: number) => {
    const TH = 0.03 * U; // ≈ constant on screen
    let sx = cx;
    let sy = cy;
    let gvx: number | undefined;
    let gvy: number | undefined;
    if (magnet) {
      const others = foot.filter((o) => o.id !== f.id);
      // candidate centre-x positions: stick to a wall, align/abut another footprint
      const candX = [wallMinX + f.hbx, wallMaxX - f.hbx];
      const candY = [wallMinY + f.hby, wallMaxY - f.hby];
      for (const o of others) {
        candX.push(o.cx, o.cx - o.hbx - f.hbx, o.cx + o.hbx + f.hbx);
        candY.push(o.cy, o.cy - o.hby - f.hby, o.cy + o.hby + f.hby);
      }
      let bx = TH;
      for (const v of candX) { const dd = Math.abs(cx - v); if (dd < bx) { bx = dd; sx = v; gvx = v; } }
      let by = TH;
      for (const v of candY) { const dd = Math.abs(cy - v); if (dd < by) { by = dd; sy = v; gvy = v; } }
    }
    if (grid) {
      if (gvx === undefined) { const g = Math.round(sx / GRID) * GRID; if (Math.abs(sx - g) < TH) { sx = g; gvx = g; } }
      if (gvy === undefined) { const g = Math.round(sy / GRID) * GRID; if (Math.abs(sy - g) < TH) { sy = g; gvy = g; } }
    }
    return { x: sx, y: sy, gvx, gvy };
  };

  // four oriented corners of a footprint rectangle
  const footCorners = (f: Foot) => {
    const hw = f.w / 2, hd = f.depth / 2;
    return SIGNS.map(([su, si]) => ({ x: f.cx + f.ux * su * hw + f.ix * si * hd, y: f.cy + f.uy * su * hw + f.iy * si * hd }));
  };
  // Corner-unit outline: a square with its ROOM-FACING corner removed — BASE via an
  // inner notch (L-shape, L-door), UPPER via a single 45° chamfer (pentagon, diagonal
  // door). `cut` is how far the run-butt edge sits past centre (armDepth − halfSide).
  const cornerGeom = (f: Foot) => {
    const cs = footCorners(f);
    let ri = 0, rd = Infinity;
    cs.forEach((p, i) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < rd) { rd = d; ri = i; } });
    const [su, si] = SIGNS[ri];
    const hw = f.w / 2, armDepth = f.upper ? 350 : 560, cut = armDepth - hw;
    const P = (uu: number, ii: number) => ({ x: f.cx + f.ux * uu + f.ix * ii, y: f.cy + f.uy * uu + f.iy * ii });
    const buttA = P(su * hw, si * cut), buttB = P(su * cut, si * hw), notch = P(su * cut, si * cut);
    const ring = [P(-su * hw, -si * hw), P(su * hw, -si * hw), buttA, ...(f.upper ? [] : [notch]), buttB, P(-su * hw, si * hw)];
    const doorSegs = f.upper ? [[buttA, buttB]] : [[buttA, notch], [notch, buttB]];
    return { ring, doorSegs };
  };
  const quadPts = (f: Foot) => {
    if (!f.corner) return footCorners(f).map((p) => `${p.x},${p.y}`).join(" ");
    return cornerGeom(f).ring.map((p) => `${p.x},${p.y}`).join(" ");
  };

  // ---- pointer + drag/rotate ----
  const clientToMm = (e: React.PointerEvent) => {
    const svg = zoom.svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, y: r.y };
  };
  const onMoveDown = (f: Foot) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    begun.current = false; // snapshot lazily on the first move (taps make no undo step)
    const mm = clientToMm(e);
    dragRef.current = { id: f.id, mode: "move", startCx: f.cx, startCy: f.cy, rot: f.rotDeg, downX: mm.x, downY: mm.y };
  };
  const onRotateDown = (f: Foot, r: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    begun.current = false;
    const mm = clientToMm(e);
    const a = Math.atan2(mm.y - f.cy, mm.x - f.cx);
    dragRef.current = { id: f.id, mode: "rotate", cx: f.cx, cy: f.cy, startRot: f.rotDeg, startAngle: a, r, prevA: a, accum: 0 };
    setRotUI({ cx: f.cx, cy: f.cy, r, a0: a, a1: a });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (!dr || !onMovePlan) return;
    e.stopPropagation();
    if (!begun.current) { onBeginEdit?.(); begun.current = true; } // first move → one undo step
    const mm = clientToMm(e);
    if (dr.mode === "move") {
      const nx = dr.startCx + (mm.x - dr.downX);
      const ny = dr.startCy + (mm.y - dr.downY);
      const f = foot.find((x) => x.id === dr.id);
      const sn = f ? snapMove(f, nx, ny) : { x: nx, y: ny, gvx: undefined, gvy: undefined };
      onMovePlan(dr.id, { px: sn.x, pz: sn.y, rot: dr.rot });
      setMoveGuide({ vx: sn.gvx, vy: sn.gvy });
    } else {
      const a1 = Math.atan2(mm.y - dr.cy, mm.x - dr.cx);
      let d = a1 - dr.prevA; // unwrap across the ±180° branch cut
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      dr.accum += d;
      dr.prevA = a1;
      let rot = dr.startRot + dr.accum * DEG;
      if (magnet) {
        const n = Math.round(rot / 45) * 45;
        if (Math.abs(rot - n) < 7) rot = n; // snappy at 45° / 90°
      }
      onMovePlan(dr.id, { px: dr.cx, pz: dr.cy, rot });
      setRotUI({ cx: dr.cx, cy: dr.cy, r: dr.r, a0: dr.startAngle, a1 });
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    setRotUI(null);
    setMoveGuide(null);
  };

  // handle geometry for the selected footprint
  const R = 0.05 * U;
  const isc = (0.9 * R) / 16;
  const rotDist = selFoot ? Math.max(selFoot.w, selFoot.depth) / 2 + R * 2.2 : 0;
  const rotHx = selFoot ? selFoot.cx + selFoot.ix * rotDist : 0;
  const rotHy = selFoot ? selFoot.cy + selFoot.iy * rotDist : 0;

  // selected dims — a real dimension line (extension lines + end ticks + a chip) along
  // an edge, offset by `perp`
  const editClick = (value: number, cabId: string, kind: "w" | "depth") =>
    onEditDim ? (e: React.MouseEvent) => onEditDim({ clientX: e.clientX, clientY: e.clientY, value, cabId, kind }) : undefined;
  const sc = zoom.scale;
  const oDim = (a: Pt, b: Pt, perp: Pt, label: string, key: string, onClick?: (e: React.MouseEvent) => void) => {
    const OFF = 230 * sc;
    const TICK = 26 * sc;
    const STK = 4 * sc;
    const e1 = { x: a.x + perp.x * OFF, y: a.y + perp.y * OFF };
    const e2 = { x: b.x + perp.x * OFF, y: b.y + perp.y * OFF };
    const mx = (e1.x + e2.x) / 2;
    const my = (e1.y + e2.y) / 2;
    const px = perp.x * TICK;
    const py = perp.y * TICK;
    return (
      <g key={key}>
        <line x1={a.x} y1={a.y} x2={e1.x} y2={e1.y} stroke="#9aa0a6" strokeWidth={STK * 0.7} />
        <line x1={b.x} y1={b.y} x2={e2.x} y2={e2.y} stroke="#9aa0a6" strokeWidth={STK * 0.7} />
        <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={C.sel} strokeWidth={STK} />
        <line x1={e1.x - px} y1={e1.y - py} x2={e1.x + px} y2={e1.y + py} stroke={C.sel} strokeWidth={STK} />
        <line x1={e2.x - px} y1={e2.y - py} x2={e2.x + px} y2={e2.y + py} stroke={C.sel} strokeWidth={STK} />
        <g onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
          {onClick && <rect x={mx - 200 * sc} y={my - 100 * sc} width={400 * sc} height={200 * sc} fill="transparent" />}
          <rect x={mx - 150 * sc} y={my - 78 * sc} width={300 * sc} height={156 * sc} rx={36 * sc} fill="#fff" stroke={C.sel} strokeWidth={5 * sc} />
          <text x={mx} y={my + 34 * sc} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={92 * sc} fontWeight={600} fill={C.sel}>{label}</text>
        </g>
      </g>
    );
  };

  return (
    <svg ref={zoom.svgRef} className="scene-canvas" style={{ touchAction: "none" }} viewBox={zoom.vbStr} preserveAspectRatio="xMidYMid meet" {...zoom.bind} onPointerMove={(e) => { zoom.bind.onPointerMove(e); onPointerMove(e); }} onPointerUp={(e) => { zoom.bind.onPointerUp(e); onPointerUp(e); }} onPointerCancel={(e) => { zoom.bind.onPointerCancel(e); onPointerUp(e); }}>
      <defs>
        <pattern id="cplanks" width="640" height="170" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="640" y2="0" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="0" y1="85" x2="640" y2="85" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="320" y1="0" x2="320" y2="85" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
          <line x1="160" y1="85" x2="160" y2="170" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
          <line x1="480" y1="85" x2="480" y2="170" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* tap empty space to deselect */}
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" onClick={() => onSelectCab(null)} />

      {/* optional snapping grid */}
      {grid && (
        <g pointerEvents="none">
          {Array.from({ length: Math.floor(box.w / GRID) + 2 }, (_, i) => {
            const gx = Math.ceil(box.x / GRID) * GRID + i * GRID;
            return <line key={`gx${i}`} x1={gx} y1={box.y} x2={gx} y2={box.y + box.h} stroke="rgba(42,109,240,0.12)" strokeWidth={3} />;
          })}
          {Array.from({ length: Math.floor(box.h / GRID) + 2 }, (_, i) => {
            const gy = Math.ceil(box.y / GRID) * GRID + i * GRID;
            return <line key={`gy${i}`} x1={box.x} y1={gy} x2={box.x + box.w} y2={gy} stroke="rgba(42,109,240,0.12)" strokeWidth={3} />;
          })}
        </g>
      )}

      {/* room shell */}
      <g pointerEvents="none">
        <path d={`${d} ${dInner}`} fillRule="evenodd" fill="#d6d6d6" />
        <path d={dInner} fill={coveringColor} />
        <path d={dInner} fill="url(#cplanks)" />
        <path d={d} fill="none" stroke="#b4b4b4" strokeWidth={6} />
        <path d={dInner} fill="none" stroke="#c7c7c7" strokeWidth={4} />
        {interiorWalls.map((poly, wi) => (
          <polyline key={`iw${wi}`} points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#b4b4b4" strokeWidth={T} strokeLinecap="square" strokeLinejoin="miter" />
        ))}
        {openings.map((o) => {
          const seg = segs[o.wall];
          if (!seg) return null;
          const nn = outwardNormal(seg.a, seg.b, c);
          return <OpeningGlyph key={o.id} o={o} a={seg.a} b={seg.b} nx={nn.nx} ny={nn.ny} coveringColor={coveringColor} />;
        })}
      </g>

      {/* footprint bodies — render style (Lines/Transparent) applied here only */}
      <g className={mode === "wire" ? "svg-wire plan-wire" : mode === "xray" ? "svg-xray" : undefined}>
        {foot.map((f) => {
          const appl = f.appliance === "fridge" || f.appliance === "oven" || f.appliance === "dishwasher" ? C.steel : f.appliance === "sink" || f.appliance === "hob" ? C.carcass : null;
          // a picked facade finish recolours the footprint (appliances keep their look)
          const typeFill = appl ?? (f.finish?.facade != null ? `#${f.finish.facade.toString(16).padStart(6, "0")}` : C.facade);
          const along = (mm: number) => ({ x: f.ux * mm, y: f.uy * mm });
          const into = (mm: number) => ({ x: f.ix * mm, y: f.iy * mm });
          return (
            <g key={f.id} pointerEvents="none">
              <polygon points={quadPts(f)} fill={f.upper ? "none" : typeFill} stroke={f.upper ? "#9aa0a6" : C.facadeLine} strokeWidth={f.upper ? 7 : 8} strokeDasharray={f.upper ? `${70} ${45}` : undefined} />
              {f.corner && cornerGeom(f).doorSegs.map((s, si) => <line key={`dr${si}`} x1={s[0].x} y1={s[0].y} x2={s[1].x} y2={s[1].y} stroke={f.upper ? "#9aa0a6" : C.facadeLine} strokeWidth={f.upper ? 7 : 9} />)}
              {!f.upper && f.appliance === "sink" && [-0.12, 0.12].map((k, ki) => { const o = along(k * f.w); return <circle key={ki} cx={f.cx + o.x} cy={f.cy + o.y} r={Math.min(f.w * 0.16, 160)} fill="none" stroke={C.steelLine} strokeWidth={10} />; })}
              {!f.upper && f.appliance === "hob" && [-0.18, 0.18].flatMap((au) => [-0.16, 0.16].map((ai) => { const o1 = along(au * f.w); const o2 = into(ai * f.depth); return <circle key={`${au}-${ai}`} cx={f.cx + o1.x + o2.x} cy={f.cy + o1.y + o2.y} r={70} fill="#2c3035" />; }))}
              {!f.upper && f.appliance === "fridge" && (() => { const o = into(f.depth * 0.32); return <circle cx={f.cx + o.x} cy={f.cy + o.y} r={70} fill="#111417" />; })()}
            </g>
          );
        })}
      </g>

      {/* selection + overlap highlight — drawn over the body, NOT affected by render mode */}
      {foot.map((f) => {
        const selected = f.id === selectedId;
        const over = overlap.has(f.id);
        if (!selected && !over) return null;
        return <polygon key={`hl${f.id}`} points={quadPts(f)} pointerEvents="none" fill={over ? "rgba(229,57,53,0.26)" : C.sel} fillOpacity={over ? 1 : 0.16} stroke={over ? "#e53935" : C.sel} strokeWidth={over ? 16 : 22} strokeDasharray={f.upper && !over ? `${70} ${45}` : undefined} />;
      })}

      {/* selection targets — above the visuals so any footprint can be (re)selected;
          wall units last so the back strip selects the upper, the front strip the base */}
      {[...foot].sort((a, b) => Number(a.upper) - Number(b.upper)).map((f) => (
        <polygon key={`t${f.id}`} points={quadPts(f)} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelectCab(f.id)} />
      ))}

      {/* magnet / grid alignment guides while moving */}
      {moveGuide?.vx != null && <line x1={moveGuide.vx} y1={box.y} x2={moveGuide.vx} y2={box.y + box.h} stroke={C.sel} strokeWidth={0.006 * U} strokeDasharray={`${0.03 * U} ${0.02 * U}`} pointerEvents="none" />}
      {moveGuide?.vy != null && <line x1={box.x} y1={moveGuide.vy} x2={box.x + box.w} y2={moveGuide.vy} stroke={C.sel} strokeWidth={0.006 * U} strokeDasharray={`${0.03 * U} ${0.02 * U}`} pointerEvents="none" />}

      {/* rotation progress ring */}
      {rotUI && (() => {
        const sweep = ((rotUI.a1 - rotUI.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const large = sweep > Math.PI ? 1 : 0;
        const p0 = { x: rotUI.cx + rotUI.r * Math.cos(rotUI.a0), y: rotUI.cy + rotUI.r * Math.sin(rotUI.a0) };
        const p1 = { x: rotUI.cx + rotUI.r * Math.cos(rotUI.a1), y: rotUI.cy + rotUI.r * Math.sin(rotUI.a1) };
        return (
          <g pointerEvents="none">
            <circle cx={rotUI.cx} cy={rotUI.cy} r={rotUI.r} fill="none" stroke="#fff" strokeWidth={0.01 * U} />
            <path d={`M${p0.x} ${p0.y} A${rotUI.r} ${rotUI.r} 0 ${large} 1 ${p1.x} ${p1.y}`} fill="none" stroke={C.sel} strokeWidth={0.012 * U} strokeLinecap="round" />
          </g>
        );
      })()}

      {/* selected dims: depth on the right edge, width on the bottom edge */}
      {selFoot && onEditDim && (() => {
        const f = selFoot;
        const hw = f.w / 2;
        const hd = f.depth / 2;
        // width on the lower screen side (bottom); depth on the right screen side
        const wperp = f.iy >= 0 ? { x: f.ix, y: f.iy } : { x: -f.ix, y: -f.iy };
        const dperp = f.ux >= 0 ? { x: f.ux, y: f.uy } : { x: -f.ux, y: -f.uy };
        const wA = { x: f.cx - f.ux * hw + wperp.x * hd, y: f.cy - f.uy * hw + wperp.y * hd };
        const wB = { x: f.cx + f.ux * hw + wperp.x * hd, y: f.cy + f.uy * hw + wperp.y * hd };
        const dA = { x: f.cx + dperp.x * hw - f.ix * hd, y: f.cy + dperp.y * hw - f.iy * hd };
        const dB = { x: f.cx + dperp.x * hw + f.ix * hd, y: f.cy + dperp.y * hw + f.iy * hd };
        return (
          <>
            {oDim(wA, wB, wperp, `${f.w}`, "dimw", editClick(f.w, f.id, "w"))}
            {oDim(dA, dB, dperp, `${f.depth}`, "dimd", editClick(f.depth, f.id, "depth"))}
          </>
        );
      })()}
      {selFoot && onMovePlan && (
        <>
          <line x1={selFoot.cx} y1={selFoot.cy} x2={rotHx} y2={rotHy} stroke={C.sel} strokeWidth={0.004 * U} pointerEvents="none" />
          {/* drag handle (centre) */}
          <g transform={`translate(${selFoot.cx} ${selFoot.cy})`} onPointerDown={onMoveDown(selFoot)} style={{ cursor: "grab", touchAction: "none" }}>
            <circle r={R} fill="#fff" stroke="#cfcfcf" strokeWidth={0.004 * U} />
            <g transform={`translate(${-16 * isc} ${-16 * isc}) scale(${isc})`}><path d={ICON_DRAG_PATH} fill="#1c1b18" /></g>
          </g>
          {/* rotate handle */}
          <g transform={`translate(${rotHx} ${rotHy})`} onPointerDown={onRotateDown(selFoot, rotDist)} style={{ cursor: "grab", touchAction: "none" }}>
            <circle r={R} fill="#fff" stroke="#cfcfcf" strokeWidth={0.004 * U} />
            <g transform={`translate(${-16 * isc} ${-16 * isc}) scale(${isc})`}><path d={ICON_ROTATE_PATH} fill="#1c1b18" /></g>
          </g>
        </>
      )}
    </svg>
  );
}
