// Phase B layout solver — turns a Space + the user's onboarding choices into
// realistic, production-ready cabinet runs. Pure & deterministic.
//
// TWO LAYERS:
//  1. Onboarding = HARD CONSTRAINTS applied to every variant — fridge type
//     (built-in / free / none), oven placement (under the hob / in a tower), hood
//     (integrated / dome), and shape (I = one run, L = two runs + corner).
//  2. Variant = the DIFFERENTIATOR — the four strategies differ structurally:
//     tall-bank size/composition, upper height/coverage/glass, module rhythm,
//     finish (colour/handle), and storage approach. So they read as four genuinely
//     different designs, not reskins.
//
// Placement respects the room: doors/passages are hard gaps (no module), windows
// block tall units and uppers (but a base cabinet may sit under a window, and the
// sink prefers it), the sink anchors to the water side, and the hob stays clear of
// the sink and any window.

import { mk, type ApplianceKind, type Cabinet } from "./cabinet";
import type { RunOpening, KitchenLayout } from "./runPlan";

export type Zone = "left" | "center" | "right";
export type FridgeType = "integ" | "free" | "none";
export type OvenType = "under" | "tall";
export type HoodType = "integ" | "dome";

/** One planned run, as the solver needs it (geometry lives in runPlan). */
export interface RunInput {
  kind: "wall" | "peninsula" | "island";
  len: number;
  cornerStart: boolean;
  cornerEnd: boolean;
  openings: RunOpening[];
}

/** A selected kitchen layout with its pre-planned runs (from runPlan). */
export interface PlannedLayout {
  layout: KitchenLayout;
  runs: RunInput[];
  /** Index (into runs) of the run on the water wall — gets the sink. */
  waterRun: number;
}

export interface LayoutInput {
  /** The selected layout(s), each pre-planned; spread across the variants. */
  layouts: PlannedLayout[];
  ceiling: number;
  water: Zone;
  hasGas: boolean;
  // each is the SET of options the user is open to; with >1 the variants explore
  // each choice (so multi-select onboarding → more diverse variants)
  fridge: FridgeType[];
  oven: OvenType[];
  hood: HoodType[];
}

/** A single variant's resolved onboarding choices (one option per dimension). */
interface VariantInput {
  layout: KitchenLayout;
  runs: RunInput[];
  waterRun: number;
  ceiling: number;
  water: Zone;
  fridge: FridgeType;
  oven: OvenType;
  hood: HoodType;
}

export interface KitchenStyle {
  carcass: number;
  facade: number;
  worktop: number;
  handle: number;
  glassUppers: boolean;
}

export interface GenVariant {
  id: string;
  name: string;
  blurb: string;
  cabs: Cabinet[];
  style: KitchenStyle;
  /** the layout this variant uses (the scene needs it to place the runs) */
  layout: KitchenLayout;
}

// ---- standard catalog (mm) ----
const BASE_H = 720;
const TALL_H = 2100;
const UPPER_H = 720;
export const GEOM = {
  plinth: 100,
  baseH: BASE_H,
  worktop: 40,
  tallH: TALL_H,
  upperH: UPPER_H,
  upperBottom: 1520,
} as const;

const WIDE_LADDER = [800, 600, 500, 450, 400, 300];
const NARROW_LADDER = [600, 500, 450, 400, 300, 800];
const MIN_W = 300;
const TALL_W = 600;
const DOOR_MARGIN = 40; // clearance kept around a door (mm)

const zoneCenterFrac = (z: Zone): number => (z === "left" ? 1 / 6 : z === "right" ? 5 / 6 : 0.5);

interface Span {
  a: number;
  b: number;
}

/** [lo,hi] minus the blocked intervals → the free spans that remain. */
function subtract(lo: number, hi: number, blocks: Span[]): Span[] {
  const sorted = blocks.filter((b) => b.b > b.a).sort((a, b) => a.a - b.a);
  const res: Span[] = [];
  let cur = lo;
  for (const blk of sorted) {
    if (blk.a > cur) res.push({ a: cur, b: Math.min(hi, blk.a) });
    cur = Math.max(cur, blk.b);
    if (cur >= hi) break;
  }
  if (cur < hi) res.push({ a: cur, b: hi });
  return res.filter((s) => s.b - s.a > 1);
}

function packWidths(total: number, ladder: number[]): number[] {
  const widths: number[] = [];
  let rem = Math.max(0, Math.round(total));
  while (rem >= MIN_W) {
    let pick = ladder.find((w) => w <= rem && (rem - w === 0 || rem - w >= MIN_W));
    if (pick == null) pick = [...ladder].sort((a, b) => a - b).find((w) => w <= rem);
    if (pick == null) break;
    widths.push(pick);
    rem -= pick;
  }
  return widths;
}

/** Find a tall-bank position [pos,pos+w] clear of doors AND windows, at the end. */
function placeBank(L: number, w: number, end: "near" | "far", doors: Span[], windows: Span[]): number {
  const spans = subtract(0, L, [...doors, ...windows]);
  const fit = spans.filter((s) => s.b - s.a >= w - 1);
  if (!fit.length) return -1;
  if (end === "far") return Math.round(fit[fit.length - 1].b - w);
  return Math.round(fit[0].a);
}

interface Strategy {
  id: string;
  name: string;
  blurb: string;
  dishwasher: boolean;
  extraPantry: boolean;
  baseFill: "shelves" | "drawers" | "mix";
  drawerCount: number;
  ladder: number[];
  upperCoverage: "partial" | "full";
  upperTall: boolean;
  upperDoor: number;
  baseDoor: number;
  handle: number;
  /** Add a freestanding island when the room is large enough. */
  island: boolean;
  style: KitchenStyle;
}

const STRATEGIES: Strategy[] = [
  {
    id: "standard",
    name: "Стандартная",
    blurb: "Светлый дуб, распашные фасады — лучшая цена",
    dishwasher: false,
    extraPantry: false,
    baseFill: "shelves",
    drawerCount: 3,
    ladder: WIDE_LADDER,
    upperCoverage: "partial",
    upperTall: false,
    upperDoor: 0,
    baseDoor: 0,
    handle: 0,
    island: false,
    style: { carcass: 0xefe8da, facade: 0xe7ddc9, worktop: 0x7c756b, handle: 0x6f6a62, glassUppers: false },
  },
  {
    id: "ergonomic",
    name: "Эргономичная",
    blurb: "Белые ящики, посудомойка, плотный ряд",
    dishwasher: true,
    extraPantry: false,
    baseFill: "drawers",
    drawerCount: 3,
    ladder: NARROW_LADDER,
    upperCoverage: "full",
    upperTall: false,
    upperDoor: 0,
    baseDoor: 0,
    handle: 2,
    island: false,
    style: { carcass: 0xeeeeec, facade: 0xf2f2f0, worktop: 0x8a8f93, handle: 0x9aa0a6, glassUppers: false },
  },
  {
    id: "storage",
    name: "Максимум хранения",
    blurb: "Тёплое дерево, колонны и шкафы до потолка",
    dishwasher: true,
    extraPantry: true,
    baseFill: "mix",
    drawerCount: 3,
    ladder: WIDE_LADDER,
    upperCoverage: "full",
    upperTall: true,
    upperDoor: 0,
    baseDoor: 0,
    handle: 0,
    island: true,
    style: { carcass: 0xe3d5b8, facade: 0xd8c69f, worktop: 0x5b5550, handle: 0x6f6a62, glassUppers: false },
  },
  {
    id: "premium",
    name: "Премиум",
    blurb: "Графит, стеклянные витрины, ящики",
    dishwasher: true,
    extraPantry: false,
    baseFill: "drawers",
    drawerCount: 3,
    ladder: WIDE_LADDER, // bold full-width drawer fronts (vs ergonomic's many narrow)
    upperCoverage: "full",
    upperTall: false,
    upperDoor: 2, // glass
    baseDoor: 1, // milled
    handle: 1,
    island: true,
    style: { carcass: 0x44484d, facade: 0x4c5157, worktop: 0x2e3236, handle: 0xc8ccd0, glassUppers: true },
  },
];

interface TallSpec {
  kind: "fridge" | "oven" | "pantry";
  builtin: boolean;
}

function tallsFor(v: VariantInput, st: Strategy): TallSpec[] {
  const talls: TallSpec[] = [];
  if (v.fridge !== "none") talls.push({ kind: "fridge", builtin: v.fridge === "integ" });
  if (v.oven === "tall") talls.push({ kind: "oven", builtin: true });
  if (st.extraPantry) talls.push({ kind: "pantry", builtin: true });
  return talls;
}

interface RunFill {
  length: number;
  run: number;
  sink: boolean;
  cook: "hob" | "cooktop" | "none";
  dishwasher: boolean;
  talls: TallSpec[];
  tallEnd: "near" | "far";
  openings: RunOpening[];
}

interface BaseSlot {
  x: number;
  w: number;
}

/** Fill one wall run, respecting its openings; returns base + tall + upper Cabinets. */
function fillRun(rf: RunFill, st: Strategy, v: VariantInput): Cabinet[] {
  const L = Math.max(MIN_W, Math.round(rf.length));
  const doors: Span[] = rf.openings.filter((o) => o.kind === "door").map((o) => ({ a: Math.max(0, o.a - DOOR_MARGIN), b: Math.min(L, o.b + DOOR_MARGIN) }));
  const windows: Span[] = rf.openings.filter((o) => o.kind === "window").map((o) => ({ a: o.a, b: o.b }));
  const overlapsWin = (x: number, w: number) => windows.some((win) => x < win.b && x + w > win.a);

  // --- tall bank: fit at the preferred end, clear of doors + windows ---
  const talls = rf.talls.slice();
  let tallStart = -1;
  while (talls.length) {
    tallStart = placeBank(L, talls.length * TALL_W, rf.tallEnd, doors, windows);
    if (tallStart >= 0) break;
    talls.pop(); // drop pantry, then oven, then fridge until it fits
  }
  const tallBlock: Span[] = tallStart >= 0 ? [{ a: tallStart, b: tallStart + talls.length * TALL_W }] : [];

  // --- base modules fill the run minus doors minus the tall bank (windows OK) ---
  const baseSlots: BaseSlot[] = [];
  for (const sp of subtract(0, L, [...doors, ...tallBlock])) {
    let x = sp.a;
    for (const w of packWidths(sp.b - sp.a, st.ladder)) {
      baseSlots.push({ x, w });
      x += w;
    }
  }
  baseSlots.sort((p, q) => p.x - q.x);

  const frac = (s: BaseSlot) => (s.x + s.w / 2) / L;

  // sink — nearest the water zone (the wall the user put the supply on)
  let sinkIdx = -1;
  if (rf.sink && baseSlots.length) {
    const wf = zoneCenterFrac(v.water);
    const wide = baseSlots.map((s, i) => i).filter((i) => baseSlots[i].w >= 500);
    const cand = wide.length ? wide : baseSlots.map((_, i) => i);
    sinkIdx = cand.reduce((b, i) => (Math.abs(frac(baseSlots[i]) - wf) < Math.abs(frac(baseSlots[b]) - wf) ? i : b), cand[0]);
  }

  // hob/cooktop — clear of the sink and window, and away from the fridge tower
  // (the work-triangle guideline: don't put the cooktop next to the fridge)
  const tallCenter = tallStart >= 0 && talls.length ? tallStart + (talls.length * TALL_W) / 2 : null;
  const hobIdx = rf.cook === "none" ? -1 : pickHob(baseSlots, sinkIdx, overlapsWin, tallCenter);

  // dishwasher — beside the sink
  let dwIdx = -1;
  if (rf.dishwasher && sinkIdx >= 0) {
    for (const j of [sinkIdx - 1, sinkIdx + 1]) {
      if (j >= 0 && j < baseSlots.length && j !== hobIdx && baseSlots[j].w >= 450) {
        dwIdx = j;
        break;
      }
    }
  }

  const cabs: Cabinet[] = [];

  // tall columns
  let tx = tallStart;
  if (tallStart >= 0) {
    for (const t of talls) {
      const b = { w: TALL_W, handle: st.handle, x: tx, run: rf.run };
      if (t.kind === "fridge") cabs.push(mk({ ...b, kind: "tall", h: TALL_H, fill: "shelves", count: 0, door: 0, appliance: "fridge", builtin: t.builtin }));
      else if (t.kind === "oven") cabs.push(mk({ ...b, kind: "tall", h: TALL_H, fill: "shelves", count: 2, door: st.baseDoor, appliance: "oven", builtin: true }));
      else cabs.push(mk({ ...b, kind: "tall", h: TALL_H, fill: "shelves", count: 5, door: st.baseDoor, appliance: "none" }));
      tx += TALL_W;
    }
  }

  // base modules
  let mix = 0;
  baseSlots.forEach((s, i) => {
    const b = { w: s.w, handle: st.handle, x: s.x, run: rf.run };
    if (i === sinkIdx) cabs.push(mk({ ...b, kind: "base", h: BASE_H, fill: "shelves", count: 0, door: st.baseDoor, appliance: "sink" }));
    else if (i === hobIdx) cabs.push(mk({ ...b, kind: "base", h: BASE_H, fill: "drawers", count: 2, door: st.baseDoor, appliance: rf.cook === "cooktop" ? "cooktop" : "hob" }));
    else if (i === dwIdx) cabs.push(mk({ ...b, kind: "base", h: BASE_H, fill: "open", count: 0, door: st.baseDoor, appliance: "dishwasher" }));
    else {
      const drawers = st.baseFill === "drawers" || (st.baseFill === "mix" && mix++ % 2 === 0);
      cabs.push(
        drawers
          ? mk({ ...b, kind: "base", h: BASE_H, fill: "drawers", count: st.drawerCount, door: st.baseDoor })
          : mk({ ...b, kind: "base", h: BASE_H, fill: "shelves", count: 2, door: st.baseDoor }),
      );
    }
  });

  // upper cabinets — never over a window; hob gets the hood; height per strategy
  const upperH = st.upperTall ? Math.max(UPPER_H, Math.min(1100, v.ceiling - GEOM.upperBottom - 80)) : UPPER_H;
  baseSlots.forEach((s, i) => {
    const onWindow = overlapsWin(s.x, s.w);
    if (i === hobIdx) {
      if (v.hood === "dome") cabs.push(mk({ kind: "upper", w: s.w, h: 350, fill: "open", count: 0, door: 3, handle: 3, appliance: "hood", x: s.x, run: rf.run }));
      else if (!onWindow) cabs.push(mk({ kind: "upper", w: s.w, h: upperH, fill: "shelves", count: 2, door: st.upperDoor, handle: st.handle, x: s.x, run: rf.run }));
      return;
    }
    if (onWindow) return; // no upper blocking a window
    if (i === sinkIdx && st.upperCoverage !== "full") return;
    if (st.upperCoverage === "partial" && s.w < 500) return;
    cabs.push(mk({ kind: "upper", w: s.w, h: upperH, fill: "shelves", count: 2, door: st.upperDoor, handle: st.handle, x: s.x, run: rf.run }));
  });

  return cabs;
}

/** Hob slot: keep ≥600mm worktop from the sink, wide enough, not under a window,
 *  and as far as possible from the fridge tower (`awayX`, else from the sink). */
function pickHob(slots: BaseSlot[], sinkIdx: number, overlapsWin: (x: number, w: number) => boolean, awayX: number | null): number {
  if (!slots.length) return -1;
  const cx = (i: number) => slots[i].x + slots[i].w / 2;
  const sinkX = sinkIdx >= 0 ? cx(sinkIdx) : 0;
  const ref = awayX != null ? awayX : sinkX;
  const dist = (i: number) => Math.abs(cx(i) - ref);
  const farthest = (pool: number[]) => (pool.length ? pool.reduce((b, i) => (dist(i) > dist(b) ? i : b), pool[0]) : -1);
  const gapOK = (i: number) => sinkIdx < 0 || Math.abs(cx(i) - sinkX) >= 600; // worktop between sink & hob
  const idxs = slots.map((_, i) => i).filter((i) => i !== sinkIdx);
  const tiers = [
    idxs.filter((i) => gapOK(i) && slots[i].w >= 500 && !overlapsWin(slots[i].x, slots[i].w)),
    idxs.filter((i) => gapOK(i) && slots[i].w >= 500),
    idxs.filter((i) => slots[i].w >= 450 && !overlapsWin(slots[i].x, slots[i].w)),
    idxs.filter((i) => slots[i].w >= 450),
    idxs,
  ];
  for (const t of tiers) {
    const pick = farthest(t);
    if (pick >= 0) return pick;
  }
  return -1;
}

interface Role {
  sink: boolean;
  hob: boolean;
  dw: boolean;
  talls: boolean;
}

/** Spread sink / hob / fridge-bank across the wall runs per the layout. */
function assignRoles(layout: KitchenLayout, runs: RunInput[], waterRun: number): Record<number, Role> {
  const wallIdx = runs.map((_, i) => i).filter((i) => runs[i].kind === "wall");
  const roles: Record<number, Role> = {};
  const set = (i: number, r: Partial<Role>) => (roles[i] = { sink: false, hob: false, dw: false, talls: false, ...r });

  if (layout === "i" || layout === "peninsula" || wallIdx.length === 1) {
    set(wallIdx[0], { sink: true, hob: true, dw: true, talls: true });
  } else if (layout === "u" && wallIdx.length >= 3) {
    const mid = wallIdx[1];
    const sinkRun = wallIdx.includes(waterRun) ? waterRun : mid;
    let hobRun: number;
    let tallsRun: number;
    if (sinkRun !== mid) {
      hobRun = mid;
      tallsRun = wallIdx.find((i) => i !== sinkRun && i !== mid) ?? mid;
    } else {
      const arms = wallIdx.filter((i) => i !== mid);
      hobRun = arms[0];
      tallsRun = arms[1] ?? arms[0];
    }
    set(sinkRun, { sink: true, dw: true });
    set(hobRun, { hob: true });
    set(tallsRun, { talls: true });
  } else {
    // galley / l — sink + hob on the water wall; fridge bank on the other
    const work = wallIdx.includes(waterRun) ? waterRun : wallIdx[0];
    const other = wallIdx.find((i) => i !== work) ?? work;
    set(work, { sink: true, hob: true, dw: true });
    set(other, { talls: true });
  }
  for (const i of wallIdx) if (!roles[i]) set(i, {});
  return roles;
}

/** Storage modules for an island / peninsula run (base drawers, no uppers). */
function fillStorageRun(r: RunInput, runIdx: number, st: Strategy): Cabinet[] {
  const cabs: Cabinet[] = [];
  let x = 0;
  for (const w of packWidths(r.len, st.ladder)) {
    cabs.push(mk({ kind: "base", h: BASE_H, w, fill: "drawers", count: 3, door: st.baseDoor, handle: st.handle, x, run: runIdx }));
    x += w;
  }
  return cabs;
}

const FRIDGE_NOTE: Record<FridgeType, string> = { integ: "встроенный х-к", free: "отдельный х-к", none: "без х-ка" };
const OVEN_NOTE: Record<OvenType, string> = { under: "духовка под столешницей", tall: "духовка-пенал" };
const HOOD_NOTE: Record<HoodType, string> = { integ: "встроенная вытяжка", dome: "купольная вытяжка" };
const LAYOUT_NOTE: Record<KitchenLayout, string> = { i: "Прямая", galley: "Параллельная", l: "Угловая", u: "П-образная", peninsula: "С полуостровом" };

const FALLBACK_LAYOUT: PlannedLayout = { layout: "i", runs: [], waterRun: 0 };

/** Generate the four Phase-B variants. The selected layout(s) AND onboarding option
 *  sets are spread across the variants, so multi-select → genuinely different kitchens. */
export function generateVariants(input: LayoutInput): GenVariant[] {
  const lays = input.layouts.length ? input.layouts : [FALLBACK_LAYOUT];
  const fr = input.fridge.length ? input.fridge : (["free"] as FridgeType[]);
  const ov = input.oven.length ? input.oven : (["under"] as OvenType[]);
  const ho = input.hood.length ? input.hood : (["integ"] as HoodType[]);
  const layoutVaries = lays.length > 1;
  const applVaries = fr.length > 1 || ov.length > 1 || ho.length > 1;

  // more selected layouts → more variants (like IKEA): 2 finishes per layout,
  // min 4, max 8. Staggered so every (layout × finish) pairing is distinct.
  const count = Math.max(4, Math.min(8, lays.length * 2));

  return Array.from({ length: count }, (_, si) => {
    const pl = lays[si % lays.length];
    const st = STRATEGIES[Math.floor(si / lays.length) % STRATEGIES.length];
    const { layout, runs, waterRun } = pl;
    const roles = assignRoles(layout, runs, waterRun);
    const hi = (si >> 1) & 1;
    const lo = si & 1;
    const fridge = fr[hi % fr.length];
    const oven = ov[lo % ov.length];
    const hood = ho[(hi ^ lo) % ho.length];

    const v: VariantInput = { layout, runs, waterRun, ceiling: input.ceiling, water: input.water, fridge, oven, hood };
    const cook: RunFill["cook"] = oven === "tall" ? "cooktop" : "hob";
    const talls = tallsFor(v, st);
    const cabs: Cabinet[] = [];
    runs.forEach((r, i) => {
      if (r.kind !== "wall") {
        if (r.kind === "island" && !st.island) return; // island only for some variants
        if (r.len > 600) cabs.push(...fillStorageRun(r, i, st));
        return;
      }
      const role = roles[i] ?? { sink: false, hob: false, dw: false, talls: false };
      const tallEnd: RunFill["tallEnd"] = r.cornerEnd ? "near" : layout === "i" && v.water === "right" ? "near" : "far";
      cabs.push(
        ...fillRun(
          { length: r.len, run: i, sink: role.sink, cook: role.hob ? cook : "none", dishwasher: role.dw && st.dishwasher, talls: role.talls ? talls : [], tallEnd, openings: r.openings },
          st,
          v,
        ),
      );
    });

    // when layouts vary, lead with the layout name and put the finish in the blurb
    const name = layoutVaries ? LAYOUT_NOTE[layout] : st.name;
    const bits: string[] = [];
    if (layoutVaries) bits.push(st.name);
    if (applVaries) bits.push([FRIDGE_NOTE[fridge], OVEN_NOTE[oven], HOOD_NOTE[hood]].join(", "));
    return { id: `${st.id}-${si}`, name, blurb: bits.join(" · ") || st.blurb, cabs, style: st.style, layout };
  });
}
