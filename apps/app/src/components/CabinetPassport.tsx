import { cellToKarkasBlock } from "../three/cellToKarkas";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { estimate, groupSpecs, hardwareEstimate } from "../three/estimate";
import { planThickness, BOARDS, EDGES } from "../three/materials";
import { bandsLabel } from "../three/specCsv";
import { shelfPositions, type Cabinet } from "../model/cabinet";
import { GEOM } from "../model/layout";

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

  const w = cab.w;
  const hc = carcassH(cab);
  const d = cabDepth(cab);
  const kindRu = cab.kind === "base" ? "Напольный" : cab.kind === "tall" ? "Пенал" : "Навесной";
  const drawers = cab.fill === "drawers" ? Math.max(1, cab.count ?? 1) : 0;

  const leftW = 680;
  const rightX = M + leftW + 60;
  const rightW = PAGE_W - rightX - M;

  const viewsH = VIEW_H * 2 + 200;

  const els: React.ReactNode[] = [];

  els.push(<circle key="anc" cx={M + 46} cy={90} r={46} fill={NUM} />);
  els.push(<text key="ann" x={M + 46} y={108} fontSize={54} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{artNo}</text>);
  els.push(<text key="ttl" x={M + 130} y={80} fontSize={68} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">{kindRu} {w}{qty > 1 ? ` · ×${qty}` : ""}</text>);
  els.push(<text key="dims" x={M + 130} y={148} fontSize={48} fill={DIM} fontFamily="Inter, sans-serif">В{Math.round(hc)} × Ш{Math.round(w)} × Г{Math.round(d)} мм</text>);
  els.push(<line key="hl" x1={M} y1={HEAD - 20} x2={PAGE_W - M} y2={HEAD - 20} stroke={INK} strokeWidth={SW} />);

  const drawView = (label: string, boxW: number, boxH: number, y0: number, draw: (x: number, y: number, bw: number, bh: number) => void) => {
    els.push(<text key={`vl${label}`} x={M} y={y0 + 30} fontSize={44} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">{label}</text>);
    const scale = Math.min((leftW - 200) / boxW, (VIEW_H - 120) / boxH);
    const bw = boxW * scale;
    const bh = boxH * scale;
    const x = M + 120 + (leftW - 200 - bw) / 2;
    const y = y0 + 70 + (VIEW_H - 120 - bh) / 2;
    draw(x, y, bw, bh);
    els.push(<text key={`vw${label}`} x={x + bw / 2} y={y + bh + 54} fontSize={40} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(label === "Фасад" ? w : d)}</text>);
    els.push(<text key={`vh${label}`} x={x - 34} y={y + bh / 2} fontSize={40} fill={DIM} textAnchor="middle" transform={`rotate(-90 ${x - 34} ${y + bh / 2})`} fontFamily="Inter, sans-serif">{Math.round(hc)}</text>);
  };

  drawView("Фасад", w, hc, HEAD + 40, (x, y, bw, bh) => {
    els.push(<rect key="fb" x={x} y={y} width={bw} height={bh} fill="#fff" stroke={INK} strokeWidth={SW} />);
    if (drawers > 0) {
      for (let i = 1; i < drawers; i++) els.push(<line key={`fd${i}`} x1={x} y1={y + (bh * i) / drawers} x2={x + bw} y2={y + (bh * i) / drawers} stroke={INK} strokeWidth={SW * 0.6} />);
      for (let i = 0; i < drawers; i++) els.push(<line key={`fh${i}`} x1={x + bw / 2 - 40} y1={y + (bh * (i + 0.5)) / drawers} x2={x + bw / 2 + 40} y2={y + (bh * (i + 0.5)) / drawers} stroke={INK} strokeWidth={SW * 1.4} />);
    } else {
      els.push(<line key="fhd" x1={x + bw - 44} y1={y + bh / 2 - 60} x2={x + bw - 44} y2={y + bh / 2 + 60} stroke={INK} strokeWidth={SW * 1.4} />);
    }
  });

  drawView("Разрез", d, hc, HEAD + 40 + VIEW_H + 80, (x, y, bw, bh) => {
    const t = Math.max(4, 16 * (bh / hc));
    els.push(<rect key="sb" x={x} y={y} width={bw} height={bh} fill="#fff" stroke={INK} strokeWidth={SW} />);
    els.push(<line key="sbk" x1={x + t} y1={y} x2={x + t} y2={y + bh} stroke={INK} strokeWidth={SW * 0.8} />);
    if (cab.fill === "shelves") shelfPositions(cab.count ?? 0).forEach((f, i) => els.push(<line key={`ss${i}`} x1={x + t} y1={y + bh - f * bh} x2={x + bw - t * 0.5} y2={y + bh - f * bh} stroke={INK} strokeWidth={SW * 0.7} />));
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
