import { cellToKarkasBlock } from "../three/cellToKarkas";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { estimate, groupSpecs, hardwareEstimate } from "../three/estimate";
import { planThickness, boardHexByName, edgeHexByName } from "../three/materials";
import { bandsLabel } from "../three/specCsv";
import { type Cabinet } from "../model/cabinet";
import { GEOM } from "../model/layout";
import { code128 } from "../model/barcode";
import { buildExploded } from "../three/exploded";
import type { MaterialCoding } from "../three/materialCode";
import { rowsWeightKg } from "../three/weight";

const INK = "#222";
const DIM = "#555";
const NUM = "#2e9e6a";
const SW = 4;
const PAGE_W = 2100;
const M = 70;
const HEAD = 210;
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
  coding: MaterialCoding;
  svgId?: string;
}

export function CabinetPassport({ cab, artNo, qty, project, date, coding, svgId }: Props) {
  const { model, plan } = cellToKarkasBlock(cab);
  const parts = groupSpecs(estimate(solveStructure(model, planThickness(plan)), plan).parts);
  const weightKg = rowsWeightKg(parts);
  const hw = hardwareEstimate(model).lines;

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
  els.push(<text key="dims" x={M + 130} y={148} fontSize={48} fill={DIM} fontFamily="Inter, sans-serif">В{Math.round(hc)} × Ш{Math.round(w)} × Г{Math.round(d)} мм · {weightKg.toFixed(1)} кг</text>);
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
  const GRID = "#cfcfca";
  const rowH = 50;
  const frame = (top: number, tblW: number, verticals: number[], nData: number, key: string) => {
    const nR = 1 + nData;
    els.push(<rect key={`bg${key}`} x={rightX} y={top} width={tblW} height={rowH} fill="#f3f3f0" />);
    els.push(<rect key={`ob${key}`} x={rightX} y={top} width={tblW} height={rowH * nR} fill="none" stroke={GRID} strokeWidth={SW * 0.4} />);
    verticals.forEach((vx, i) => els.push(<line key={`vl${key}${i}`} x1={rightX + vx} y1={top} x2={rightX + vx} y2={top + rowH * nR} stroke={GRID} strokeWidth={SW * 0.4} />));
    for (let r = 1; r < nR; r++) els.push(<line key={`hl${key}${r}`} x1={rightX} y1={top + r * rowH} x2={rightX + tblW} y2={top + r * rowH} stroke={GRID} strokeWidth={SW * 0.4} />);
  };
  const sectionTitle = (title: string) => {
    els.push(<text key={`st${title}`} x={rightX} y={ry} fontSize={40} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">{title}</text>);
    ry += 22;
  };
  const cell = (x: number, y: number, s: React.ReactNode, dim: boolean, key: string) =>
    els.push(<text key={`c${key}`} x={rightX + x + 16} y={y} fontSize={32} fill={dim ? DIM : INK} fontFamily="Inter, sans-serif">{s}</text>);
  const hcell = (x: number, y: number, s: string, key: string) =>
    els.push(<text key={`h${key}`} x={rightX + x + 16} y={y} fontSize={30} fontWeight={600} fill={DIM} fontFamily="Inter, sans-serif">{s}</text>);

  sectionTitle("Детали");
  {
    const tblW = rightW;
    const d1 = 100;
    const d2 = tblW - 620;
    const d3 = tblW - 250;
    const top = ry;
    frame(top, tblW, [d1, d2, d3], parts.length, "d");
    const hy = top + rowH / 2 + 12;
    hcell(0, hy, "#", "d0");
    hcell(d1, hy, "Название", "d1");
    hcell(d2, hy, "Размер", "d2");
    hcell(d3, hy, "Кромка", "d3");
    parts.forEach((p, i) => {
      const y = top + rowH * (i + 1) + rowH / 2 + 12;
      cell(0, y, p.qty > 1 ? `${i + 1}×${p.qty}` : i + 1, false, `p${i}0`);
      cell(d1, y, p.name, false, `p${i}1`);
      cell(d2, y, `${p.l_mm}×${p.w_mm}×${p.t_mm}`, false, `p${i}2`);
      cell(d3, y, bandsLabel(p.bands), true, `p${i}3`);
    });
    ry = top + rowH * (1 + parts.length) + 64;
  }

  sectionTitle("Фурнитура");
  {
    const tblW = rightW;
    const f1 = tblW - 230;
    const top = ry;
    frame(top, tblW, [f1], hw.length, "f");
    const hy = top + rowH / 2 + 12;
    hcell(0, hy, "Название", "f0");
    hcell(f1, hy, "Кол-во", "f1");
    hw.forEach((h, i) => {
      const y = top + rowH * (i + 1) + rowH / 2 + 12;
      cell(0, y, h.name, false, `hw${i}0`);
      cell(f1, y, String(h.qty), false, `hw${i}1`);
    });
    ry = top + rowH * (1 + hw.length) + 64;
  }

  sectionTitle("Материалы");
  {
    const usedMats = coding.mats.filter((m) => parts.some((p) => p.materialName === m.name && p.t_mm === m.t_mm));
    const usedEdges = coding.edges.filter((e) => parts.some((p) => p.edgeName === e.name));
    const mrows = [...usedMats.map((m) => ({ c: m.code, n: m.full, hex: boardHexByName(m.name) })), ...usedEdges.map((e) => ({ c: e.code, n: e.full, hex: edgeHexByName(e.name) }))];
    const tblW = rightW;
    const m1 = 170;
    const top = ry;
    frame(top, tblW, [m1], mrows.length, "m");
    const hy = top + rowH / 2 + 12;
    hcell(0, hy, "Код", "m0");
    hcell(m1, hy, "Наименование", "m1");
    mrows.forEach((m, i) => {
      const y = top + rowH * (i + 1) + rowH / 2 + 12;
      els.push(<text key={`mc${i}`} x={rightX + 16} y={y} fontSize={32} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">{m.c}</text>);
      if (m.hex) els.push(<rect key={`msw${i}`} x={rightX + m1 + 16} y={y - 32} width={38} height={38} fill={m.hex} stroke={INK} strokeWidth={2} />);
      els.push(<text key={`mn${i}`} x={rightX + m1 + 70} y={y} fontSize={32} fill={DIM} fontFamily="Inter, sans-serif">{m.n}</text>);
    });
    ry = top + rowH * (1 + mrows.length) + 64;
  }

  const H = Math.max(ry, HEAD + viewsH) + 80;

  const paperF = Math.min(297 / PAGE_W, 210 / H);
  const scaleX = Math.max(1, Math.round(1 / (10 * ex.scale * paperF)));
  els.push(<text key="scl" x={M + 250} y={HEAD + 56} fontSize={36} fill={DIM} fontFamily="Inter, sans-serif">Масштаб 1:{scaleX}</text>);

  return (
    <svg id={svgId} viewBox={`0 0 ${PAGE_W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}
