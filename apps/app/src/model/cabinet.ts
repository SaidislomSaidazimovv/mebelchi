// The app's cabinet model — the editable run. Ported from v7-journey.html's
// cabinet helpers, typed, with stable ids so React can key on them. This is the
// UI-facing model; model/toProject.ts maps it to the @mebelchi/schema Project
// that pricing consumes.

/** A built-in appliance carried by a module (priced as its host cabinet).
 *  `hob` = cooktop + oven under it; `cooktop` = cooktop only (oven lives in a tower);
 *  `filler` is a render-only scribe panel and never enters the priced run. */
export type ApplianceKind =
  | "sink"
  | "hob"
  | "cooktop"
  | "oven"
  | "fridge"
  | "dishwasher"
  | "hood"
  | "filler"
  | "none";

export interface Cabinet {
  id: string;
  kind: "base" | "tall" | "upper";
  w: number; // mm
  h: number; // mm
  fill: "shelves" | "drawers" | "open";
  count: number; // shelves or drawers
  div: 0 | 1; // vertical divider
  door: number; // index into DOORS
  handle: number; // index into HANDLES
  /** Built-in appliance this module carries (sink/hob/fridge…), default none. */
  appliance?: ApplianceKind;
  /** Integrated appliance behind a matching facade (vs a free-standing steel unit).
   *  Drives whether the fridge/oven renders as a panelled column or bare steel. */
  builtin?: boolean;
  /** Which wall run this module sits on (0 = primary, 1 = L return wall). */
  run?: number;
  /** Left edge of the module along its run (mm). Set by the layout solver so the
   *  elevation / 3D can place base/upper/tall rows consistently; legacy/hand-edited
   *  runs omit it and are laid out left→right by width instead. */
  x?: number;
  /** Bottom of a wall-mounted (upper) module above the floor (mm). Lets the user
   *  slide an upper up/down in the front view; defaults to GEOM.upperBottom. */
  mountY?: number;
  /** Free plan transform (set when the user drags/rotates a module in the 2D plan).
   *  px/pz = footprint centre in absolute room mm; rot = rotation in degrees. When
   *  present they override the wall-run placement IN THE PLAN. */
  px?: number;
  pz?: number;
  rot?: number;
  /** Depth override (mm); defaults to the per-kind depth (base/tall 560, upper 350). */
  depth?: number;
  /** Diagonal 45° corner unit (L/U layouts): a triangular body with a diagonal door
   *  facing the room. Placed via px/pz/rot; the 3D builds special geometry for it. */
  corner?: boolean;
}

/** Visual corpus materials (swatches). Pricing currently uses the seed LDSP rate
 *  regardless of swatch — see model/toProject.ts. */
export const MATERIALS = [
  { n: "Белый", c: "#f3f0ea", e: "#dcd6ca" },
  { n: "Дуб", c: "#d8b483", e: "#b9905c" },
  { n: "Графит", c: "#5d5b57", e: "#43413d" },
  { n: "Песок", c: "#cdbfa3", e: "#ab9b7c" },
  { n: "Олива", c: "#8c8d6f", e: "#6e6f54" },
  { n: "Бордо", c: "#7c4a4a", e: "#5e3636" },
] as const;

export const DOORS = ["Гладкий", "Фрезер", "Стекло", "Без"] as const; // 0..3
export const HANDLES = ["Скоба", "Профиль", "Кнопка", "Без"] as const; // 0..3
export const FILLS: [Cabinet["fill"], string][] = [
  ["shelves", "Полки"],
  ["drawers", "Ящики"],
  ["open", "Открытый"],
];

let _seq = 0;
const uid = () => `cab-${++_seq}`;

export function mk(o: Partial<Cabinet> = {}): Cabinet {
  return {
    id: uid(),
    kind: "base",
    w: 600,
    h: 720,
    fill: "shelves",
    count: 2,
    div: 0,
    door: 0,
    handle: 0,
    ...o,
  };
}

/** The 4 starter layouts offered in Phase B (ported from v7 `arch`). */
export function archetype(v: number): Cabinet[] {
  if (v === 0)
    return [
      mk({ fill: "open", count: 2 }),
      mk({ count: 1 }),
      mk({ fill: "drawers", count: 3 }),
      mk({ count: 1 }),
      mk({ kind: "tall", h: 2100, fill: "shelves", count: 5 }),
    ];
  if (v === 1)
    return [
      mk({ fill: "open", count: 2 }),
      mk({ fill: "drawers", count: 3 }),
      mk({ kind: "tall", h: 2100, fill: "shelves", count: 5 }),
      mk({ count: 1 }),
      mk({ kind: "tall", h: 2100, fill: "shelves", count: 6 }),
    ];
  if (v === 2)
    return [
      mk({ fill: "drawers", count: 3 }),
      mk({ fill: "drawers", count: 4 }),
      mk({ fill: "drawers", count: 2 }),
      mk({ count: 1 }),
      mk({ kind: "tall", h: 2100, fill: "drawers", count: 4 }),
    ];
  return [
    mk({ fill: "open", count: 2 }),
    mk({ fill: "drawers", count: 3 }),
    mk({ kind: "tall", h: 2100, fill: "shelves", count: 5 }),
  ];
}
