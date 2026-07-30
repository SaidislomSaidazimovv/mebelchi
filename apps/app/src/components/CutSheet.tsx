import type { NestResult, MaterialNest, NestSheet, NestConfig } from "../three/nesting";

const INK = "#222";
const DIM = "#555";
const NUM = "#d98a1e";
const SW = 4;
const PAGE_W = 2100;
const M = 70;
const ROW = 56;

interface SummaryProps {
  result: NestResult;
  cfg: NestConfig;
  project: string;
  date: string;
  svgId?: string;
}

function titleBlock(els: React.ReactNode[], H: number, chertyozh: string, project: string, date: string): void {
  const TITLE = 300;
  const tbTop = H - TITLE;
  const tbMid = tbTop + TITLE * 0.44;
  const cw4 = (PAGE_W - M * 2) / 4;
  const cellX = (i: number) => M + cw4 * i;
  els.push(<line key="tbl" x1={M} y1={tbTop} x2={PAGE_W - M} y2={tbTop} stroke={INK} strokeWidth={SW} />);
  for (let i = 1; i < 4; i++) els.push(<line key={`tbd${i}`} x1={cellX(i)} y1={tbTop} x2={cellX(i)} y2={H - 90} stroke={INK} strokeWidth={SW * 0.5} />);
  els.push(<text key="tbb" x={cellX(0) + cw4 / 2} y={tbMid + 20} fontSize={64} fontWeight={800} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">Mebelchi</text>);
  ([["Проект", project], ["Чертёж", chertyozh], ["Дата", date]] as [string, string][]).forEach(([top, bot], k) => {
    const cx = cellX(k + 1) + cw4 / 2;
    els.push(<text key={`ts${k}`} x={cx} y={tbMid - 26} fontSize={34} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{top}</text>);
    els.push(<text key={`tb${k}`} x={cx} y={tbMid + 34} fontSize={44} fontWeight={600} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{bot}</text>);
  });
}

export function CutSummary({ result, cfg, project, date, svgId }: SummaryProps): React.ReactElement {
  const t = result.totals;
  const rows: [string, string][] = [
    ["Размер листа", `${cfg.sheetL} × ${cfg.sheetW} мм`],
    ["Листов", String(t.sheets)],
    ["Деталей", String(t.parts)],
    ["Площадь деталей", `${t.partAreaM2.toFixed(2)} м²`],
    ["Остаток (деловой)", `${t.offcutM2.toFixed(2)} м²`],
    ["Отходы", `${t.wastePct.toFixed(1)} %`],
    ["Длина реза", `${t.cutLenM.toFixed(1)} м`],
  ];
  const mats = result.perMaterial;
  const H = 210 + 60 + rows.length * ROW + 120 + mats.length * ROW + 60 + 300;
  const els: React.ReactNode[] = [];
  els.push(<text key="ttl" x={M} y={120} fontSize={72} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">Раскрой листов</text>);
  els.push(<line key="hl" x1={M} y1={180} x2={PAGE_W - M} y2={180} stroke={INK} strokeWidth={SW} />);

  let y = 250;
  els.push(<text key="rh" x={M} y={y} fontSize={48} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Результаты</text>);
  y += 60;
  rows.forEach(([k, v], i) => {
    els.push(<text key={`rk${i}`} x={M} y={y} fontSize={40} fill={INK} fontFamily="Inter, sans-serif">{k}</text>);
    els.push(<text key={`rv${i}`} x={PAGE_W - M} y={y} fontSize={40} fontWeight={600} fill={INK} textAnchor="end" fontFamily="Inter, sans-serif">{v}</text>);
    els.push(<line key={`rl${i}`} x1={M} y1={y + 16} x2={PAGE_W - M} y2={y + 16} stroke={INK} strokeWidth={SW * 0.3} />);
    y += ROW;
  });

  y += 60;
  els.push(<text key="mh" x={M} y={y} fontSize={48} fontWeight={700} fill={INK} fontFamily="Inter, sans-serif">Материалы</text>);
  y += 60;
  mats.forEach((m, i) => {
    els.push(<text key={`mk${i}`} x={M} y={y} fontSize={40} fill={INK} fontFamily="Inter, sans-serif">{m.material}</text>);
    els.push(<text key={`mv${i}`} x={PAGE_W - M} y={y} fontSize={40} fontWeight={600} fill={INK} textAnchor="end" fontFamily="Inter, sans-serif">{m.sheets.length} лист.</text>);
    els.push(<line key={`ml${i}`} x1={M} y1={y + 16} x2={PAGE_W - M} y2={y + 16} stroke={INK} strokeWidth={SW * 0.3} />);
    y += ROW;
  });

  titleBlock(els, H, "Раскрой", project, date);
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
  const HEAD = 200;
  const availW = PAGE_W - M * 2;
  const scale = availW / cfg.sheetL;
  const bw = cfg.sheetL * scale;
  const bh = cfg.sheetW * scale;
  const ox = M;
  const oy = HEAD;
  const H = oy + bh + 120 + 300;
  const els: React.ReactNode[] = [];

  els.push(<text key="ttl" x={M} y={100} fontSize={60} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">Лист {no} · {material}</text>);
  els.push(<text key="sz" x={M} y={158} fontSize={40} fill={DIM} fontFamily="Inter, sans-serif">{cfg.sheetL} × {cfg.sheetW} мм · отходы {sheet.wastePct.toFixed(1)}%</text>);

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
    els.push(<rect key={`p${i}`} x={px} y={py} width={pw} height={ph} fill="#fff" stroke={INK} strokeWidth={SW * 0.8} />);
    const fs = Math.max(20, Math.min(40, pw / (p.label.length * 0.62), ph * 0.6));
    els.push(<text key={`pt${i}`} x={px + pw / 2} y={py + ph / 2 + fs * 0.34} fontSize={fs} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{p.label}</text>);
  });

  titleBlock(els, H, "Раскрой", project, date);
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
