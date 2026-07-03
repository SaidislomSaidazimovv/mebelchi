// X-ray drilling sheet: every machined panel drawn flat with its holes, colour-coded by
// fitting type (cam / dowel / shelf-pin / hinge cup / mark). Schematic — holes are SIZED
// by type and POSITIONED to scale (the IKEA convention), so a Ø5 pin stays visible on a
// 2-metre panel. Built straight from the engine's solved operations, i.e. the real
// machine coordinates that drive the SWJ008 file. Pure SVG in mm; PNG/PDF-exportable.

import type { Part, DrillOp } from "../model/machining";

const INK = "#222";
const DIM = "#555";

/** Visual class per drill diameter (mm10): colour, schematic radius, RU label. */
const HOLE: Record<number, { color: string; r: number; ru: string }> = {
  350: { color: "#9b59b6", r: 14, ru: "Ø35 петля (паз 13)" },
  150: { color: "#e8833a", r: 9, ru: "Ø15 эксцентрик (12.5)" },
  80: { color: "#3a7de8", r: 7, ru: "Ø8 шкант (34)" },
  50: { color: "#2faf5a", r: 6, ru: "Ø5 полкодержатель (11)" },
  30: { color: "#9aa0a6", r: 4, ru: "Ø3 разметка" },
};
const FALLBACK = { color: "#444", r: 5, ru: "прочее" };
const cls = (d: number) => HOLE[d] ?? FALLBACK;

const COLS = 3;
const CELL = 640; // box each panel scales into (mm units)
const PAD = 150;
const LABEL = 120;
const LEGEND = 300;
const TITLE = 540;
const SW = 6;

interface Props {
  parts: Part[];
  project: string;
  date: string;
  svgId?: string;
}

export function DrillSheet({ parts, project, date, svgId }: Props) {
  const machined = parts.filter((p) => p.operations.length > 0);
  const cellW = CELL + PAD;
  const cellH = CELL + LABEL + PAD;
  const rows = Math.max(1, Math.ceil(machined.length / COLS));
  const W = COLS * cellW + PAD;
  const H = LEGEND + rows * cellH + TITLE;

  const els: React.ReactNode[] = [];

  // ---- legend (which classes are actually present) ----
  const present = new Set<number>();
  for (const p of machined) for (const op of p.operations) if (op.op === "drill") present.add(op.diameter_mm10);
  const legend = [350, 150, 80, 50, 30].filter((d) => present.has(d));
  els.push(<text key="lt" x={PAD} y={130} fontSize={104} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">Карта сверловки · X-Ray</text>);
  legend.forEach((d, i) => {
    const lx = PAD + i * 900;
    const ly = 230;
    const c = cls(d);
    els.push(<circle key={`lc${d}`} cx={lx + 24} cy={ly - 18} r={c.r + 4} fill={c.color} />);
    els.push(<text key={`ll${d}`} x={lx + 70} y={ly} fontSize={62} fill={DIM} fontFamily="Inter, sans-serif">{c.ru}</text>);
  });

  // ---- panels ----
  machined.forEach((p, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const ox = PAD + col * cellW;
    const oy = LEGEND + row * cellH;

    const len = p.length_mm10 / 10;
    const wid = p.width_mm10 / 10;
    const scale = CELL / Math.max(len, wid);
    const pw = len * scale;
    const ph = wid * scale;
    const px0 = ox + (CELL - pw) / 2;
    const py0 = oy + (CELL - ph) / 2;

    // panel outline
    els.push(<rect key={`pr${idx}`} x={px0} y={py0} width={pw} height={ph} fill="#fff" stroke={INK} strokeWidth={SW} />);

    // holes
    p.operations.forEach((op, j) => {
      if (op.op !== "drill") return;
      const d = op as DrillOp;
      const c = cls(d.diameter_mm10);
      const isEdge = d.face.startsWith("edge");
      // engine origin = bottom-left of Face A; flip Y for screen (y-down)
      const hx = px0 + (d.x_mm10 / 10) * scale;
      const hy = py0 + ph - (d.y_mm10 / 10) * scale;
      if (!isEdge) {
        els.push(<circle key={`h${idx}_${j}`} cx={hx} cy={hy} r={c.r} fill={c.color} fillOpacity={0.85} stroke="#0003" strokeWidth={1.5} />);
      } else {
        // edge drill: a tick sitting on the panel perimeter (edge3 = right, edge4 = left)
        const ex = d.face === "edge3" ? px0 + pw : d.face === "edge4" ? px0 : hx;
        els.push(<rect key={`e${idx}_${j}`} x={ex - 9} y={hy - 16} width={18} height={32} fill={c.color} stroke="#0003" strokeWidth={1.5} />);
      }
    });

    // label
    els.push(
      <text key={`pl${idx}`} x={ox + CELL / 2} y={oy + CELL + 78} fontSize={62} fill={INK} fontWeight={600} textAnchor="middle" fontFamily="Inter, sans-serif">
        {p.name} · {p.operations.length} отв · {Math.round(len)}×{Math.round(wid)}
      </text>,
    );
  });

  // ---- title block (4 cells) ----
  const tbTop = H - TITLE;
  const tbMid = tbTop + TITLE * 0.46;
  const m = 40;
  const cw4 = (W - m * 2) / 4;
  const cellX = (i: number) => m + cw4 * i;
  els.push(<line key="tbl" x1={0} y1={tbTop} x2={W} y2={tbTop} stroke={INK} strokeWidth={SW} />);
  for (let i = 1; i < 4; i++) els.push(<line key={`tbd${i}`} x1={cellX(i)} y1={tbTop} x2={cellX(i)} y2={H - 200} stroke={INK} strokeWidth={SW * 0.5} />);
  els.push(<text key="tbb" x={cellX(0) + cw4 / 2} y={tbMid + 30} fontSize={120} fontWeight={800} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">Mebelchi</text>);
  ([["Проект", project], ["Чертёж", "Сверловка"], ["Дата", date]] as [string, string][]).forEach(([top, bot], k) => {
    const cx = cellX(k + 1) + cw4 / 2;
    els.push(<text key={`ts${k}`} x={cx} y={tbMid - 50} fontSize={58} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{top}</text>);
    els.push(<text key={`tb${k}`} x={cx} y={tbMid + 40} fontSize={80} fontWeight={600} fill={INK} textAnchor="middle" fontFamily="Inter, sans-serif">{bot}</text>);
  });
  els.push(<text key="tbn" x={W / 2} y={H - 90} fontSize={52} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">Отверстия схематичны: размер по типу, положение в масштабе. Все размеры в мм.</text>);

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      <rect x={SW} y={SW} width={W - SW * 2} height={H - SW * 2} fill="none" stroke={INK} strokeWidth={SW} />
      {els}
    </svg>
  );
}
