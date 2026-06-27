// Wall coverings (paint) + a recursive surface split-tree so a wall can be split
// horizontally / vertically into sub-surfaces, each with its own colour.

export interface WallCovering {
  id: string;
  name: string;
  family: string; // grouping used by the catalog filter
  color: string;
}

// ~55 paint colours grouped into main colour families for the filter.
export const WALL_COVERINGS: WallCovering[] = [
  { id: "r1", name: "Алый", family: "Красный", color: "#e01b1b" },
  { id: "r2", name: "Классический красный", family: "Красный", color: "#d11f1f" },
  { id: "r3", name: "Помидор", family: "Красный", color: "#e23b2e" },
  { id: "r4", name: "Огненно-красный", family: "Красный", color: "#f0301c" },
  { id: "r5", name: "Светло-красный", family: "Красный", color: "#ef5350" },
  { id: "r6", name: "Бордовый", family: "Красный", color: "#8c1c1c" },
  { id: "r7", name: "Винный", family: "Красный", color: "#722f37" },
  { id: "p1", name: "Розовый", family: "Розовый", color: "#e35d6a" },
  { id: "p2", name: "Малиновый", family: "Розовый", color: "#c71f54" },
  { id: "p3", name: "Фуксия", family: "Розовый", color: "#cf2d6a" },
  { id: "p4", name: "Пыльная роза", family: "Розовый", color: "#c08081" },
  { id: "p5", name: "Коралловый", family: "Розовый", color: "#ff6f61" },
  { id: "p6", name: "Лосось", family: "Розовый", color: "#fa8072" },
  { id: "o1", name: "Оранжевый", family: "Оранжевый", color: "#f57c2e" },
  { id: "o2", name: "Терракота", family: "Оранжевый", color: "#c1542a" },
  { id: "o3", name: "Кирпичный", family: "Оранжевый", color: "#a8392b" },
  { id: "o4", name: "Тыквенный", family: "Оранжевый", color: "#e08a1e" },
  { id: "o5", name: "Янтарный", family: "Оранжевый", color: "#cf7a30" },
  { id: "y1", name: "Жёлтый", family: "Жёлтый", color: "#f3c318" },
  { id: "y2", name: "Горчичный", family: "Жёлтый", color: "#d4a017" },
  { id: "y3", name: "Золотистый", family: "Жёлтый", color: "#e3b94e" },
  { id: "y4", name: "Лимонный", family: "Жёлтый", color: "#eed94f" },
  { id: "y5", name: "Песочный", family: "Жёлтый", color: "#e6d29a" },
  { id: "g1", name: "Зелёный", family: "Зелёный", color: "#3f9b4f" },
  { id: "g2", name: "Оливковый", family: "Зелёный", color: "#7a8b3c" },
  { id: "g3", name: "Шалфей", family: "Зелёный", color: "#9caf88" },
  { id: "g4", name: "Изумрудный", family: "Зелёный", color: "#1f8a5b" },
  { id: "g5", name: "Мятный", family: "Зелёный", color: "#a7d7c5" },
  { id: "g6", name: "Хаки", family: "Зелёный", color: "#6b7a4b" },
  { id: "t1", name: "Бирюзовый", family: "Голубой", color: "#1fb6b0" },
  { id: "t2", name: "Голубой", family: "Голубой", color: "#5bb8e6" },
  { id: "t3", name: "Небесный", family: "Голубой", color: "#86c5e0" },
  { id: "t4", name: "Аква", family: "Голубой", color: "#4cc9c0" },
  { id: "bl1", name: "Синий", family: "Синий", color: "#2a6df0" },
  { id: "bl2", name: "Тёмно-синий", family: "Синий", color: "#1f3d7a" },
  { id: "bl3", name: "Кобальт", family: "Синий", color: "#2747b8" },
  { id: "bl4", name: "Индиго", family: "Синий", color: "#36456e" },
  { id: "bl5", name: "Джинсовый", family: "Синий", color: "#5a76a0" },
  { id: "v1", name: "Фиолетовый", family: "Фиолетовый", color: "#7b4ea8" },
  { id: "v2", name: "Лавандовый", family: "Фиолетовый", color: "#b39ddb" },
  { id: "v3", name: "Сливовый", family: "Фиолетовый", color: "#6a3b6e" },
  { id: "v4", name: "Сиреневый", family: "Фиолетовый", color: "#a98fc9" },
  { id: "br1", name: "Шоколадный", family: "Коричневый", color: "#5b3b29" },
  { id: "br2", name: "Кофейный", family: "Коричневый", color: "#7b5e44" },
  { id: "br3", name: "Орех", family: "Коричневый", color: "#8a5a3b" },
  { id: "br4", name: "Какао", family: "Коричневый", color: "#9c7a5b" },
  { id: "n1", name: "Тёплый белый", family: "Нейтральный", color: "#f3efe9" },
  { id: "n2", name: "Кремовый", family: "Нейтральный", color: "#efe6d2" },
  { id: "n3", name: "Светло-серый", family: "Нейтральный", color: "#d9d6d0" },
  { id: "n4", name: "Тёплый бежевый", family: "Нейтральный", color: "#e3d5bf" },
  { id: "n5", name: "Серый", family: "Нейтральный", color: "#9a9a9a" },
  { id: "n6", name: "Графит", family: "Нейтральный", color: "#4a4a4a" },
  { id: "n7", name: "Антрацит", family: "Нейтральный", color: "#33373b" },
];

// main colour families, in display order
export const WALL_FAMILIES: string[] = ["Красный", "Розовый", "Оранжевый", "Жёлтый", "Зелёный", "Голубой", "Синий", "Фиолетовый", "Коричневый", "Нейтральный"];

export function familyCount(family: string): number {
  return WALL_COVERINGS.filter((w) => w.family === family).length;
}

export function coveringColor(c: number): string | null {
  return c >= 0 && c < WALL_COVERINGS.length ? WALL_COVERINGS[c].color : null;
}

// ---- surface split tree ----
export type SurfPath = ("a" | "b")[];
export type Surface =
  | { t: "leaf"; c: number } // c = WALL_COVERINGS index, -1 = unpainted
  | { t: "split"; d: "h" | "v"; at: number; a: Surface; b: Surface };

export function defaultSurface(): Surface {
  return { t: "leaf", c: -1 };
}

export interface LeafRect {
  path: SurfPath;
  c: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** All leaves with their rectangle within [0,1]×[0,1] (x = along wall, y = 0 bottom → 1 top). */
export function leafRects(s: Surface, path: SurfPath = [], r = { x0: 0, y0: 0, x1: 1, y1: 1 }): LeafRect[] {
  if (s.t === "leaf") return [{ path, c: s.c, ...r }];
  if (s.d === "v") {
    const xm = r.x0 + (r.x1 - r.x0) * s.at;
    return [...leafRects(s.a, [...path, "a"], { ...r, x1: xm }), ...leafRects(s.b, [...path, "b"], { ...r, x0: xm })];
  }
  const ym = r.y0 + (r.y1 - r.y0) * s.at;
  // a = bottom, b = top
  return [...leafRects(s.a, [...path, "a"], { ...r, y1: ym }), ...leafRects(s.b, [...path, "b"], { ...r, y0: ym })];
}

function updateAt(s: Surface, path: SurfPath, fn: (leaf: Surface) => Surface): Surface {
  if (path.length === 0) return fn(s);
  if (s.t !== "split") return s;
  const [head, ...rest] = path;
  return head === "a" ? { ...s, a: updateAt(s.a, rest, fn) } : { ...s, b: updateAt(s.b, rest, fn) };
}

export function splitLeaf(s: Surface, path: SurfPath, dir: "h" | "v"): Surface {
  return updateAt(s, path, (leaf) => (leaf.t === "leaf" ? { t: "split", d: dir, at: 0.5, a: { ...leaf }, b: { ...leaf } } : leaf));
}

export function colorLeaf(s: Surface, path: SurfPath, c: number): Surface {
  return updateAt(s, path, (leaf) => (leaf.t === "leaf" ? { ...leaf, c } : leaf));
}

/** The covering index of the first painted leaf (for the "current colour" readout), or -1. */
export function dominantColor(s: Surface): number {
  if (s.t === "leaf") return s.c;
  const a = dominantColor(s.a);
  return a >= 0 ? a : dominantColor(s.b);
}
