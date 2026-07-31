import type { NestResult, MaterialNest, NestSheet, NestConfig } from "../three/nesting";
import { boardHexByName } from "../three/materials";

const INK = "#222";
const DIM = "#555";
const NUM = "#2e9e6a";
const SW = 4;
const PAGE_W = 2100;
const M = 70;
const ROW = 56;

const plainName = (m: string): string => m.replace(/\s+\d+мм$/, "");
const matHex = (m: string): string => boardHexByName(plainName(m)) ?? "#ffffff";

const PALETTE = ["#dbeafe", "#dcfce7", "#fef9c3", "#fce7f3", "#e0e7ff", "#ffedd5", "#ccfbf1", "#f3e8ff", "#fee2e2", "#e2e8f0", "#d9f99d", "#fbcfe8"];
const cabKey = (id: string): string => {
  const c = id.indexOf(":");
  return c > 0 ? id.slice(0, c) : id;
};
const cabColor = (id: string): string => {
  const s = cabKey(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length] ?? "#eef2f7";
};

interface SummaryProps {
  result: NestResult;
  cfg: NestConfig;
  weightKg: number;
  matWeightKg: Map<string, number>;
  project: string;
  date: string;
  svgId?: string;
}

export function CutSummary({ result, cfg, weightKg, matWeightKg, project, date, svgId }: SummaryProps): React.ReactElement {
  const t = result.totals;
  const rows: [string, string][] = [
    ["Размер листа", `${cfg.sheetL} × ${cfg.sheetW} мм`],
    ["Листов", String(t.sheets)],
    ["Деталей", String(t.parts)],
    ["Площадь деталей", `${t.partAreaM2.toFixed(2)} м²`],
    ["Вес деталей", `${weightKg.toFixed(1)} кг`],
    ["Остаток (деловой)", `${t.offcutM2.toFixed(2)} м²`],
    ["Отходы", `${t.wastePct.toFixed(1)} %`],
    ["Длина реза", `${t.cutLenM.toFixed(1)} м`],
  ];
  const mats = result.perMaterial;
  const rowH = 62;
  const H = 240 + rows.length * rowH + mats.length * rowH;
  const els: React.ReactNode[] = [];
  const GRID = "#cfcfca";
  const TW = PAGE_W - M * 2;

  let y = 70;
  els.push(<text key="rh" x={M} y={y} fontSize={48} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Результаты</text>);
  y += 34;
  els.push(<rect key="rout" x={M} y={y} width={TW} height={rowH * rows.length} fill="none" stroke={GRID} strokeWidth={SW * 0.5} />);
  rows.forEach(([k, v], i) => {
    const ry = y + rowH * i;
    if (i > 0) els.push(<line key={`rl${i}`} x1={M} y1={ry} x2={M + TW} y2={ry} stroke={GRID} strokeWidth={SW * 0.4} />);
    els.push(<text key={`rk${i}`} x={M + 26} y={ry + rowH / 2 + 14} fontSize={40} fill={INK} fontFamily="Inter, sans-serif">{k}</text>);
    els.push(<text key={`rv${i}`} x={M + TW - 26} y={ry + rowH / 2 + 14} fontSize={40} fontWeight={600} fill={INK} textAnchor="end" fontFamily="Inter, sans-serif">{v}</text>);
  });
  y += rowH * rows.length + 76;

  els.push(<text key="mh" x={M} y={y} fontSize={48} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Материалы</text>);
  y += 34;
  els.push(<rect key="mout" x={M} y={y} width={TW} height={rowH * mats.length} fill="none" stroke={GRID} strokeWidth={SW * 0.5} />);
  mats.forEach((m, i) => {
    const newN = m.sheets.filter((s) => !s.fromStock).length;
    const stkN = m.sheets.length - newN;
    const ry = y + rowH * i;
    if (i > 0) els.push(<line key={`ml${i}`} x1={M} y1={ry} x2={M + TW} y2={ry} stroke={GRID} strokeWidth={SW * 0.4} />);
    els.push(<rect key={`ms${i}`} x={M + 26} y={ry + rowH / 2 - 21} width={42} height={42} fill={matHex(m.material)} stroke={INK} strokeWidth={2} />);
    els.push(<text key={`mk${i}`} x={M + 86} y={ry + rowH / 2 + 14} fontSize={40} fill={INK} fontFamily="Inter, sans-serif">{m.material}</text>);
    els.push(<text key={`mv${i}`} x={M + TW - 26} y={ry + rowH / 2 + 14} fontSize={40} fontWeight={600} fill={INK} textAnchor="end" fontFamily="Inter, sans-serif">{newN} лист.{stkN ? ` + ${stkN} ост.` : ""} · {(matWeightKg.get(m.material) ?? 0).toFixed(1)} кг</text>);
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${PAGE_W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}

interface PageProps {
  material: string;
  sheet: NestSheet;
  no: number;
  cfg: NestConfig;
  project: string;
  date: string;
  svgId?: string;
}

export function CutSheetPage({ material, sheet, no, cfg, project, date, svgId }: PageProps): React.ReactElement {
  const HEAD = 70;
  const tableW = 520;
  const availW = PAGE_W - M * 2 - tableW;
  const scale = availW / sheet.sheetL;
  const bw = sheet.sheetL * scale;
  const bh = sheet.sheetW * scale;
  const ox = M;
  const oy = HEAD;
  const H = oy + bh + 120;
  const els: React.ReactNode[] = [];

  els.push(
    <defs key="defs">
      <pattern id={`hatch${no}`} width={22} height={22} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={22} stroke="#00000018" strokeWidth={6} />
      </pattern>
    </defs>,
  );
  els.push(<rect key="sheet" x={ox} y={oy} width={bw} height={bh} fill={`url(#hatch${no})`} stroke={INK} strokeWidth={SW} />);
  els.push(<rect key="trim" x={ox + cfg.trim * scale} y={oy + cfg.trim * scale} width={(cfg.sheetL - cfg.trim * 2) * scale} height={(cfg.sheetW - cfg.trim * 2) * scale} fill="none" stroke={DIM} strokeWidth={SW * 0.5} strokeDasharray="10 8" />);

  sheet.offcuts.forEach((o, i) => {
    els.push(<rect key={`o${i}`} x={ox + o.x * scale} y={oy + o.y * scale} width={o.w * scale} height={o.h * scale} fill="#fff" stroke={DIM} strokeWidth={SW * 0.5} strokeDasharray="14 10" />);
    if (o.w * scale > 120 && o.h * scale > 40) {
      els.push(<text key={`ot${i}`} x={ox + (o.x + o.w / 2) * scale} y={oy + (o.y + o.h / 2) * scale + 12} fontSize={30} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">остаток {Math.round(o.w)}×{Math.round(o.h)}</text>);
    }
  });

  sheet.parts.forEach((p, i) => {
    const px = ox + p.x * scale;
    const py = oy + p.y * scale;
    const pw = p.w * scale;
    const ph = p.h * scale;
    els.push(<rect key={`p${i}`} x={px} y={py} width={pw} height={ph} fill={cabColor(p.id)} stroke={INK} strokeWidth={SW * 0.8} />);
    const fs = Math.max(20, Math.min(40, pw / (p.label.length * 0.62), ph * 0.6));
    els.push(<text key={`pt${i}`} x={px + pw / 2} y={py + ph / 2 + fs * 0.34} fontSize={fs} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{p.label}</text>);
  });

  const grouped = new Map<string, number>();
  for (const p of sheet.parts) grouped.set(p.label, (grouped.get(p.label) ?? 0) + 1);
  const tx = ox + bw + 60;
  const TW = tableW - 20;
  const cB = tx + 64;
  const cC = tx + 214;
  const cD = tx + 364;
  const cE = tx + TW;
  const m0 = (tx + cB) / 2;
  const m1 = (cB + cC) / 2;
  const m2 = (cC + cD) / 2;
  const m3 = (cD + cE) / 2;
  const rowH = 58;
  const tTop = oy + 90;
  const nRows = 1 + grouped.size;
  const GRID = "#cfcfca";
  els.push(<text key="pdh" x={tx} y={oy + 40} fontSize={44} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Детали на листе</text>);
  els.push(<rect key="thbg" x={tx} y={tTop} width={TW} height={rowH} fill="#f3f3f0" />);
  els.push(<rect key="tout" x={tx} y={tTop} width={TW} height={rowH * nRows} fill="none" stroke={GRID} strokeWidth={SW * 0.5} />);
  [cB, cC, cD].forEach((x, i) => els.push(<line key={`tv${i}`} x1={x} y1={tTop} x2={x} y2={tTop + rowH * nRows} stroke={GRID} strokeWidth={SW * 0.5} />));
  for (let r = 1; r < nRows; r++) els.push(<line key={`th${r}`} x1={tx} y1={tTop + r * rowH} x2={cE} y2={tTop + r * rowH} stroke={GRID} strokeWidth={SW * 0.5} />);
  ([["#", m0], ["Длина", m1], ["Ширина", m2], ["Кол-во", m3]] as [string, number][]).forEach(([h, cx], i) =>
    els.push(<text key={`phc${i}`} x={cx} y={tTop + rowH / 2 + 12} fontSize={32} fontWeight={600} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{h}</text>),
  );
  [...grouped].forEach(([label, qty], i) => {
    const parts = label.split("×");
    const ry = tTop + rowH * (i + 1) + rowH / 2 + 12;
    ([[String(i + 1), m0], [parts[0] ?? label, m1], [parts[1] ?? "", m2], [String(qty), m3]] as [string, number][]).forEach(([v, cx], ci) =>
      els.push(<text key={`pdc${i}_${ci}`} x={cx} y={ry} fontSize={34} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{v}</text>),
    );
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${PAGE_W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}

export function cutSheetPages(result: NestResult): { material: string; sheet: NestSheet; no: number }[] {
  const out: { material: string; sheet: NestSheet; no: number }[] = [];
  let no = 0;
  result.perMaterial.forEach((m: MaterialNest) => m.sheets.forEach((sheet) => out.push({ material: m.material, sheet, no: ++no })));
  return out;
}
