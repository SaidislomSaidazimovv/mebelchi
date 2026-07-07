# Factory Visit Checklist — Layer-1 Primitive Verification

## CLOSED by the dump (June 12) — hinge ground truth landed

The door golden fixture `SHKOF_ORTA_CHAP_ESHIK_7_1` (94 cups across 18 dump panels
agree) closed the doc-15 hinge rows. `hingeCupPattern` is **verified: true,
grade: manufacturing**; its proof test is now a hard gate.

| doc-15 ask | Answer from the file |
|---|---|
| Cup diameter, cup depth | **Ø35 × 13.0mm** — research estimate 13 was right |
| Cup centre from door edge ("E") | **21.5mm** — research said 22.5, WRONG |
| Mounting screw count/Ø/depth/spacing | **Not drilled at all.** 2× **Ø3×1 marking pricks** per cup at cupX ± 26mm, 5.5mm beyond the cup centre (research claimed Ø8×11 at ±24 — wrong twice) |
| Cup face | **Face 5** (engine Face A) |
| Hinge count/positions (observed, → Layer-2 rule data) | 2170mm door → 4 hinges; end cups 100mm from door ends, middles evenly spaced |

Still open on the hinge:
- **Brand/SKU** the shop buys (pattern verified, name unknown).
- **No-marks variant:** the 4 prop-0 `SHK ESHIK` doors carry 16 cups with ZERO Ø3 marks — different SKU or operator setting? Ask the constructor.
- Overlay (full/half/inset) dependence of the 21.5 offset.

## STILL OPEN for the dump visit (June 12)

1. ~~One folder per cabinet/project~~ — DONE, dump arrived grouped (prop-0/1/2).
2. **Hardware purchase list** — promotes/demotes core catalogue defaults (CORE_DOCTRINE R12).
3. **Ø15 cam seats: why two depths (11.0 vs 12.5mm)?** Dump says 12.5 is the standard (357×) and 11.0 is rare (4× in 1 panel) — confirm which SKU ↔ which depth.
4. **Quarter-millimetre coordinates**: dump shows sub-0.1mm on *structural* drills too (hinge middles at X=710.670, depths 34.003/34.005, Ø6×9.8 class) — the mm10→mm100 question is now backed by data; decide before the dump grows.
5. **22 UNIDENTIFIED hole classes** in `hole_classes.json` (Ø8×18 edge ×122, Ø16.5×12, Ø10×14, Ø6×9.8…) — walk the list with the constructor (doc 16 Source B).

---

Generated from the failing primitive proofs (`15_PRIMITIVES_STEP2.md`). Each row is a
spec value the dummy could not confirm. Bring back the number **and its source**
(datasheet photo / drilling card / Bazis export), enter it in
`engine/catalogs/hardware_specs.dummy.json`, flip `verified: true`, and the
corresponding proof test goes green automatically.

The primitive **functions are done and never need editing** — only the JSON.

## Precise field diffs (what the tests fail on today)

| Primitive | Spec field | Dummy value | Factory value (from current panels) | Status |
|---|---|---|---|---|
| `shelfPinPattern` | `system32.frontRowSetback` | 37 mm | **91.5 mm** (ORTA_BAK) | confirm front vs back separately |
| `shelfPinPattern` | `system32.backRowSetback` | 37 mm | **91.5 mm** (ORTA_BAK) | confirm |
| `rastex15Pattern` | `connectors.DUMMY_RASTEX_15.camSeat.fromMatingEdge` | 20 mm | **34 mm** (ORTA_BAK) | added field — confirm |
| ~~`hingeCupPattern`~~ | ~~*all*~~ | — | — | **CLOSED 2026-06-12** — verified against the door golden fixture (see top of file) |

Field diffs are also printed live by `npm test` (the `[checklist]` diagnostic tests):

```
shelfPinPattern UNVERIFIED diffs:  op#0.y: generated=370 real=915 ; op#1.y: generated=4660 real=4115
rastex15Pattern cam UNVERIFIED diffs:  op#0.x: generated=5180 real=5040 ; op#1.x: generated=5180 real=5040
```

## Already matching the factory (proven green today — do NOT re-measure)

- Ø5 shelf-pin **diameter + depth (11 mm)** — confirmed against ORTA_BAK.
- Ø15 cam-seat **diameter + depth (12.5 mm)** — confirmed against ORTA_BAK edge-3 cams.
- Ø8 edge-dowel **diameter + depth (34 mm) + Z = thickness/2** — fully matches ORTA_BAK.

## Data to bring back (from `15_PRIMITIVES_STEP2.md`)

**Hinge — need a real door panel export (this cabinet had none):**
- Cup diameter, cup depth, cup centre distance from door edge (overlay "E").
- Mounting screw count, diameter, depth, spacing from cup centre.
- Actual SKU bought (Boyard B-35H? Blum CLIP top? Hettich?).

**Rastex/Minifix cam connector:**
- Which connector explains Ø15 **11 mm** vs **12.5 mm** holes (two depths seen).
- Cam-seat distance from mating edge (factory shows 34 mm — confirm).
- The exact SKU on the shelf / purchase list.

**System 32:**
- First-hole offset from edge (research says 37 — factory shelf rows show 91.5; confirm origin convention).
- Confirm 32 mm pitch and the front-row / back-row setbacks separately.

**Exports:** one door + one drawer + one corner cabinet from Bazis → golden fixtures 4–6.
