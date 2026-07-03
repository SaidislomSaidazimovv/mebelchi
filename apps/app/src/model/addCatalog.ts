// Catalog of modules the user can ADD in the constructor (Phase C). Each template is
// a partial Cabinet fed to `mk()` by `store.addCab`, which auto-fits it into the first
// free gap on a wall run. Grouped with section headings (IKEA-style) so the picker
// stays readable as the catalog grows; the chip itself is the visual one-tap "category"
// level. When the real Eman feed (photos + prices) lands, a chip can open a leaf
// product-list — the grouping here is the level above that.
//
// Two sheets mirror the bottom toolbar's pickers:
//   Шкафы (cabinets)     → pickCab  → CABINET_GROUPS
//   Бытовая (appliances) → pickAppl → APPLIANCE_GROUPS
// Corner units carry `corner:true` and are dropped free-floating (no straight-run gap
// fits a diagonal unit); everything else tiles into a run.

import type { Cabinet } from "./cabinet";

export interface AddTemplate {
  id: string;
  name: string;
  sub: string;
  /** glyph shown on the chip (text/emoji so it needs no new icon assets) */
  glyph: string;
  cab: Partial<Cabinet>;
}

/** A titled section of templates — rendered as a heading + a grid of chips. */
export interface AddGroup {
  heading: string;
  items: AddTemplate[];
}

const TALL_H = 2100;
const BASE_H = 720;

export const CABINET_GROUPS: AddGroup[] = [
  {
    heading: "Напольные",
    items: [
      { id: "base-door", name: "Распашной", sub: "600", glyph: "▢", cab: { kind: "base", w: 600, h: BASE_H, fill: "shelves", count: 2, door: 0 } },
      { id: "base-drawers", name: "С ящиками", sub: "600", glyph: "▤", cab: { kind: "base", w: 600, h: BASE_H, fill: "drawers", count: 3, door: 0 } },
      { id: "sink-base", name: "Под мойку", sub: "800", glyph: "◑", cab: { kind: "base", w: 800, h: BASE_H, fill: "open", count: 0, door: 0, appliance: "sink" } },
    ],
  },
  {
    heading: "Навесные",
    items: [{ id: "upper", name: "Навесной", sub: "600", glyph: "▭", cab: { kind: "upper", w: 600, h: BASE_H, fill: "shelves", count: 2, door: 0 } }],
  },
  {
    heading: "Высокие",
    items: [{ id: "tall", name: "Пенал", sub: "Колонна · 600", glyph: "▯", cab: { kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 5, door: 0 } }],
  },
  {
    heading: "Угловые",
    items: [{ id: "corner", name: "Угловой", sub: "840", glyph: "◣", cab: { kind: "base", w: 840, depth: 840, h: BASE_H, fill: "shelves", count: 1, door: 0, corner: true } }],
  },
];

// free-standing furniture (tables + chairs) — added via the "Обеденная" toolbar button,
// placed free-floating in the room (furniture:"table"|"chair" → special 3D geometry).
export const FURNITURE_GROUPS: AddGroup[] = [
  {
    heading: "Столы",
    items: [
      { id: "table-2", name: "Стол · 2", sub: "700×700", glyph: "▢", cab: { furniture: "table", kind: "base", w: 700, depth: 700, h: 740 } },
      { id: "table-4", name: "Стол · 4", sub: "1200×800", glyph: "▭", cab: { furniture: "table", kind: "base", w: 1200, depth: 800, h: 740 } },
      { id: "table-6", name: "Стол · 6", sub: "1800×900", glyph: "▬", cab: { furniture: "table", kind: "base", w: 1800, depth: 900, h: 740 } },
    ],
  },
  {
    heading: "Стулья",
    items: [{ id: "chair", name: "Стул", sub: "460×480", glyph: "🪑", cab: { furniture: "chair", kind: "base", w: 460, depth: 480, h: 900 } }],
  },
];

// kitchen extras (the "Дополнительные" toolbar button) — free-standing visual pieces
// that reuse the furniture system (rendered free-floating, priced as non-cabinet).
export const EXTRA_GROUPS: AddGroup[] = [
  {
    heading: "Мебель и хранение",
    items: [
      { id: "trolley", name: "Тележка", sub: "500×400", glyph: "🛒", cab: { furniture: "trolley", kind: "base", w: 500, depth: 400, h: 850 } },
      { id: "shelf", name: "Полка настенная", sub: "800×250", glyph: "▦", cab: { furniture: "shelf", kind: "base", w: 800, depth: 250, h: 300 } },
    ],
  },
  {
    heading: "Прочее",
    items: [
      { id: "stool", name: "Барный стул", sub: "380×380", glyph: "🪑", cab: { furniture: "stool", kind: "base", w: 380, depth: 380, h: 700 } },
      { id: "bin", name: "Ведро", sub: "350×300", glyph: "🗑", cab: { furniture: "bin", kind: "base", w: 350, depth: 300, h: 600 } },
    ],
  },
];

export const APPLIANCE_GROUPS: AddGroup[] = [
  {
    heading: "Встраиваемая",
    items: [
      { id: "oven", name: "Духовой шкаф", sub: "Пенал", glyph: "⊟", cab: { kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 2, door: 0, appliance: "oven", builtin: true } },
      { id: "hob", name: "Плита", sub: "Напольная · 600", glyph: "⊞", cab: { kind: "base", w: 600, h: BASE_H, fill: "drawers", count: 2, door: 0, appliance: "hob" } },
      { id: "dishwasher", name: "Посудомойка", sub: "Напольная · 600", glyph: "▥", cab: { kind: "base", w: 600, h: BASE_H, fill: "open", count: 0, door: 0, appliance: "dishwasher" } },
      { id: "hood", name: "Вытяжка", sub: "Навесная · 600", glyph: "△", cab: { kind: "upper", w: 600, h: 350, fill: "open", count: 0, door: 3, handle: 3, appliance: "hood" } },
    ],
  },
  {
    heading: "Отдельностоящая",
    items: [{ id: "fridge", name: "Холодильник", sub: "600", glyph: "❄", cab: { kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 0, door: 0, appliance: "fridge", builtin: false } }],
  },
];
