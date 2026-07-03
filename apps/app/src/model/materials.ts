// Eman.uz material catalogue (placeholder). The real product feed — names,
// thicknesses and live pricing — will be wired in later; for now this seeds the
// "Стиль" picker so the furniture-editor flow is complete and demonstrable.

import { fmtSum } from "./format";
import type { FinishKey } from "./cabinet";

export interface EmanMaterial {
  id: string;
  name: string;
  desc: string; // e.g. "Ручка, черная"
  thickness: string; // e.g. "10mm"
  price: number; // sum, per pack
  per: number; // pack size ("за N")
  color: string; // swatch
  part: FinishKey; // which render colour this material drives
  en?: string; // English material descriptor for the AI render prompt
  tex?: string; // PBR texture key (three/pbr.ts TEX) — drives the live 3D surface
}

export const EMAN_MATERIALS: EmanMaterial[] = [
  { id: "bagannas-bk", name: "BAGANNAS", desc: "Ручка, черная", thickness: "10mm", price: 6000, per: 2, color: "#2b2b2b", part: "handle", en: "matte black tubular metal handles" },
  { id: "bagannas-st", name: "BAGANNAS", desc: "Ручка, сталь", thickness: "10mm", price: 7000, per: 2, color: "#b9bdc1", part: "handle", en: "brushed stainless-steel tubular handles" },
  { id: "vinstaa", name: "VINSTAA", desc: "Фасад, белый глянец", thickness: "18mm", price: 142000, per: 1, color: "#f3f0ea", part: "facade", en: "white high-gloss lacquered cabinet fronts" },
  { id: "ekbacken", name: "EKBACKEN", desc: "Столешница, дуб", thickness: "28mm", price: 210000, per: 1, color: "#caa777", part: "worktop", en: "warm solid oak butcher-block countertop", tex: "wood_oak" },
  { id: "sibbarp", name: "SIBBARP", desc: "Стеновая панель, бетон", thickness: "13mm", price: 96000, per: 1, color: "#9b9a96", part: "carcass", en: "grey concrete-look panels" },
  { id: "lerhyttan", name: "LERHYTTAN", desc: "Фасад, орех", thickness: "18mm", price: 168000, per: 1, color: "#5a4636", part: "facade", en: "walnut solid-wood cabinet fronts", tex: "wood_walnut" },
  { id: "voxtorp", name: "VOXTORP", desc: "Фасад, матовый антрацит", thickness: "18mm", price: 158000, per: 1, color: "#5d5b57", part: "facade", en: "matte anthracite handleless cabinet fronts" },
  { id: "stensund", name: "STENSUND", desc: "Фасад, бежевый", thickness: "18mm", price: 149000, per: 1, color: "#cdbfa3", part: "facade", en: "soft beige shaker cabinet fronts" },
  { id: "bodbyn", name: "BODBYN", desc: "Фасад, серый", thickness: "18mm", price: 152000, per: 1, color: "#9ea29b", part: "facade", en: "warm grey shaker cabinet fronts" },
  { id: "torhamn", name: "TORHAMN", desc: "Фасад, дуб", thickness: "18mm", price: 175000, per: 1, color: "#c8a878", part: "facade", en: "natural oak solid-wood cabinet fronts", tex: "wood_oak" },
  { id: "maximera", name: "MAXIMERA", desc: "Ящик, доводчик", thickness: "—", price: 88000, per: 1, color: "#d6dadd", part: "carcass" },
  { id: "utrusta", name: "UTRUSTA", desc: "Полка, закалённое стекло", thickness: "5mm", price: 42000, per: 1, color: "#cdeaf5", part: "carcass" },
  { id: "kungsbacka", name: "KUNGSBACKA", desc: "Фасад, антрацит", thickness: "18mm", price: 161000, per: 1, color: "#4a4640", part: "facade", en: "matte dark anthracite cabinet fronts" },
  { id: "ringhult", name: "RINGHULT", desc: "Фасад, светло-серый глянец", thickness: "18mm", price: 156000, per: 1, color: "#dcd9d2", part: "facade", en: "light grey high-gloss cabinet fronts" },
  { id: "kasker", name: "KASKER", desc: "Столешница, мрамор", thickness: "30mm", price: 320000, per: 1, color: "#e6e4e0", part: "worktop", en: "white marble countertop", tex: "marble" },
  { id: "saeljan", name: "SÄLJAN", desc: "Столешница, чёрный мрамор", thickness: "28mm", price: 180000, per: 1, color: "#3c3b3a", part: "worktop", en: "black marble countertop", tex: "marble" },
  { id: "ekestad", name: "EKESTAD", desc: "Фасад, серый дуб", thickness: "18mm", price: 171000, per: 1, color: "#6b6258", part: "facade", en: "grey-oak wood cabinet fronts", tex: "wood_ash" },
  { id: "askersund", name: "ASKERSUND", desc: "Фасад, тёмное дерево", thickness: "18mm", price: 166000, per: 1, color: "#43352a", part: "facade", en: "dark wenge wood cabinet fronts", tex: "wood_wenge" },
  // carcass (Корпус) body finishes — more options than the original 3
  { id: "ldsp-white", name: "ЛДСП", desc: "Корпус, белый", thickness: "16mm", price: 78000, per: 1, color: "#f0efe9", part: "carcass" },
  { id: "ldsp-grey", name: "ЛДСП", desc: "Корпус, светло-серый", thickness: "16mm", price: 82000, per: 1, color: "#c9c8c3", part: "carcass" },
  { id: "ldsp-sand", name: "ЛДСП", desc: "Корпус, песочный", thickness: "16mm", price: 84000, per: 1, color: "#cdbfa3", part: "carcass" },
  { id: "ldsp-oak", name: "ЛДСП", desc: "Корпус, дуб", thickness: "16mm", price: 96000, per: 1, color: "#c8a878", part: "carcass", tex: "wood_oak" },
  { id: "ldsp-walnut", name: "ЛДСП", desc: "Корпус, орех", thickness: "16mm", price: 98000, per: 1, color: "#5a4636", part: "carcass", tex: "wood_walnut" },
  { id: "ldsp-anthracite", name: "ЛДСП", desc: "Корпус, антрацит", thickness: "16mm", price: 90000, per: 1, color: "#46474a", part: "carcass" },
];

/** hex string ("#rrggbb") → the colour int the renderer + finish overrides use. */
export const hexToInt = (hex: string) => parseInt(hex.replace("#", ""), 16);

/** the catalog material a finish colour came from (exact colour+part match), or undefined
 *  — lets the 3D recover the picked material's PBR texture from the stored finish. */
export function catalogByColor(colorInt: number | undefined, part: FinishKey): EmanMaterial | undefined {
  if (colorInt == null) return undefined;
  return EMAN_MATERIALS.find((m) => m.part === part && hexToInt(m.color) === colorInt);
}

// `money` defaults to UZS (`fmtSum`); pass a `useMoney()` formatter to honour the
// user's chosen currency (the price is a UZS base amount).
export const matPriceLabel = (m: EmanMaterial, money: (n: number) => string = fmtSum) => `${money(m.price)} за ${m.per}`;
