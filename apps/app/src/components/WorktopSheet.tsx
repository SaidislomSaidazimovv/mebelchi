// Architectural worktop cut-detail sheet (IKEA "Worktop"): the countertop slab with
// sink/hob cutouts (rounded rects + radii + faucet hole), dimensioned (length, depth,
// cutout positions + sizes). Pure SVG in mm; PNG/PDF-exportable.

import type { Cabinet } from "../model/cabinet";

const INK = "#222";
const DIM = "#444";
const WD = 600; // worktop depth (mm)

const L = 620;
const T = 540;
const R = 420;
const DIMBAND = 460;
const TITLE = 620;
const SW = 7;
const FS = 84;

interface Props {
  cabs: Cabinet[]; // the run's base modules (have x)
  wallLen: number;
  project: string;
  view: string;
  date: string;
  svgId?: string;
}

interface Cut {
  cx: number;
  w: number;
  h: number;
  r: number;
  kind: "sink" | "hob";
}

export function WorktopSheet({ cabs, wallLen, project, view, date, svgId }: Props) {
  const cuts: Cut[] = cabs
    .filter((c) => c.appliance === "sink" || c.appliance === "hob" || c.appliance === "cooktop")
    .map((c) => {
      const sink = c.appliance === "sink";
      return { cx: (c.x as number) + c.w / 2, w: Math.min(c.w - 80, sink ? 500 : 540), h: WD - 170, r: sink ? 50 : 30, kind: sink ? ("sink" as const) : ("hob" as const) };
    });

  const W = L + wallLen + R;
  const H = T + WD + DIMBAND + TITLE;
  const px = (x: number) => L + x;
  const py = (y: number) => T + y;

  const els: React.ReactNode[] = [];

  // ---- worktop slab ----
  els.push(<rect key="slab" x={px(0)} y={py(0)} width={wallLen} height={WD} fill="#fff" stroke={INK} strokeWidth={SW} />);

  // ---- cutouts ----
  cuts.forEach((c, i) => {
    const cy = WD / 2;
    els.push(<rect key={`c${i}`} x={px(c.cx - c.w / 2)} y={py(cy - c.h / 2)} width={c.w} height={c.h} rx={c.r} fill="#f3f1ec" stroke={INK} strokeWidth={SW * 0.8} />);
    if (c.kind === "sink") {
      els.push(<circle key={`fh${i}`} cx={px(c.cx)} cy={py(70)} r={26} fill="none" stroke={INK} strokeWidth={SW * 0.7} />); // faucet hole
    }
    els.push(<text key={`cl${i}`} x={px(c.cx)} y={py(cy + 26)} fontSize={70} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(c.w)}×{Math.round(c.h)}</text>);
    els.push(<text key={`cr${i}`} x={px(c.cx - c.w / 2) - 12} y={py(cy - c.h / 2) - 16} fontSize={56} fill={DIM} textAnchor="end" fontFamily="Inter, sans-serif">R{c.r}</text>);
    // position dim: worktop left → cutout centre (above the slab)
    const dy = py(0) - 150;
    els.push(<line key={`pd${i}`} x1={px(0)} y1={dy} x2={px(c.cx)} y2={dy} stroke={DIM} strokeWidth={SW * 0.6} />);
    els.push(<line key={`pt0${i}`} x1={px(0)} y1={dy - 26} x2={px(0)} y2={dy + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
    els.push(<line key={`pt1${i}`} x1={px(c.cx)} y1={dy - 26} x2={px(c.cx)} y2={dy + 26} stroke={DIM} strokeWidth={SW * 0.6} />);
    els.push(<text key={`pl${i}`} x={px(c.cx / 2)} y={dy - 36} fontSize={FS} fill={DIM} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(c.cx)}</text>);
  });

  // ---- overall length (bottom) + depth (right) ----
  const ly = py(WD) + 230;
  els.push(<line key="lw" x1={px(0)} y1={ly} x2={px(wallLen)} y2={ly} stroke={DIM} strokeWidth={SW * 0.6} />);
  [0, wallLen].forEach((x) => els.push(<line key={`lt${x}`} x1={px(x)} y1={ly - 26} x2={px(x)} y2={ly + 26} stroke={DIM} strokeWidth={SW * 0.6} />));
  els.push(<text key="lwt" x={px(wallLen / 2)} y={ly - 40} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" fontFamily="Inter, sans-serif">{Math.round(wallLen)}</text>);
  const dx = px(wallLen) + 230;
  els.push(<line key="dh" x1={dx} y1={py(0)} x2={dx} y2={py(WD)} stroke={DIM} strokeWidth={SW * 0.6} />);
  [0, WD].forEach((y) => els.push(<line key={`dt${y}`} x1={dx - 26} y1={py(y)} x2={dx + 26} y2={py(y)} stroke={DIM} strokeWidth={SW * 0.6} />));
  els.push(<text key="dht" x={dx + 36} y={py(WD / 2)} fontSize={FS} fill={DIM} fontWeight={600} textAnchor="middle" transform={`rotate(-90 ${dx + 36} ${py(WD / 2)})`} fontFamily="Inter, sans-serif">{WD}</text>);

  // ---- title block (4 cells) ----
  const tbTop = T + WD + DIMBAND;
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
