// Layer 0 — construction profiles. Data, not logic.
//
// Every number is MEASURED, and each carries where it came from:
//   DB/25  — the 359-panel census (aggregate across prop-0/1/2 + XML output examples)
//   DB/28  — the replay of one real cabinet, which resolved what the census could not
// A number with no citation is a bug. When a value is a guess, it says so.

import type {
  ConstructionProfile, EdgeKromka, PartRole, TypeConstruction,
} from "../contracts/design.js";

/** Build a kromka map from only the edges that exist for that part's axes. */
const K = (e: Partial<EdgeKromka>): EdgeKromka =>
  ({ front: null, back: null, left: null, right: null, top: null, bottom: null, ...e });

const BARE = K({});

/**
 * DB/25 F2 kromka map (aggregate): shelf = 1 front edge (9/9) · door = 4 (16/22) ·
 * plinth never bare (0/38) · divider/stretcher = front only · backs mostly bare.
 *
 * DB/28 A6 FIX: side = 2 edges. The census already said side 2e×9 / 3e×6 — the
 * first cut of this file encoded 1. The replay caught the mis-encoding.
 *
 * Each map uses only the semantic names its part's ORIENTATION owns (see EdgeKromka):
 *   side/divider  h×d → front/back/top/bottom      shelf d×w → front/back/left/right
 *   bottom/top/stretcher/worktop w×d → front/back/left/right
 *   door h×w, plinth w×h, filler h×w → top/bottom/left/right
 */
const KROMKA_CENSUS: Record<PartRole, EdgeKromka> = {
  shelf:     K({ front: "K1" }),                                  // 9/9 — one front edge
  divider:   K({ front: "K1" }),
  stretcher: K({ front: "K1" }),
  side:      K({ front: "K1", back: "K1" }),                      // A6: two edges
  bottom:    K({ front: "K1" }),
  top:       K({ front: "K1" }),
  worktop:   K({ front: "K1", back: "K1", left: "K1", right: "K1" }),
  door:      K({ top: "K1", bottom: "K1", left: "K1", right: "K1" }), // h×w → no "front"
  plinth:    K({ top: "K1", left: "K2", right: "K2" }),           // w×h → 3 edges (22× mode)
  filler:    K({ left: "K1" }),
  back:      BARE,
};

/** The census aggregate — the safe fallback for a type we have not replayed yet. */
const DEFAULTS: TypeConstruction = {
  bottomPlacement: "nakladnoe", // UNPROVEN for the aggregate (DB/25 gap: 4 pairs only)
  topStyle: "full",             // DB/25 F5: 7 full tops, 0 stretcher-tops
  stretcherWidth_mm10: 800,     // R17 theory (~80mm) — no local evidence
  back: {
    treatment: "groove",   // DB/25 F3: universal in the aggregate
    grooveWidth_mm10: 40,  // 4.0mm — 70 of 71
    grooveDepth_mm10: 80,  // 8.0mm — 69 of 71
    grooveSetback_mm10: 120, // 12.0mm — 50 of 71
  },
  backZone_mm10: 170,      // DB/28 A2 — see shelf_unit; unproven for the aggregate
  shelfSetback_mm10: 0,    // DB/28: the depth reduction IS the back zone, not extra
  plinth: { style: "box", height_mm10: 1200, placement: "between" }, // DB/25 F4: box, 120 (22×)
  worktop: { sideOverhang_mm10: 400, frontOverhang_mm10: 800 },      // DB/28, from the replay
  kromkaByRole: KROMKA_CENSUS,
};

/**
 * The measured Qorasu/Eman workshop.
 *
 * `shelf_unit` is the ONLY type replayed against real panels so far (DB/28) — its
 * numbers are exact. Every other type falls back to the census aggregate and is
 * therefore UNPROVEN until its own replay. That distinction is deliberate and must
 * not be blurred: `byType` says "measured", `defaults` says "aggregate guess".
 */
export const QORASU_PROFILE: ConstructionProfile = {
  profileId: "qorasu_eman_2026_07",
  name: "Карасу · Eman",
  material: {
    carcass_mm10: 160, // DB/25 F1: 16mm — 0 of 359 panels were 18mm
    back_mm10: 160,    // DB/28 A2/A3: 16mm ЛДСП backs are 17 of the dump's 33 backs
    front_mm10: 220,   // DB/25: the 22mm facade layer
  },
  kromka: { slots: { K1: { thickness_mm10: 10 }, K2: { thickness_mm10: 4 } } }, // F2: 1.0 / 0.4; 2mm never
  grain: "L", // F-secondary: L on 359/359
  defaults: DEFAULTS,
  byType: {
    /** REPLAY-EXACT (DB/28): every value below reproduces the real 7-panel cabinet. */
    shelf_unit: {
      bottomPlacement: "vkladnoe",   // A1 — real bottom 988 = W−2t. The replay settled the census gap.
      topStyle: "none",              // A4 — a worktop sits on the sides; no carcass top
      backZone_mm10: 170,            // A2 — bottom & shelf are 503 vs sides 520 (16mm back + 1mm)
      shelfSetback_mm10: 0,          // the 17mm back zone is the whole reduction
      plinth: { style: "strip", height_mm10: 800, placement: "between" }, // A5 — 80mm, 988 = W−2t
      worktop: { sideOverhang_mm10: 400, frontOverhang_mm10: 800 },       // 1100×600 vs 1020×520
      back: { treatment: "overlay", grooveWidth_mm10: 0, grooveDepth_mm10: 0, grooveSetback_mm10: 0 },
      kromkaByRole: {
        ...KROMKA_CENSUS,
        plinth: BARE, // A7 — real plinth is bare here (the census aggregate says never bare)
      },
    },
  },
};

/** A deliberately different workshop — proves profile-swap purity (DB/27 §5b ④). */
export const OTHER_SHOP_PROFILE: ConstructionProfile = {
  profileId: "other_shop",
  name: "Другой цех (для проверки чистоты профиля)",
  material: { carcass_mm10: 180, back_mm10: 40, front_mm10: 180 },
  kromka: { slots: { K1: { thickness_mm10: 20 }, K2: { thickness_mm10: 4 } } },
  grain: "L",
  defaults: {
    ...DEFAULTS,
    bottomPlacement: "vkladnoe",
    topStyle: "stretchers",
    back: { treatment: "overlay", grooveWidth_mm10: 0, grooveDepth_mm10: 0, grooveSetback_mm10: 0 },
    backZone_mm10: 40,
    shelfSetback_mm10: 200,
    plinth: { style: "strip", height_mm10: 1000, placement: "under" },
  },
  byType: {},
};
