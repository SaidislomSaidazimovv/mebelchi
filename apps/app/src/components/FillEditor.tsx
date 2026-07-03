// Focused full-screen "Наполнение" (fill) editor for ONE cabinet — a TOOL-BASED hybrid
// editor. Four tools (like the main toolbar): Draw Lines (add horizontal/vertical
// separators → cells), Move/Resize (drag a separator or the module's edges), Add Doors
// (tap a cell → a door; drag over cells → one combined door), Add Drawers (tap a cell →
// a drawer). A selected door/drawer shows Opening + Handle options up top; a selected item
// shows a delete button. 3D/2D toggle (left) + undo/redo (right). Writes the cab's `layout`.

import { useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { cabinetLayout, cellSizes, isLeaf, type Cabinet, type Cell, type CombinedDoor, type DoorOpening, type HandlePos } from "../model/cabinet";
import type { KitchenStyle } from "../model/layout";
import { CabinetPreview3D } from "./CabinetPreview3D";
import { OrganizerEditor } from "./OrganizerEditor";
import { IconUndo, IconRedo } from "./icons";

interface Props {
  cab: Cabinet;
  index: number;
  name: string;
  style: KitchenStyle;
  patchCab: (i: number, patch: Partial<Cabinet>) => void;
  patchCabLive: (i: number, patch: Partial<Cabinet>) => void;
  beginEdit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

type Tool = "draw" | "move" | "door" | "drawer";
const T = 18, PAD = 110, EDGE_STEP = 10, MIN_CELL = 0.12;
const LINE = "#c7b593", ACCENT = "#00a961", DOORBG = "#e7ddc9", DRAWBG = "#e4d7bb", OPENBG = "#f6f2e8", HANDLE = "#9a8b6e";

// ── tool icons (from the user's SVGs) ──
const Ico = ({ d }: { d: string }) => (<svg viewBox="0 0 32 32" width="26" height="26" fill="none"><path d={d} fill="currentColor" /></svg>);
const D_DRAW = "M22 3.58594L17.4785 8.10742L10.7383 10.0352C9.41728 10.3922 8.3715 11.3805 7.9375 12.6855L3.85938 25.2734L5.29297 26.707L6.72656 28.1406L19.3203 24.0605C20.6183 23.6285 21.6069 22.5814 21.9609 21.2734L23.8887 14.5254L28.4141 10L22 3.58594ZM22 6.41406L25.5859 10L23 12.5859L19.4141 9L22 6.41406ZM17.7109 10.125L21.875 14.2891L20.0332 20.7383C19.8512 21.4103 19.3493 21.9422 18.6973 22.1602L7.68945 25.7246L13.4844 19.9297C13.6525 19.9755 13.8258 19.9991 14 20C14.5304 20 15.0391 19.7893 15.4142 19.4142C15.7893 19.0391 16 18.5304 16 18C16 17.4696 15.7893 16.9609 15.4142 16.5858C15.0391 16.2107 14.5304 16 14 16C13.6936 16.0004 13.3914 16.0712 13.1168 16.2069C12.8421 16.3426 12.6023 16.5396 12.4158 16.7827C12.2293 17.0258 12.1012 17.3085 12.0413 17.6089C11.9814 17.9094 11.9913 18.2196 12.0703 18.5156L6.27539 24.3105L9.83789 13.3105C10.0579 12.6495 10.5904 12.1489 11.2754 11.9629L17.7109 10.125Z";
const D_MOVE = "M16 2.58594L11.293 7.29297L12.707 8.70703L15 6.41406V12H17V6.41406L19.293 8.70703L20.707 7.29297L16 2.58594ZM7.29297 11.293L2.58594 16L7.29297 20.707L8.70703 19.293L6.41406 17H13V15H6.41406L8.70703 12.707L7.29297 11.293ZM24.707 11.293L23.293 12.707L25.5859 15H19V17H25.5859L23.293 19.293L24.707 20.707L29.4141 16L24.707 11.293ZM15 19V25.5859L12.707 23.293L11.293 24.707L16 29.4141L20.707 24.707L19.293 23.293L17 25.5859V19H15Z";
const D_DOOR = "M8 5V27H24V5H8ZM10 7H22V25H10V7ZM20 15C19.4492 15 19 15.4492 19 16C19 16.5508 19.4492 17 20 17C20.5508 17 21 16.5508 21 16C21 15.4492 20.5508 15 20 15Z";
const D_DRAWER = "M5 5V27H27V5H5ZM7 7H25V15H7V7ZM13 9V11H19V9H13ZM7 17H25V25H7V17ZM13 19V21H19V19H13Z";

// ── cell-tree ops (cells addressed by a path of child indices) ──
const getCell = (root: Cell, p: number[]): Cell => { let c = root; for (const i of p) c = c.children![i]; return c; };
const replaceCell = (root: Cell, p: number[], fn: (c: Cell) => Cell): Cell => {
  if (p.length === 0) return fn(root);
  const [i, ...rest] = p;
  return { ...root, children: root.children!.map((ch, k) => (k === i ? replaceCell(ch, rest, fn) : ch)) };
};
const editorLeaf = (c: Cell) => !!c.front || isLeaf(c); // a front-node is opaque in the editor
const samePath = (a: number[] | null | undefined, b: number[]) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);
// NORMALIZE: inline any same-direction split nested in its parent so N parallel separators
// are always flat siblings (moving one never drags the others). Idempotent; leaves + fronts
// pass through untouched. Applied when reading the layout AND after every split.
const flatten = (cell: Cell): Cell => {
  if (!cell.children || !cell.children.length) return cell;
  const kids = cell.children.map(flatten);
  const sizes = cellSizes(cell);
  const oc: Cell[] = [], os: number[] = [];
  kids.forEach((ch, i) => {
    if (!ch.front && ch.split === cell.split && ch.children && ch.children.length) {
      const cs = cellSizes(ch);
      ch.children.forEach((gc, j) => { oc.push(gc); os.push(sizes[i] * cs[j]); });
    } else { oc.push(ch); os.push(sizes[i]); }
  });
  return { ...cell, children: oc, sizes: os };
};

const deleteAt = (root: Cell, p: number[]): Cell => {
  if (p.length === 0) return {};
  const idx = p[p.length - 1];
  return replaceCell(root, p.slice(0, -1), (par) => {
    const children = par.children!.filter((_, k) => k !== idx);
    if (children.length === 1) return children[0];
    const sizes = cellSizes(par).filter((_, k) => k !== idx);
    const tot = sizes.reduce((a, b) => a + b, 0) || 1;
    return { ...par, children, sizes: sizes.map((s) => s / tot) };
  });
};
const deleteDivider = (root: Cell, parentPath: number[], i: number): Cell =>
  replaceCell(root, parentPath, (par) => {
    const children = par.children!.filter((_, k) => k !== i + 1); // merge i+1 into i
    if (children.length === 1) return children[0];
    const s = cellSizes(par);
    const sizes = s.filter((_, k) => k !== i + 1).map((v, k) => (k === i ? v + s[i + 1] : v));
    return { ...par, children, sizes };
  });

interface Leaf { cell: Cell; path: number[]; fx0: number; fy0: number; fx1: number; fy1: number; }
interface Div { parent: number[]; i: number; split: "rows" | "cols"; pfx0: number; pfy0: number; pfx1: number; pfy1: number; sizes: number[]; af: number; b0: number; b1: number; }
function layoutTree(root: Cell): { leaves: Leaf[]; divs: Div[] } {
  const leaves: Leaf[] = [], divs: Div[] = [];
  const walk = (cell: Cell, path: number[], fx0: number, fy0: number, fx1: number, fy1: number) => {
    if (editorLeaf(cell)) { leaves.push({ cell, path, fx0, fy0, fx1, fy1 }); return; }
    const sizes = cellSizes(cell);
    let acc = 0;
    for (let i = 0; i < cell.children!.length; i++) {
      const f = sizes[i];
      if (cell.split === "rows") walk(cell.children![i], [...path, i], fx0, fy0 + (fy1 - fy0) * acc, fx1, fy0 + (fy1 - fy0) * (acc + f));
      else walk(cell.children![i], [...path, i], fx0 + (fx1 - fx0) * acc, fy0, fx0 + (fx1 - fx0) * (acc + f), fy1);
      acc += f;
      if (i < cell.children!.length - 1) divs.push(cell.split === "rows"
        ? { parent: path, i, split: "rows", pfx0: fx0, pfy0: fy0, pfx1: fx1, pfy1: fy1, sizes, af: fy0 + (fy1 - fy0) * acc, b0: fx0, b1: fx1 }
        : { parent: path, i, split: "cols", pfx0: fx0, pfy0: fy0, pfx1: fx1, pfy1: fy1, sizes, af: fx0 + (fx1 - fx0) * acc, b0: fy0, b1: fy1 });
    }
  };
  walk(root, [], 0, 0, 1, 1);
  return { leaves, divs };
}

type Sel = { kind: "cell"; path: number[] } | { kind: "div"; parent: number[]; i: number } | { kind: "cdoor"; idx: number } | null;
const rectsOverlap = (a: { fx0: number; fy0: number; fx1: number; fy1: number }, b: { fx0: number; fy0: number; fx1: number; fy1: number }) => a.fx0 < b.fx1 - 1e-4 && a.fx1 > b.fx0 + 1e-4 && a.fy0 < b.fy1 - 1e-4 && a.fy1 > b.fy0 + 1e-4;
type Drag =
  | { kind: "draw"; path: number[]; fx0: number; fy0: number; fx1: number; fy1: number; x0: number; y0: number; dir: "rows" | "cols"; af: number; moved: boolean }
  | { kind: "front"; front: "door" | "drawer"; x0: number; y0: number; covered: number[][]; moved: boolean }
  | { kind: "div"; d: Div; origCds: CombinedDoor[]; moved: boolean }
  | { kind: "cedge"; idx: number; edge: "l" | "r" | "t" | "b"; moved: boolean }
  | { kind: "edge"; edge: "top" | "right"; downX: number; downY: number; base: number; mmPerPx: number; moved: boolean };

// small dropdown for the door/drawer option bar
function Dropdown({ label, value, options, optLabel, onPick }: { label: string; value: string; options: string[]; optLabel: (v: string) => string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fe-dd">
      <span className="fe-dd-lbl">{label}</span>
      <button className="fe-dd-btn" onClick={() => setOpen((o) => !o)} type="button">{optLabel(value)} <span className="fe-dd-ch">▾</span></button>
      {open && <div className="fe-dd-menu">{options.map((o) => <button key={o} className={o === value ? "sel" : ""} onClick={() => { onPick(o); setOpen(false); }} type="button">{optLabel(o)}</button>)}</div>}
    </div>
  );
}

export function FillEditor({ cab, index, name, style, patchCab, patchCabLive, beginEdit, undo, redo, canUndo, canRedo, onClose }: Props) {
  const t = useT();
  const [view3d, setView3d] = useState(false);
  const [tool, setTool] = useState<Tool>("draw");
  const [sel, setSel] = useState<Sel>(null);
  const [preview, setPreview] = useState<React.ReactNode>(null);
  const [orgOpen, setOrgOpen] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickTool = (k: Tool) => {
    setTool(k); setSel(null);
    setTip((t.fe.tip as Record<string, string>)[k]);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 3500);
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const W = cab.w, H = cab.h;
  const interiorW = W - 2 * T, interiorH = H - 2 * T;
  const vbW = W + PAD * 2, vbH = H + PAD * 2;
  const x0 = PAD + T, y0 = PAD + T, iw = W - 2 * T, ih = H - 2 * T;

  const root = flatten(cabinetLayout(cab)); // always a flat tree → siblings, no nesting bug
  const cds = cab.combinedDoors ?? [];
  const { leaves, divs } = layoutTree(root);
  const selCell = sel?.kind === "cell" && leaves.find((l) => samePath(sel.path, l.path)) ? getCell(root, sel.path) : null;
  const selCd = sel?.kind === "cdoor" && cds[sel.idx] ? cds[sel.idx] : null;
  // grid lines (for snapping a door edge) + is a separator behind a combined door (dashed)
  const gridX = [0, 1, ...divs.filter((d) => d.split === "cols").map((d) => d.af)];
  const gridY = [0, 1, ...divs.filter((d) => d.split === "rows").map((d) => d.af)];
  const snapTo = (v: number, lines: number[]) => { let best = v, bd = 0.045; for (const l of lines) { const dd = Math.abs(v - l); if (dd < bd) { bd = dd; best = l; } } return best; };
  const behindDoor = (dv: Div) => cds.some((cd) => dv.split === "rows"
    ? dv.af > cd.fy0 + 1e-3 && dv.af < cd.fy1 - 1e-3 && dv.b0 < cd.fx1 - 1e-3 && dv.b1 > cd.fx0 + 1e-3
    : dv.af > cd.fx0 + 1e-3 && dv.af < cd.fx1 - 1e-3 && dv.b0 < cd.fy1 - 1e-3 && dv.b1 > cd.fy0 + 1e-3);

  const svgX = (fx: number) => x0 + iw * fx;
  const svgY = (fy: number) => y0 + ih * (1 - fy);
  const fracFromEvent = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!svgRef.current || !m) return null;
    const p = svgRef.current.createSVGPoint(); p.x = cx; p.y = cy;
    const q = p.matrixTransform(m.inverse());
    return { xf: (q.x - x0) / iw, yf: 1 - (q.y - y0) / ih };
  };
  const commit = (next: Cell, live = false) => (live ? patchCabLive : patchCab)(index, { layout: next });
  const optLabel = (v: string) => (t.fe.opt as Record<string, string>)[v] ?? v;

  // ── gestures ──
  const preventTouch = (e: TouchEvent) => e.preventDefault();
  const detach = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("touchmove", preventTouch); };
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current, f = fracFromEvent(e.clientX, e.clientY);
    if (!d || !f) return;
    if (d.kind === "draw") {
      d.moved = true;
      // follow the hand: a mostly-VERTICAL drag draws a VERTICAL line (cols split); the
      // line sits where you touched (perpendicular coord), spanning the cell.
      const dx = Math.abs(f.xf - d.x0), dy = Math.abs(f.yf - d.y0);
      d.dir = dy >= dx ? "cols" : "rows";
      const m = 0.12;
      if (d.dir === "cols") {
        const fx = Math.max(d.fx0 + (d.fx1 - d.fx0) * m, Math.min(d.fx1 - (d.fx1 - d.fx0) * m, d.x0));
        d.af = fx;
        setPreview(<line x1={svgX(fx)} y1={svgY(d.fy0)} x2={svgX(fx)} y2={svgY(d.fy1)} stroke={ACCENT} strokeWidth={9} strokeDasharray="4 9" strokeLinecap="round" />);
      } else {
        const fy = Math.max(d.fy0 + (d.fy1 - d.fy0) * m, Math.min(d.fy1 - (d.fy1 - d.fy0) * m, d.y0));
        d.af = fy;
        setPreview(<line x1={svgX(d.fx0)} y1={svgY(fy)} x2={svgX(d.fx1)} y2={svgY(fy)} stroke={ACCENT} strokeWidth={9} strokeDasharray="4 9" strokeLinecap="round" />);
      }
    } else if (d.kind === "front") {
      d.moved = true;
      const rx0 = Math.min(d.x0, f.xf), rx1 = Math.max(d.x0, f.xf), ry0 = Math.min(d.y0, f.yf), ry1 = Math.max(d.y0, f.yf);
      d.covered = leaves.filter((l) => { const cx = (l.fx0 + l.fx1) / 2, cy = (l.fy0 + l.fy1) / 2; return cx >= rx0 && cx <= rx1 && cy >= ry0 && cy <= ry1; }).map((l) => l.path);
      const box = leaves.filter((l) => d.covered.some((p) => samePath(p, l.path)));
      const bx0 = Math.min(...box.map((l) => l.fx0)), bx1 = Math.max(...box.map((l) => l.fx1)), by0 = Math.min(...box.map((l) => l.fy0)), by1 = Math.max(...box.map((l) => l.fy1));
      setPreview(box.length ? <rect x={svgX(bx0)} y={svgY(by1)} width={iw * (bx1 - bx0)} height={ih * (by1 - by0)} fill={ACCENT} opacity={0.18} stroke={ACCENT} strokeWidth={5} /> : null);
    } else if (d.kind === "div") {
      if (!d.moved) { beginEdit(); d.moved = true; }
      const dv = d.d;
      const frac = dv.split === "rows" ? (f.yf - dv.pfy0) / (dv.pfy1 - dv.pfy0) : (f.xf - dv.pfx0) / (dv.pfx1 - dv.pfx0);
      const before = dv.sizes.slice(0, dv.i).reduce((a, b) => a + b, 0);
      const pair = dv.sizes[dv.i] + dv.sizes[dv.i + 1];
      const si = Math.max(MIN_CELL, Math.min(pair - MIN_CELL, frac - before));
      const nextLayout = replaceCell(root, dv.parent, (p) => ({ ...p, sizes: dv.sizes.map((s, k) => (k === dv.i ? si : k === dv.i + 1 ? pair - si : s)) }));
      // TRACK: any combined-door edge sitting on this separator follows it
      const newAf = dv.split === "rows" ? dv.pfy0 + (dv.pfy1 - dv.pfy0) * (before + si) : dv.pfx0 + (dv.pfx1 - dv.pfx0) * (before + si);
      const nextCds = d.origCds.map((cd) => {
        let c = cd;
        if (dv.split === "rows" && dv.b0 < cd.fx1 - 1e-3 && dv.b1 > cd.fx0 + 1e-3) {
          if (Math.abs(cd.fy0 - dv.af) < 2e-3) c = { ...c, fy0: newAf };
          if (Math.abs(cd.fy1 - dv.af) < 2e-3) c = { ...c, fy1: newAf };
        } else if (dv.split === "cols" && dv.b0 < cd.fy1 - 1e-3 && dv.b1 > cd.fy0 + 1e-3) {
          if (Math.abs(cd.fx0 - dv.af) < 2e-3) c = { ...c, fx0: newAf };
          if (Math.abs(cd.fx1 - dv.af) < 2e-3) c = { ...c, fx1: newAf };
        }
        return c;
      });
      patchCabLive(index, { layout: nextLayout, combinedDoors: nextCds });
    } else if (d.kind === "cedge") {
      if (!d.moved) { beginEdit(); d.moved = true; }
      const cd = cds[d.idx];
      if (!cd) return;
      let next = { ...cd };
      if (d.edge === "l") next.fx0 = Math.min(cd.fx1 - MIN_CELL, snapTo(f.xf, gridX));
      else if (d.edge === "r") next.fx1 = Math.max(cd.fx0 + MIN_CELL, snapTo(f.xf, gridX));
      else if (d.edge === "t") next.fy1 = Math.max(cd.fy0 + MIN_CELL, snapTo(f.yf, gridY));
      else next.fy0 = Math.min(cd.fy1 - MIN_CELL, snapTo(f.yf, gridY));
      patchCabLive(index, { combinedDoors: cds.map((c, k) => (k === d.idx ? next : c)) });
    } else {
      if (!d.moved) { beginEdit(); d.moved = true; }
      if (d.edge === "top") patchCabLive(index, { h: Math.round(Math.max(200, Math.min(2400, d.base + (d.downY - e.clientY) * d.mmPerPx)) / EDGE_STEP) * EDGE_STEP });
      else patchCabLive(index, { w: Math.round(Math.max(150, Math.min(1200, d.base + (e.clientX - d.downX) * d.mmPerPx)) / EDGE_STEP) * EDGE_STEP });
    }
  };
  const onUp = () => {
    detach();
    const d = dragRef.current; dragRef.current = null; setPreview(null);
    if (!d) return;
    if (d.kind === "draw") {
      // one separator at the drawn position (tap → split the longer side in half)
      const dir = d.moved ? d.dir : (d.fx1 - d.fx0) * interiorW >= (d.fy1 - d.fy0) * interiorH ? "cols" : "rows";
      const raw = !d.moved ? 0.5 : dir === "cols" ? (d.af - d.fx0) / (d.fx1 - d.fx0) : (d.af - d.fy0) / (d.fy1 - d.fy0);
      const pos = Math.max(0.12, Math.min(0.88, raw));
      commit(flatten(replaceCell(root, d.path, () => ({ split: dir, sizes: [pos, 1 - pos], children: [{}, {}] }))));
      setSel(null);
    } else if (d.kind === "front") {
      const paths = d.covered.length ? d.covered : [];
      if (d.front === "drawer") {
        let next = root;
        (paths.length ? paths : [dragStartPath(d)]).forEach((p) => { next = replaceCell(next, p, () => ({ front: "drawer", handle: "top" })); });
        commit(next);
      } else {
        const target = paths.length ? paths : [dragStartPath(d)];
        if (target.length === 1) {
          if (target[0]) { commit(replaceCell(root, target[0], () => ({ front: "door", opening: "left", handle: "right" }))); setSel({ kind: "cell", path: target[0] }); }
        } else {
          // combined door: one door over the bounding rect of the covered cells (any block,
          // across rows AND columns). Clear the covered cells' own fronts (they become the
          // interior behind the door), remove overlapping combined doors, add the overlay.
          const box = leaves.filter((l) => target.some((p) => samePath(p, l.path)));
          const rect = { fx0: Math.min(...box.map((l) => l.fx0)), fy0: Math.min(...box.map((l) => l.fy0)), fx1: Math.max(...box.map((l) => l.fx1)), fy1: Math.max(...box.map((l) => l.fy1)) };
          let nextLayout = root;
          target.forEach((p) => { nextLayout = replaceCell(nextLayout, p, (c) => { const { front: _f, opening: _o, handle: _h, ...rest } = c; void _f; void _o; void _h; return rest; }); });
          const nextCds = [...cds.filter((cd) => !rectsOverlap(cd, rect)), { ...rect, opening: "left" as DoorOpening, handle: "right" as HandlePos }];
          patchCab(index, { layout: nextLayout, combinedDoors: nextCds });
          setSel({ kind: "cdoor", idx: nextCds.length - 1 });
        }
      }
    }
  };
  // the leaf under the gesture's start point (for a tap that didn't move)
  const dragStartPath = (d: Drag & { x0: number; y0: number }): number[] => {
    const hit = leaves.find((l) => d.x0 >= l.fx0 && d.x0 <= l.fx1 && d.y0 >= l.fy0 && d.y0 <= l.fy1);
    return hit ? hit.path : [];
  };
  const attach = (d: Drag) => { dragRef.current = d; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("touchmove", preventTouch, { passive: false }); };

  const onLeafDown = (l: Leaf, e: React.PointerEvent) => {
    e.preventDefault();
    const f = fracFromEvent(e.clientX, e.clientY); if (!f) return;
    if (tool === "draw") attach({ kind: "draw", path: l.path, fx0: l.fx0, fy0: l.fy0, fx1: l.fx1, fy1: l.fy1, x0: f.xf, y0: f.yf, dir: "rows", af: 0, moved: false });
    else if (tool === "door" || tool === "drawer") attach({ kind: "front", front: tool, x0: f.xf, y0: f.yf, covered: [l.path], moved: false });
    else setSel({ kind: "cell", path: l.path }); // move mode → select
  };
  const onDivDown = (dv: Div, e: React.PointerEvent) => {
    if (tool !== "move") return;
    e.preventDefault(); e.stopPropagation();
    setSel({ kind: "div", parent: dv.parent, i: dv.i });
    attach({ kind: "div", d: dv, origCds: cds, moved: false });
  };
  const onCedgeDown = (idx: number, edge: "l" | "r" | "t" | "b", e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    setSel({ kind: "cdoor", idx });
    attach({ kind: "cedge", idx, edge, moved: false });
  };
  const onEdgeDown = (edge: "top" | "right", e: React.PointerEvent) => {
    if (tool !== "move") return;
    e.preventDefault(); e.stopPropagation();
    setSel(null);
    const ctm = svgRef.current?.getScreenCTM();
    attach({ kind: "edge", edge, downX: e.clientX, downY: e.clientY, base: edge === "top" ? H : W, mmPerPx: ctm ? 1 / ctm.a : 1, moved: false });
  };

  const del = () => {
    if (!sel) return;
    if (sel.kind === "cdoor") { patchCab(index, { combinedDoors: cds.filter((_, k) => k !== sel.idx) }); setSel(null); return; }
    if (sel.kind === "div") { commit(deleteDivider(root, sel.parent, sel.i)); setSel(null); return; }
    const c = getCell(root, sel.path);
    if (c.front) commit(replaceCell(root, sel.path, (x) => { const { front: _f, opening: _o, handle: _h, ...rest } = x; void _f; void _o; void _h; return rest; }));
    else commit(deleteAt(root, sel.path));
    setSel(null);
  };
  const setOpt = (patch: { opening?: DoorOpening; handle?: HandlePos }) => {
    if (sel?.kind === "cell") commit(replaceCell(root, sel.path, (c) => ({ ...c, ...patch })));
    else if (sel?.kind === "cdoor") patchCab(index, { combinedDoors: cds.map((cd, k) => (k === sel.idx ? { ...cd, ...patch } : cd)) });
  };

  const onCdDown = (idx: number, e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); setSel({ kind: "cdoor", idx }); };

  // ── render one editor-leaf (open / door / drawer) ──
  const handleMark = (l: { fx0: number; fy0: number; fx1: number; fy1: number }, pos: HandlePos | undefined): React.ReactNode => {
    const xL = svgX(l.fx0), xR = svgX(l.fx1), yT = svgY(l.fy1), yB = svgY(l.fy0), w = xR - xL, h = yB - yT, m = 16;
    const p = pos ?? "right";
    if (p === "none") return null;
    if (p === "center") return <circle cx={xL + w / 2} cy={yT + h / 2} r={11} fill={HANDLE} />;
    if (p === "top") return <rect x={xL + w / 2 - Math.min(60, w / 4)} y={yT + m} width={Math.min(120, w / 2)} height={8} rx={4} fill={HANDLE} />;
    if (p === "bottom") return <rect x={xL + w / 2 - Math.min(60, w / 4)} y={yB - m - 8} width={Math.min(120, w / 2)} height={8} rx={4} fill={HANDLE} />;
    if (p === "left") return <rect x={xL + m} y={yT + h / 2 - Math.min(60, h / 4)} width={8} height={Math.min(120, h / 2)} rx={4} fill={HANDLE} />;
    return <rect x={xR - m - 8} y={yT + h / 2 - Math.min(60, h / 4)} width={8} height={Math.min(120, h / 2)} rx={4} fill={HANDLE} />;
  };

  const doorSel = selCell?.front === "door" ? selCell : null;
  const drawerSel = selCell?.front === "drawer" ? selCell : null;
  const selLeafInfo = sel?.kind === "cell" ? leaves.find((l) => samePath(sel.path, l.path)) : undefined;
  const drawerDepth = Math.round(cab.depth ?? (cab.kind === "upper" ? 350 : 560));

  return (
    <div className="fill-editor">
      <div className="fill-head">
        <span className="fill-title">{name}</span>
        <span className="fill-sub">{t.fe.fillTitle} · {Math.round(W / 10)}×{Math.round(H / 10)} cm</span>
        <button className="fill-done" onClick={onClose} type="button">{t.fe.done}</button>
      </div>

      {/* door / drawer option bar (a combined door has door options too) */}
      {(doorSel || drawerSel || selCd) && (
        <div className="fe-optbar">
          {(doorSel || selCd) && <Dropdown label={t.fe.opening} value={(doorSel ?? selCd)!.opening ?? "left"} options={["left", "right", "top", "bottom"]} optLabel={optLabel} onPick={(v) => setOpt({ opening: v as DoorOpening })} />}
          <Dropdown label={t.fe.handlePos} value={(doorSel ?? selCd ?? drawerSel)!.handle ?? (drawerSel ? "top" : "right")} options={["top", "bottom", "left", "right", "center", "none"]} optLabel={optLabel} onPick={(v) => setOpt({ handle: v as HandlePos })} />
          {drawerSel && <button className="fe-org-btn" onClick={() => setOrgOpen(true)} type="button">{t.fe.organizer}</button>}
        </div>
      )}

      {orgOpen && drawerSel && sel?.kind === "cell" && selLeafInfo && (
        <OrganizerEditor
          organizer={drawerSel.organizer}
          widthMm={Math.max(60, Math.round(interiorW * (selLeafInfo.fx1 - selLeafInfo.fx0)))}
          depthMm={drawerDepth}
          onChange={(next, live) => commit(replaceCell(root, sel.path, (c) => ({ ...c, organizer: next })), live)}
          beginEdit={beginEdit}
          undo={undo}
          redo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onClose={() => setOrgOpen(false)}
        />
      )}

      <div className="fill-stage">
        {view3d ? (
          <CabinetPreview3D cab={cab} style={style} />
        ) : (
          <svg ref={svgRef} className="fill-svg" viewBox={`0 0 ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg">
            <rect x={PAD} y={PAD} width={W} height={H} rx={14} fill="#efeae0" stroke={LINE} strokeWidth={5} />
            {leaves.map((l) => {
              const xL = svgX(l.fx0), yT = svgY(l.fy1), w = iw * (l.fx1 - l.fx0), h = ih * (l.fy1 - l.fy0);
              const on = sel?.kind === "cell" && samePath(sel.path, l.path);
              const front = l.cell.front;
              const bg = front === "door" ? DOORBG : front === "drawer" ? DRAWBG : OPENBG;
              const wmm = Math.round(interiorW * (l.fx1 - l.fx0) / 10), hmm = Math.round(interiorH * (l.fy1 - l.fy0) / 10);
              return (
                <g key={l.path.join("-") || "root"} onPointerDown={(e) => onLeafDown(l, e)}>
                  <rect x={xL + 3} y={yT + 3} width={w - 6} height={h - 6} rx={front ? 8 : 2} fill={bg} stroke={on ? ACCENT : front ? LINE : "none"} strokeWidth={on ? 7 : front ? 3 : 0} />
                  {front && handleMark(l, l.cell.handle ?? (front === "drawer" ? "top" : (l.cell.opening === "left" ? "right" : l.cell.opening === "right" ? "left" : l.cell.opening === "top" ? "bottom" : "top")))}
                  <text x={(xL + svgX(l.fx1)) / 2} y={(yT + svgY(l.fy0)) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={30} fontFamily="Inter, sans-serif" fontWeight={on ? 700 : 500} fill={on ? ACCENT : "#8a7c5f"} pointerEvents="none">{wmm}×{hmm}</text>
                </g>
              );
            })}
            {/* combined doors — TRANSLUCENT so the separators behind show through; the body
                is pass-through in Draw/Drawer tools so you can split the cells behind it */}
            {cds.map((cd, k) => {
              const on = sel?.kind === "cdoor" && sel.idx === k;
              const xL = svgX(cd.fx0), xR = svgX(cd.fx1), yT = svgY(cd.fy1), yB = svgY(cd.fy0);
              const hpos = cd.handle ?? (cd.opening === "left" ? "right" : cd.opening === "right" ? "left" : cd.opening === "top" ? "bottom" : "top");
              const pe = tool === "move" || tool === "door" ? "auto" : "none";
              return (
                <g key={`cd${k}`}>
                  <rect x={xL + 3} y={yT + 3} width={xR - xL - 6} height={yB - yT - 6} rx={8} fill={DOORBG} fillOpacity={0.62} stroke={on ? ACCENT : LINE} strokeWidth={on ? 7 : 3} onPointerDown={(e) => onCdDown(k, e)} style={{ pointerEvents: pe as React.CSSProperties["pointerEvents"] }} />
                  <g style={{ pointerEvents: "none" }}>{handleMark(cd, hpos)}</g>
                  {on && tool === "move" && ([["l", xL, yT, xL, yB], ["r", xR, yT, xR, yB], ["t", xL, yT, xR, yT], ["b", xL, yB, xR, yB]] as [string, number, number, number, number][]).map(([edge, ex1, ey1, ex2, ey2]) => (
                    <g key={edge} className={`fill-sep ${edge === "l" || edge === "r" ? "vert" : "horiz"}`} onPointerDown={(e) => onCedgeDown(k, edge as "l" | "r" | "t" | "b", e)}>
                      <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke="transparent" strokeWidth={30} />
                      <line x1={ex1} y1={ey1} x2={ex2} y2={ey2} stroke={ACCENT} strokeWidth={6} strokeLinecap="round" />
                    </g>
                  ))}
                </g>
              );
            })}
            {/* separators — drawn ON TOP of the doors, DASHED when behind one, still editable */}
            {divs.map((dv, k) => {
              const ln = dv.split === "rows" ? { x1: svgX(dv.b0), y1: svgY(dv.af), x2: svgX(dv.b1), y2: svgY(dv.af) } : { x1: svgX(dv.af), y1: svgY(dv.b0), x2: svgX(dv.af), y2: svgY(dv.b1) };
              const on = sel?.kind === "div" && samePath(sel.parent, dv.parent) && sel.i === dv.i;
              const dashed = behindDoor(dv);
              return (
                <g key={`dv${k}`} className={`fill-sep ${dv.split === "rows" ? "horiz" : "vert"}`} onPointerDown={(e) => onDivDown(dv, e)} style={{ pointerEvents: tool === "move" ? "auto" : "none" }}>
                  <line {...ln} stroke="transparent" strokeWidth={40} />
                  <line {...ln} stroke={on ? ACCENT : dashed ? "#a6906a" : LINE} strokeWidth={on ? 13 : dashed ? 8 : 11} strokeLinecap="round" strokeDasharray={dashed ? "10 12" : undefined} />
                </g>
              );
            })}
            {preview}
            {tool === "move" && <>
              <line x1={x0} y1={y0} x2={x0 + iw} y2={y0} stroke="transparent" strokeWidth={34} className="fill-edge topedge" onPointerDown={(e) => onEdgeDown("top", e)} />
              <line x1={x0 + iw} y1={y0} x2={x0 + iw} y2={y0 + ih} stroke="transparent" strokeWidth={34} className="fill-edge rightedge" onPointerDown={(e) => onEdgeDown("right", e)} />
              <rect x={x0 + iw / 2 - 26} y={y0 - 5} width={52} height={10} rx={5} fill={LINE} pointerEvents="none" />
              <rect x={x0 + iw - 5} y={y0 + ih / 2 - 26} width={10} height={52} rx={5} fill={LINE} pointerEvents="none" />
            </>}
          </svg>
        )}
      </div>

      {/* 3D/2D (left) · delete (centre, when selected) · undo/redo (right) */}
      <div className="fill-bar">
        <div className="fill-vtog2">
          <button className={view3d ? "sel" : ""} onClick={() => setView3d(true)} type="button">3D</button>
          <button className={!view3d ? "sel" : ""} onClick={() => setView3d(false)} type="button">2D</button>
        </div>
        <button className="fill-del2" onClick={del} type="button" aria-label="delete" style={{ visibility: sel ? "visible" : "hidden" }}>✕</button>
        <div className="fill-ur">
          <button onClick={undo} disabled={!canUndo} type="button" aria-label={t.config.undo}><IconUndo /></button>
          <button onClick={redo} disabled={!canRedo} type="button" aria-label={t.config.redo}><IconRedo /></button>
        </div>
      </div>

      {/* 4-tool toolbar (tapping a tool flashes a 3.5s how-to tip) */}
      <div className="fill-toolbar">
        {tip && <div className="fe-tip">{tip}</div>}
        {([["draw", D_DRAW, t.fe.drawLines], ["move", D_MOVE, t.fe.moveResize], ["door", D_DOOR, t.fe.addDoors], ["drawer", D_DRAWER, t.fe.addDrawers]] as [Tool, string, string][]).map(([k, d, lbl]) => (
          <button key={k} className={`fe-tool${tool === k ? " sel" : ""}`} onClick={() => pickTool(k)} type="button">
            <span className="fe-tool-ic"><Ico d={d} /></span>
            <span className="fe-tool-lbl">{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
