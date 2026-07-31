import { GEOM } from "../model/layout";
import { shelfPositions, type Cabinet } from "../model/cabinet";

const INK = "#222";
const DIM = "#555";
const NUM = "#2e9e6a";
const COLS = 2;
const CELL_W = 1000;
const CELL_H = 1200;
const PAD = 170;
const LABEL = 160;
const HEAD = 240;
const SW = 7;
const FS = 74;

function cabDepth(c: Cabinet): number {
  return c.depth ?? (c.kind === "upper" ? 350 : 560);
}

function carcassH(c: Cabinet): number {
  return c.kind === "base" ? GEOM.baseH : c.h;
}

interface Group {
  cab: Cabinet;
  qty: number;
  nums: number[];
}

interface Props {
  cabs: Cabinet[];
  numberOf?: Map<string, number>;
  project: string;
  view: string;
  date: string;
  svgId?: string;
}

export function SectionSheet({ cabs, numberOf, project, view, date, svgId }: Props) {
  const mods = cabs.filter((c) => (c.kind === "base" || c.kind === "tall" || c.kind === "upper") && !c.furniture && c.appliance !== "filler");
  const seen = new Map<string, Group>();
  const groups: Group[] = [];
  for (const c of mods) {
    const k = `${c.kind}|${carcassH(c)}|${cabDepth(c)}|${c.fill}|${c.count}|${c.div ?? 0}`;
    const n = numberOf?.get(c.id);
    const g = seen.get(k);
    if (g) {
      g.qty += 1;
      if (n != null) g.nums.push(n);
    } else {
      const ng = { cab: c, qty: 1, nums: n != null ? [n] : [] };
      seen.set(k, ng);
      groups.push(ng);
    }
  }

  const rowH = CELL_H + LABEL + PAD;
  const rows = Math.max(1, Math.ceil(groups.length / COLS));
  const W = COLS * (CELL_W + PAD) + PAD;
  const H = HEAD + rows * rowH;

  const els: React.ReactNode[] = [];
  els.push(<text key="tt" x={PAD} y={150} fontSize={104} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">{view}</text>);

  groups.forEach((g, idx) => {
    const c = g.cab;
    const d = cabDepth(c);
    const hc = carcassH(c);
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const ox = PAD + col * (CELL_W + PAD);
    const oy = HEAD + row * rowH;
    const scale = Math.min(CELL_W / d, CELL_H / hc);
    const bw = d * scale;
    const bh = hc * scale;
    const x0 = ox + (CELL_W - bw) / 2;
    const y0 = oy + (CELL_H - bh) / 2;
    const t = Math.max(5, 16 * scale);

    els.push(<rect key={`b${idx}`} x={x0} y={y0} width={bw} height={bh} fill="#fff" stroke={INK} strokeWidth={SW} />);
    els.push(<line key={`bk${idx}`} x1={x0 + t} y1={y0} x2={x0 + t} y2={y0 + bh} stroke={INK} strokeWidth={SW * 0.8} />);
    if (c.fill === "shelves") {
      shelfPositions(c.count ?? 0).forEach((f, si) => {
        const sy = y0 + bh - f * bh;
        els.push(<line key={`sh${idx}_${si}`} x1={x0 + t} y1={sy} x2={x0 + bw - t * 0.5} y2={sy} stroke={INK} strokeWidth={SW * 0.75} />);
      });
    }
    els.push(<text key={`dh${idx}`} x={x0 - 34} y={y0 + bh / 2} fontSize={FS} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif" transform={`rotate(-90 ${x0 - 34} ${y0 + bh / 2})`}>{Math.round(hc)}</text>);
    els.push(<text key={`dd${idx}`} x={x0 + bw / 2} y={y0 - 24} fontSize={FS} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(d)}</text>);

    const kindRu = c.kind === "base" ? "Напольный" : c.kind === "tall" ? "Пенал" : "Навесной";
    els.push(<text key={`lb${idx}`} x={ox + CELL_W / 2} y={oy + CELL_H + 110} fontSize={70} fontWeight={600} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{kindRu} {c.w} · В{Math.round(hc)}×Г{Math.round(d)}{g.qty > 1 ? ` · ×${g.qty}` : ""}</text>);

    if (g.nums.length) {
      els.push(<text key={`nn${idx}`} x={x0 + 18} y={y0 + 58} fontSize={58} fontWeight={800} fill={NUM} fontFamily="Inter, sans-serif">№ {g.nums.slice().sort((a, b) => a - b).join(", ")}</text>);
    }
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}
