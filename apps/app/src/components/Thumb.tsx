// SVG thumbnails for the product lists — drawn to match the 3D scene (window pane
// grids, door panels/glazing, radiators, vents, sockets) so the list and the
// room stay consistent without external image files.
import type { OpeningKindId } from "../model/room";

const GRID: Record<string, [number, number]> = { single: [1, 1], twin: [2, 1], grid: [2, 2], triple: [3, 1], pano: [1, 1], balcony: [2, 1] };

export function OpeningThumb({ kind, design }: { kind: OpeningKindId; design: string }) {
  if (kind === "window") {
    const [cols, rows] = GRID[design] ?? [2, 1];
    const x = 10;
    const y = 14;
    const w = 72;
    const h = 56;
    const lines: React.ReactNode[] = [];
    for (let k = 1; k < cols; k++) lines.push(<line key={`v${k}`} x1={x + (k * w) / cols} y1={y} x2={x + (k * w) / cols} y2={y + h} stroke="#cfd6da" strokeWidth={3} />);
    for (let k = 1; k < rows; k++) lines.push(<line key={`h${k}`} x1={x} y1={y + (k * h) / rows} x2={x + w} y2={y + (k * h) / rows} stroke="#cfd6da" strokeWidth={3} />);
    return (
      <svg className="thumb" viewBox="0 0 92 92">
        <rect x={x} y={y} width={w} height={h} fill="#cdeaf5" stroke="#9aa6ac" strokeWidth={4} />
        {lines}
        <rect x={x - 3} y={y + h} width={w + 6} height={5} fill="#e6e6e6" stroke="#bdbdbd" strokeWidth={1.5} />
      </svg>
    );
  }
  if (kind === "opening") {
    return (
      <svg className="thumb" viewBox="0 0 92 92">
        <rect x={28} y={10} width={36} height={74} fill="#efe6d6" stroke="#9a9a9a" strokeWidth={4} strokeDasharray="2 0" />
        <line x1={28} y1={10} x2={28} y2={84} stroke="#8a8a8a" strokeWidth={5} />
        <line x1={64} y1={10} x2={64} y2={84} stroke="#8a8a8a" strokeWidth={5} />
      </svg>
    );
  }
  // door
  const leaves = design === "double" ? 2 : 1;
  const x = leaves === 2 ? 16 : 26;
  const totalW = leaves === 2 ? 60 : 40;
  const lw = totalW / leaves;
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < leaves; i++) {
    const lx = x + i * lw;
    parts.push(<rect key={`l${i}`} x={lx} y={10} width={lw - 2} height={74} fill="#d8cbb2" stroke="#9a8d76" strokeWidth={3} />);
    if (design === "glazed") {
      parts.push(<rect key={`g${i}`} x={lx + 5} y={16} width={lw - 12} height={30} fill="#cdeaf5" stroke="#9aa6ac" strokeWidth={2} />);
      parts.push(<rect key={`p${i}`} x={lx + 5} y={54} width={lw - 12} height={24} fill="#c3b496" stroke="#9a8d76" strokeWidth={2} />);
    } else if (design !== "solid") {
      parts.push(<rect key={`p1${i}`} x={lx + 5} y={16} width={lw - 12} height={28} fill="#c3b496" stroke="#9a8d76" strokeWidth={2} />);
      parts.push(<rect key={`p2${i}`} x={lx + 5} y={50} width={lw - 12} height={28} fill="#c3b496" stroke="#9a8d76" strokeWidth={2} />);
    }
    const hx = leaves === 2 ? (i === 0 ? lx + lw - 7 : lx + 5) : lx + lw - 8;
    parts.push(<circle key={`h${i}`} cx={hx} cy={48} r={2.6} fill="#3a3a3a" />);
  }
  return <svg className="thumb" viewBox="0 0 92 92">{parts}</svg>;
}

export function FittingThumb({ symbol }: { symbol: string }) {
  if (symbol === "radiator") {
    const fins = [22, 33, 44, 55, 66];
    return (
      <svg className="thumb" viewBox="0 0 92 92">
        <rect x={16} y={28} width={60} height={36} rx={3} fill="#f2efe8" stroke="#b8b2a4" strokeWidth={3} />
        {fins.map((fx) => <line key={fx} x1={fx} y1={32} x2={fx} y2={60} stroke="#b8b2a4" strokeWidth={3} />)}
      </svg>
    );
  }
  if (symbol === "vent" || symbol === "vent-fan") {
    return (
      <svg className="thumb" viewBox="0 0 92 92">
        <rect x={26} y={26} width={40} height={40} rx={4} fill="#eef0f1" stroke="#a8adb1" strokeWidth={3} />
        {[34, 42, 50, 58].map((ly) => <line key={ly} x1={31} y1={ly} x2={61} y2={ly} stroke="#a8adb1" strokeWidth={3} />)}
      </svg>
    );
  }
  // socket / switch
  const dbl = symbol.endsWith("2");
  const isSwitch = symbol.startsWith("switch");
  return (
    <svg className="thumb" viewBox="0 0 92 92">
      <rect x={dbl ? 22 : 30} y={28} width={dbl ? 48 : 32} height={36} rx={6} fill="#f4f4f4" stroke="#b6b6b6" strokeWidth={3} />
      {isSwitch ? (
        <rect x={dbl ? 30 : 38} y={34} width={dbl ? 14 : 16} height={24} rx={3} fill="none" stroke="#7a7a7a" strokeWidth={3} />
      ) : (
        <>
          <circle cx={dbl ? 34 : 40} cy={46} r={4} fill="#8a8a8a" />
          <circle cx={dbl ? 44 : 52} cy={46} r={4} fill="#8a8a8a" />
        </>
      )}
      {dbl && isSwitch && <rect x={50} y={34} width={14} height={24} rx={3} fill="none" stroke="#7a7a7a" strokeWidth={3} />}
      {dbl && !isSwitch && (
        <>
          <circle cx={56} cy={46} r={4} fill="#8a8a8a" />
          <circle cx={64} cy={46} r={4} fill="#8a8a8a" />
        </>
      )}
    </svg>
  );
}
