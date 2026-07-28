import type { mm10 } from "../../../../engine/contracts/types";
import type { CabinetType } from "../contracts/design";

export type KromkaSlot = "K1" | "K2";
export type PartRole = "side" | "bottom" | "top" | "stretcher" | "shelf" | "back" | "worktop" | "door" | "divider" | "plinth" | "filler";

export interface EdgeKromka {
  front: KromkaSlot | null;
  back: KromkaSlot | null;
  left: KromkaSlot | null;
  right: KromkaSlot | null;
  top: KromkaSlot | null;
  bottom: KromkaSlot | null;
}

export interface TypeConstruction {
  bottomPlacement: "nakladnoe" | "vkladnoe";
  topStyle: "full" | "stretchers" | "none";
  stretcherWidth_mm10: mm10;
  back: {
    treatment: "groove" | "overlay" | "none";
    grooveWidth_mm10: mm10;
    grooveDepth_mm10: mm10;
    grooveSetback_mm10: mm10;
  };
  backZone_mm10: mm10;
  shelfSetback_mm10: mm10;
  plinth: {
    style: "box" | "strip" | "none";
    height_mm10: mm10;
    placement: "between" | "under";
    role: "decorative" | "structural";
  };
  worktop: {
    sideOverhang_mm10: mm10;
    frontOverhang_mm10: mm10;
  };
  kromkaByRole: Record<PartRole, EdgeKromka>;
  merge: {
    allowed: boolean;
    strategy: "shared_divider";
    limits: {
      maxSheetLength_mm10: mm10;
      maxSheetWidth_mm10: mm10;
      maxWeightKg: number;
    };
  };
  grainPolicy: {
    mode: "lock_all" | "free_hidden";
    hiddenRoles: PartRole[];
  };
}

export interface ConstructionProfile {
  profileId: string;
  name: string;
  material: {
    carcass_mm10: mm10;
    back_mm10: mm10;
    front_mm10: mm10;
    worktop_mm10: mm10;
    density_kg_m3: number;
  };
  kromka: {
    slots: Record<KromkaSlot, { thickness_mm10: mm10 }>;
  };
  grain: "L" | "NONE";
  defaults: TypeConstruction;
  byType: Partial<Record<CabinetType, Partial<TypeConstruction>>>;
}
