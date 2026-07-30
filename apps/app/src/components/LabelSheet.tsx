import { code128 } from "../model/barcode";

const INK = "#222";
const DIM = "#555";
const NUM = "#d98a1e";
const BAND = "#8a6d1f";
const PAGE_W = 2100;
const PAGE_H = 1485;
const M = 40;
const COLS = 3;
const ROWS = 4;
export const LABELS_PER_PAGE = COLS * ROWS;

export interface LabelItem {
  no: number;
  name: string;
  l_mm: number;
  w_mm: number;
  t_mm: number;
  material: string;
  kromka: string;
  bands: [boolean, boolean, boolean, boolean];
  cabinet: string;
}

export function labelPageCount(items: readonly LabelItem[]): number {
  return Math.max(1, Math.ceil(items.length / LABELS_PER_PAGE));
}

interface Props {
  items: readonly LabelItem[];
  page: number;
  project: string;
  svgId?: string;
}

export function LabelSheet({ items, page, project, svgId }: Props): React.ReactElement {
  const cw = (PAGE_W - M * 2) / COLS;
  const ch = (PAGE_H - M * 2) / ROWS;
  const slice = items.slice(page * LABELS_PER_PAGE, page * LABELS_PER_PAGE + LABELS_PER_PAGE);
  const els: React.ReactNode[] = [];

  slice.forEach((it, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = M + col * cw;
    const cy = M + row * ch;
    const key = `l${page}_${i}`;
    els.push(<rect key={`${key}b`} x={cx + 6} y={cy + 6} width={cw - 12} height={ch - 12} fill="#fff" stroke={INK} strokeWidth={2} rx={10} />);

    els.push(<circle key={`${key}nc`} cx={cx + 46} cy={cy + 46} r={30} fill={NUM} />);
    els.push(<text key={`${key}nn`} x={cx + 46} y={cy + 57} fontSize={34} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{it.no}</text>);
    els.push(<text key={`${key}nm`} x={cx + 90} y={cy + 56} fontSize={34} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">{it.name}</text>);

    const gx = cx + cw - 150;
    const gy = cy + 26;
    const gW = 120;
    const gH = 88;
    const asp = it.l_mm / Math.max(1, it.w_mm);
    let rw = gW;
    let rh = gW / asp;
    if (rh > gH) { rh = gH; rw = gH * asp; }
    const rx = gx + (gW - rw) / 2;
    const ry = gy + (gH - rh) / 2;
    els.push(<rect key={`${key}g`} x={rx} y={ry} width={rw} height={rh} fill="#faf9f6" stroke={INK} strokeWidth={1.5} />);
    const edge = (x1: number, y1: number, x2: number, y2: number, on: boolean) =>
      els.push(<line key={`${key}e${x1}${y1}${x2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? BAND : "#bbb"} strokeWidth={on ? 8 : 2} />);
    edge(rx, ry, rx + rw, ry, it.bands[0]);
    edge(rx, ry + rh, rx + rw, ry + rh, it.bands[1]);
    edge(rx + rw, ry, rx + rw, ry + rh, it.bands[2]);
    edge(rx, ry, rx, ry + rh, it.bands[3]);

    let ty = cy + 100;
    const line = (s: string, bold = false) => {
      els.push(<text key={`${key}t${ty}`} x={cx + 46} y={ty} fontSize={28} fontWeight={bold ? 700 : 400} fill={INK} fontFamily="Inter, sans-serif">{s}</text>);
      ty += 40;
    };
    line(`${it.l_mm}×${it.w_mm}×${it.t_mm} мм`, true);
    line(it.material);
    line(`Кромка: ${it.kromka}`);
    line(it.cabinet);

    const val = `MEBELCHI-${String(it.no).padStart(2, "0")}`;
    const bc = code128(val);
    const bcH = 60;
    const bcMod = Math.min(3.4, (cw - 120) / bc.modules);
    const bcW = bc.modules * bcMod;
    const bx = cx + (cw - bcW) / 2;
    const by = cy + ch - 118;
    bc.bars.forEach((b, j) => els.push(<rect key={`${key}bc${j}`} x={bx + b.x * bcMod} y={by} width={b.w * bcMod} height={bcH} fill={INK} />));
    els.push(<text key={`${key}bv`} x={cx + cw / 2} y={by + bcH + 30} fontSize={24} fill={INK} textAnchor="middle" letterSpacing={1} fontFamily="Inter, sans-serif">{val}</text>);
  });

  els.push(<text key="ft" x={PAGE_W - M} y={PAGE_H - 12} fontSize={22} fill={DIM} textAnchor="end" fontFamily="Inter, sans-serif">Mebelchi · {project} · Этикетки {page + 1}</text>);

  return (
    <svg id={svgId} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}
