// Floor-covering catalog (Покрытия). Colour tints the plan floor; a real catalog
// (textures / SKUs / prices) plugs in here later.
export interface FloorCovering {
  id: string;
  name: string;
  desc: string;
  color: string;
}

export const FLOOR_COVERINGS: FloorCovering[] = [
  { id: "oak", name: "Паркет · Дуб", desc: "Покрытие из твердой древесины", color: "#ecd9b4" },
  { id: "maple", name: "Паркет · Клён", desc: "Покрытие из твердой древесины", color: "#f1e3c6" },
  { id: "ash", name: "Паркет · Ясень", desc: "Покрытие из твердой древесины", color: "#e7d3ab" },
  { id: "walnut", name: "Паркет · Орех", desc: "Покрытие из твердой древесины", color: "#cda877" },
  { id: "cherry", name: "Паркет · Вишня", desc: "Покрытие из твердой древесины", color: "#d9b48f" },
  { id: "greyoak", name: "Ламинат · Серый дуб", desc: "Покрытие из твердой древесины", color: "#d2cabd" },
];

export const ROOM_TYPES = ["Кухня", "Гостиная", "Спальня", "Ванная", "Прихожая", "Кабинет"];
