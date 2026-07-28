import type { mm10 } from "../../../../engine/contracts/types";

export type RoleSlot = "fasad" | "korpus" | "orqa";
export type CabinetType = "kitchen_base" | "kitchen_wall" | "tall" | "drawer_base" | "wardrobe" | "shelf_unit";
export type NodeKind = "cabinet" | "shelf" | "divider" | "door" | "drawer" | "filler" | "rod";
export type Division = { rule: "fixed"; mm: mm10 } | { rule: "ratio"; weight: number } | { rule: "flex" };

export interface DesignNode {
  nodeId: string;
  kind: NodeKind;
  cabinetType?: CabinetType;
  roleSlot?: RoleSlot;
  size?: { w_mm10?: mm10; h_mm10?: mm10; d_mm10?: mm10 };
  division?: Division;
  purpose?: string;
  children?: DesignNode[];
  hasDoor?: boolean;
  hasWorktop?: boolean;
}

export interface DesignBlock {
  blockId: string;
  name: string;
  author: string;
  schemaVersion: 1;
  root: DesignNode;
  requiredSlots: RoleSlot[];
  tags?: string[];
}

export interface ConstructionOverride {
  nodeId: string;
  field: "topStyle" | "bottomPlacement" | "shelfSetback_mm10" | "plinthHeight_mm10";
  value: string | number;
}

export interface DesignProject {
  projectId: string;
  name: string;
  nodes: DesignNode[];
  slotBindings: Record<RoleSlot, string>;
  overrides: ConstructionOverride[];
}
