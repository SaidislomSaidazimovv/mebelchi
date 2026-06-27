// priceProject: (Project, RateTable) → grouped Quote (PRICING_AND_SCHEMA.md §4).
//
// Pure and stateless: same model + same rates → same quote. Cheap enough to run
// on every edit (the live ticker) and identical when re-run server-side on lock.
// Rounds to whole сум at the line level, then sums into groups + total.

import type {
  Project,
  RateTable,
  BomLine,
  RawBomLine,
  HardwareRate,
  Quote,
  QuoteGroup,
} from "../../schema/src/index.js";
import { buildBom } from "./buildBom.js";
import { KIND_TO_GROUP } from "./constants.js";

function missingRate(kind: string, ref: string): never {
  throw new Error(`priceProject: no rate in RateTable for ${kind} ref "${ref}"`);
}

/** Read a numeric field by name from a flat rate sub-object (operations/labor/delivery). */
function numberField(obj: object, key: string): number | undefined {
  return (obj as Record<string, number>)[key];
}

/** Resolve the per-unit rate for one BOM line against the rate table. */
function resolveRate(
  line: RawBomLine,
  rates: RateTable,
  hardwareBySku: Map<string, HardwareRate>,
): number {
  switch (line.kind) {
    case "panel": {
      const m = rates.materials[line.ref];
      return m ? m.pricePerM2 : missingRate(line.kind, line.ref);
    }
    case "edge": {
      const e = rates.edge[line.ref];
      return e ? e.pricePerM : missingRate(line.kind, line.ref);
    }
    case "worktop": {
      const w = rates.worktop[line.ref];
      return w ? w.pricePerM : missingRate(line.kind, line.ref);
    }
    case "hardware": {
      const h = hardwareBySku.get(line.ref);
      return h ? h.pricePerUnit : missingRate(line.kind, line.ref);
    }
    case "operation": {
      const r = numberField(rates.operations, line.ref);
      return r !== undefined ? r : missingRate(line.kind, line.ref);
    }
    case "labor": {
      const r = numberField(rates.labor, line.ref);
      return r !== undefined ? r : missingRate(line.kind, line.ref);
    }
    case "delivery": {
      const r = numberField(rates.delivery, line.ref);
      return r !== undefined ? r : missingRate(line.kind, line.ref);
    }
  }
}

export function priceProject(project: Project, rates: RateTable): Quote {
  // Hardware is referenced by SKU; index the table's hardware once per call.
  const hardwareBySku = new Map<string, HardwareRate>();
  for (const entry of Object.values(rates.hardware)) hardwareBySku.set(entry.sku, entry);

  const lines: BomLine[] = buildBom(project).map((raw) => {
    const rate = resolveRate(raw, rates, hardwareBySku);
    return {
      ...raw,
      rate,
      amount: Math.round(raw.qty * rate), // round to whole сум at the line level
      group: KIND_TO_GROUP[raw.kind],
    };
  });

  const groups: Record<QuoteGroup, number> = {
    carcassFacade: 0,
    hardware: 0,
    worktopEdge: 0,
    cnc: 0,
    delivery: 0,
  };
  let total = 0;
  for (const line of lines) {
    groups[line.group] += line.amount;
    total += line.amount;
  }

  return {
    currency: rates.currency,
    total,
    groups,
    lines,
    itemCount: project.run.length,
  };
}
