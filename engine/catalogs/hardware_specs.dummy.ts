// Layer 0 — hardware catalog DATA (dummy spec). A plain TypeScript data module, NOT logic.
//
// WHY .ts and not .json: the app bundles the engine through Metro (Expo web/native), and Metro
// cannot parse the `import ... with { type: "json" }` attribute that `module: NodeNext` forces on
// a `.json` import. Holding the same data in a `.ts` const removes that attribute at the root, so
// the drilling + SWJ008-export path (cnc.ts → applyDrilling → this catalog) can be bundled by the
// app (blocker E1). Node/vitest/tsc all import a plain `.ts` module with no attribute too.
//
// THE ONE RULE (15_PRIMITIVES_STEP2.md): tomorrow's verified factory values slot in by editing
// THIS data file only — never the primitive functions. `verified:false` entries stay provisional
// until confirmed against a factory datasheet/output; `verified:true` are grounded in golden files.

/**
 * DUMMY SPEC — placeholder values. Every entry has verified:false until confirmed against a
 * factory datasheet/output. Primitives read ONLY from this object. No drilling number is ever a
 * literal in code. Units: mm (the engine converts to mm10 integers internally).
 */
export const hardwareSpecRaw = {
  _README:
    "DUMMY SPEC — placeholder values. Every entry has verified:false until confirmed against factory datasheet/output. Primitives read ONLY from this file. No drilling number is ever a literal in code. Replace values after the factory visit; do not touch the primitive functions.",
  _units: "All dimensions in mm (the engine converts to mm10 integers internally).",
  _extends:
    "Copied from CORE 2/hardware_specs.dummy.json. Fields marked ADDED were not in the original dummy but are structurally required by a primitive; the doc's 'data to bring back' lists them. They carry placeholder values and verified:false.",

  hinges: {
    DUMMY_CUP_110: {
      brand:
        "TBD — SKU/brand still unknown; drilling pattern verified against factory door export",
      verified: true,
      source: "Example sets/prop-2/SHKOF ORTA CHAP ESHIK_7_1.XML (golden fixture, dump 2026-06-12)",
      grade: "manufacturing",
      cup: {
        diameter: 35,
        depth: 13,
        comment:
          "PROVEN: Ø35.000 × 13.000 on Face 5, ×94 across the dump — research estimate 13mm was right",
      },
      cupCenterFromDoorEdge: 21.5,
      comment_offset:
        "PROVEN: 21.5mm (research said 22.5 — WRONG). prop-0 doors show float noise 21.496/21.504 of the same value. Overlay dependence still unknown.",
      satelliteMarks: {
        count: 2,
        diameter: 3,
        depth: 1,
        alongFromCupCenter: 26,
        beyondCupFromEdge: 5.5,
        comment:
          "PROVEN: the factory does NOT drill wing screws (research claimed Ø8×11 at ±24 — WRONG twice). It pricks 2× Ø3×1 marks per cup at cupX±26, 5.5mm beyond the cup centre (Y=27 for cups at Y=21.5). NOTE: the 4 prop-0 SHK ESHIK doors have cups with NO marks at all — possibly a different hinge SKU or operator setting; ask the constructor.",
      },
    },
  },

  connectors: {
    DUMMY_RASTEX_15: {
      brand: "TBD (Häfele Rastex 15 / Minifix 15 class)",
      verified: false,
      source: "research-estimate CORRECTED against factory files; CONFIRM at factory",
      camSeat: {
        face: "A_or_B",
        diameter: 15,
        depth: 12.5,
        comment_depth:
          "FACTORY FILES show 11.0 and 12.5 — NOT the 15.7 the research doc claimed. Two values seen; confirm which connector uses which.",
        fromMatingEdge: 20,
        comment_fromMatingEdge:
          "ADDED — placeholder guess. Distance of the Ø15 cam-seat centre from the mating edge, on the face. Factory ORTA_BAK shows ~34mm; CONFIRM.",
      },
      dowelHole: {
        edge: true,
        diameter: 8,
        depth: 34,
        comment_depth:
          "factory edge Ø8 holes drill 34mm deep; face Ø8 drill 11mm — depth depends on operation context",
      },
    },
  },

  shelfPins: {
    DUMMY_PIN_5: {
      brand: "TBD",
      verified: true,
      source:
        "Ø5 × 11mm + 91.5mm setback confirmed against tests/golden/xml/ORTA_BAK_6_1.XML (Face5 shelf pins match generated pattern exactly). Face6 mirror + multi-panel broadening = S3-E7.",
      diameter: 5,
      depth: 11,
      comment_depth: "factory files confirm Ø5 face holes drill 11mm",
    },
  },

  system32: {
    verified: true,
    source:
      "shelf-pin setbacks (91.5mm) confirmed against ORTA_BAK_6_1.XML; pitch=32 is the System-32 standard. firstHoleOffset is NOT used by shelfPinPattern (kept for reference, unconfirmed).",
    verticalPitch: 32,
    firstHoleOffset: 37,
    comment_firstOffset:
      "research says 37mm from top/bottom edge; factory files show Ø4.5 construction holes at Y=32/64 and various — CONFIRM the row origin convention",
    frontRowSetback: 91.5,
    backRowSetback: 91.5,
    comment_rowSetbacks:
      "GROUNDED from factory file tests/golden/xml/ORTA_BAK_6_1.XML: Ø5 shelf-pin rows sit 91.5mm from each Y edge (Face5 Y=91.5/411.5 on a 503-wide panel → 91.5 front, 503−411.5=91.5 back). Was a 37mm placeholder. verified:false kept until full S3-E7 factory sign-off (front/back confirmed separately, plus the Face6 mirror).",
  },
} as const;
