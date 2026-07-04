// Adapter: app state → @mebelchi/schema Project, so priceProject can run on the
// live model. Pure. The visual swatch (state.mat) does not change rate-table refs
// in this MVP — every project is priced against the seed LDSP/MDF/worktop/edge
// entries; that's where a real material→SKU mapping will later plug in.

import { priceProject, seedRateTable } from "@mebelchi/pricing";
import type { Project, Module, MaterialSelection, Quote, QuoteGroup } from "@mebelchi/schema";
import type { AppState } from "../store";
import type { Cabinet } from "./cabinet";

const DOOR_STYLE = ["flat", "milled", "glass", "none"] as const;
const HANDLE_TYPE = ["bar", "profile", "knob", "none"] as const;
const DEPTH: Record<Cabinet["kind"], number> = { base: 560, tall: 560, upper: 350 };

const CONSTRAINT_MAP: Record<string, "gas" | "riser" | "sockets" | "window" | "radiator"> = {
  "Газовая труба": "gas",
  Сток: "riser",
  Розетки: "sockets",
  Окно: "window",
  Радиатор: "radiator",
};

/** Derive the rate-table material refs from the seed (robust to UUID changes). */
function pickMaterials(): MaterialSelection {
  const matEntries = Object.entries(seedRateTable.materials);
  const byType = (t: string) => matEntries.find(([, m]) => m.type === t)?.[0];
  const carcassId = byType("LDSP") ?? matEntries[0][0];
  const facadeId = byType("MDF") ?? carcassId;
  const worktopId = Object.keys(seedRateTable.worktop)[0];
  const edges = Object.entries(seedRateTable.edge)
    .sort((a, b) => b[1].pricePerM - a[1].pricePerM)
    .map(([id]) => id);
  return {
    carcassId,
    facadeId,
    worktopId,
    edgeVisibleId: edges[0],
    edgeHiddenId: edges[1] ?? edges[0],
  };
}

export function cabToModule(c: Cabinet): Module {
  return {
    id: c.id,
    kind: c.kind,
    w: c.w,
    h: c.h,
    // honor a user's custom depth so the cut list / price / DXF match the SWJ008 drill file
    // (machining.ts already uses c.depth); falls back to the per-kind default when unset.
    d: c.depth ?? DEPTH[c.kind] ?? 560,
    fill: c.fill,
    count: c.count,
    dividers: c.div,
    door: { style: DOOR_STYLE[c.door] ?? "flat" },
    handle: { type: HANDLE_TYPE[c.handle] ?? "bar" },
  };
}

/** Shared Project skeleton — pricing reads only `run` + `materials`, so a neutral
 *  space is fine when we just need a quote (e.g. previewing a variant's cabs). */
function makeProject(run: Module[], space: Project["space"]): Project {
  const now = new Date().toISOString();
  return {
    id: "local-project",
    name: "Mebelchi kitchen",
    ownerId: "local",
    units: "mm",
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    space,
    run,
    materials: pickMaterials(),
    pricing: { rateTableId: seedRateTable.id, snapshotAt: now },
  };
}

export function toProject(s: AppState): Project {
  // free-standing furniture (tables/chairs) isn't a cabinet — keep it out of the BOM
  const cabs = s.cabs.filter((c) => !c.furniture);
  const run = cabs.map(cabToModule);
  // global "усиление" flag → a hardening preset on the recommended (first open) module
  if (s.hardened && run.length) {
    const idx = Math.max(0, cabs.findIndex((c) => c.fill === "open"));
    run[idx] = { ...run[idx], hardening: ["standard-shelf"] };
  }
  return makeProject(run, {
    source: "manual",
    shape: s.shape,
    wallLength: s.wallLen,
    ceilingHeight: s.ceiling,
    waterWall: s.water,
    constraints: s.constraints
      .map((c) => CONSTRAINT_MAP[c])
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  });
}

/** A priceable Project from a bare cabinet run (no room state) — used to quote the
 *  generated Phase-B variants before one is committed to the editable run. */
export function projectFromCabs(cabs: Cabinet[]): Project {
  return makeProject(cabs.filter((c) => !c.furniture).map(cabToModule), {
    source: "manual",
    shape: "i",
    wallLength: 0,
    ceilingHeight: 2700,
    waterWall: "none",
    constraints: [],
  });
}

/** Total price (сум) of a cabinet run against the seed rate table. */
export function priceCabs(cabs: Cabinet[]): number {
  return cabs.length ? priceProject(projectFromCabs(cabs), seedRateTable).total : 0;
}

/** Russian labels for the quote groups (the Смета breakdown). */
export const GROUP_LABEL: Record<QuoteGroup, string> = {
  carcassFacade: "Корпус и фасады",
  worktopEdge: "Столешница и кромка",
  hardware: "Фурнитура",
  cnc: "ЧПУ и обработка",
  delivery: "Доставка и сборка",
};

export interface CabCost {
  id: string;
  cost: number;
}

/** The full quote for the cost screen + a per-module cost (each module's price WITHOUT
 *  the fixed project delivery, so the per-module list + delivery ≈ the total). */
export function costBreakdown(cabs: Cabinet[]): { quote: Quote; perCab: CabCost[] } | null {
  const real = cabs.filter((c) => !c.furniture);
  if (!real.length) return null;
  const quote = priceProject(projectFromCabs(real), seedRateTable);
  const perCab = real.map((c) => {
    const q = priceProject(projectFromCabs([c]), seedRateTable);
    return { id: c.id, cost: q.total - q.groups.delivery }; // module cost, minus the fixed delivery base
  });
  return { quote, perCab };
}
