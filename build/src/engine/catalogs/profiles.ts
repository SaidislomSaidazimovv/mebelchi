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

export const QORASU_PROFILE: ConstructionProfile = {
  profileId: "QORASU_16",
  name: "Qorasu 16mm (Vkladnoy)",
  material: { carcass_mm10: 160, back_mm10: 40, front_mm10: 180, worktop_mm10: 160, density_kg_m3: 700 },
  kromka: { slots: { K1: { thickness_mm10: 10 }, K2: { thickness_mm10: 4 } } },
  grain: "L",
  defaults: {
    bottomPlacement: "vkladnoe",
    topStyle: "full",
    stretcherWidth_mm10: 800,
    back: { treatment: "groove", grooveWidth_mm10: 40, grooveDepth_mm10: 60, grooveSetback_mm10: 200 },
    backZone_mm10: 300,
    shelfSetback_mm10: 200,
    plinth: { style: "none", height_mm10: 1000, placement: "under", role: "structural" },
    worktop: { sideOverhang_mm10: 0, frontOverhang_mm10: 0 },
    kromkaByRole: {
      side: { front: "K1", back: "K2", left: null, right: null, top: null, bottom: null },
      bottom: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      top: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      stretcher: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      shelf: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      back: { front: null, back: null, left: null, right: null, top: null, bottom: null },
      worktop: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      door: { front: "K1", back: "K1", left: "K1", right: "K1", top: null, bottom: null },
      divider: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      plinth: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      filler: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
    },
    merge: { allowed: true, strategy: "shared_divider", limits: { maxSheetLength_mm10: 27500, maxSheetWidth_mm10: 18300, maxWeightKg: 150 } },
    grainPolicy: { mode: "lock_all", hiddenRoles: [] }
  },
  byType: {}
};

export const EMAN_PROFILE: ConstructionProfile = {
  profileId: "EMAN_18",
  name: "Eman 18mm (Nakladnoy)",
  material: { carcass_mm10: 180, back_mm10: 40, front_mm10: 180, worktop_mm10: 160, density_kg_m3: 700 },
  kromka: { slots: { K1: { thickness_mm10: 20 }, K2: { thickness_mm10: 4 } } },
  grain: "L",
  defaults: {
    bottomPlacement: "nakladnoe",
    topStyle: "full",
    stretcherWidth_mm10: 800,
    back: { treatment: "overlay", grooveWidth_mm10: 0, grooveDepth_mm10: 0, grooveSetback_mm10: 0 },
    backZone_mm10: 0,
    shelfSetback_mm10: 200,
    plinth: { style: "none", height_mm10: 1000, placement: "under", role: "structural" },
    worktop: { sideOverhang_mm10: 0, frontOverhang_mm10: 0 },
    kromkaByRole: {
      side: { front: "K1", back: "K1", left: null, right: null, top: null, bottom: null },
      bottom: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      top: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      stretcher: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      shelf: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      back: { front: null, back: null, left: null, right: null, top: null, bottom: null },
      worktop: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      door: { front: "K1", back: "K1", left: "K1", right: "K1", top: null, bottom: null },
      divider: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      plinth: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      filler: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
    },
    merge: { allowed: true, strategy: "shared_divider", limits: { maxSheetLength_mm10: 27500, maxSheetWidth_mm10: 18300, maxWeightKg: 150 } },
    grainPolicy: { mode: "lock_all", hiddenRoles: [] }
  },
  byType: {}
};
