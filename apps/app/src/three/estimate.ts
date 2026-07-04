// three/estimate.ts — a pure specification + price estimate over solved StructuralModel parts
// (Phase 5 / 5.C). Reads the engine's Part[] (dims in mm10, per-edge band thickness, PanelRole) and
// prices it against a MaterialPlan: each part's board rate comes from its role → decor (materials.ts),
// edges from the plan's band. Produces a cut list, sheet-area / edge totals grouped by thickness AND
// by material, and a rouble price. Pure and side-effect-free so the «Спецификация» panel renders
// straight from it. Rates live in materials.ts (realistic-but-illustrative until a live feed lands).

import type { Part } from "../../../../engine/contracts/types.js";
import type { StructuralModel, Section } from "../../../../engine/contracts/structure.js";
import {
  partBoard,
  edgeById,
  DEFAULT_PLAN,
  HARDWARE,
  hingesForDoorHeightMm,
  CAMS_PER_CARCASS,
  DOWELS_PER_CARCASS,
  PINS_PER_SHELF,
  type MaterialPlan,
} from "./materials.js";

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
  priceUzs: number; // this part's board + edge cost
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
  priceUzs: number;
}

export interface Estimate {
  parts: PartSpec[];
  count: number;
  areaM2: number; // total board area
  edgeM: number; // total edge-band length
  byThickness: ThicknessGroup[];
  byMaterial: MaterialGroup[];
  priceUzs: number;
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
    const board = partBoard(plan, p.role, p.materialId);
    const priceUzs = areaM2 * (board?.pricePerM2 ?? 0) + edgeM * edgeRate;
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
      priceUzs,
    };
  });

  const byThickness = [...specs.reduce((m, s) => {
    const g = m.get(s.t_mm) ?? { t_mm: s.t_mm, count: 0, areaM2: 0 };
    g.count += 1;
    g.areaM2 += s.areaM2;
    return m.set(s.t_mm, g);
  }, new Map<number, ThicknessGroup>()).values()].sort((a, b) => b.t_mm - a.t_mm);

  const byMaterial = [...specs.reduce((m, s) => {
    const g = m.get(s.materialName) ?? { name: s.materialName, count: 0, areaM2: 0, priceUzs: 0 };
    g.count += 1;
    g.areaM2 += s.areaM2;
    g.priceUzs += s.priceUzs;
    return m.set(s.materialName, g);
  }, new Map<string, MaterialGroup>()).values()].sort((a, b) => b.priceUzs - a.priceUzs);

  const areaM2 = sum(specs.map((s) => s.areaM2));
  const edgeM = sum(specs.map((s) => s.edgeM));
  const priceUzs = Math.round(sum(specs.map((s) => s.priceUzs)));
  return { parts: specs, count: specs.length, areaM2, edgeM, byThickness, byMaterial, priceUzs };
}

export interface HardwareLine {
  name: string;
  qty: number;
  priceUzs: number;
}
export interface HardwareEstimate {
  lines: HardwareLine[];
  priceUzs: number;
}

/** Height (mm) of the section with `id`, searched over the given zone roots (or null if absent). */
function sectionHeightMm(roots: Section[], id: string): number | null {
  for (const root of roots) {
    const stack: Section[] = [root];
    while (stack.length) {
      const s = stack.pop()!;
      if (s.id === id) return s.box.h / 10;
      for (const c of s.children) stack.push(c);
    }
  }
  return null;
}

/**
 * Count + price the hardware a model needs (Phase 7.2): hinges per door leaf (by height), 4 pins per
 * adjustable shelf, and one cam-and-dowel carcass kit per block. Computed from the MODEL (instances +
 * roles + section sizes) rather than the solved parts, so doubled / glazed-grid facades — which emit
 * many parts per single door — are counted once.
 */
export function hardwareEstimate(model: StructuralModel): HardwareEstimate {
  let hinges = 0;
  let slides = 0;
  let pins = 0;
  let cams = 0;
  let dowels = 0;
  for (const b of model.blocks) {
    cams += CAMS_PER_CARCASS;
    dowels += DOWELS_PER_CARCASS;
    const roots = b.zones.map((z) => z.root);
    for (const inst of b.instances) {
      const comp = b.components.find((c) => c.id === inst.componentId);
      if (!comp) continue;
      if (comp.drawer) {
        slides += 1; // one runner set per drawer (slides, not hinges)
      } else if (comp.role === "facade") {
        hinges += hingesForDoorHeightMm(sectionHeightMm(roots, inst.sectionId) ?? 700);
      } else if (comp.role === "internal_shelf") {
        pins += PINS_PER_SHELF;
      }
    }
  }
  const lines = [
    { name: HARDWARE.hinge.name, qty: hinges, priceUzs: hinges * HARDWARE.hinge.priceUzs },
    { name: HARDWARE.slide.name, qty: slides, priceUzs: slides * HARDWARE.slide.priceUzs },
    { name: HARDWARE.pin.name, qty: pins, priceUzs: pins * HARDWARE.pin.priceUzs },
    { name: HARDWARE.cam.name, qty: cams, priceUzs: cams * HARDWARE.cam.priceUzs },
    { name: HARDWARE.dowel.name, qty: dowels, priceUzs: dowels * HARDWARE.dowel.priceUzs },
  ].filter((l) => l.qty > 0);
  return { lines, priceUzs: sum(lines.map((l) => l.priceUzs)) };
}
