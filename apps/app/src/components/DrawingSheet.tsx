// Architectural front-elevation drawing sheet (IKEA "FacePlan" style): clean line art
// of one wall's modules with a dimension chain, numbered modules and a title block.
// Pure SVG in millimetre units, so it's print/PDF/PNG-exportable. No interactivity.

import { GEOM } from "../model/layout";
import type { Cabinet } from "../model/cabinet";

const COUNTER = GEOM.plinth + GEOM.baseH + GEOM.worktop; // base front height (≈860)
const INK = "#222";
const DIM = "#444";
const NUM = "#d98a1e";

// margins / bands (mm)
const L = 820;
const T = 240;
const R = 240;
const DIMBAND = 560;
const TITLE = 620;
const SW = 7; // line weight
const FS = 86; // dimension font

interface Props {
  cabs: Cabinet[]; // one wall run's modules (run-tiled, have x)
  wallLen: number;
  ceiling: number;
  /** shared module numbering (id → n) so the same module has the same number across views */
  numberOf?: Map<string, number>;
  project: string;
  view: string;
  date: string;
  svgId?: string;
}

function isFloor(c: Cabinet) {
  return c.kind === "base" || c.kind === "tall";
}

export function DrawingSheet({ cabs, wallLen, ceiling, numberOf, project, view, date, svgId }: Props) {
  const mods = cabs
    .filter((c) => c.x != null && c.px == null && c.appliance !== "filler" && !c.furniture)
    .sort((a, b) => (a.x as number) - (b.x as number));
  const floor = mods.filter(isFloor);
  const uppers = mods.filter((c) => c.kind === "upper").sort((a, b) => (a.x as number) - (b.x as number));
  const upBottom = uppers.length ? Math.min(...uppers.map((c) => c.mountY ?? GEOM.upperBottom)) : 0;
  const upTop = uppers.length ? Math.max(...uppers.map((c) => (c.mountY ?? GEOM.upperBottom) + c.h)) : 0;

  const W = L + wallLen + R;
  const H = T + ceiling + DIMBAND + TITLE;
  const px = (x: number) => L + x;
  const py = (y: number) => T + ceiling - y; // mm-from-floor → svg-y (floor at bottom)

  const els: React.ReactNode[] = [];

  // ---- modules (outlined line art) ----
  mods.forEach((c, i) => {
    const x = c.x as number;
    const upper = c.kind === "upper";
    const y0 = upper ? (c.mountY ?? GEOM.upperBottom) : 0;
    const y1 = upper ? y0 + c.h : c.kind === "tall" ? c.h : COUNTER;
    const k = `m${i}`;
    // carcass outline
    els.push(<rect key={`${k}o`} x={px(x)} y={py(y1)} width={c.w} height={y1 - y0} fill="#fff" stroke={INK} strokeWidth={SW} />);
    if (!upper && c.kind === "base") {
      // plinth + worktop lines
      els.push(<line key={`${k}p`} x1={px(x)} y1={py(GEOM.plinth)} x2={px(x + c.w)} y2={py(GEOM.plinth)} stroke={INK} strokeWidth={SW * 0.6} />);
      els.push(<line key={`${k}w`} x1={px(x)} y1={py(GEOM.plinth + GEOM.baseH)} x2={px(x + c.w)} y2={py(GEOM.plinth + GEOM.baseH)} stroke={INK} strokeWidth={SW * 0.6} />);
    }
    // facade divisions: drawers = horizontal splits, else a single door + handle
    const fTop = upper ? y1 : c.kind === "tall" ? c.h : GEOM.plinth + GEOM.baseH;
    const fBot = upper ? y0 : GEOM.plinth;
    if (c.appliance && c.appliance !== "none" && !["sink", "hob", "cooktop"].includes(c.appliance)) {
      // appliance front: a cross to read as a unit
      els.push(<line key={`${k}a1`} x1={px(x)} y1={py(fBot)} x2={px(x + c.w)} y2={py(fTop)} stroke={DIM} strokeWidth={SW * 0.5} />);
      els.push(<line key={`${k}a2`} x1={px(x)} y1={py(fTop)} x2={px(x + c.w)} y2={py(fBot)} stroke={DIM} strokeWidth={SW * 0.5} />);
    } else if (c.fill === "drawers" && c.count > 0) {
      for (let d = 1; d < c.count; d++) {
        const yy = fBot + ((fTop - fBot) * d) / c.count;
        els.push(<line key={`${k}d${d}`} x1={px(x + 30)} y1={py(yy)} x2={px(x + c.w - 30)} y2={py(yy)} stroke={INK} strokeWidth={SW * 0.5} />);
      }
      for (let d = 0; d < c.count; d++) {
        const yc = fBot + (fTop - fBot) * (d + 0.5) / c.count;
        els.push(<rect key={`${k}dh${d}`} x={px(x + c.w / 2 - 90)} y={py(yc) - 7} width={180} height={14} rx={6} fill={INK} />);
      }
    } else if (c.fill !== "open") {
      els.push(<rect key={`${k}h`} x={px(x + c.w - 60)} y={py((fTop + fBot) / 2 + 130)} width={14} height={260} rx={6} fill={INK} />);
    }
    // number badge
    const bx = px(x + c.w / 2);
    const by = upper ? py(y1) - 110 : py(c.kind === "tall" ? c.h : COUNTER) - 110;
    const num = numberOf?.get(c.id) ?? i + 1;
    els.push(<circle key={`${k}nc`} cx={bx} cy={by} r={78} fill={NUM} />);
    els.push(<text key={`${k}nt`} x={bx} y={by + 30} fontSize={92} fontWeight={700} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{num}</text>);
  });

  // ---- horizontal dimension chain (floor modules) ----
  const chainY = py(0) + 220;
  const tick = (x: number) => els.push(<line key={`tk${x}`} x1={px(x)} y1={chainY - 26} x2={px(x)} y2={chainY + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<line key="chain" x1={px(0)} y1={chainY} x2={px(wallLen)} y2={chainY} stroke={DIM} strokeWidth={SW * 0.6} />);
  tick(0);
  floor.forEach((c) => {
    const x = c.x as number;
    tick(x + c.w);
    els.push(<text key={`dt${x}`} x={px(x + c.w / 2)} y={chainY - 40} fontSize={FS} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{c.w}</text>);
  });
  // overall
  const overY = chainY + 230;
  els.push(<line key="ov" x1={px(0)} y1={overY} x2={px(wallLen)} y2={overY} stroke={DIM} strokeWidth={SW * 0.6} />);
  tick(0); // ticks at ends drawn above; add overall ticks
  els.push(<line key="ovl" x1={px(0)} y1={overY - 26} x2={px(0)} y2={overY + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<line key="ovr" x1={px(wallLen)} y1={overY - 26} x2={px(wallLen)} y2={overY + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<text key="ovt" x={px(wallLen / 2)} y={overY - 40} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(wallLen)}</text>);

  // ---- top dimension chain (upper modules) ----
  if (uppers.length) {
    const topY = py(upTop) - 300; // above the upper row + its number badges
    const ua = px(uppers[0].x as number);
    const ub = px((uppers[uppers.length - 1].x as number) + uppers[uppers.length - 1].w);
    els.push(<line key="uc" x1={ua} y1={topY} x2={ub} y2={topY} stroke={DIM} strokeWidth={SW * 0.6} />);
    els.push(<line key="uct0" x1={ua} y1={topY - 26} x2={ua} y2={topY + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
    uppers.forEach((c) => {
      const x = c.x as number;
      els.push(<line key={`uct${x}`} x1={px(x + c.w)} y1={topY - 26} x2={px(x + c.w)} y2={topY + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
      els.push(<text key={`ucx${x}`} x={px(x + c.w / 2)} y={topY - 40} fontSize={FS} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{c.w}</text>);
    });
  }

  // ---- left vertical dimension chain (segments: counter / upper band / ceiling) ----
  const vx = L - 320;
  const marks = [...new Set([0, COUNTER, ...(uppers.length ? [upBottom, upTop] : []), ceiling])].sort((a, b) => a - b);
  els.push(<line key="vchain" x1={vx} y1={py(0)} x2={vx} y2={py(ceiling)} stroke={DIM} strokeWidth={SW * 0.6} />);
  marks.forEach((v) => els.push(<line key={`vtk${v}`} x1={vx - 24} y1={py(v)} x2={vx + 24} y2={py(v)} stroke={DIM} strokeWidth={SW * 0.6} />));
  for (let i = 0; i < marks.length - 1; i++) {
    const seg = marks[i + 1] - marks[i];
    if (seg < 200) continue;
    const my = py((marks[i] + marks[i + 1]) / 2);
    els.push(<text key={`vseg${i}`} x={vx - 34} y={my} fontSize={FS} fill={DIM} textAnchor="middle" transform={`rotate(-90 ${vx - 34} ${my})`} fontFamily="Inter, sans-serif">{Math.round(seg)}</text>);
  }
  // overall height (outer)
  const ovx = vx - 250;
  els.push(<line key="voa" x1={ovx} y1={py(0)} x2={ovx} y2={py(ceiling)} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<line key="voat0" x1={ovx - 24} y1={py(0)} x2={ovx + 24} y2={py(0)} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<line key="voat1" x1={ovx - 24} y1={py(ceiling)} x2={ovx + 24} y2={py(ceiling)} stroke={DIM} strokeWidth={SW * 0.6} />);
  els.push(<text key="voat" x={ovx - 34} y={py(ceiling / 2)} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" transform={`rotate(-90 ${ovx - 34} ${py(ceiling / 2)})`} fontFamily="Inter, sans-serif">{Math.round(ceiling)}</text>);

  // ---- title block: 4 cells (brand | project | view | date) with dividers ----
  const tbTop = T + ceiling + DIMBAND;
  const tbMid = tbTop + TITLE * 0.42;
  const tbm = 40;
  const cw4 = (W - tbm * 2) / 4;
  const cellX = (i: number) => tbm + cw4 * i;
  els.push(<line key="tbline" x1={0} y1={tbTop} x2={W} y2={tbTop} stroke={INK} strokeWidth={SW} />);
  for (let i = 1; i < 4; i++) els.push(<line key={`tbd${i}`} x1={cellX(i)} y1={tbTop} x2={cellX(i)} y2={H - 230} stroke={INK} strokeWidth={SW * 0.5} />);
  els.push(<text key="tbbrand" x={cellX(0) + cw4 / 2} y={tbMid + 34} fontSize={128} fontWeight={800} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">Mebelchi</text>);
  ([["Проект", project], ["Чертёж", view], ["Дата", date]] as [string, string][]).forEach(([top, bot], k) => {
    const cx = cellX(k + 1) + cw4 / 2;
    els.push(<text key={`tcs${k}`} x={cx} y={tbMid - 56} fontSize={60} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{top}</text>);
    els.push(<text key={`tcb${k}`} x={cx} y={tbMid + 44} fontSize={86} fontWeight={600} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{bot}</text>);
  });
  els.push(<text key="tbnote" x={W / 2} y={H - 120} fontSize={56} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">Все размеры в миллиметрах. Перед раскроем проверьте на замере.</text>);

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      <rect x={SW} y={SW} width={W - SW * 2} height={H - SW * 2} fill="none" stroke={INK} strokeWidth={SW} />
      {els}
    </svg>
  );
}
