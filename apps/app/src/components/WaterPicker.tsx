// Water-supply wall picker. A stripped-down 2D plan (no dimensions, no handles):
// the room outline plus one white circle per wall side. Tap a circle to choose
// which wall the water enters from; the chosen one turns into a blue faucet
// marker. Drives where the dishwasher is later placed when generating variants.
import {
  polygonBoundsMm,
  offsetPolygon,
  centroidOf,
  openingSpan,
  wallSegments,
  type Pt,
  type Opening,
} from "../model/room";

const T = 100; // wall thickness (mm)
const MARGIN = 1200;

const path = (pts: Pt[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";

function outwardNormal(a: Pt, b: Pt, c: Pt) {
  let nx = b.y - a.y;
  let ny = -(b.x - a.x);
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((mx - c.x) * nx + (my - c.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

export function WaterPicker({
  points,
  openings,
  interiorWalls,
  coveringColor,
  roomName,
  selected,
  onSelect,
}: {
  points: Pt[];
  openings: Opening[];
  interiorWalls: Pt[][];
  coveringColor: string;
  roomName: string;
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const n = points.length;
  const c = centroidOf(points);
  const inner = offsetPolygon(points, T);
  const segs = wallSegments(points, interiorWalls);
  const b = polygonBoundsMm(points);
  const vb = { x: b.minX - MARGIN, y: b.minY - MARGIN, w: b.w + 2 * MARGIN, h: b.h + 2 * MARGIN };
  const d = path(points);
  const dInner = path(inner);

  let area = 0;
  for (let i = 0; i < n; i++) area += points[i].x * points[(i + 1) % n].y - points[(i + 1) % n].x * points[i].y;
  const m2 = Math.round((Math.abs(area) / 2 / 1e6) * 10) / 10;

  return (
    <svg className="water-plan" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="wplanks" width="640" height="170" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="640" y2="0" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="0" y1="85" x2="640" y2="85" stroke="rgba(150,120,80,0.20)" strokeWidth="3" />
          <line x1="320" y1="0" x2="320" y2="85" stroke="rgba(150,120,80,0.14)" strokeWidth="2" />
        </pattern>
      </defs>

      <g pointerEvents="none">
        <path d={`${d} ${dInner}`} fillRule="evenodd" fill="#d6d6d6" />
        <path d={dInner} fill={coveringColor} />
        <path d={dInner} fill="url(#wplanks)" />
        <path d={d} fill="none" stroke="#b4b4b4" strokeWidth={6} />
        <path d={dInner} fill="none" stroke="#c7c7c7" strokeWidth={4} />
        {interiorWalls.map((poly, wi) => (
          <polyline key={`wiw${wi}`} points={poly.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#d6d6d6" strokeWidth={T} strokeLinecap="square" strokeLinejoin="miter" />
        ))}
        {openings.map((o) => {
          if (o.wall >= n) return null; // openings on drawn walls aren't shown in the water picker
          const a = points[o.wall];
          const bb = points[(o.wall + 1) % n];
          const sp = openingSpan(a, bb, o.t, o.width);
          return (
            <g key={`wo${o.id}`}>
              <line x1={sp.p1.x} y1={sp.p1.y} x2={sp.p2.x} y2={sp.p2.y} stroke="#fff" strokeWidth={T + 8} />
              {o.kind === "window" && <line x1={sp.p1.x} y1={sp.p1.y} x2={sp.p2.x} y2={sp.p2.y} stroke="#8fc7e8" strokeWidth={26} />}
            </g>
          );
        })}
      </g>

      {/* centred room label (no dimensions) */}
      <text x={c.x} y={c.y - 30} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={170} fill="#555" pointerEvents="none">
        {roomName}
      </text>
      <text x={c.x} y={c.y + 220} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize={240} fontWeight={600} fill="#222" pointerEvents="none">
        {`${Number.isInteger(m2) ? m2 : m2.toFixed(1)} м²`}
      </text>

      {/* one selectable circle per wall side (room + drawn); selected → faucet */}
      {segs.map((seg, i) => {
        const a = seg.a;
        const bb = seg.b;
        if (Math.hypot(bb.x - a.x, bb.y - a.y) < 1) return null;
        const nn = outwardNormal(a, bb, c);
        const mx = (a.x + bb.x) / 2;
        const my = (a.y + bb.y) / 2;
        const px = mx - nn.nx * 300;
        const py = my - nn.ny * 300;
        const sel = selected === i;
        const r = 280;
        return (
          <g key={`wc${i}`} style={{ cursor: "pointer" }} onClick={() => onSelect(i)}>
            <circle cx={px} cy={py} r={r + 120} fill="transparent" />
            <circle cx={px} cy={py} r={r} fill={sel ? "#2a6df0" : "#fff"} stroke={sel ? "#2a6df0" : "#9aa0a6"} strokeWidth={sel ? 0 : 18} />
            {sel ? (
              <path
                d={`M${px} ${py - r * 0.5} C ${px + r * 0.58} ${py - r * 0.05} ${px + r * 0.4} ${py + r * 0.48} ${px} ${py + r * 0.48} C ${px - r * 0.4} ${py + r * 0.48} ${px - r * 0.58} ${py - r * 0.05} ${px} ${py - r * 0.5} Z`}
                fill="#fff"
              />
            ) : (
              <circle cx={px} cy={py} r={70} fill="#9aa0a6" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
