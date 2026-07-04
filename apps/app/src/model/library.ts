// The "Library" (Biblioteka) — a ~100-block, 2-level kitchen block catalog. Level 1 is
// the category (Pol / Osma / Baland / Burchak / Texnika); level 2 is each block's INTERNAL
// `layout` (a real Cell tree: drawers / shelves / doors, several with a drawer organizer).
// Blocks are generated from IKEA-SEKTION-style standard dimensions (width × interior) —
// NOT scraped from IKEA; real photos/prices land later. A master picks a ready block and
// drops it (reusing the constructor's addCab flow) and can save their OWN configured
// module back as a personal block.
//
// The predefined blocks reuse the AddGroup/AddTemplate shape from model/addCatalog so the
// constructor's add-head/add-chip renderer draws them unchanged.

import type { AddGroup, AddTemplate } from "./addCatalog";
import type { Cabinet, Cell } from "./cabinet";

const BASE_H = 720;
const TALL_H = 2100;

/* ── Cell-tree builders — each guarantees a valid tree (sizes always sum to 1) ── */
const even = (n: number): number[] => Array.from({ length: n }, () => 1 / n);
const rows = (children: Cell[]): Cell => ({ split: "rows", sizes: even(children.length), children });
const cols = (children: Cell[]): Cell => ({ split: "cols", sizes: even(children.length), children });
const rowsW = (parts: Array<[number, Cell]>): Cell => {
  const total = parts.reduce((a, [w]) => a + w, 0);
  return { split: "rows", sizes: parts.map(([w]) => w / total), children: parts.map(([, c]) => c) };
};

const drawer = (organizer?: Cell): Cell => ({ front: "drawer", handle: "top", ...(organizer ? { organizer } : {}) });
const doorL = (): Cell => ({ front: "door", opening: "left", handle: "right" });
const doorR = (): Cell => ({ front: "door", opening: "right", handle: "left" });
const openCell = (): Cell => ({});
const tray = cols([openCell(), openCell(), openCell()]); // cutlery organizer (level-3 nesting)

/* interior presets */
const door1 = (): Cell => doorL();
const door2 = (): Cell => cols([doorL(), doorR()]);
const drawersN = (n: number, org = false): Cell =>
  rows(Array.from({ length: n }, (_, i) => (org && i === 0 ? drawer(tray) : drawer())));
const drawerOverDoor = (): Cell => rowsW([[0.28, drawer(tray)], [0.72, doorL()]]);
const drawerOverDoor2 = (): Cell => rowsW([[0.24, drawer(tray)], [0.76, door2()]]);
const shelves = (n: number): Cell => rows(Array.from({ length: n }, () => openCell()));
const doorOverDrawers = (n: number): Cell =>
  rowsW([[0.6, doorL()], [0.4, rows(Array.from({ length: n }, () => drawer()))]]);
const larder = (): Cell => rows([doorL(), doorL()]);
const glassDoor = (): Cell => doorL(); // rendered as a door for now (glass finish is a later refinement)
const microNiche = (): Cell => rowsW([[0.55, openCell()], [0.45, shelves(2)]]);

/* ── block factories → AddTemplate with an auto id ───────────────────────────── */
let _n = 0;
const T = (name: string, w: number, glyph: string, cab: Partial<Cabinet>): AddTemplate => ({
  id: `lib-${++_n}`, name, sub: `${w}`, glyph, cab: { w, door: 0, ...cab },
});
const base = (w: number, name: string, glyph: string, layout: Cell, extra: Partial<Cabinet> = {}): AddTemplate =>
  T(name, w, glyph, { kind: "base", h: BASE_H, fill: "shelves", count: 2, layout, ...extra });
const upper = (w: number, name: string, glyph: string, layout: Cell, h = 720, extra: Partial<Cabinet> = {}): AddTemplate =>
  T(name, w, glyph, { kind: "upper", h, fill: "shelves", count: 2, layout, ...extra });
const tall = (w: number, name: string, glyph: string, layout: Cell, extra: Partial<Cabinet> = {}): AddTemplate =>
  T(name, w, glyph, { kind: "tall", h: TALL_H, fill: "shelves", count: 5, layout, ...extra });
const corner = (w: number, name: string, glyph: string, layout: Cell, kind: Cabinet["kind"] = "base", extra: Partial<Cabinet> = {}): AddTemplate =>
  T(name, w, glyph, { kind, depth: w, h: kind === "tall" ? TALL_H : BASE_H, fill: "shelves", count: 1, corner: true, layout, ...extra });
// built-in appliances are leaf blocks (the appliance itself — no interior cell tree)
const appl = (w: number, name: string, glyph: string, kind: Cabinet["kind"], appliance: Cabinet["appliance"], extra: Partial<Cabinet> = {}): AddTemplate =>
  T(name, w, glyph, { kind, h: kind === "tall" ? TALL_H : BASE_H, fill: "open", count: 0, appliance, ...extra });

/* ── Pol (напольные / base cabinets) ─────────────────────────────────────────── */
const pol: AddTemplate[] = [
  ...[300, 350, 400, 450, 500, 600, 800].map((w) => base(w, "1 eshik", "▢", door1())),
  ...[600, 800, 900, 1000].map((w) => base(w, "2 eshik", "▥", door2())),
  ...[400, 500, 600].map((w) => base(w, "2 tortma", "▤", drawersN(2), { fill: "drawers", count: 2 })),
  ...[400, 500, 600, 800].map((w) => base(w, "3 tortma", "▤", drawersN(3, true), { fill: "drawers", count: 3 })),
  ...[400, 600].map((w) => base(w, "4 tortma", "▤", drawersN(4), { fill: "drawers", count: 4 })),
  ...[600].map((w) => base(w, "5 tortma", "▤", drawersN(5), { fill: "drawers", count: 5 })),
  ...[400, 500, 600, 800].map((w) => base(w, "Tortma + eshik", "◧", drawerOverDoor())),
  ...[600, 800, 900].map((w) => base(w, "Tortma + 2 eshik", "◨", drawerOverDoor2())),
  ...[450, 600, 800, 900].map((w) => base(w, "Mancha tagi", "◑", door2(), { fill: "open", count: 0, appliance: "sink" })),
  ...[300, 400, 500, 600].map((w) => base(w, "Ochiq", "▦", shelves(3), { fill: "open", count: 1 })),
];

/* ── Osma (навесные / wall cabinets) ─────────────────────────────────────────── */
const osma: AddTemplate[] = [
  ...[300, 400, 500, 600, 800].map((w) => upper(w, "1 eshik", "▭", door1())),
  ...[600, 800, 900].map((w) => upper(w, "2 eshik", "⊟", door2())),
  ...[400, 500, 600, 800, 900].map((w) => upper(w, "Ochiq javon", "▦", shelves(3), 720, { fill: "open" })),
  ...[300, 400, 500].map((w) => upper(w, "Ochiq past", "▦", shelves(2), 600, { fill: "open" })),
  ...[400, 500, 600, 800].map((w) => upper(w, "Shisha eshik", "⊞", glassDoor())),
  ...[400, 500, 600, 800].map((w) => upper(w, "Tepaga ochiluvchi", "△", door1(), 360)),
  ...[500, 600, 800].map((w) => upper(w, "Baland 2 eshik", "⊟", door2(), 900)),
  ...[600].map((w) => upper(w, "Mikro javon", "▤", microNiche(), 720, { fill: "open" })),
];

/* ── Baland (высокие / tall pantry) ──────────────────────────────────────────── */
const baland: AddTemplate[] = [
  ...[400, 500, 600].map((w) => tall(w, "Penal 1 eshik", "▯", door1())),
  ...[400, 500, 600].map((w) => tall(w, "Penal 2 eshik", "⊞", larder())),
  ...[400, 500, 600].map((w) => tall(w, "Eshik + 3 tortma", "⊡", doorOverDrawers(3))),
  ...[400, 500].map((w) => tall(w, "Eshik + 2 tortma", "⊡", doorOverDrawers(2))),
  ...[400, 500, 600].map((w) => tall(w, "Ochiq penal", "▤", shelves(5), { fill: "open" })),
  ...[400, 500].map((w) => tall(w, "Supurgi", "▯", door1())),
];

/* ── Burchak (угловые / corner) ──────────────────────────────────────────────── */
const burchak: AddTemplate[] = [
  ...[840, 900, 1000].map((w) => corner(w, "Burchak eshik", "◣", rows([doorL(), openCell()]))),
  ...[840].map((w) => corner(w, "Burchak tortma", "◺", rows([drawer(), drawer()]), "base", { fill: "drawers", count: 2 })),
  ...[600, 840].map((w) => corner(w, "Burchak ochiq", "◹", shelves(2), "base", { fill: "open", count: 1 })),
  ...[600, 800, 900].map((w) => corner(w, "Burchak osma", "◲", rows([doorL(), openCell()]), "upper")),
  ...[600].map((w) => corner(w, "Burchak penal", "◰", rowsW([[0.6, doorL()], [0.4, shelves(2)]]), "tall")),
];

/* ── Texnika (встроенная техника / built-in appliances — leaf blocks) ─────────── */
const texnika: AddTemplate[] = [
  appl(600, "Duxovka", "⊟", "tall", "oven", { builtin: true, fill: "shelves", count: 2 }),
  ...[600, 800].map((w) => appl(w, "Plita", "⊞", "base", "hob", { fill: "drawers", count: 2, layout: drawersN(2) })),
  ...[450, 600].map((w) => appl(w, "Idish yuvgich", "▥", "base", "dishwasher")),
  ...[600, 900].map((w) => appl(w, "So'rg'ich", "△", "upper", "hood", { h: 350 })),
  appl(600, "Muzlatgich", "❄", "tall", "fridge", { builtin: false }),
  appl(600, "Mikroto'lqin", "▣", "upper", "oven", { builtin: true, h: 400 }),
];

/** The full 2-level library — 5 categories, ~100 blocks. */
export const LIBRARY_GROUPS: AddGroup[] = [
  { heading: "Pol", items: pol },
  { heading: "Osma", items: osma },
  { heading: "Baland", items: baland },
  { heading: "Burchak", items: burchak },
  { heading: "Texnika", items: texnika },
];

/** Total predefined block count (handy for tests / UI badges). */
export const LIBRARY_BLOCK_COUNT = LIBRARY_GROUPS.reduce((n, g) => n + g.items.length, 0);

// ---------------------------------------------------------------------------
// Personal blocks — the master's saved modules (localStorage only for the demo).
// Mirrors model/projects.ts: a thin storage layer; the store owns the live state.
// ---------------------------------------------------------------------------
const KEY = "mebelchi.library.v1";

/** A user-saved block: the module's spec (with its full `layout`/`combinedDoors`/finish),
 *  stripped of placement so re-adding auto-fits fresh, plus light metadata. */
export interface LibraryItem {
  id: string;
  name: string;
  glyph: string;
  /** the saved module as a template fed back to addCab (no id / run / position). */
  cab: Partial<Cabinet>;
  /**
   * A from-scratch karkas block (Phase K), stored as the karkas project JSON ({version,model,plan}).
   * When present this is a KARKAS block: the «Mening bloklarim» tap re-opens it in the karkas editor
   * instead of addCab-ing a cabinet. Absent = an ordinary kitchen-cabinet block.
   */
  karkasJson?: string;
  updatedAt: number;
}

/** Personal blocks also render through the add-chip picker → they are AddTemplates too. */
export type { AddTemplate };

function readAll(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LibraryItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: LibraryItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

function newLibraryId(): string {
  // Avoid the DOM `Crypto` type name so this module type-checks outside a DOM lib (root tsconfig,
  // reached when a test imports it). Feature-detect randomUUID structurally instead.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `lib-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Personal blocks, newest first. */
export function listLibrary(): LibraryItem[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Insert or update a personal block, stamping updatedAt. */
export function upsertLibraryItem(item: LibraryItem): void {
  const list = readAll();
  const i = list.findIndex((x) => x.id === item.id);
  const next = { ...item, updatedAt: Date.now() };
  if (i >= 0) list[i] = next;
  else list.push(next);
  writeAll(list);
}

export function deleteLibraryItem(id: string): void {
  writeAll(readAll().filter((x) => x.id !== id));
}

/** A short auto-name for a saved module (Uzbek, matching the demo sheet's headings). */
function blockName(cab: Cabinet): string {
  if (cab.corner) return `Burchak ${cab.w}`;
  const k = cab.kind === "upper" ? "Osma" : cab.kind === "tall" ? "Penal" : "Tumba";
  return `${k} ${cab.w}`;
}

function blockGlyph(cab: Cabinet): string {
  if (cab.corner) return "◣";
  return cab.kind === "upper" ? "▭" : cab.kind === "tall" ? "▯" : "▢";
}

/** Build a personal LibraryItem from a from-scratch karkas block (Phase K) — its project JSON. */
export function libraryItemFromKarkas(name: string, karkasJson: string): LibraryItem {
  return {
    id: newLibraryId(),
    name: name.trim() || "Karkas blok",
    glyph: "🔧",
    cab: {},
    karkasJson,
    updatedAt: Date.now(),
  };
}

/** Build a personal LibraryItem from a live cabinet: keep the full spec (layout /
 *  combinedDoors / organizer / finish) but drop id + placement so it re-adds fresh. */
export function libraryItemFromCab(cab: Cabinet): LibraryItem {
  const { id: _id, run: _run, x: _x, px: _px, pz: _pz, rot: _rot, mountY: _mountY, ...rest } = cab;
  return {
    id: newLibraryId(),
    name: blockName(cab),
    glyph: blockGlyph(cab),
    cab: rest,
    updatedAt: Date.now(),
  };
}
