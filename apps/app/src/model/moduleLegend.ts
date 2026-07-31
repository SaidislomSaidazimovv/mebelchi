import type { Cabinet } from "./cabinet";
import { GEOM } from "./layout";

const APPL_RU: Record<string, string> = {
  sink: "Мойка",
  hob: "Плита",
  cooktop: "Варочная панель",
  oven: "Духовой шкаф",
  fridge: "Холодильник",
  dishwasher: "Посудомойка",
  hood: "Вытяжка",
  washer: "Стиральная машина",
};

const kindRu = (c: Cabinet): string =>
  c.corner ? "Угловой" : c.kind === "base" ? "Напольный" : c.kind === "tall" ? "Пенал" : c.kind === "upper" ? "Навесной" : "Модуль";
const carcassH = (c: Cabinet): number => (c.kind === "base" ? GEOM.baseH : c.h);
const cabDepth = (c: Cabinet): number => c.depth ?? (c.kind === "upper" ? 350 : 560);

export interface LegendItem {
  n: number;
  name: string;
  size: string;
  label: string;
}

export function moduleLegendItems(cabs: readonly Cabinet[], numberOf?: Map<string, number>): LegendItem[] {
  return cabs
    .filter((c) => !c.furniture && c.appliance !== "filler")
    .map((c, i) => {
      const appl = c.appliance && c.appliance !== "none" ? APPL_RU[c.appliance] : undefined;
      const name = appl ?? kindRu(c);
      const size = `${c.w}×${Math.round(carcassH(c))}×${cabDepth(c)}`;
      return { n: numberOf?.get(c.id) ?? i + 1, name, size, label: `${name} ${size}` };
    })
    .sort((a, b) => a.n - b.n);
}
