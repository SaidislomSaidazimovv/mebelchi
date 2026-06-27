// Editable parts of a module — the "Измените некоторые элементы" list in the
// furniture editor. Derived from the cabinet (kind / fill / appliance). This is a
// reasonable decomposition until the real Eman.uz BOM is wired in; the editor
// drives it generically so swapping in the real part list later is a data change.

import type { Cabinet } from "./cabinet";

export type PartAction = "edit" | "style" | "delete";

export interface Part {
  id: string;
  name: string;
  actions: PartAction[];
  /** aspect shown after "Редактировать" in the part-edit panel title, e.g. "Выступ" */
  editLabel?: string;
}

const isAppliance = (c: Cabinet) => !!c.appliance && c.appliance !== "none" && c.appliance !== "filler";

export function cabinetParts(c: Cabinet): Part[] {
  const parts: Part[] = [];
  const drawers = c.fill === "drawers";

  // facade / front
  if (isAppliance(c)) {
    if (c.appliance === "fridge" || c.appliance === "oven" || c.appliance === "dishwasher") {
      parts.push({ id: "front", name: "Передняя панель", actions: ["edit", "style", "delete"], editLabel: "Зазор" });
    }
  } else {
    parts.push({ id: "front", name: drawers ? "Передняя панель ящика" : "Фасад", actions: ["edit", "style", "delete"], editLabel: "Зазор" });
  }

  if (c.handle !== 3) parts.push({ id: "handle", name: "Ручка", actions: ["edit", "style", "delete"], editLabel: "Положение" });
  if (c.kind === "base") parts.push({ id: "worktop", name: "Столешница", actions: ["edit", "style", "delete"], editLabel: "Выступ" });
  if (c.kind !== "upper") parts.push({ id: "legs", name: "Ножки И Постаменты", actions: ["edit", "style", "delete"], editLabel: "Высота" });

  parts.push({ id: "cover-right", name: "Правая Крышка", actions: ["edit", "style", "delete"], editLabel: "Выступ" });
  parts.push({ id: "carcass", name: "Корпус", actions: ["edit", "style", "delete"], editLabel: "Толщина" });
  parts.push({ id: "frame", name: "Рамка", actions: ["style"] });

  if (drawers) parts.push({ id: "drawer", name: "Ящик среднего размера", actions: ["style", "delete"] });
  if (c.fill === "shelves") parts.push({ id: "shelf", name: "Полка", actions: ["style", "delete"] });
  parts.push({ id: "rail", name: "Подвесная направляющая", actions: ["style", "delete"] });

  return parts;
}

export interface AddOn {
  id: string;
  name: string;
}

/** One-tap add-ons listed under the parts. */
export const PART_ADDONS: AddOn[] = [
  { id: "drawer-light", name: "Подсветка ящика" },
  { id: "wall-panel", name: "Стеновая панель" },
  { id: "wall-edge", name: "Краевая полоса стены" },
];

/** Boolean settings (switches) at the bottom of the editor. */
export const PART_TOGGLES: AddOn[] = [
  { id: "auto-right-cover", name: "Автоматическое снятие правой крышки" },
  { id: "fillers", name: "Заполнители" },
];
