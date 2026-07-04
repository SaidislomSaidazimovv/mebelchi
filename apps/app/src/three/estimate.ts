// three/estimate.ts — a pure specification + price estimate over solved StructuralModel parts
// (Phase 5 / 5.C). Reads the engine's Part[] (dims in mm10, per-edge band thickness, PanelRole) and
// prices it against a MaterialPlan: each part's board rate comes from its role → decor (materials.ts),
// edges from the plan's band. Produces a cut list, sheet-area / edge totals grouped by thickness AND
// by material, and a rouble price. Pure and side-effect-free so the «Спецификация» panel renders
// straight from it. Rates live in materials.ts (realistic-but-illustrative until a live feed lands).

import type { Part } from "../../../../engine/contracts/types.js";
import { boardForRole, edgeById, DEFAULT_PLAN, type MaterialPlan } from "./materials.js";

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
  role?: string;
  materialName: string; // decor this part is cut from under the plan
  priceRub: number; // this part's board + edge cost
}

export interface ThicknessGroup {
  t_mm: number;
  count: number;
  areaM2: number;
}

export interface MaterialGroup {
  name: string;
  count: number;
  areaM2: number;
  priceRub: number;
}

export interface Estimate {
  parts: PartSpec[];
  count: number;
  areaM2: number; // total board area
  edgeM: number; // total edge-band length
  byThickness: ThicknessGroup[];
  byMaterial: MaterialGroup[];
  priceRub: number;
}

/** Build the cut list + totals + price for a solved model's parts under a material plan. */
export function estimate(parts: Part[], plan: MaterialPlan = DEFAULT_PLAN): Estimate {
  const edgeRate = edgeById(plan.edge)?.pricePerM ?? 0;

  const specs: PartSpec[] = parts.map((p) => {
    const w = M(p.width_mm10);
    const l = M(p.length_mm10);
    const areaM2 = w * l;
    const bands: [boolean, boolean, boolean, boolean] = [p.edges[0] > 0, p.edges[1] > 0, p.edges[2] > 0, p.edges[3] > 0];
    // SWJ008 perimeter convention: faces 1 & 3 run along Width, faces 2 & 4 along Length.
    const edgeM = (bands[0] ? w : 0) + (bands[2] ? w : 0) + (bands[1] ? l : 0) + (bands[3] ? l : 0);
    const board = boardForRole(plan, p.role);
    const priceRub = areaM2 * (board?.pricePerM2 ?? 0) + edgeM * edgeRate;
    return {
      id: p.id,
      name: p.name,
      w_mm: MM(p.width_mm10),
      l_mm: MM(p.length_mm10),
      t_mm: round1(p.thickness_mm10 / 10),
      areaM2,
      edgeM,
      bands,
      role: p.role,
      materialName: board?.name ?? "—",
      priceRub,
    };
  });

  const byThickness = [...specs.reduce((m, s) => {
    const g = m.get(s.t_mm) ?? { t_mm: s.t_mm, count: 0, areaM2: 0 };
    g.count += 1;
    g.areaM2 += s.areaM2;
    return m.set(s.t_mm, g);
  }, new Map<number, ThicknessGroup>()).values()].sort((a, b) => b.t_mm - a.t_mm);

  const byMaterial = [...specs.reduce((m, s) => {
    const g = m.get(s.materialName) ?? { name: s.materialName, count: 0, areaM2: 0, priceRub: 0 };
    g.count += 1;
    g.areaM2 += s.areaM2;
    g.priceRub += s.priceRub;
    return m.set(s.materialName, g);
  }, new Map<string, MaterialGroup>()).values()].sort((a, b) => b.priceRub - a.priceRub);

  const areaM2 = sum(specs.map((s) => s.areaM2));
  const edgeM = sum(specs.map((s) => s.edgeM));
  const priceRub = Math.round(sum(specs.map((s) => s.priceRub)));
  return { parts: specs, count: specs.length, areaM2, edgeM, byThickness, byMaterial, priceRub };
}
