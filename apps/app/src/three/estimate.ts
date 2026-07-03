// three/estimate.ts — a pure specification + price estimate over solved StructuralModel parts
// (Phase 5). Reads the engine's Part[] (dims in mm10, per-edge band thickness) and produces a cut
// list, sheet-area / edge-length totals grouped by board thickness, and a rough rouble price from a
// small configurable rate table. Pure and side-effect-free so it is trivially unit-testable and the
// «Спецификация» panel can render straight from it. NOTE: the rates are placeholder estimates
// («taxminiy») until the material catalog (Phase 5.C) lets a real per-part decor drive the price.

import type { Part } from "../../../../engine/contracts/types.js";

/** Placeholder rates — clearly an estimate until a material catalog drives real per-decor pricing. */
export interface RateTable {
  boardPerM2: number; // ₽ per m² of sheet
  edgePerM: number; // ₽ per metre of edge banding
}
export const DEFAULT_RATES: RateTable = { boardPerM2: 560, edgePerM: 28 };

const M = (mm10: number): number => mm10 / 10000; // mm10 → metres
const MM = (mm10: number): number => Math.round(mm10 / 10); // mm10 → whole mm
const round1 = (n: number): number => Math.round(n * 10) / 10;
const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0);

/** One row of the cut list. Dimensions in mm; area in m²; banded flags per SWJ008 edge face 1..4. */
export interface PartSpec {
  id: string;
  name: string;
  w_mm: number;
  l_mm: number;
  t_mm: number;
  areaM2: number;
  edgeM: number;
  bands: [boolean, boolean, boolean, boolean];
}

export interface ThicknessGroup {
  t_mm: number;
  count: number;
  areaM2: number;
}

export interface Estimate {
  parts: PartSpec[];
  count: number;
  areaM2: number; // total board area
  edgeM: number; // total edge-band length
  byThickness: ThicknessGroup[];
  priceRub: number;
}

/** Build the cut list + totals + price for a solved model's parts. */
export function estimate(parts: Part[], rates: RateTable = DEFAULT_RATES): Estimate {
  const specs: PartSpec[] = parts.map((p) => {
    const w = M(p.width_mm10);
    const l = M(p.length_mm10);
    const bands: [boolean, boolean, boolean, boolean] = [
      p.edges[0] > 0,
      p.edges[1] > 0,
      p.edges[2] > 0,
      p.edges[3] > 0,
    ];
    // SWJ008 perimeter convention: faces 1 & 3 run along Width, faces 2 & 4 along Length.
    const edgeM = (bands[0] ? w : 0) + (bands[2] ? w : 0) + (bands[1] ? l : 0) + (bands[3] ? l : 0);
    return { id: p.id, name: p.name, w_mm: MM(p.width_mm10), l_mm: MM(p.length_mm10), t_mm: round1(p.thickness_mm10 / 10), areaM2: w * l, edgeM, bands };
  });

  const byThickness = [...specs.reduce((m, s) => {
    const g = m.get(s.t_mm) ?? { t_mm: s.t_mm, count: 0, areaM2: 0 };
    g.count += 1;
    g.areaM2 += s.areaM2;
    return m.set(s.t_mm, g);
  }, new Map<number, ThicknessGroup>()).values()].sort((a, b) => b.t_mm - a.t_mm);

  const areaM2 = sum(specs.map((s) => s.areaM2));
  const edgeM = sum(specs.map((s) => s.edgeM));
  const priceRub = Math.round(areaM2 * rates.boardPerM2 + edgeM * rates.edgePerM);
  return { parts: specs, count: specs.length, areaM2, edgeM, byThickness, priceRub };
}
