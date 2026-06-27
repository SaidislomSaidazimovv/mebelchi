// Eman.uz material catalogue (placeholder). The real product feed — names,
// thicknesses and live pricing — will be wired in later; for now this seeds the
// "Стиль" picker so the furniture-editor flow is complete and demonstrable.

import { fmtSum } from "./format";

export interface EmanMaterial {
  id: string;
  name: string;
  desc: string; // e.g. "Ручка, черная"
  thickness: string; // e.g. "10mm"
  price: number; // sum, per pack
  per: number; // pack size ("за N")
  color: string; // swatch
}

export const EMAN_MATERIALS: EmanMaterial[] = [
  { id: "bagannas-bk", name: "BAGANNAS", desc: "Ручка, черная", thickness: "10mm", price: 6000, per: 2, color: "#2b2b2b" },
  { id: "bagannas-st", name: "BAGANNAS", desc: "Ручка, сталь", thickness: "10mm", price: 7000, per: 2, color: "#b9bdc1" },
  { id: "vinstaa", name: "VINSTAA", desc: "Фасад, белый глянец", thickness: "18mm", price: 142000, per: 1, color: "#f3f0ea" },
  { id: "ekbacken", name: "EKBACKEN", desc: "Столешница, дуб", thickness: "28mm", price: 210000, per: 1, color: "#caa777" },
  { id: "sibbarp", name: "SIBBARP", desc: "Стеновая панель, бетон", thickness: "13mm", price: 96000, per: 1, color: "#9b9a96" },
  { id: "lerhyttan", name: "LERHYTTAN", desc: "Фасад, чёрная морилка", thickness: "18mm", price: 168000, per: 1, color: "#3a352f" },
  { id: "voxtorp", name: "VOXTORP", desc: "Фасад, матовый антрацит", thickness: "18mm", price: 158000, per: 1, color: "#5d5b57" },
  { id: "stensund", name: "STENSUND", desc: "Фасад, бежевый", thickness: "18mm", price: 149000, per: 1, color: "#cdbfa3" },
  { id: "bodbyn", name: "BODBYN", desc: "Фасад, серый", thickness: "18mm", price: 152000, per: 1, color: "#9ea29b" },
  { id: "torhamn", name: "TORHAMN", desc: "Фасад, ясень", thickness: "18mm", price: 175000, per: 1, color: "#c8b291" },
  { id: "maximera", name: "MAXIMERA", desc: "Ящик, доводчик", thickness: "—", price: 88000, per: 1, color: "#d6dadd" },
  { id: "utrusta", name: "UTRUSTA", desc: "Полка, закалённое стекло", thickness: "5mm", price: 42000, per: 1, color: "#cdeaf5" },
  { id: "kungsbacka", name: "KUNGSBACKA", desc: "Фасад, антрацит", thickness: "18mm", price: 161000, per: 1, color: "#4a4640" },
  { id: "ringhult", name: "RINGHULT", desc: "Фасад, светло-серый глянец", thickness: "18mm", price: 156000, per: 1, color: "#dcd9d2" },
];

export const matPriceLabel = (m: EmanMaterial) => `${fmtSum(m.price)} за ${m.per}`;
