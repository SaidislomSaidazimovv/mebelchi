import type { CutPiece } from "../engine/cutlist";
import { mm10ToMm } from "../engine/units";

const size = (v: number) => String(Math.round(mm10ToMm(v)));
const meters = (v: number) => (mm10ToMm(v) / 1000).toFixed(2);

export function CutList({ pieces }: { pieces: CutPiece[] }) {
  const totalKromka = pieces.reduce((sum, p) => sum + p.kromkaLength, 0);
  return (
    <aside className="cutlist">
      <div className="cutlist-head">
        <span className="cutlist-title">Kesim ro'yxati</span>
      </div>
      <table className="cutlist-table" style={{ fontSize: "13px" }}>
        <thead>
          <tr>
            <th>Detal</th>
            <th>Tayyor (mm)</th>
            <th>Kromka (m)</th>
            <th>Arra (mm)</th>
            <th>Paz</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{size(p.length)} × {size(p.width)}</td>
              <td>{p.kromkaLength > 0 ? meters(p.kromkaLength) : "—"}</td>
              <td>{size(p.sawLength)} × {size(p.sawWidth)}</td>
              <td>{p.operationsCount > 0 ? `${p.operationsCount}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cutlist-foot">Jami kromka: {meters(totalKromka)} m</div>
    </aside>
  );
}
