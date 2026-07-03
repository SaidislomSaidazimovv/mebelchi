// Drawer ORGANIZER editor — a popup (dark backdrop) showing the drawer from ABOVE (top
// view). Draw separators to carve the floor into cutlery-tray compartments; Move to slide
// a divider. Same recursive Cell model as the fill editor, but in the width × depth plane
// and with no fronts. Writes the drawer cell's `organizer` tree. No 3D here — the fill
// editor's main preview already shows the tray inside the open drawer.

import { useRef, useState } from "react";
import { useT } from "../i18n/useT";
import { cellSizes, isLeaf, type Cell } from "../model/cabinet";
import { IconUndo, IconRedo } from "./icons";

interface Props {
  organizer?: Cell;
  widthMm: number; // drawer interior width (X)
  depthMm: number; // drawer interior depth (Y, front→back)
  onChange: (next: Cell, live?: boolean) => void;
  beginEdit: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClose: () => void;
}

const PAD = 44, MIN_CELL = 0.14, ACCENT = "#00a961", LINE = "#c7b593", CELLBG = "#f6f2e8";
const D_DRAW = "M22 3.58594L17.4785 8.10742L10.7383 10.0352C9.41728 10.3922 8.3715 11.3805 7.9375 12.6855L3.85938 25.2734L5.29297 26.707L6.72656 28.1406L19.3203 24.0605C20.6183 23.6285 21.6069 22.5814 21.9609 21.2734L23.8887 14.5254L28.4141 10L22 3.58594ZM22 6.41406L25.5859 10L23 12.5859L19.4141 9L22 6.41406ZM17.7109 10.125L21.875 14.2891L20.0332 20.7383C19.8512 21.4103 19.3493 21.9422 18.6973 22.1602L7.68945 25.7246L13.4844 19.9297C13.6525 19.9755 13.8258 19.9991 14 20C14.5304 20 15.0391 19.7893 15.4142 19.4142C15.7893 19.0391 16 18.5304 16 18C16 17.4696 15.7893 16.9609 15.4142 16.5858C15.0391 16.2107 14.5304 16 14 16C13.6936 16.0004 13.3914 16.0712 13.1168 16.2069C12.8421 16.3426 12.6023 16.5396 12.4158 16.7827C12.2293 17.0258 12.1012 17.3085 12.0413 17.6089C11.9814 17.9094 11.9913 18.2196 12.0703 18.5156L6.27539 24.3105L9.83789 13.3105C10.0579 12.6495 10.5904 12.1489 11.2754 11.9629L17.7109 10.125Z";
const D_MOVE = "M16 2.58594L11.293 7.29297L12.707 8.70703L15 6.41406V12H17V6.41406L19.293 8.70703L20.707 7.29297L16 2.58594ZM7.29297 11.293L2.58594 16L7.29297 20.707L8.70703 19.293L6.41406 17H13V15H6.41406L8.70703 12.707L7.29297 11.293ZM24.707 11.293L23.293 12.707L25.5859 15H19V17H25.5859L23.293 19.293L24.707 20.707L29.4141 16L24.707 11.293ZM15 19V25.5859L12.707 23.293L11.293 24.707L16 29.4141L20.707 24.707L19.293 23.293L17 25.5859V19H15Z";
const Ico = ({ d }: { d: string }) => (<svg viewBox="0 0 32 32" width="24" height="24" fill="none"><path d={d} fill="currentColor" /></svg>);

const replaceCell = (root: Cell, p: number[], fn: (c: Cell) => Cell): Cell => {
  if (!p.length) return fn(root);
  const [i, ...rest] = p;
  return { ...root, children: root.children!.map((ch, k) => (k === i ? replaceCell(ch, rest, fn) : ch)) };
};
// normalize: inline same-direction nested splits so parallel separators are flat siblings
const flatten = (cell: Cell): Cell => {
  if (!cell.children || !cell.children.length) return cell;
  const kids = cell.children.map(flatten);
  const sizes = cellSizes(cell);
  const oc: Cell[] = [], os: number[] = [];
  kids.forEach((ch, i) => {
    if (ch.split === cell.split && ch.children && ch.children.length) {
      const cs = cellSizes(ch);
      ch.children.forEach((gc, j) => { oc.push(gc); os.push(sizes[i] * cs[j]); });
    } else { oc.push(ch); os.push(sizes[i]); }
  });
  return { ...cell, children: oc, sizes: os };
};
const deleteAt = (root: Cell, p: number[]): Cell => {
  if (!p.length) return {};
  const idx = p[p.length - 1];
  return replaceCell(root, p.slice(0, -1), (par) => {
    const children = par.children!.filter((_, k) => k !== idx);
    if (children.length === 1) return children[0];
    const s = cellSizes(par).filter((_, k) => k !== idx), tot = s.reduce((a, b) => a + b, 0) || 1;
    return { ...par, children, sizes: s.map((v) => v / tot) };
  });
};
const deleteDivider = (root: Cell, pp: number[], i: number): Cell =>
  replaceCell(root, pp, (par) => {
    const children = par.children!.filter((_, k) => k !== i + 1);
    if (children.length === 1) return children[0];
    const s = cellSizes(par);
    return { ...par, children, sizes: s.filter((_, k) => k !== i + 1).map((v, k) => (k === i ? v + s[i + 1] : v)) };
  });
const samePath = (a: number[] | null | undefined, b: number[]) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);

interface Leaf { path: number[]; fx0: number; fy0: number; fx1: number; fy1: number; }
interface Div { parent: number[]; i: number; split: "rows" | "cols"; pfx0: number; pfy0: number; pfx1: number; pfy1: number; sizes: number[]; af: number; b0: number; b1: number; }
function layoutTree(root: Cell) {
  const leaves: Leaf[] = [], divs: Div[] = [];
  const walk = (cell: Cell, path: number[], fx0: number, fy0: number, fx1: number, fy1: number) => {
    if (isLeaf(cell)) { leaves.push({ path, fx0, fy0, fx1, fy1 }); return; }
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

type Sel = { kind: "cell"; path: number[] } | { kind: "div"; parent: number[]; i: number } | null;
type Drag =
  | { kind: "draw"; path: number[]; fx0: number; fy0: number; fx1: number; fy1: number; x0: number; y0: number; dir: "rows" | "cols"; af: number; moved: boolean }
  | { kind: "div"; d: Div; moved: boolean };

export function OrganizerEditor({ organizer, widthMm, depthMm, onChange, beginEdit, undo, redo, canUndo, canRedo, onClose }: Props) {
  const t = useT();
  const [tool, setTool] = useState<"draw" | "move">("draw");
  const [sel, setSel] = useState<Sel>(null);
  const [preview, setPreview] = useState<React.ReactNode>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const root = flatten(organizer ?? {});
  const { leaves, divs } = layoutTree(root);
  // aspect: keep the real drawer proportions (width × depth), fit within a ~320-unit box
  const aspect = widthMm / Math.max(1, depthMm);
  const BW = aspect >= 1 ? 320 : 320 * aspect;
  const BH = aspect >= 1 ? 320 / aspect : 320;
  const vbW = BW + PAD * 2, vbH = BH + PAD * 2;
  const x0 = PAD, y0 = PAD, iw = BW, ih = BH;

  const svgX = (fx: number) => x0 + iw * fx;
  const svgY = (fy: number) => y0 + ih * fy; // fy = depth (front at top)
  const fracFromEvent = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM();
    if (!svgRef.current || !m) return null;
    const p = svgRef.current.createSVGPoint(); p.x = cx; p.y = cy;
    const q = p.matrixTransform(m.inverse());
    return { xf: (q.x - x0) / iw, yf: (q.y - y0) / ih };
  };

  const preventTouch = (e: TouchEvent) => e.preventDefault();
  const detach = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("touchmove", preventTouch); };
  const onMove = (e: PointerEvent) => {
    const d = dragRef.current, f = fracFromEvent(e.clientX, e.clientY);
    if (!d || !f) return;
    if (d.kind === "draw") {
      d.moved = true;
      const dx = Math.abs(f.xf - d.x0), dy = Math.abs(f.yf - d.y0);
      d.dir = dy >= dx ? "cols" : "rows"; // follow the hand: vertical drag → vertical line
      const m = 0.14;
      if (d.dir === "cols") {
        const fx = Math.max(d.fx0 + (d.fx1 - d.fx0) * m, Math.min(d.fx1 - (d.fx1 - d.fx0) * m, d.x0));
        d.af = fx;
        setPreview(<line x1={svgX(fx)} y1={svgY(d.fy0)} x2={svgX(fx)} y2={svgY(d.fy1)} stroke={ACCENT} strokeWidth={7} strokeDasharray="3 7" strokeLinecap="round" />);
      } else {
        const fy = Math.max(d.fy0 + (d.fy1 - d.fy0) * m, Math.min(d.fy1 - (d.fy1 - d.fy0) * m, d.y0));
        d.af = fy;
        setPreview(<line x1={svgX(d.fx0)} y1={svgY(fy)} x2={svgX(d.fx1)} y2={svgY(fy)} stroke={ACCENT} strokeWidth={7} strokeDasharray="3 7" strokeLinecap="round" />);
      }
    } else {
      if (!d.moved) { beginEdit(); d.moved = true; }
      const dv = d.d;
      const frac = dv.split === "rows" ? (f.yf - dv.pfy0) / (dv.pfy1 - dv.pfy0) : (f.xf - dv.pfx0) / (dv.pfx1 - dv.pfx0);
      const before = dv.sizes.slice(0, dv.i).reduce((a, b) => a + b, 0), pair = dv.sizes[dv.i] + dv.sizes[dv.i + 1];
      const si = Math.max(MIN_CELL, Math.min(pair - MIN_CELL, frac - before));
      onChange(replaceCell(root, dv.parent, (p) => ({ ...p, sizes: dv.sizes.map((s, k) => (k === dv.i ? si : k === dv.i + 1 ? pair - si : s)) })), true);
    }
  };
  const onUp = () => {
    detach();
    const d = dragRef.current; dragRef.current = null; setPreview(null);
    if (d?.kind === "draw") {
      const dir = d.moved ? d.dir : (d.fx1 - d.fx0) * widthMm >= (d.fy1 - d.fy0) * depthMm ? "cols" : "rows";
      const raw = !d.moved ? 0.5 : dir === "cols" ? (d.af - d.fx0) / (d.fx1 - d.fx0) : (d.af - d.fy0) / (d.fy1 - d.fy0);
      const pos = Math.max(0.14, Math.min(0.86, raw));
      onChange(flatten(replaceCell(root, d.path, () => ({ split: dir, sizes: [pos, 1 - pos], children: [{}, {}] }))));
      setSel(null);
    }
  };
  const attach = (d: Drag) => { dragRef.current = d; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("touchmove", preventTouch, { passive: false }); };
  const onLeafDown = (l: Leaf, e: React.PointerEvent) => {
    e.preventDefault();
    const f = fracFromEvent(e.clientX, e.clientY); if (!f) return;
    if (tool === "draw") attach({ kind: "draw", path: l.path, fx0: l.fx0, fy0: l.fy0, fx1: l.fx1, fy1: l.fy1, x0: f.xf, y0: f.yf, dir: "rows", af: 0, moved: false });
    else setSel({ kind: "cell", path: l.path });
  };
  const onDivDown = (dv: Div, e: React.PointerEvent) => {
    if (tool !== "move") return;
    e.preventDefault(); e.stopPropagation();
    setSel({ kind: "div", parent: dv.parent, i: dv.i });
    attach({ kind: "div", d: dv, moved: false });
  };
  const del = () => {
    if (!sel) return;
    if (sel.kind === "div") onChange(deleteDivider(root, sel.parent, sel.i));
    else onChange(deleteAt(root, sel.path));
    setSel(null);
  };

  return (
    <div className="org-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="org-card">
        <div className="org-head">
          <span className="org-title">{t.fe.organizer} · {Math.round(widthMm / 10)}×{Math.round(depthMm / 10)} cm</span>
          <button className="org-x" onClick={onClose} type="button" aria-label={t.config.close}>✕</button>
        </div>

        <div className="org-stage">
          <svg ref={svgRef} className="org-svg" viewBox={`0 0 ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg">
            <rect x={x0 - 8} y={y0 - 8} width={iw + 16} height={ih + 16} rx={12} fill="#e9e2d2" stroke={LINE} strokeWidth={7} />
            {leaves.map((l) => {
              const on = sel?.kind === "cell" && samePath(sel.path, l.path);
              const wcm = Math.round(widthMm * (l.fx1 - l.fx0) / 10), dcm = Math.round(depthMm * (l.fy1 - l.fy0) / 10);
              return (
                <g key={l.path.join("-") || "root"} onPointerDown={(e) => onLeafDown(l, e)}>
                  <rect x={svgX(l.fx0) + 2} y={svgY(l.fy0) + 2} width={iw * (l.fx1 - l.fx0) - 4} height={ih * (l.fy1 - l.fy0) - 4} rx={4} fill={CELLBG} stroke={on ? ACCENT : "none"} strokeWidth={on ? 5 : 0} />
                  <text x={(svgX(l.fx0) + svgX(l.fx1)) / 2} y={(svgY(l.fy0) + svgY(l.fy1)) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={20} fontFamily="Inter, sans-serif" fontWeight={on ? 700 : 500} fill={on ? ACCENT : "#8a7c5f"} pointerEvents="none">{wcm}×{dcm}</text>
                </g>
              );
            })}
            {divs.map((dv, k) => {
              const ln = dv.split === "rows" ? { x1: svgX(dv.b0), y1: svgY(dv.af), x2: svgX(dv.b1), y2: svgY(dv.af) } : { x1: svgX(dv.af), y1: svgY(dv.b0), x2: svgX(dv.af), y2: svgY(dv.b1) };
              const on = sel?.kind === "div" && samePath(sel.parent, dv.parent) && sel.i === dv.i;
              return (
                <g key={`dv${k}`} className={`fill-sep ${dv.split === "rows" ? "horiz" : "vert"}`} onPointerDown={(e) => onDivDown(dv, e)} style={{ pointerEvents: tool === "move" ? "auto" : "none" }}>
                  <line {...ln} stroke="transparent" strokeWidth={30} />
                  <line {...ln} stroke={on ? ACCENT : LINE} strokeWidth={on ? 10 : 8} strokeLinecap="round" />
                </g>
              );
            })}
            {preview}
          </svg>
        </div>

        <div className="org-bar">
          <div className="org-tools">
            <button className={tool === "draw" ? "sel" : ""} onClick={() => setTool("draw")} type="button" aria-label={t.fe.drawLines}><Ico d={D_DRAW} /></button>
            <button className={tool === "move" ? "sel" : ""} onClick={() => setTool("move")} type="button" aria-label={t.fe.moveResize}><Ico d={D_MOVE} /></button>
          </div>
          <button className="org-del" onClick={del} type="button" aria-label="delete" style={{ visibility: sel ? "visible" : "hidden" }}>✕</button>
          <div className="fill-ur">
            <button onClick={undo} disabled={!canUndo} type="button" aria-label={t.config.undo}><IconUndo /></button>
            <button onClick={redo} disabled={!canRedo} type="button" aria-label={t.config.redo}><IconRedo /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
