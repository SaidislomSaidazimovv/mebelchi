// The project model — the central contract everything reads from
// (PRICING_AND_SCHEMA.md §1). Stored as small JSON per the ADR-001 sync model.

import type { UUID } from "./common.js";
import type { Space } from "./space.js";
import type { Module } from "./module.js";

export interface MaterialSelection {
  /** Corpus material (LDSP etc.). */
  carcassId: UUID;
  /** Default facade material. */
  facadeId: UUID;
  worktopId?: UUID;
  /** 2mm kromka. */
  edgeVisibleId: UUID;
  /** 0.4mm kromka. */
  edgeHiddenId: UUID;
}

/** Which rate table this quote used, and when it was snapshotted. */
export interface ProjectPricing {
  rateTableId: UUID;
  snapshotAt: string;
}

export interface ProjectMeta {
  variantArchetype?: string;
}

export interface Project {
  id: UUID;
  name: string;
  ownerId: UUID;
  units: "mm";
  /** ISO timestamp. */
  createdAt: string;
  /** ISO timestamp. */
  updatedAt: string;
  schemaVersion: 1;

  /** From manual entry OR a RoomPlan scan. */
  space: Space;
  /** The cabinet run. */
  run: Module[];
  materials: MaterialSelection;
  pricing: ProjectPricing;
  meta?: ProjectMeta;
}
