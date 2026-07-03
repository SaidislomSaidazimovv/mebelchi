// The "Library" (Biblioteka) — a small demo of a 2-level block catalog. Level 1 is the
// category (Pol / Osma / Baland / Burchak); level 2 is the block's INTERNAL `layout` (a
// real Cell tree: drawers / shelves / doors, some nested, at least one with an organizer).
// A master picks a ready block and drops it (reusing the constructor's addCab flow), and
// can save their OWN configured module back as a personal block.
//
// Scope (demo): ~12 predefined blocks + localStorage-only personal blocks. NOT the full
// 100-block catalog, NOT Supabase yet — the store leaves a TODO where the cloud push goes.
// The predefined blocks reuse the AddGroup/AddTemplate shape from model/addCatalog so the
// constructor's add-head/add-chip renderer draws them unchanged.

import type { AddGroup, AddTemplate } from "./addCatalog";
import type { Cabinet, Cell } from "./cabinet";

const BASE_H = 720;
const UPPER_H = 720;
const TALL_H = 2100;

// handy leaf builders so the demo layout trees below stay readable
const drawer = (): Cell => ({ front: "drawer", handle: "top" });
const doorL = (): Cell => ({ front: "door", opening: "left", handle: "right" });
const doorR = (): Cell => ({ front: "door", opening: "right", handle: "left" });
const open = (): Cell => ({});

// ---------------------------------------------------------------------------
// Predefined demo blocks — grouped by category, each with a REAL internal layout.
// ---------------------------------------------------------------------------
export const LIBRARY_GROUPS: AddGroup[] = [
  {
    heading: "Pol",
    items: [
      {
        id: "lib-base-3drawers",
        name: "3 tortma",
        sub: "600",
        glyph: "▤",
        cab: {
          kind: "base", w: 600, h: BASE_H, fill: "drawers", count: 3, door: 0,
          // level-2: a stack of 3 drawers; the top drawer carries an organizer (cutlery tray)
          layout: {
            split: "rows", sizes: [0.34, 0.33, 0.33],
            children: [
              { front: "drawer", handle: "top", organizer: { split: "cols", sizes: [0.4, 0.3, 0.3], children: [open(), open(), open()] } },
              drawer(),
              drawer(),
            ],
          },
        },
      },
      {
        id: "lib-base-drawer-door",
        name: "Tortma + eshik",
        sub: "600",
        glyph: "◧",
        cab: {
          kind: "base", w: 600, h: BASE_H, fill: "shelves", count: 1, door: 0,
          // top drawer over a bottom door (mixed fronts in one module)
          layout: { split: "rows", sizes: [0.28, 0.72], children: [drawer(), doorL()] },
        },
      },
      {
        id: "lib-base-2doors",
        name: "2 eshik",
        sub: "800",
        glyph: "▥",
        cab: {
          kind: "base", w: 800, h: BASE_H, fill: "shelves", count: 2, door: 0,
          layout: { split: "cols", sizes: [0.5, 0.5], children: [doorL(), doorR()] },
        },
      },
    ],
  },
  {
    heading: "Osma",
    items: [
      {
        id: "lib-upper-door",
        name: "Osma eshik",
        sub: "600",
        glyph: "▭",
        cab: {
          kind: "upper", w: 600, h: UPPER_H, fill: "shelves", count: 2, door: 0,
          layout: doorL(),
        },
      },
      {
        id: "lib-upper-open",
        name: "Osma ochiq",
        sub: "800",
        glyph: "▦",
        cab: {
          kind: "upper", w: 800, h: UPPER_H, fill: "open", count: 2, door: 0,
          // 3 open compartments (2 shelves)
          layout: { split: "rows", sizes: [0.34, 0.33, 0.33], children: [open(), open(), open()] },
        },
      },
      {
        id: "lib-upper-2doors",
        name: "Osma 2 eshik",
        sub: "900",
        glyph: "⊟",
        cab: {
          kind: "upper", w: 900, h: UPPER_H, fill: "shelves", count: 2, door: 0,
          layout: { split: "cols", sizes: [0.5, 0.5], children: [doorL(), doorR()] },
        },
      },
    ],
  },
  {
    heading: "Baland",
    items: [
      {
        id: "lib-tall-door-drawers",
        name: "Penal + tortma",
        sub: "600",
        glyph: "▯",
        cab: {
          kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 5, door: 0,
          // big top door over two bottom drawers (level-2 nesting)
          layout: {
            split: "rows", sizes: [0.62, 0.38],
            children: [doorL(), { split: "rows", sizes: [0.5, 0.5], children: [drawer(), drawer()] }],
          },
        },
      },
      {
        id: "lib-tall-2doors",
        name: "Penal 2 eshik",
        sub: "600",
        glyph: "⊞",
        cab: {
          kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 6, door: 0,
          layout: { split: "rows", sizes: [0.5, 0.5], children: [doorL(), doorL()] },
        },
      },
      {
        id: "lib-tall-door-open-drawers",
        name: "Penal aralash",
        sub: "600",
        glyph: "⊡",
        cab: {
          kind: "tall", w: 600, h: TALL_H, fill: "shelves", count: 5, door: 0,
          // door / open niche / 3 drawers
          layout: {
            split: "rows", sizes: [0.45, 0.2, 0.35],
            children: [
              doorL(),
              open(),
              { split: "rows", sizes: [1 / 3, 1 / 3, 1 / 3], children: [drawer(), drawer(), drawer()] },
            ],
          },
        },
      },
    ],
  },
  {
    heading: "Burchak",
    items: [
      {
        id: "lib-corner-door",
        name: "Burchak eshik",
        sub: "840",
        glyph: "◣",
        cab: {
          kind: "base", w: 840, depth: 840, h: BASE_H, fill: "shelves", count: 1, door: 0, corner: true,
          layout: { split: "rows", sizes: [0.55, 0.45], children: [doorL(), open()] },
        },
      },
      {
        id: "lib-corner-drawers",
        name: "Burchak tortma",
        sub: "840",
        glyph: "◺",
        cab: {
          kind: "base", w: 840, depth: 840, h: BASE_H, fill: "drawers", count: 2, door: 0, corner: true,
          layout: { split: "rows", sizes: [0.5, 0.5], children: [drawer(), drawer()] },
        },
      },
      {
        id: "lib-corner-open",
        name: "Burchak ochiq",
        sub: "600",
        glyph: "◹",
        cab: {
          kind: "base", w: 600, depth: 600, h: BASE_H, fill: "open", count: 1, door: 0, corner: true,
          layout: { split: "rows", sizes: [0.5, 0.5], children: [open(), open()] },
        },
      },
    ],
  },
];

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
  const c = globalThis.crypto as Crypto | undefined;
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
