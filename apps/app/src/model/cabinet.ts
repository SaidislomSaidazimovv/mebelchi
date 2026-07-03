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

/** The recolourable parts of a module. A picked material maps to one of these and
 *  is stored on the cabinet as a colour override (int), read by the 3D + 2D views. */
export type FinishKey = "facade" | "carcass" | "worktop" | "handle";

export interface Cabinet {
  id: string;
  kind: "base" | "tall" | "upper";
  w: number; // mm
  h: number; // mm
  fill: "shelves" | "drawers" | "open";
  count: number; // shelves or drawers
  /** custom shelf heights as fractions 0..1 from the bottom (only when the user drags
   *  individual shelves in the fill editor). Absent → shelves are spread evenly by `count`. */
  shelfYs?: number[];
  /** vertical divider positions as fractions 0..1 across the interior width (left→right).
   *  Legacy freeform-divider field; superseded by `layout` but kept for derivation. */
  dividerXs?: number[];
  /** ONE door covering a rectangular block of cells (interior fractions) — an overlay, so
   *  it can span across rows AND columns (which the cell tree can't express as one node).
   *  The cells it covers are left open (their dividers become interior shelves behind it). */
  combinedDoors?: CombinedDoor[];
  /** HYBRID INTERIOR — a recursive cell tree. The whole interior is one root Cell; a cell
   *  either splits into rows/columns (child cells) or is a leaf with its OWN type (door
   *  «shelves» / drawers / open), so a cabinet can mix drawers + doors + open in any
   *  arbitrary layout. When present it SUPERSEDES the whole-cabinet `fill`/`count` for the
   *  interior + front; absent → derived from those legacy fields. See `cabinetLayout`. */
  layout?: Cell;
  div: 0 | 1; // vertical divider (legacy flag; kept in sync with the layout for pricing)
  door: number; // index into DOORS
  handle: number; // index into HANDLES (the handle TYPE: bar/profile/knob/none)
  /** Whole-cabinet DEFAULT door opening side + handle placement, set from the module editor's
   *  "Ручка → Редактировать" panel. They seed the DERIVED layout (see `cabinetLayout`); a custom
   *  per-cell `layout` from the Fill Editor keeps its own per-cell values. */
  opening?: DoorOpening;
  handlePos?: HandlePos;
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
  /** Free-standing furniture / extras — NOT a cabinet: no worktop, no wall run, placed
   *  free-floating via px/pz/rot. The 3D builds bespoke geometry per kind and pricing
   *  skips it. table/chair = dining; trolley/stool/shelf/bin = kitchen extras. */
  furniture?: "table" | "chair" | "trolley" | "stool" | "shelf" | "bin";
  /** Per-module finish overrides (colour ints, like KitchenStyle). Set from the
   *  material picker; each present key wins over the kitchen-wide style in the render. */
  finish?: Partial<Record<FinishKey, number>>;
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

/** Shelf heights as fractions 0..1 from the bottom: the custom `shelfYs` if set,
 *  else `count` shelves spread evenly. Shared by the 3D, the 2D elevation + the fill editor. */
export function shelfPositions(count: number, shelfYs?: number[]): number[] {
  if (shelfYs && shelfYs.length) return shelfYs;
  return Array.from({ length: Math.max(0, count) }, (_, i) => (i + 1) / (count + 1));
}

/** Vertical divider positions as fractions 0..1 across the interior width (left→right):
 *  the custom `dividerXs` if set, else `n` dividers spread evenly. Shared by the 3D, the
 *  2D elevation + the fill editor. Legacy `div` (0|1) maps to n = div. */
export function dividerPositions(div: 0 | 1, dividerXs?: number[]): number[] {
  if (dividerXs && dividerXs.length) return dividerXs;
  return div ? [0.5] : [];
}

/** Evenly spread `n` separators across 0..1 (used when adding the first custom one). */
export function evenFractions(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => (i + 1) / (n + 1));
}

/** A door's opening side (hinge for left/right; hydraulic lift for top/bottom). */
export type DoorOpening = "left" | "right" | "top" | "bottom";

/** A door covering a rectangular block of the interior (fractions 0..1), spanning any
 *  number of cells. Overlay on top of the cell tree — see `Cabinet.combinedDoors`. */
export interface CombinedDoor {
  fx0: number;
  fy0: number;
  fx1: number;
  fy1: number;
  opening?: DoorOpening;
  handle?: HandlePos;
}
/** Where the handle sits on a door / drawer front. "center" = a central knob; "none" =
 *  handleless (a push-to-open / tip-on latch — a real hardware item in production). */
export type HandlePos = "top" | "bottom" | "left" | "right" | "center" | "none";

/** A recursive interior cell — the hybrid model. Separators (Draw Lines) SPLIT a cell into
 *  `children` (rows = horizontal separators, cols = vertical), creating a grid of cells.
 *  A `front` (door / drawer) is then placed onto a cell — and because a front can sit on a
 *  SPLIT node, ONE door can cover a whole group of cells (the children become the interior
 *  compartments behind it). No front → an open compartment. */
export interface Cell {
  split?: "rows" | "cols";
  sizes?: number[]; // child fractions (normalized to sum 1)
  children?: Cell[];
  front?: "door" | "drawer"; // covers this cell's whole rect; undefined = open
  opening?: DoorOpening; // door only (default "left")
  handle?: HandlePos; // handle placement
  /** drawer only: a top-down split of the drawer FLOOR (width × depth) into organizer
   *  compartments (cutlery tray). Same recursive Cell model, edited from a top view. */
  organizer?: Cell;
}

/** A cell with no children — a single compartment (whatever its front). */
export const isLeaf = (c: Cell): boolean => !c.split || !c.children || c.children.length === 0;

/** The cabinet's interior as a cell tree: the freeform `layout` if set, else derived from
 *  the legacy whole-cabinet `fill`/`count`/`dividerXs` so existing modules render + edit. */
export function cabinetLayout(cab: Cabinet): Cell {
  if (cab.layout) return cab.layout;
  const n = Math.max(0, cab.count ?? 0);
  const even = (k: number) => Array(k).fill(1 / k);
  // whole-cabinet defaults from the module editor (fall back to the classic left-hinge door)
  const opn: DoorOpening = cab.opening ?? "left";
  const drawerHandle: HandlePos = cab.handlePos ?? "top";
  if (cab.fill === "drawers") {
    const k = Math.max(1, n);
    if (k === 1) return { front: "drawer", handle: drawerHandle };
    return { split: "rows", sizes: even(k), children: Array.from({ length: k }, () => ({ front: "drawer" as const, handle: drawerHandle })) };
  }
  if (cab.fill === "open") {
    if (n <= 0) return {};
    return { split: "rows", sizes: even(n + 1), children: Array.from({ length: n + 1 }, () => ({})) };
  }
  const door: Cell = { front: "door", opening: opn, handle: cab.handlePos ?? defaultHandlePos(opn) };
  if (cab.dividerXs && cab.dividerXs.length) {
    const k = cab.dividerXs.length + 1;
    return { split: "cols", sizes: even(k), children: Array.from({ length: k }, () => ({ ...door })) };
  }
  return door;
}

/** Where a door's handle sits by default given its opening side — opposite the hinge. */
export function defaultHandlePos(opening: DoorOpening): HandlePos {
  return opening === "left" ? "right" : opening === "right" ? "left" : opening === "top" ? "bottom" : "top";
}

/** Normalized child sizes (sum to 1); falls back to equal split. */
export function cellSizes(c: Cell): number[] {
  const n = c.children?.length ?? 0;
  if (!n) return [];
  const s = c.sizes && c.sizes.length === n ? c.sizes : Array(n).fill(1 / n);
  const total = s.reduce((a, b) => a + b, 0) || 1;
  return s.map((v) => v / total);
}

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
