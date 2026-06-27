// Front elevation of a generated layout — a pure SVG drawing of the cabinet run.
// In the constructor it is the architectural "front view": dimension chains (tap a
// number to edit, sizes constant on screen), pinch/zoom/pan, and — when a module
// is selected — only that module's dimensions plus move handles. Dragging a module
// horizontally REORDERS its row (the neighbours slide aside with a subtle ease and
// the row re-tiles, never overlapping); wall units can also be slid vertically
// (mountY), snapping to other modules' top/bottom edges with an alignment guide.
//
// Each module is drawn in LOCAL coordinates (left edge at x=0) inside a
// `<g transform="translate(x)">` so its position is a transitionable CSS transform —
// that's what makes the reorder animate smoothly without jumping on drop.

import { useRef, useState } from "react";
import { GEOM } from "../model/layout";
import type { Cabinet } from "../model/cabinet";
import { useSvgZoom } from "./useSvgZoom";
import { ICON_VMOVE_PATH, ICON_DRAG_PATH } from "./icons";

const C = {
  facade: "#e7ddc9",
  facadeLine: "#c4b79c",
  carcass: "#efe8da",
  worktop: "#6f6862",
  plinth: "#cdc6bb",
  steel: "#d6dadd",
  steelLine: "#a9afb4",
  glass: "#cdeaf5",
  glassLine: "#9fc3d4",
  filler: "#ddd5c8",
  handle: "#8a8378",
  floor: "#cfc7ba",
  dim: "#444",
  sel: "#2a6df0",
};

const HOOD_DEFAULT = GEOM.plinth + GEOM.baseH + GEOM.worktop + 560; // hood mount above floor
const ANIM = "transform 180ms ease";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A facade carved into drawer fronts / a door / glass, drawn inside a carcass box. */
function Facade({ box, cab }: { box: Box; cab: Cabinet }) {
  const { x, y, w, h } = box;
  const inset = 14;
  const fx = x + inset;
  const fw = w - inset * 2;
  const parts: React.ReactNode[] = [];

  if (cab.fill === "drawers" && cab.count > 0) {
    const gap = 12;
    const fh = (h - inset * 2 - gap * (cab.count - 1)) / cab.count;
    for (let i = 0; i < cab.count; i++) {
      const fy = y + inset + i * (fh + gap);
      parts.push(<rect key={`d${i}`} x={fx} y={fy} width={fw} height={fh} rx={6} fill={C.facade} stroke={C.facadeLine} strokeWidth={4} />);
      parts.push(<rect key={`dh${i}`} x={fx + fw / 2 - 70} y={fy + fh - 26} width={140} height={9} rx={4} fill={C.handle} />);
    }
    return <>{parts}</>;
  }

  if (cab.fill === "open") {
    parts.push(<rect key="bk" x={fx} y={y + inset} width={fw} height={h - inset * 2} fill="#0000000d" />);
    for (let i = 1; i <= 2; i++) parts.push(<line key={`s${i}`} x1={fx} y1={y + (h * i) / 3} x2={fx + fw} y2={y + (h * i) / 3} stroke={C.facadeLine} strokeWidth={4} />);
    return <>{parts}</>;
  }

  const glass = cab.door === 2;
  parts.push(<rect key="door" x={fx} y={y + inset} width={fw} height={h - inset * 2} rx={6} fill={glass ? C.glass : C.facade} stroke={glass ? C.glassLine : C.facadeLine} strokeWidth={4} />);
  if (glass) parts.push(<line key="gl" x1={fx + fw / 2} y1={y + inset} x2={fx + fw / 2} y2={y + h - inset} stroke={C.glassLine} strokeWidth={3} />);
  const hx = x + w - inset - 18;
  parts.push(<rect key="h" x={hx - 9} y={y + h / 2 - 70} width={9} height={140} rx={4} fill={C.handle} />);
  return <>{parts}</>;
}

function carcass(b: Box, key: string, fill = C.carcass) {
  return <rect key={key} x={b.x} y={b.y} width={b.w} height={b.h} fill={fill} stroke={C.facadeLine} strokeWidth={4} />;
}

/** Draw one module's shapes in LOCAL coords (left edge at x=0). */
function moduleLocal(c: Cabinet, mountY: number): React.ReactNode[] {
  const n: React.ReactNode[] = [];
  if (c.kind === "tall") {
    const b: Box = { x: 0, y: GEOM.plinth, w: c.w, h: c.h };
    n.push(<rect key="pl" x={0} y={0} width={c.w} height={GEOM.plinth} fill={C.plinth} />);
    if (c.appliance === "fridge") {
      n.push(carcass(b, "ca", C.steel));
      const split = b.y + b.h * 0.62;
      n.push(<line key="fz" x1={0} y1={split} x2={c.w} y2={split} stroke={C.steelLine} strokeWidth={4} />);
      n.push(<rect key="fh1" x={c.w - 34} y={split + 40} width={10} height={b.y + b.h - split - 90} rx={5} fill={C.handle} />);
      n.push(<rect key="fh2" x={c.w - 34} y={b.y + 60} width={10} height={split - b.y - 110} rx={5} fill={C.handle} />);
    } else {
      n.push(carcass(b, "ca"));
      n.push(<Facade key="fc" box={b} cab={c} />);
    }
    return n;
  }
  if (c.kind === "upper") {
    if (c.appliance === "hood") {
      const topY = mountY + 360;
      n.push(<polygon key="hd" points={`${c.w * 0.2},${mountY} ${c.w * 0.8},${mountY} ${c.w * 0.62},${topY} ${c.w * 0.38},${topY}`} fill={C.steel} stroke={C.steelLine} strokeWidth={4} />);
      return n;
    }
    const b: Box = { x: 0, y: mountY, w: c.w, h: c.h };
    n.push(carcass(b, "ca"));
    n.push(<Facade key="fc" box={b} cab={c} />);
    return n;
  }
  // base
  const h = c.h;
  const worktopY = GEOM.plinth + h;
  const topY = worktopY + GEOM.worktop;
  const b: Box = { x: 0, y: GEOM.plinth, w: c.w, h };
  n.push(<rect key="pl" x={0} y={0} width={c.w} height={GEOM.plinth} fill={C.plinth} />);
  n.push(carcass(b, "ca"));
  n.push(<rect key="wt" x={0} y={worktopY} width={c.w} height={GEOM.worktop} fill={C.worktop} />);
  if (c.appliance === "sink") {
    n.push(<Facade key="fc" box={b} cab={{ ...c, fill: "shelves" }} />);
    n.push(<rect key="sb" x={40} y={worktopY + 6} width={c.w - 80} height={GEOM.worktop - 12} rx={6} fill={C.steel} stroke={C.steelLine} strokeWidth={3} />);
    n.push(<path key="fa" d={`M${c.w - 70} ${topY} q0 -150 60 -150`} fill="none" stroke={C.steelLine} strokeWidth={10} strokeLinecap="round" />);
  } else if (c.appliance === "hob" || c.appliance === "cooktop") {
    if (c.appliance === "hob") {
      const oy = GEOM.plinth + 40;
      n.push(<rect key="ov" x={16} y={oy} width={c.w - 32} height={h - 90} rx={8} fill={C.steel} stroke={C.steelLine} strokeWidth={4} />);
      n.push(<rect key="ovw" x={36} y={oy + 60} width={c.w - 72} height={h - 240} rx={6} fill="#3a3f44" opacity={0.85} />);
      n.push(<rect key="ovh" x={36} y={oy + 18} width={c.w - 72} height={12} rx={6} fill={C.handle} />);
    } else {
      n.push(<Facade key="fc" box={b} cab={c} />);
    }
    const cy = worktopY + GEOM.worktop / 2;
    [0.3, 0.7].forEach((cxF, a) => [0.32, 0.68].forEach((cyF, b2) => n.push(<circle key={`hb${a}-${b2}`} cx={c.w * cxF} cy={cy + (cyF - 0.5) * (GEOM.worktop - 14)} r={9} fill="#2c3035" />)));
  } else if (c.appliance === "dishwasher") {
    n.push(<rect key="dw" x={14} y={GEOM.plinth + 14} width={c.w - 28} height={h - 28} rx={6} fill={C.facade} stroke={C.facadeLine} strokeWidth={4} />);
    n.push(<rect key="dwc" x={14} y={GEOM.plinth + h - 60} width={c.w - 28} height={18} rx={4} fill={C.steel} stroke={C.steelLine} strokeWidth={3} />);
  } else {
    n.push(<Facade key="fc" box={b} cab={c} />);
  }
  return n;
}

/** Interior structure (shelves + a vertical divider) in LOCAL coords — drawn as a
 *  reveal layer over a transparent/wireframe cabinet so you can see inside. */
function interiorLocal(c: Cabinet, mountY: number): React.ReactNode[] {
  const ap = c.appliance && c.appliance !== "none" && c.appliance !== "filler";
  if (ap) return []; // appliances have no shelf interior to reveal
  const y = c.kind === "upper" ? mountY : GEOM.plinth;
  const h = c.h;
  const w = c.w;
  const inset = 16;
  const out: React.ReactNode[] = [];
  if (c.fill === "shelves" && c.count > 0) {
    for (let i = 1; i <= c.count; i++) {
      const sy = y + (h * i) / (c.count + 1);
      out.push(<line key={`sh${i}`} x1={inset} y1={sy} x2={w - inset} y2={sy} stroke={C.facadeLine} strokeWidth={8} />);
    }
  }
  if (c.div) out.push(<line key="dv" x1={w / 2} y1={y + inset} x2={w / 2} y2={y + h - inset} stroke={C.facadeLine} strokeWidth={8} />);
  return out;
}

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface WidthMod {
  id: string;
  x0: number;
  x1: number;
}
interface Rect {
  id: string;
  kind: Cabinet["kind"];
  x0: number;
  x1: number;
  cyLow: number;
  cyHigh: number;
  w: number;
  h: number;
}

export interface EditDim {
  clientX: number;
  clientY: number;
  value: number;
  cabId: string;
  kind: "w" | "h";
}
export interface ReorderUpdate {
  id: string;
  x: number;
  mountY?: number;
}

type DragRef = { id: string; kind: Cabinet["kind"]; mode: "v" | "free"; w: number; h: number; origX: number; origMy: number; downX: number; downYUp: number } | null;

export function KitchenElevation({
  cabs,
  runLen,
  ceiling,
  className,
  dims = false,
  mode = "real",
  magnet = true,
  guide = true,
  selectedId = null,
  onSelect,
  onEditDim,
  onReorder,
}: {
  cabs: Cabinet[];
  runLen: number;
  ceiling: number;
  className?: string;
  dims?: boolean;
  /** furniture render style — real (filled) / xray (faded) / wire (outlines) */
  mode?: "real" | "xray" | "wire";
  /** snapping / reorder on drag (off = free positioning, overlaps allowed) */
  magnet?: boolean;
  /** show alignment guide lines */
  guide?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onEditDim?: (e: EditDim) => void;
  /** commit moved modules (row re-tile x + the dragged module's mountY) */
  onReorder?: (updates: ReorderUpdate[]) => void;
}) {
  const [dragPos, setDragPos] = useState<{ id: string; x: number; mountY?: number; mode: "v" | "free" } | null>(null);
  const [guides, setGuides] = useState<{ vx?: number; hy?: number } | null>(null);
  const dragRef = useRef<DragRef>(null);
  const lastPos = useRef<{ x: number; mountY?: number } | null>(null);
  const moved = useRef(false); // did the handle actually drag (vs a bare tap)?

  const cabsById: Record<string, Cabinet> = {};
  cabs.forEach((c) => (cabsById[c.id] = c));

  // committed layout x for every module (left→right per kind lane)
  const baseX: Record<string, number> = {};
  {
    const cur: Record<string, number> = { base: 0, tall: 0, upper: 0 };
    for (const c of cabs) {
      baseX[c.id] = c.x ?? cur[c.kind];
      cur[c.kind] = baseX[c.id] + c.w;
    }
  }

  // live row re-tiling while dragging (insert the dragged module at the slot its
  // centre is over; pack the row from its start in the new order)
  const inFloorRow = (c: Cabinet) => c.kind === "base" || c.kind === "tall";
  const tileRow = (draggedId: string, draggedX: number): Record<string, number> | null => {
    const D = cabsById[draggedId];
    if (!D) return null;
    const member = (c: Cabinet) =>
      (inFloorRow(D) ? inFloorRow(c) : c.kind === "upper") && c.appliance !== "filler" && (c.run ?? 0) === (D.run ?? 0);
    const rowMembers = cabs.filter(member);
    if (rowMembers.length < 2) return null;
    const rowStart = Math.min(...rowMembers.map((c) => baseX[c.id]));
    const sibs = rowMembers.filter((c) => c.id !== D.id).sort((a, b) => baseX[a.id] - baseX[b.id]);
    const draggedCenter = draggedX + D.w / 2;
    let k = 0;
    for (const sb of sibs) if (baseX[sb.id] + sb.w / 2 < draggedCenter) k++;
    const order = [...sibs.slice(0, k), D, ...sibs.slice(k)];
    const out: Record<string, number> = {};
    let run = rowStart;
    for (const c of order) {
      out[c.id] = run;
      run += c.w;
    }
    return out;
  };
  // reorder only when the magnet is on (off = free positioning, can overlap)
  const tiling = dragPos && dragPos.mode === "free" && magnet ? tileRow(dragPos.id, dragPos.x) : null;
  const dispX = (c: Cabinet) => (dragPos && dragPos.id === c.id ? dragPos.x : tiling && tiling[c.id] != null ? tiling[c.id] : baseX[c.id]);
  const dispMount = (c: Cabinet) => {
    const def = c.appliance === "hood" ? c.mountY ?? HOOD_DEFAULT : c.mountY ?? GEOM.upperBottom;
    return dragPos && dragPos.id === c.id && dragPos.mountY != null ? dragPos.mountY : def;
  };

  const nodes: React.ReactNode[] = [];
  const interiorNodes: React.ReactNode[] = []; // shelves/dividers, revealed in xray/lines
  const hits: Hit[] = [];
  const rects: Rect[] = [];
  const floorMods: WidthMod[] = [];
  const upperMods: WidthMod[] = [];
  const floorCabs = cabs.filter((c) => c.kind === "base" || c.kind === "tall");
  let maxTop = GEOM.plinth + GEOM.baseH + GEOM.worktop;

  cabs.forEach((c) => {
    if (c.appliance === "filler") return; // scribe panels handled by the gap pass
    if (c.corner) return; // diagonal corner units don't map onto a flat wall elevation
    const x = dispX(c);
    const mountY = dispMount(c);
    nodes.push(
      <g key={c.id} style={{ transform: `translate(${x}px, 0)`, transition: dragPos && dragPos.id === c.id ? "none" : ANIM }}>
        {moduleLocal(c, mountY)}
      </g>,
    );
    const inside = interiorLocal(c, mountY);
    if (inside.length) interiorNodes.push(<g key={`int${c.id}`} transform={`translate(${x} 0)`}>{inside}</g>);
    if (c.kind === "tall") {
      maxTop = Math.max(maxTop, GEOM.plinth + c.h);
      floorMods.push({ id: c.id, x0: x, x1: x + c.w });
      hits.push({ id: c.id, x, y: 0, w: c.w, h: GEOM.plinth + c.h });
      rects.push({ id: c.id, kind: "tall", x0: x, x1: x + c.w, cyLow: GEOM.plinth, cyHigh: GEOM.plinth + c.h, w: c.w, h: c.h });
    } else if (c.kind === "upper") {
      if (c.appliance === "hood") {
        const topY = mountY + 360;
        maxTop = Math.max(maxTop, topY);
        hits.push({ id: c.id, x: x + c.w * 0.2, y: mountY, w: c.w * 0.6, h: topY - mountY });
        rects.push({ id: c.id, kind: "upper", x0: x, x1: x + c.w, cyLow: mountY, cyHigh: topY, w: c.w, h: topY - mountY });
      } else {
        maxTop = Math.max(maxTop, mountY + c.h);
        upperMods.push({ id: c.id, x0: x, x1: x + c.w });
        hits.push({ id: c.id, x, y: mountY, w: c.w, h: c.h });
        rects.push({ id: c.id, kind: "upper", x0: x, x1: x + c.w, cyLow: mountY, cyHigh: mountY + c.h, w: c.w, h: c.h });
      }
    } else {
      const worktopY = GEOM.plinth + c.h;
      maxTop = Math.max(maxTop, worktopY + GEOM.worktop);
      floorMods.push({ id: c.id, x0: x, x1: x + c.w });
      hits.push({ id: c.id, x, y: 0, w: c.w, h: worktopY + GEOM.worktop });
      rects.push({ id: c.id, kind: "base", x0: x, x1: x + c.w, cyLow: GEOM.plinth, cyHigh: worktopY, w: c.w, h: c.h });
    }
  });

  // filler / scribe panels (absolute, no reorder) — drawn into fillerNodes below
  const covered = floorCabs.map((c) => [baseX[c.id], baseX[c.id] + c.w] as [number, number]).sort((a, b) => a[0] - b[0]);
  const fillerTop = GEOM.plinth + GEOM.baseH + GEOM.worktop;

  // ---- layout + zoom ----
  const mX = 80;
  const leftPad = dims ? 520 : mX;
  const rightPad = dims ? 140 : mX;
  const topPad = dims ? 260 : 0;
  const botPad = dims ? 360 : 0;
  const viewH = Math.min(ceiling, maxTop + 160);
  const box = { x: -leftPad, y: -topPad, w: runLen + leftPad + rightPad, h: viewH + topPad + botPad };
  const zoom = useSvgZoom(box, `${Math.round(runLen)}|${dims}`);
  const s = zoom.scale;
  const U = box.w * s;

  // filler panels in mm-up space
  const fillerNodes: React.ReactNode[] = [];
  {
    let p = 0;
    for (const [a, b] of covered) {
      if (a - p > 8) fillerNodes.push(<rect key={`fl${p}`} x={p} y={0} width={a - p} height={fillerTop} fill={C.filler} stroke={C.facadeLine} strokeWidth={3} />);
      p = Math.max(p, b);
    }
    if (runLen - p > 8) fillerNodes.push(<rect key="fl-end" x={p} y={0} width={runLen - p} height={fillerTop} fill={C.filler} stroke={C.facadeLine} strokeWidth={3} />);
  }

  const selRect = selectedId ? rects.find((r) => r.id === selectedId) : undefined;
  const selBox = selectedId ? hits.find((h) => h.id === selectedId) : undefined;

  // ---- pointer → mm + drag (vertical mountY snaps; horizontal reorders) ----
  const clientToMm = (e: React.PointerEvent) => {
    const svg = zoom.svgRef.current;
    if (!svg) return { x: 0, yUp: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, yUp: 0 };
    const r = pt.matrixTransform(m.inverse());
    return { x: r.x, yUp: viewH - r.y };
  };
  const TH = 0.035 * U; // align/snap threshold (≈ constant on screen)
  // nearest of `edges` to either dragged edge in `targets`; returns the matched edge
  // and the offset to apply to align (only within TH)
  const nearestEdge = (targets: number[], edges: number[]) => {
    let best = TH;
    let snap = 0;
    let edge: number | undefined;
    for (const oe of edges) for (const de of targets) {
      const dd = Math.abs(de - oe);
      if (dd < best) { best = dd; snap = oe - de; edge = oe; }
    }
    return { snap, edge };
  };
  const onHandleDown = (rect: Rect, mode: "v" | "free") => (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const mm = clientToMm(e);
    dragRef.current = { id: rect.id, kind: rect.kind, mode, w: rect.w, h: rect.h, origX: rect.x0, origMy: rect.cyLow, downX: mm.x, downYUp: mm.yUp };
    lastPos.current = { x: rect.x0, mountY: rect.cyLow };
    moved.current = false;
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    moved.current = true;
    const mm = clientToMm(e);
    const others = rects.filter((r) => r.id !== d.id);
    const rawX = d.mode === "v" ? d.origX : d.origX + (mm.x - d.downX);
    let mountY: number | undefined;
    let gVx: number | undefined;
    let gHy: number | undefined;

    // horizontal: magnet-on free-drag reorders (no edge snap/guide); magnet-off is
    // free, with a passive x-alignment guide line when `guide` is on
    if (d.mode !== "v" && !magnet && guide) {
      gVx = nearestEdge([rawX, rawX + d.w], others.flatMap((r) => [r.x0, r.x1])).edge;
    }
    // vertical (wall units): magnet snaps mountY to edges; otherwise free, with a
    // passive y-alignment guide when `guide` is on
    if (d.kind === "upper") {
      const rawMy = d.origMy + (mm.yUp - d.downYUp);
      const a = nearestEdge([rawMy, rawMy + d.h], others.flatMap((r) => [r.cyLow, r.cyHigh]));
      if (magnet) {
        mountY = a.edge != null ? rawMy + a.snap : rawMy;
        gHy = a.edge;
      } else {
        mountY = rawMy;
        if (guide) gHy = a.edge;
      }
    }
    lastPos.current = { x: rawX, mountY };
    setDragPos({ id: d.id, x: rawX, mountY, mode: d.mode });
    setGuides(guide ? { vx: gVx, hy: gHy } : null);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    dragRef.current = null;
    setDragPos(null);
    setGuides(null);
    if (!moved.current) return; // a bare tap on the handle — no commit, no undo step
    const lp = lastPos.current ?? { x: d.origX };
    const updates: ReorderUpdate[] = [];
    if (magnet && d.mode === "free") {
      const tile = tileRow(d.id, lp.x); // horizontal drag → re-tile the row
      if (tile) for (const [id, x] of Object.entries(tile)) updates.push({ id, x: Math.round(x) });
      else updates.push({ id: d.id, x: Math.round(lp.x) });
    } else {
      const x = d.mode === "v" ? Math.round(d.origX) : Math.round(lp.x); // free / vertical-only
      updates.push({ id: d.id, x });
    }
    const me = updates.find((u) => u.id === d.id);
    if (me && d.kind === "upper" && lp.mountY != null) me.mountY = Math.round(lp.mountY);
    onReorder?.(updates);
  };

  // overlap warning — when free positioning may overlap (skip mid magnet-reorder drag)
  const overlap = new Set<string>();
  if (!magnet || !dragPos) {
    const isFloor = (k: Cabinet["kind"]) => k === "base" || k === "tall";
    const EPS = 6;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (isFloor(a.kind) !== isFloor(b.kind)) continue; // different rows never clash
        if (!(a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS)) continue; // no x overlap
        if (isFloor(a.kind) || (a.cyLow < b.cyHigh - EPS && a.cyHigh > b.cyLow + EPS)) {
          overlap.add(a.id);
          overlap.add(b.id);
        }
      }
    }
  }

  // ---- dimension chains (sizes scale by `s` → constant on screen) ----
  const dimNodes: React.ReactNode[] = [];
  if (dims) {
    const TICK = 26 * s;
    const STK = 4 * s;
    const FONT = 120 * s;
    const FONT_S = 150 * s;
    const BELOW = 120 * s;
    const BELOW2 = 250 * s;
    const ABOVE = 70 * s;
    const editClick = (value: number, cabId: string, kind: "w" | "h") =>
      onEditDim ? (e: React.MouseEvent) => onEditDim({ clientX: e.clientX, clientY: e.clientY, value, cabId, kind }) : undefined;
    const hDim = (x0: number, x1: number, y: number, label: string, key: string, strong: boolean, onClick?: (e: React.MouseEvent) => void) => {
      const col = onClick ? C.sel : strong ? "#222" : C.dim;
      const cx = (x0 + x1) / 2;
      dimNodes.push(
        <g key={key}>
          <line x1={x0} y1={y - TICK} x2={x0} y2={y + TICK} stroke={col} strokeWidth={STK} />
          <line x1={x1} y1={y - TICK} x2={x1} y2={y + TICK} stroke={col} strokeWidth={STK} />
          <line x1={x0} y1={y} x2={x1} y2={y} stroke={col} strokeWidth={STK} />
          <g onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
            {onClick && <rect x={cx - 220 * s} y={y - 170 * s} width={440 * s} height={150 * s} fill="transparent" />}
            <text x={cx} y={y - 26 * s} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={strong ? FONT_S : FONT} fontWeight={strong ? 600 : 400} fill={col}>{label}</text>
          </g>
        </g>,
      );
    };
    const vDim = (x: number, mmLow: number, mmHigh: number, label: string, key: string, onClick?: (e: React.MouseEvent) => void) => {
      const col = onClick ? C.sel : C.dim;
      const yBot = viewH - mmLow;
      const yTop = viewH - mmHigh;
      const my = (yBot + yTop) / 2;
      dimNodes.push(
        <g key={key}>
          <line x1={x - TICK} y1={yBot} x2={x + TICK} y2={yBot} stroke={col} strokeWidth={STK} />
          <line x1={x - TICK} y1={yTop} x2={x + TICK} y2={yTop} stroke={col} strokeWidth={STK} />
          <line x1={x} y1={yBot} x2={x} y2={yTop} stroke={col} strokeWidth={STK} />
          <g onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
            {onClick && <rect x={x - 150 * s} y={my - 220 * s} width={130 * s} height={440 * s} fill="transparent" />}
            <text x={x - 30 * s} y={my} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={FONT} fill={col} transform={`rotate(-90 ${x - 30 * s} ${my})`}>{label}</text>
          </g>
        </g>,
      );
    };

    // worktop (counter) top — the reference the wall-unit gap is measured from
    const baseRef = floorCabs.find((c) => c.kind === "base");
    const counterTopY = baseRef ? GEOM.plinth + baseRef.h + GEOM.worktop : GEOM.plinth + GEOM.baseH + GEOM.worktop;

    if (selRect) {
      const cab = cabsById[selRect.id];
      hDim(selRect.x0, selRect.x1, viewH + BELOW, `${cab.w}`, "selwB", false, editClick(cab.w, cab.id, "w"));
      hDim(selRect.x0, selRect.x1, viewH - maxTop - ABOVE, `${cab.w}`, "selwT", false, editClick(cab.w, cab.id, "w"));
      vDim(selRect.x0 - 130 * s, selRect.cyLow, selRect.cyHigh, `${cab.h}`, "selh", editClick(cab.h, cab.id, "h"));
      // wall unit: also show the gap down to the worktop (continues the same chain)
      if (selRect.kind === "upper" && selRect.cyLow > counterTopY + 1) {
        vDim(selRect.x0 - 130 * s, counterTopY, selRect.cyLow, `${Math.round(selRect.cyLow - counterTopY)}`, "selgap");
      }
    } else {
      floorMods.sort((a, b) => a.x0 - b.x0).forEach((m, k) => hDim(m.x0, m.x1, viewH + BELOW, `${Math.round(m.x1 - m.x0)}`, `fw${k}`, false, editClick(m.x1 - m.x0, m.id, "w")));
      hDim(0, runLen, viewH + BELOW2, `${runLen}`, "total", true);
      if (upperMods.length) upperMods.sort((a, b) => a.x0 - b.x0).forEach((m, k) => hDim(m.x0, m.x1, viewH - maxTop - ABOVE, `${Math.round(m.x1 - m.x0)}`, `uw${k}`, false, editClick(m.x1 - m.x0, m.id, "w")));
      const refFloor = floorCabs.find((c) => c.kind === "base") ?? floorCabs[0];
      const refUpper = cabs.find((c) => c.kind === "upper" && c.appliance !== "hood");
      const innerX = -150 * s;
      if (refFloor) {
        vDim(innerX, 0, GEOM.plinth, `${GEOM.plinth}`, "vplinth");
        vDim(innerX, GEOM.plinth, GEOM.plinth + refFloor.h, `${refFloor.h}`, "vcarc", editClick(refFloor.h, refFloor.id, "h"));
        if (refFloor.kind === "base") vDim(innerX, GEOM.plinth + refFloor.h, GEOM.plinth + refFloor.h + GEOM.worktop, `${GEOM.worktop}`, "vwt");
      }
      if (refUpper) {
        const ub = refUpper.mountY ?? GEOM.upperBottom;
        // gap between the worktop and the wall unit (the backsplash height)
        if (ub > counterTopY + 1) vDim(innerX, counterTopY, ub, `${Math.round(ub - counterTopY)}`, "vgap");
        vDim(innerX, ub, ub + refUpper.h, `${refUpper.h}`, "vup", editClick(refUpper.h, refUpper.id, "h"));
      }
      vDim(-330 * s, 0, maxTop, `${maxTop}`, "voverall");
    }
  }

  // ---- move handles (selected module) ----
  const handleNodes: React.ReactNode[] = [];
  if (dims && selRect && onReorder) {
    const R = 0.05 * U;
    const isc = (0.9 * R) / 16;
    const cx = (selRect.x0 + selRect.x1) / 2;
    const scyMid = viewH - (selRect.cyLow + selRect.cyHigh) / 2;
    const handle = (scy: number, path: string, mode: "v" | "free", key: string) => (
      <g key={key} transform={`translate(${cx} ${scy})`} onPointerDown={onHandleDown(selRect, mode)} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp} style={{ cursor: "pointer", touchAction: "none" }}>
        <circle r={R} fill="#fff" stroke="#cfcfcf" strokeWidth={0.004 * U} />
        <g transform={`translate(${-16 * isc} ${-16 * isc}) scale(${isc})`}>
          <path d={path} fill="#1c1b18" />
        </g>
      </g>
    );
    if (selRect.kind === "upper") {
      handleNodes.push(handle(scyMid - 1.25 * R, ICON_VMOVE_PATH, "v", "h-v"));
      handleNodes.push(handle(scyMid + 1.25 * R, ICON_DRAG_PATH, "free", "h-d"));
    } else {
      handleNodes.push(handle(scyMid, ICON_DRAG_PATH, "free", "h-d"));
    }
  }

  return (
    <svg ref={zoom.svgRef} className={className} style={{ touchAction: "none" }} viewBox={zoom.vbStr} preserveAspectRatio="xMidYMid meet" {...zoom.bind}>
      {onSelect && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="transparent" onClick={() => onSelect(null)} />}

      <g transform={`translate(0 ${viewH}) scale(1 -1)`}>
        {dims && <rect x={-mX} y={0} width={runLen + mX * 2} height={viewH} fill="#eceef1" onClick={onSelect ? () => onSelect(null) : undefined} />}
        <line x1={-mX} y1={0} x2={runLen + mX} y2={0} stroke={C.floor} strokeWidth={10} />
        {/* furniture body — render style applied here only (UI below stays visible) */}
        <g className={mode === "wire" ? "svg-wire elev-wire" : mode === "xray" ? "svg-xray" : undefined}>
          {fillerNodes}
          {nodes}
        </g>
        {/* interior reveal (shelves/dividers) — only in transparency/lines, drawn on
            top so it shows THROUGH the faded facade (group opacity hides what's behind) */}
        {mode !== "real" && interiorNodes.length > 0 && (
          <g className={mode === "wire" ? "svg-wire elev-wire" : undefined} pointerEvents="none">
            {interiorNodes}
          </g>
        )}
        {/* light-red overlap warning (free positioning only) */}
        {[...overlap].map((id) => {
          const h = hits.find((x) => x.id === id);
          return h ? <rect key={`ov${id}`} x={h.x} y={h.y} width={h.w} height={h.h} fill="rgba(229,57,53,0.26)" stroke="#e53935" strokeWidth={16} pointerEvents="none" /> : null;
        })}
        {selBox && <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill={C.sel} fillOpacity={0.14} stroke={C.sel} strokeWidth={20} />}
        {onSelect && hits.map((h) => <rect key={`hit${h.id}`} x={h.x} y={h.y} width={h.w} height={h.h} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelect(h.id)} />)}
      </g>

      {/* alignment guides (vertical = x-edge, horizontal = y-edge) */}
      {guides?.vx != null && <line x1={guides.vx} y1={box.y} x2={guides.vx} y2={box.y + box.h} stroke={C.sel} strokeWidth={0.007 * U} strokeDasharray={`${0.03 * U} ${0.02 * U}`} />}
      {guides?.hy != null && <line x1={box.x} y1={viewH - guides.hy} x2={box.x + box.w} y2={viewH - guides.hy} stroke={C.sel} strokeWidth={0.007 * U} strokeDasharray={`${0.03 * U} ${0.02 * U}`} />}

      {dimNodes}
      {handleNodes}
    </svg>
  );
}
