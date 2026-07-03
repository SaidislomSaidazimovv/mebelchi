// Phase Е — "Передача": turn the constructed run into a factory production package.
// Reuses the pricing engine's panel decomposition (modulePanels) + the quote's hardware
// lines, so the cut list / hardware list are REAL (the same data that prices the kitchen),
// not a mockup. Pure; the screen renders it and offers a CSV download.

import { modulePanels, panelAreaM2, seedRateTable, priceProject } from "@mebelchi/pricing";
import { cabToModule, projectFromCabs } from "./toProject";
import type { Cabinet } from "./cabinet";

const CARCASS_T = 16; // engine CARCASS_THICKNESS_MM
const FACADE_T = 18; // engine FACADE_THICKNESS_MM

const matName = (ref: string): string => seedRateTable.materials[ref]?.name ?? ref;
const hwName = (sku: string): string => Object.values(seedRateTable.hardware).find((h) => h.sku === sku)?.name ?? sku;

const PART_RU: Record<string, string> = {
  "side-left": "Бок левый",
  "side-right": "Бок правый",
  bottom: "Дно",
  top: "Крышка",
  back: "Задняя стенка",
  door: "Фасад",
};
function partRu(name: string): string {
  if (PART_RU[name]) return PART_RU[name];
  const [base, n] = name.split(/-(?=\d+$)/);
  if (base === "shelf") return `Полка ${n}`;
  if (base === "divider") return `Перегородка ${n}`;
  if (name.startsWith("drawer-front")) return `Фасад ящика ${name.split("-").pop()}`;
  return name;
}

const APPL: Record<string, string> = {
  sink: "Мойка",
  hob: "Плита",
  cooktop: "Варочная панель",
  oven: "Духовой шкаф",
  fridge: "Холодильник",
  dishwasher: "Посудомойка",
  hood: "Вытяжка",
};
function cabLabel(c: Cabinet): string {
  if (c.appliance && c.appliance !== "none" && c.appliance !== "filler") return APPL[c.appliance] ?? "Техника";
  if (c.corner) return "Угловой";
  const k = c.kind === "upper" ? "Навесной" : c.kind === "tall" ? "Пенал" : "Напольный";
  return `${k} ${c.w}`;
}

export interface PanelRow {
  module: string;
  part: string;
  /** raw ASCII panel name (side-left / bottom / door…) — for the DXF, which isn't UTF-8 */
  partEn: string;
  material: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  edge: string;
}
export interface HwRow {
  name: string;
  qty: number;
}
export interface Production {
  panels: PanelRow[];
  hardware: HwRow[];
  boardM2: number;
  moduleCount: number;
}

/** The full production package for the run (cut list + hardware + board area). */
export function production(cabs: Cabinet[]): Production | null {
  const real = cabs.filter((c) => !c.furniture);
  if (!real.length) return null;
  const project = projectFromCabs(real);
  const mats = project.materials;

  const panels: PanelRow[] = [];
  let boardArea = 0;
  const labelById = new Map(real.map((c, i) => [c.id, `${i + 1}. ${cabLabel(c)}`]));
  for (const c of real) {
    const mod = cabToModule(c);
    for (const p of modulePanels(mod, mats)) {
      const facade = p.role === "facade";
      panels.push({
        module: labelById.get(c.id) ?? cabLabel(c),
        part: partRu(p.name),
        partEn: p.name,
        material: matName(p.materialRef),
        lengthMm: Math.round(p.lengthMm),
        widthMm: Math.round(p.widthMm),
        thicknessMm: facade ? FACADE_T : CARCASS_T,
        edge: facade ? "2мм ПВХ" : "0.4мм",
      });
      boardArea += panelAreaM2(p);
    }
  }

  // hardware totals straight from the priced BOM
  const hw = new Map<string, number>();
  for (const line of priceProject(project, seedRateTable).lines) {
    if (line.kind !== "hardware") continue;
    const name = hwName(line.ref);
    hw.set(name, (hw.get(name) ?? 0) + line.qty);
  }

  return {
    panels,
    hardware: [...hw.entries()].map(([name, qty]) => ({ name, qty })),
    boardM2: Math.round(boardArea * 100) / 100,
    moduleCount: real.length,
  };
}

/** A ;-separated CSV (Excel-friendly, Cyrillic) of the cut list + hardware. */
export function productionCSV(p: Production): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: string[] = ["Тип;Модуль;Наименование;Материал;Длина, мм;Ширина, мм;Толщина, мм;Кол-во;Кромка"];
  for (const r of p.panels) {
    rows.push([ "Панель", r.module, r.part, r.material, r.lengthMm, r.widthMm, r.thicknessMm, 1, r.edge ].map(esc).join(";"));
  }
  for (const h of p.hardware) {
    rows.push([ "Фурнитура", "", h.name, "", "", "", "", h.qty, "" ].map(esc).join(";"));
  }
  return rows.join("\r\n");
}
