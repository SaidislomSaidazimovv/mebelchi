// Top-down room plan (ported from v7 kitchenSVG `opt.top`). Rendered as real JSX
// so it stays reactive. Used on the Space screen now; reused later for handoff
// deliverables. Shows the work wall, water marker, and module slots.
import { useStore } from "../store";
import { MATERIALS } from "../model/cabinet";

const MONO = "ui-monospace, Menlo, monospace";

export function PlanView() {
  const wallLen = useStore((s) => s.wallLen);
  const shape = useStore((s) => s.shape);
  const water = useStore((s) => s.water);
  const mat = useStore((s) => s.mat);
  const n = useStore((s) => s.cabs.length) || 5;

  const m = MATERIALS[mat];
  const waterX = water === "left" ? 60 : water === "right" ? 300 : 180;

  return (
    <svg viewBox="0 0 360 200" className="plan">
      <rect x="20" y="20" width="320" height="160" fill="#efe9dd" stroke="#c9c1b2" />
      <rect x="30" y="30" width="300" height="34" fill={m.c} stroke={m.e} />
      <text x="180" y="52" textAnchor="middle" fontFamily={MONO} fontSize="11" fill="#8f897d">
        {wallLen} мм · рабочая стена
      </text>
      {water !== "none" && <circle cx={waterX} cy="47" r="7" fill="#2a6df0" />}
      {Array.from({ length: n }, (_, i) => {
        const w = 260 / n;
        const x = 40 + i * (280 / n);
        return (
          <g key={i}>
            <rect x={x} y={36} width={w} height={22} fill="none" stroke="#c9c1b2" />
            <text x={x + w / 2} y={51} textAnchor="middle" fontFamily={MONO} fontSize="10" fill="#b6ad9b">
              {i + 1}
            </text>
          </g>
        );
      })}
      <text x="180" y="150" textAnchor="middle" fontFamily={MONO} fontSize="11" fill="#8f897d">
        {n} модулей · {shape === "i" ? "прямая" : "угловая"}
      </text>
    </svg>
  );
}
