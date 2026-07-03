// Architectural top-down drawing sheet (IKEA "TopPlan" style): the room walls,
// openings, and the cabinets seen from above (oriented footprints, numbered), with
// overall room dimensions and a title block. Pure SVG in mm; PNG/PDF-exportable.

import { cabFootprints, rectCorners, type Foot } from "../model/footprint";
import { offsetPolygon, polygonBoundsMm, type Pt, type Opening } from "../model/room";
import type { KitchenLayout } from "../model/runPlan";
import type { Cabinet } from "../model/cabinet";

const INK = "#222";
const DIM = "#444";
const NUM = "#d98a1e";
const WALLFILL = "#e6e6e6";

const L = 820;
const T = 320;
const R = 320;
const DIMBAND = 540;
const TITLE = 620;
const SW = 7;
const FS = 86;

interface Props {
  points: Pt[];
  cabs: Cabinet[];
  openings: Opening[];
  waterWall: number | null;
  layout: KitchenLayout;
  numberOf: Map<string, number>;
  /** ids of the main run's modules — to draw a width dimension chain along that run */
  runIds: Set<string>;
  project: string;
  view: string;
  date: string;
  svgId?: string;
}

const path = (poly: { x: number; y: number }[], px: (x: number) => number, py: (y: number) => number) =>
  poly.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x)},${py(p.y)}`).join(" ") + " Z";

export function TopPlanSheet({ points, cabs, openings, waterWall, layout, numberOf, runIds, project, view, date, svgId }: Props) {
  const b = polygonBoundsMm(points);
  const inner = offsetPolygon(points, 100);
  const foots: Foot[] = cabFootprints(cabs, points, waterWall, layout, openings).filter((f) => f.appliance !== "filler");

  const W = L + b.w + R;
  const H = T + b.h + DIMBAND + TITLE;
  const px = (x: number) => L + (x - b.minX);
  const py = (y: number) => T + (y - b.minY);

  const els: React.ReactNode[] = [];

  // ---- walls (ring between outer roomPoints and the inner offset) ----
  els.push(
    <path key="walls" d={`${path(points, px, py)} ${path(inner, px, py)}`} fillRule="evenodd" fill={WALLFILL} stroke={INK} strokeWidth={SW} />,
  );

  // ---- openings (mark the span on the wall: window blue, door brown) ----
  const n = points.length;
  openings.forEach((o, i) => {
    const a = points[o.wall];
    const c = points[(o.wall + 1) % n];
    const len = Math.hypot(c.x - a.x, c.y - a.y) || 1;
    const ux = (c.x - a.x) / len;
    const uy = (c.y - a.y) / len;
    const cx = a.x + (c.x - a.x) * o.t;
    const cy = a.y + (c.y - a.y) * o.t;
    const half = o.width / 2;
    const col = o.kind === "window" ? "#5bb8e6" : o.kind === "door" ? "#9c7a5b" : "#bbb";
    els.push(<line key={`op${i}`} x1={px(cx - ux * half)} y1={py(cy - uy * half)} x2={px(cx + ux * half)} y2={py(cy + uy * half)} stroke={col} strokeWidth={SW * 2.2} />);
  });

  // ---- cabinet footprints (numbered; uppers dashed, over the bases) ----
  // draw bases first, then uppers, so labels read on top
  [...foots].sort((p, q) => Number(p.upper) - Number(q.upper)).forEach((f) => {
    const c = rectCorners(f.cx, f.cy, f.ux, f.uy, f.ix, f.iy, f.w, f.depth);
    els.push(
      <path
        key={`fp${f.id}`}
        d={path(c, px, py)}
        fill={f.upper ? "none" : "#fff"}
        stroke={INK}
        strokeWidth={SW * 0.8}
        strokeDasharray={f.upper ? "40 26" : undefined}
      />,
    );
    const num = numberOf.get(f.id);
    if (num != null && !f.upper) {
      els.push(<circle key={`fn${f.id}`} cx={px(f.cx)} cy={py(f.cy)} r={70} fill={NUM} />);
      els.push(<text key={`ft${f.id}`} x={px(f.cx)} y={py(f.cy) + 28} fontSize={84} fontWeight={700} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{num}</text>);
    }
  });

  // ---- cabinet width dimension chain, parallel to the run (in front of the cabinets) ----
  const runFoots = foots.filter((f) => runIds.has(f.id) && !f.upper);
  if (runFoots.length) {
    const u = { x: runFoots[0].ux, y: runFoots[0].uy };
    const iv = { x: runFoots[0].ix, y: runFoots[0].iy };
    runFoots.sort((p, q) => p.cx * u.x + p.cy * u.y - (q.cx * u.x + q.cy * u.y));
    const off = runFoots[0].depth / 2 + 240; // perpendicular offset into the room
    const ang = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    const edge = (f: Foot, sign: number) => ({ x: f.cx + u.x * (sign * f.w) / 2 + iv.x * off, y: f.cy + u.y * (sign * f.w) / 2 + iv.y * off });
    const A = edge(runFoots[0], -1);
    const B = edge(runFoots[runFoots.length - 1], 1);
    els.push(<line key="rc" x1={px(A.x)} y1={py(A.y)} x2={px(B.x)} y2={py(B.y)} stroke={DIM} strokeWidth={SW * 0.6} />);
    const rtick = (p: { x: number; y: number }, key: string) => els.push(<line key={key} x1={px(p.x - iv.x * 26)} y1={py(p.y - iv.y * 26)} x2={px(p.x + iv.x * 26)} y2={py(p.y + iv.y * 26)} stroke={DIM} strokeWidth={SW * 0.6} />);
    rtick(edge(runFoots[0], -1), "rt0");
    runFoots.forEach((f) => {
      rtick(edge(f, 1), `rt${f.id}`);
      const m = edge(f, 0);
      const tx = px(m.x + iv.x * 90);
      const ty = py(m.y + iv.y * 90);
      els.push(<text key={`rl${f.id}`} x={tx} y={ty} fontSize={FS} fill={DIM} textAnchor="middle" transform={`rotate(${ang} ${tx} ${ty})`} fontFamily="Inter, sans-serif">{Math.round(f.w)}</text>);
    });
    // depth dimension (perpendicular to the run, beside its first module: back → front)
    const f0 = runFoots[0];
    const d0 = f0.depth;
    const sh = { x: -u.x * (f0.w / 2 + 260), y: -u.y * (f0.w / 2 + 260) }; // offset to the left of the run
    const bk = { x: f0.cx - iv.x * (d0 / 2) + sh.x, y: f0.cy - iv.y * (d0 / 2) + sh.y };
    const fr = { x: f0.cx + iv.x * (d0 / 2) + sh.x, y: f0.cy + iv.y * (d0 / 2) + sh.y };
    els.push(<line key="dd0" x1={px(bk.x)} y1={py(bk.y)} x2={px(fr.x)} y2={py(fr.y)} stroke={DIM} strokeWidth={SW * 0.6} />);
    const dtk = (p: { x: number; y: number }, key: string) => els.push(<line key={key} x1={px(p.x - u.x * 26)} y1={py(p.y - u.y * 26)} x2={px(p.x + u.x * 26)} y2={py(p.y + u.y * 26)} stroke={DIM} strokeWidth={SW * 0.6} />);
    dtk(bk, "ddb");
    dtk(fr, "ddf");
    const dm = { x: (bk.x + fr.x) / 2 - u.x * 80, y: (bk.y + fr.y) / 2 - u.y * 80 };
    const dang = (Math.atan2(iv.y, iv.x) * 180) / Math.PI;
    els.push(<text key="ddl" x={px(dm.x)} y={py(dm.y)} fontSize={FS} fill={DIM} textAnchor="middle" transform={`rotate(${dang} ${px(dm.x)} ${py(dm.y)})`} fontFamily="Inter, sans-serif">{Math.round(d0)}</text>);

    // upper-cabinet depth dimension (perpendicular, on the RIGHT end of the run)
    const upFoots = foots.filter((f) => runIds.has(f.id) && f.upper);
    if (upFoots.length) {
      const last = runFoots[runFoots.length - 1];
      const du = upFoots[0].depth;
      const shR = { x: u.x * (last.w / 2 + 260), y: u.y * (last.w / 2 + 260) };
      const wall = { x: last.cx - iv.x * (last.depth / 2) + shR.x, y: last.cy - iv.y * (last.depth / 2) + shR.y }; // shared back wall
      const front = { x: wall.x + iv.x * du, y: wall.y + iv.y * du };
      els.push(<line key="ud0" x1={px(wall.x)} y1={py(wall.y)} x2={px(front.x)} y2={py(front.y)} stroke={DIM} strokeWidth={SW * 0.6} />);
      dtk(wall, "udb");
      dtk(front, "udf");
      const um = { x: (wall.x + front.x) / 2 + u.x * 80, y: (wall.y + front.y) / 2 + u.y * 80 };
      els.push(<text key="udl" x={px(um.x)} y={py(um.y)} fontSize={FS} fill={DIM} textAnchor="middle" transform={`rotate(${dang} ${px(um.x)} ${py(um.y)})`} fontFamily="Inter, sans-serif">{Math.round(du)}</text>);
    }
  }

  // ---- overall room dimensions (width along bottom, depth along left) ----
  const dimY = py(b.maxY) + 230;
  els.push(<line key="dw" x1={px(b.minX)} y1={dimY} x2={px(b.maxX)} y2={dimY} stroke={DIM} strokeWidth={SW * 0.6} />);
  [b.minX, b.maxX].forEach((x) => els.push(<line key={`dwt${x}`} x1={px(x)} y1={dimY - 26} x2={px(x)} y2={dimY + 26} stroke={DIM} strokeWidth={SW * 0.6} />));
  els.push(<text key="dwx" x={px((b.minX + b.maxX) / 2)} y={dimY - 40} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(b.w)}</text>);
  const dimX = px(b.minX) - 230;
  els.push(<line key="dd" x1={dimX} y1={py(b.minY)} x2={dimX} y2={py(b.maxY)} stroke={DIM} strokeWidth={SW * 0.6} />);
  [b.minY, b.maxY].forEach((y) => els.push(<line key={`ddt${y}`} x1={dimX - 26} y1={py(y)} x2={dimX + 26} y2={py(y)} stroke={DIM} strokeWidth={SW * 0.6} />));
  els.push(<text key="ddx" x={dimX - 34} y={py((b.minY + b.maxY) / 2)} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" transform={`rotate(-90 ${dimX - 34} ${py((b.minY + b.maxY) / 2)})`} fontFamily="Inter, sans-serif">{Math.round(b.h)}</text>);

  // ---- title block (4 cells: brand | project | view | date) ----
  const tbTop = T + b.h + DIMBAND;
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
