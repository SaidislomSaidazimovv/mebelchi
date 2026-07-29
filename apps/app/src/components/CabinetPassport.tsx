import { cellToKarkasBlock } from "../three/cellToKarkas";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { estimate, groupSpecs, hardwareEstimate } from "../three/estimate";
import { planThickness, BOARDS, EDGES } from "../three/materials";
import { bandsLabel } from "../three/specCsv";
import { type Cabinet } from "../model/cabinet";
import { GEOM } from "../model/layout";
import { code128 } from "../model/barcode";
import { buildExploded } from "../three/exploded";

const INK = "#222";
const DIM = "#555";
const NUM = "#d98a1e";
const SW = 4;
const PAGE_W = 2100;
const M = 70;
const HEAD = 210;
const TITLE = 300;
const VIEW_H = 520;
const ROW = 46;

function cabDepth(c: Cabinet): number {
  return c.depth ?? (c.kind === "upper" ? 350 : 560);
}
function carcassH(c: Cabinet): number {
  return c.kind === "base" ? GEOM.baseH : c.h;
}

interface Props {
  cab: Cabinet;
  artNo: number;
  qty: number;
  project: string;
  date: string;
  svgId?: string;
}

export function CabinetPassport({ cab, artNo, qty, project, date, svgId }: Props) {
  const { model, plan } = cellToKarkasBlock(cab);
  const parts = groupSpecs(estimate(solveStructure(model, planThickness(plan)), plan).parts);
  const hw = hardwareEstimate(model).lines;
  const bId = new Map(BOARDS.map((b) => [b.name, b.id]));
  const eId = new Map(EDGES.map((e) => [e.name, e.id]));
  const decors = [...new Set(parts.map((p) => p.materialName))];
  const edges = [...new Set(parts.map((p) => p.edgeName).filter((n): n is string => !!n))];

  const placements = solveLayout(model, planThickness(plan));
  const posOf = new Map<string, number>();
  parts.forEach((g, i) => g.ids.forEach((id) => posOf.set(id, i + 1)));

  const w = cab.w;
  const hc = carcassH(cab);
  const d = cabDepth(cab);
  const kindRu = cab.kind === "base" ? "Напольный" : cab.kind === "tall" ? "Пенал" : "Навесной";

  const leftW = 680;
  const rightX = M + leftW + 60;
  const rightW = PAGE_W - rightX - M;

  const viewsH = VIEW_H * 2 + 200;

  const els: React.ReactNode[] = [];

  els.push(<circle key="anc" cx={M + 46} cy={90} r={46} fill={NUM} />);
  els.push(<text key="ann" x={M + 46} y={108} fontSize={54} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{artNo}</text>);
  els.push(<text key="ttl" x={M + 130} y={80} fontSize={68} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">{kindRu} {w}{qty > 1 ? ` · ×${qty}` : ""}</text>);
  els.push(<text key="dims" x={M + 130} y={148} fontSize={48} fill={DIM} fontFamily="Inter, sans-serif">В{Math.round(hc)} × Ш{Math.round(w)} × Г{Math.round(d)} мм</text>);
  const bcVal = `MEBELCHI-${String(artNo).padStart(2, "0")}`;
  const bc = code128(bcVal);
  const bcMod = 2.4;
  const bcH = 88;
  const bcW = bc.modules * bcMod;
  const bcX = PAGE_W - M - bcW;
  const bcY = 34;
  bc.bars.forEach((b, i) => els.push(<rect key={`bc${i}`} x={bcX + b.x * bcMod} y={bcY} width={b.w * bcMod} height={bcH} fill={INK} />));
  els.push(<text key="bcv" x={bcX + bcW / 2} y={bcY + bcH + 32} fontSize={30} fill={INK} textAnchor="middle" letterSpacing={2} fontFamily="Inter, sans-serif">{bcVal}</text>);

  els.push(<line key="hl" x1={M} y1={HEAD - 20} x2={PAGE_W - M} y2={HEAD - 20} stroke={INK} strokeWidth={SW} />);

  els.push(<text key="exl" x={M} y={HEAD + 56} fontSize={44} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Сборка</text>);
  const ex = buildExploded(placements, posOf, leftW, viewsH - 60, M, HEAD + 76);
  ex.faces.forEach((f, i) => els.push(<polygon key={`ef${i}`} points={f.pts} fill={INK} fillOpacity={f.tone} stroke={INK} strokeWidth={SW * 0.5} strokeLinejoin="round" />));
  ex.labels.forEach((l) => {
    els.push(<line key={`ell${l.n}`} x1={l.ax} y1={l.ay} x2={l.bx} y2={l.by} stroke={NUM} strokeWidth={SW * 0.5} />);
    els.push(<circle key={`elc${l.n}`} cx={l.bx} cy={l.by} r={24} fill={NUM} />);
    els.push(<text key={`elt${l.n}`} x={l.bx} y={l.by + 10} fontSize={28} fontWeight={700} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{l.n}</text>);
  });

  let ry = HEAD + 40;
  const tableHead = (label: string, cols: [string, number][]) => {
    els.push(<text key={`th${label}`} x={rightX} y={ry} fontSize={44} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">{label}</text>);
    ry += 40;
    cols.forEach(([c, off]) => els.push(<text key={`tc${label}${c}`} x={rightX + off} y={ry} fontSize={34} fill={DIM} fontFamily="Inter, sans-serif">{c}</text>));
    ry += 12;
    els.push(<line key={`tl${label}`} x1={rightX} y1={ry} x2={rightX + rightW} y2={ry} stroke={INK} strokeWidth={SW * 0.5} />);
    ry += 44;
  };

  tableHead("Детали", [["#", 0], ["Название", 80], ["Размер", 600], ["Кромка", 940]]);
  parts.forEach((p, i) => {
    els.push(<text key={`p#${i}`} x={rightX} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{p.qty > 1 ? `${i + 1}×${p.qty}` : i + 1}</text>);
    els.push(<text key={`pn${i}`} x={rightX + 80} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{p.name}</text>);
    els.push(<text key={`ps${i}`} x={rightX + 600} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{p.l_mm}×{p.w_mm}×{p.t_mm}</text>);
    els.push(<text key={`pk${i}`} x={rightX + 940} y={ry} fontSize={36} fill={DIM} fontFamily="Inter, sans-serif">{bandsLabel(p.bands)}</text>);
    ry += ROW;
  });

  ry += 70;
  tableHead("Фурнитура", [["Название", 0], ["Кол-во", 1080]]);
  hw.forEach((h, i) => {
    els.push(<text key={`h${i}`} x={rightX} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{h.name}</text>);
    els.push(<text key={`hq${i}`} x={rightX + 1080} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{h.qty}</text>);
    ry += ROW;
  });

  ry += 70;
  tableHead("Материалы", [["Наименование", 0], ["Код", 880]]);
  [...decors.map((n) => ({ n, c: bId.get(n) ?? "—" })), ...edges.map((n) => ({ n, c: eId.get(n) ?? "—" }))].forEach((m, i) => {
    els.push(<text key={`m${i}`} x={rightX} y={ry} fontSize={36} fill={INK} fontFamily="Inter, sans-serif">{m.n}</text>);
    els.push(<text key={`mc${i}`} x={rightX + 880} y={ry} fontSize={36} fill={DIM} fontFamily="Inter, sans-serif">{m.c}</text>);
    ry += ROW;
  });

  const H = Math.max(ry, HEAD + viewsH) + 80 + TITLE;

  const paperF = Math.min(297 / PAGE_W, 210 / H);
  const scaleX = Math.max(1, Math.round(1 / (10 * ex.scale * paperF)));
  els.push(<text key="scl" x={M + 250} y={HEAD + 56} fontSize={36} fill={DIM} fontFamily="Inter, sans-serif">Масштаб 1:{scaleX}</text>);

  const tbTop = H - TITLE;
  const tbMid = tbTop + TITLE * 0.44;
  const cw4 = (PAGE_W - M * 2) / 4;
  const cellX = (i: number) => M + cw4 * i;
  els.push(<line key="tbl" x1={M} y1={tbTop} x2={PAGE_W - M} y2={tbTop} stroke={INK} strokeWidth={SW} />);
  for (let i = 1; i < 4; i++) els.push(<line key={`tbd${i}`} x1={cellX(i)} y1={tbTop} x2={cellX(i)} y2={H - 90} stroke={INK} strokeWidth={SW * 0.5} />);
  els.push(<text key="tbb" x={cellX(0) + cw4 / 2} y={tbMid + 20} fontSize={64} fontWeight={800} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">Mebelchi</text>);
  ([["Проект", project], ["Артикул", String(artNo)], ["Дата", date]] as [string, string][]).forEach(([top, bot], k) => {
    const cx = cellX(k + 1) + cw4 / 2;
    els.push(<text key={`ts${k}`} x={cx} y={tbMid - 26} fontSize={34} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{top}</text>);
    els.push(<text key={`tb${k}`} x={cx} y={tbMid + 34} fontSize={44} fontWeight={600} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{bot}</text>);
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${PAGE_W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}
