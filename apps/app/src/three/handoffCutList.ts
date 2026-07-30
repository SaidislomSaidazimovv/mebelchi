import type { Cabinet } from "../model/cabinet";
import type { StructuralModel } from "../../../../engine/contracts/structure.js";
import type { Part } from "../../../../engine/contracts/types.js";
import { solveStructure } from "../../../../engine/structure/solve.js";
import { solveModelToParts } from "../../../../engine/cnc.js";
import { estimate, groupSpecs, hardwareEstimate, type PartSpec, type GroupedSpec } from "./estimate";
import { cellToKarkasBlock } from "./cellToKarkas";
import { planThickness, withPlanDefaults, type MaterialPlan } from "./materials";
import { production } from "../model/cncExport";

export interface ProjectBlockInput {
  name: string;
  karkasJson: string;
}

export interface UnifiedCutList {
  rows: GroupedSpec[];
  fallback: string[];
}

const prefixIds = (parts: Part[], prefix: string): Part[] => parts.map((p) => ({ ...p, id: `${prefix}:${p.id}` }));

const fallbackSpecs = (cab: Cabinet): PartSpec[] => {
  const prod = production([cab]);
  if (!prod) return [];
  return prod.panels.map((r, i) => ({
    id: `fb:${cab.id}:${i}`,
    name: r.part,
    w_mm: r.widthMm,
    l_mm: r.lengthMm,
    t_mm: r.thicknessMm,
    rohW_mm: r.widthMm,
    rohL_mm: r.lengthMm,
    cutW_mm: r.widthMm,
    cutL_mm: r.lengthMm,
    areaM2: (r.lengthMm * r.widthMm) / 1_000_000,
    edgeM: 0,
    bands: [false, false, false, false] as [boolean, boolean, boolean, boolean],
    materialName: r.material,
    priceUzs: 0,
    note: "⚠ черновой расчёт",
  }));
};

const cabinetSpecs = (cab: Cabinet): { specs: PartSpec[]; ok: boolean } => {
  try {
    const { model, plan } = cellToKarkasBlock(cab);
    return { specs: estimate(prefixIds(solveStructure(model, planThickness(plan)), cab.id), plan).parts, ok: true };
  } catch {
    return { specs: fallbackSpecs(cab), ok: false };
  }
};

const blockSpecs = (karkasJson: string, prefix: string): PartSpec[] => {
  try {
    const { model, plan } = JSON.parse(karkasJson) as { model?: StructuralModel; plan?: MaterialPlan };
    if (!model?.blocks?.length) return [];
    const p = withPlanDefaults(plan);
    return estimate(prefixIds(solveStructure(model, planThickness(p)), prefix), p).parts;
  } catch {
    return [];
  }
};

export function unifiedCutList(cabs: Cabinet[], blocks: ProjectBlockInput[]): UnifiedCutList {
  const specs: PartSpec[] = [];
  const fallback: string[] = [];
  for (const cab of cabs) {
    if (cab.furniture) continue;
    const r = cabinetSpecs(cab);
    specs.push(...r.specs);
    if (!r.ok) fallback.push(cab.id);
  }
  blocks.forEach((b, i) => specs.push(...blockSpecs(b.karkasJson, `blk${i}`)));
  return { rows: groupSpecs(specs), fallback };
}

export interface HwLine {
  name: string;
  qty: number;
}

export interface UnifiedHardware {
  lines: HwLine[];
  fallback: string[];
}

export function unifiedHardware(cabs: Cabinet[], blocks: ProjectBlockInput[]): UnifiedHardware {
  const byName = new Map<string, number>();
  const fallback: string[] = [];
  const add = (name: string, qty: number) => { if (qty > 0) byName.set(name, (byName.get(name) ?? 0) + qty); };
  for (const cab of cabs) {
    if (cab.furniture) continue;
    try {
      const { model } = cellToKarkasBlock(cab);
      for (const h of hardwareEstimate(model).lines) add(h.name, h.qty);
    } catch {
      const prod = production([cab]);
      if (prod) for (const h of prod.hardware) add(h.name, h.qty);
      fallback.push(cab.id);
    }
  }
  for (const b of blocks) {
    try {
      const { model } = JSON.parse(b.karkasJson) as { model?: StructuralModel };
      if (model?.blocks?.length) for (const h of hardwareEstimate(model).lines) add(h.name, h.qty);
    } catch { continue; }
  }
  return { lines: [...byName].map(([name, qty]) => ({ name, qty })), fallback };
}

export function unifiedDrilledParts(cabs: Cabinet[], blocks: ProjectBlockInput[]): Part[] {
  const parts: Part[] = [];
  for (const cab of cabs) {
    if (cab.furniture) continue;
    try {
      const { model, plan } = cellToKarkasBlock(cab);
      parts.push(...prefixIds(solveModelToParts(model, planThickness(plan)), cab.id));
    } catch { continue; }
  }
  blocks.forEach((b, i) => {
    try {
      const { model, plan } = JSON.parse(b.karkasJson) as { model?: StructuralModel; plan?: MaterialPlan };
      if (model?.blocks?.length) parts.push(...prefixIds(solveModelToParts(model, planThickness(withPlanDefaults(plan))), `blk${i}`));
    } catch { return; }
  });
  return parts;
}

export function positionMap(rows: GroupedSpec[]): Map<string, number> {
  const m = new Map<string, number>();
  rows.forEach((r, i) => r.ids.forEach((id) => m.set(id, i + 1)));
  return m;
}
