// Editable parts of a module — the "Измените некоторые элементы" list in the
// furniture editor. Derived from the cabinet (kind / fill / appliance). This is a
// reasonable decomposition until the real Eman.uz BOM is wired in; the editor
// drives it generically so swapping in the real part list later is a data change.

import type { Cabinet, FinishKey } from "./cabinet";

export type PartAction = "edit" | "style" | "delete";

/** Which render colour a part's material drives. The front is the facade; hardware
 *  (handle/rail) is the handle colour; the worktop its own; everything else the body. */
export const PART_FINISH: Record<string, FinishKey> = {
  front: "facade",
  handle: "handle",
  rail: "handle",
  worktop: "worktop",
  legs: "carcass",
  "cover-right": "carcass",
  carcass: "carcass",
  frame: "carcass",
  drawer: "carcass",
  shelf: "carcass",
};

export interface Part {
  id: string;
  name: string;
  actions: PartAction[];
  /** aspect shown after "Редактировать" in the part-edit panel title, e.g. "Выступ" */
  editLabel?: string;
}

const isAppliance = (c: Cabinet) => !!c.appliance && c.appliance !== "none" && c.appliance !== "filler";

export function cabinetParts(c: Cabinet): Part[] {
  // free-standing furniture (table/chair) isn't a cabinet — the only meaningful setting
  // is its colour/finish (the front→facade colour drives the wood in the 3D)
  if (c.furniture) {
    return [{ id: "front", name: "Цвет", actions: ["style"] }];
  }

  // Only the parts that map to a REAL, DISTINCT recolourable surface in the 3D (facade /
  // handle / worktop / carcass) are shown. The old list also had legs, right-cover, frame,
  // drawer, shelf, rail — but those ALL shared the one "carcass" material (so changing one
  // changed the others) and several had no distinct visual (placeholder BOM); they confused
  // users, so they're folded into "Корпус" (the body is one material).
  const parts: Part[] = [];

  if (isAppliance(c)) {
    if (c.appliance === "fridge" || c.appliance === "oven" || c.appliance === "dishwasher") {
      parts.push({ id: "front", name: "Передняя панель", actions: ["edit", "style"], editLabel: "Зазор" });
    }
    parts.push({ id: "handle", name: "Ручка", actions: ["edit", "style"], editLabel: "Тип" });
    return parts;
  }

  // door & drawer fronts are the same part ("Передняя панель ящика"); only its material
  // (style) is editable here — the gap/reveal isn't a user setting.
  parts.push({ id: "front", name: "Передняя панель ящика", actions: ["style"] });
  // handle: edit → door opening + handle placement (as in the Fill Editor); style → handle
  // TYPE (Скоба/Профиль/…) + metal colour.
  parts.push({ id: "handle", name: "Ручка", actions: ["edit", "style"] });
  if (c.kind === "base") parts.push({ id: "worktop", name: "Столешница", actions: ["style"] });
  // carcass is one material — nothing dimensional to edit, only its finish.
  parts.push({ id: "carcass", name: "Корпус", actions: ["style"] });

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
