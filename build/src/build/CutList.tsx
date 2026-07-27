import type { CutPiece } from "../engine/cutlist";
import { mm10ToMm } from "../engine/units";

const NAMES: Record<string, string> = {
  side_left: "Chap yon",
  side_right: "O'ng yon",
  top: "Tepa",
  bottom: "Tag",
  back: "Orqa",
};

const size = (v: number) => String(Math.round(mm10ToMm(v)));
const meters = (v: number) => (v / 10000).toFixed(2);

export function CutList({ pieces }: { pieces: CutPiece[] }) {
  const totalKromka = pieces.reduce((sum, p) => sum + p.kromkaLength, 0);
  return (
    <aside className="cutlist">
      <div className="cutlist-head">
        <span className="cutlist-title">Kesim ro'yxati</span>
        <span className="cutlist-sub">LDSP · 16 mm</span>
      </div>
      <table className="cutlist-table">
        <thead>
          <tr>
            <th>Detal</th>
            <th>Tayyor (mm)</th>
            <th>Kromka</th>
            <th>Arra (mm)</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p) => (
            <tr key={p.id}>
              <td>{NAMES[p.id] ?? p.id}</td>
              <td>{size(p.length)}×{size(p.width)}×{size(p.thickness)}</td>
              <td>{p.kromkaLength > 0 ? `old · ${meters(p.kromkaLength)} m` : "—"}</td>
              <td>{size(p.sawLength)}×{size(p.sawWidth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cutlist-foot">Jami kromka: {meters(totalKromka)} m</div>
    </aside>
  );
}
