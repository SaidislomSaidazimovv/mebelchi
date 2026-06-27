// The rate table — the swappable data source (PRICING_AND_SCHEMA.md §2).
// Stored in Supabase; seeded from an eman.uz snapshot, switched to an API/partner
// feed later WITHOUT touching pricing code. Old quotes keep their `rateTableId`
// so a saved project's price stays reproducible.

import type { UUID } from "./common.js";

export type MaterialType = "LDSP" | "MDF" | "HDF" | "solid";

export interface MaterialRate {
  name: string;
  type: MaterialType;
  pricePerM2: number;
}

export interface EdgeRate {
  name: string;
  pricePerM: number;
}

export interface WorktopRate {
  name: string;
  pricePerM: number;
}

export interface HardwareRate {
  name: string;
  sku: string;
  pricePerUnit: number;
}

/** Per-unit machining operation rates. */
export interface OperationRates {
  drillPerHole: number;
  cutPerPanel: number;
  edgebandPerM: number;
}

export interface LaborRates {
  assemblyPerModule: number;
  hardeningPerPreset: number;
}

export interface DeliveryRates {
  base: number;
  perModule: number;
}

export interface RateTable {
  id: UUID;
  currency: "UZS";
  effectiveDate: string;
  /** e.g. 'eman.uz snapshot 2026-06-20' | 'manual' | 'api:eman'. */
  source: string;
  materials: Record<UUID, MaterialRate>;
  edge: Record<UUID, EdgeRate>;
  worktop: Record<UUID, WorktopRate>;
  /** Hinges, slides, dowels, cams… */
  hardware: Record<UUID, HardwareRate>;
  operations: OperationRates;
  labor: LaborRates;
  delivery: DeliveryRates;
}
