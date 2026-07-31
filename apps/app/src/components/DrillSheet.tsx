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
  350: { color: "#9b59b6", r: 14, ru: "Ø35 петля" },
  150: { color: "#e8833a", r: 9, ru: "Ø15 эксц." },
  80: { color: "#3a7de8", r: 7, ru: "Ø8 шкант" },
  50: { color: "#2faf5a", r: 6, ru: "Ø5 полка" },
  30: { color: "#9aa0a6", r: 4, ru: "Ø3 разм." },
};
const FALLBACK = { color: "#444", r: 5, ru: "прочее" };
const cls = (d: number) => HOLE[d] ?? FALLBACK;

const NAME_RU: Record<string, string> = { "side-left": "Бок левый", "side-right": "Бок правый", bottom: "Дно", top: "Крышка", back: "Задняя стенка", door: "Дверь" };
const nameRu = (n: string): string =>
  NAME_RU[n] ?? (/^shelf-\d+$/.test(n) ? `Полка ${n.split("-")[1]}` : /^divider-\d+$/.test(n) ? `Перегородка ${n.split("-")[1]}` : n);

const COLS = 3;
const CELL = 640; // box each panel scales into (mm units)
const PAD = 150;
const LABEL = 120;
const LEGEND = 170;
const SW = 6;

interface Props {
  parts: Part[];
  project: string;
  date: string;
  svgId?: string;
  page?: number;
  posOf?: Map<string, number>;
}

export const DRILL_PER_PAGE = 6;

export function drillGroups(parts: Part[]): { part: Part; qty: number }[] {
  const machined = parts.filter((p) => p.operations.length > 0);
  const sig = (p: Part) => `${p.name}|${p.length_mm10}|${p.width_mm10}|${p.thickness_mm10}|${p.operations.map((o) => (o.op === "drill" ? `d${(o as DrillOp).diameter_mm10}:${(o as DrillOp).x_mm10}:${(o as DrillOp).y_mm10}:${(o as DrillOp).face}` : o.op)).slice().sort().join(";")}`;
  const groups: { part: Part; qty: number }[] = [];
  const gseen = new Map<string, { part: Part; qty: number }>();
  for (const p of machined) {
    const k = sig(p);
    const g = gseen.get(k);
    if (g) g.qty += 1;
    else { const ng = { part: p, qty: 1 }; gseen.set(k, ng); groups.push(ng); }
  }
  return groups;
}

export function DrillSheet({ parts, project, date, svgId, page, posOf }: Props) {
  const allGroups = drillGroups(parts);
  const groups = page != null ? allGroups.slice(page * DRILL_PER_PAGE, (page + 1) * DRILL_PER_PAGE) : allGroups;
  const machined = allGroups.map((g) => g.part);
  const cellW = CELL + PAD;
  const cellH = CELL + LABEL + PAD;
  const rows = Math.ceil(DRILL_PER_PAGE / COLS);
  const W = COLS * cellW + PAD;
  const H = LEGEND + rows * cellH;

  const els: React.ReactNode[] = [];

  // ---- legend (which classes are actually present) ----
  const present = new Set<number>();
  for (const p of machined) for (const op of p.operations) if (op.op === "drill") present.add(op.diameter_mm10);
  const legend = [350, 150, 80, 50, 30].filter((d) => present.has(d));
  const dcode = (d: number) => `D${legend.indexOf(d) + 1}`;
  const legStep = (W - PAD * 2) / Math.max(1, legend.length);
  legend.forEach((d, i) => {
    const lx = PAD + i * legStep;
    const ly = 110;
    const c = cls(d);
    els.push(<circle key={`lc${d}`} cx={lx + 20} cy={ly - 18} r={c.r + 4} fill={c.color} />);
    els.push(<text key={`ld${d}`} x={lx + 54} y={ly} fontSize={44} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">{dcode(d)}</text>);
    els.push(<text key={`ll${d}`} x={lx + 134} y={ly} fontSize={44} fill={DIM} fontFamily="Inter, sans-serif">{c.ru}</text>);
  });

  // ---- panels ----
  groups.forEach((g, idx) => {
    const p = g.part;
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
    const labeled = new Set<number>();
    p.operations.forEach((op, j) => {
      if (op.op !== "drill") return;
      const d = op as DrillOp;
      const c = cls(d.diameter_mm10);
      const isEdge = d.face.startsWith("edge");
      // engine origin = bottom-left of Face A; flip Y for screen (y-down)
      const hx = px0 + (d.x_mm10 / 10) * scale;
      const hy = py0 + ph - (d.y_mm10 / 10) * scale;
      const ex = d.face === "edge3" ? px0 + pw : d.face === "edge4" ? px0 : hx;
      if (!isEdge) {
        els.push(<circle key={`h${idx}_${j}`} cx={hx} cy={hy} r={c.r} fill={c.color} fillOpacity={0.85} stroke="#0003" strokeWidth={1.5} />);
      } else {
        // edge drill: a tick sitting on the panel perimeter (edge3 = right, edge4 = left)
        els.push(<rect key={`e${idx}_${j}`} x={ex - 9} y={hy - 16} width={18} height={32} fill={c.color} stroke="#0003" strokeWidth={1.5} />);
      }
      if (d.diameter_mm10 !== 30 && !labeled.has(d.diameter_mm10)) {
        labeled.add(d.diameter_mm10);
        els.push(<text key={`hd${idx}_${j}`} x={(isEdge ? ex : hx) + c.r + 4} y={hy - c.r} fontSize={44} fontWeight={800} fill={INK} fontFamily="Inter, sans-serif">{dcode(d.diameter_mm10)}</text>);
      }
    });

    const pos = posOf?.get(p.id);
    if (pos != null) {
      const fs = String(pos).length >= 2 ? 44 : 54;
      els.push(<circle key={`ph${idx}`} cx={px0 + 46} cy={py0 + 46} r={47} fill="#fff" />);
      els.push(<circle key={`pc${idx}`} cx={px0 + 46} cy={py0 + 46} r={42} fill="#2e9e6a" />);
      els.push(<text key={`pn${idx}`} x={px0 + 46} y={py0 + 46 + fs * 0.34} fontSize={fs} fontWeight={800} fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">{pos}</text>);
    }

    // label
    els.push(
      <text key={`pl${idx}`} x={ox + CELL / 2} y={oy + CELL + 78} fontSize={44} fill={INK} fontWeight={600} textAnchor="middle" fontFamily="Inter, sans-serif">
        {nameRu(p.name)}{g.qty > 1 ? ` ×${g.qty}` : ""} · {p.operations.length} отв · {Math.round(len)}×{Math.round(wid)}
      </text>,
    );
  });

  return (
    <svg id={svgId} viewBox={`0 0 ${W} ${H}`} width="100%" xmlns="http://www.w3.org/2000/svg" style={{ background: "#fff", display: "block" }}>
      {els}
    </svg>
  );
}
