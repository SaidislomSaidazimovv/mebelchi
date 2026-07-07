# HANDOVER 04 — Saidislom · Construction Mode build plan (test-gated)

**For:** Saidislom, continuing HIS OWN live build (the Vercel deploy of July 3–7).
**Spec:** every step references `CONSTRUCTION_FRAME_v4.md` (the contract). If code and v4 disagree — stop, raise it, don't improvise.
**Why this format:** previous handovers caused struggle because steps were vague and nothing verified them. Here every step ends with a **GATE** — a concrete test that must pass before the next step starts. No gate, no next step. One commit per step.

---

## Rules (read once)

1. **One step at a time, in order.** Steps are sized ~0.5–2 days each.
2. **The gate is the definition of done.** "It looks right" doesn't count; the gate passing counts.
3. **Never edit the engine's golden tests** (`tests/golden/`). They are the safety net. If a step breaks them, the step is wrong, not the test.
4. **Commit after every green gate** with the step number in the message (`step-3: selection modes`).
5. **Device check:** any gate marked 📱 must also be run on the Redmi over LAN, not only desktop Chrome.
6. **Founder fixtures:** the images in `UI Examples liked/TAs/` are **behavior-normative** (v4 §12): the interaction shown must exist; the visual styling is free. Steps 3, 4, 4b, 6 each reference their fixture — open it before building.

---

## Step 0 — Repo unification (foundation, do first)

The project currently lives in three places: the engine repo (`Mebelchi`), Said's fork (`Mebelchi Lajune`, has `packages/schema` + `packages/pricing` + a working app), and your own build (Vercel). **Your build is canonical for the UI going forward.**

Do:
- Bring into YOUR repo: the root `engine/` + `tests/` + `catalog/` (unchanged, with all golden fixtures), and `packages/schema` + `packages/pricing` from `Mebelchi Lajune` (they are clean and tested — don't rewrite them).
- Push everything to one git remote that Oppoq can clone. **This is currently impossible for anyone else — fix it first.**

**GATE 0:** on a fresh clone: `npm install && npm test` → engine golden suite green (19+ tests) AND `packages/pricing` tests green (incl. the 767 794 UZS snapshot total). Oppoq confirms he can clone and run it.

---

## Step 1 — Terminology + data model (v4 §1, §3, §4)

Do:
- Rename code entities to the standard ladder: **Part / Component / Block / Furniture / Space / Line**.
- Add the variable system to the model: `MaterialVar {id, label:'A'|'B'|…, role:'fasad'|'korpus'|'orqa'|custom, sku, thickness, color}`, `KromkaVar {id, label:'K1'…, sku, thickness, pattern, color}`, `JointProfile`. Parts reference variable IDs, never concrete materials/thicknesses.
- Add `DivisionRule = Fixed(mm) | Ratio(weight) | Locked(componentId) | Flex` on every Line.
- Project save/load (JSON) round-trips all of it.

**GATE 1:** `tsc` clean; a unit test creates a Furniture with all 4 rule types + 3 material vars + 2 kromka vars, saves → loads → deep-equal. Changing MaterialVar B's thickness 16→18 changes the derived geometry of every B-part in one assertion.

---

## Step 2 — The constraint solver ("acts like a table", v4 §2, §4)

Do:
- Implement resize-resolve: pulling any border (Furniture, Block, Space) re-solves the chain — Fixed stays, Locked stays, Ratio shares, Flex absorbs. No gaps possible.
- Amber (non-blocking) warning when nothing can absorb.

**GATE 2:** unit tests: (a) Furniture H 2100→2400 with a Locked sled 180 → sled still 180, shelf ratios preserved to <1mm; (b) all-Fixed column + resize → warning fires, geometry clamps; (c) 📱 drag the top border on the Redmi — live reflow, no gap ever visible.

---

## Step 3 — Two selection modes + info card (v4 §5)

Do:
- Permanent left-rail toggles: **▢ Space-select / ◇ Part-select**.
- Part-select: drag=move (distance line + mm), 4 side-handles=resize (2-axis, magnetic), no Move/Resize buttons. Numeric on tap of any readout.
- Info card **per the fixture** `TAs/info.png`: vertical material color bar before the name (multi-segment if several materials), component-accent name, 2-axis dims + material chip, state line, «⋯» menu (Duplicate·Block·Hide·Rename·Show hierarchy·Save as·Delete·Ungroup·Rotate).
- Fixed top-center readout strip during any drag.

**GATE 3:** 📱 scripted on-device checklist (10 taps, filmed once): every tap lands per mode; readout never hidden by the hand; a Component instance shows the accent name; ⋯ menu items all fire.

---

## Step 4 — Add-by-selection + ratio flow (v4 §4)

Do:
- Space-select toolset: «Полка · Стойка · Ящик · Дверь». Select space → tool → tap positions → thing appears.
- One shelf = plain Part. Shelf row = Component + Ratio rule; editing the rule reflows all; per-shelf detach via Ungroup (✂ badge).
- **Ratio pill-row editor per the fixture** `TAs/shelf adding ratios.png`: value pills + divider bars + `+` pill + dashed new-zone slot; long-press a pill → Fixed/Ratio/Locked picker (v4 §4).
- Lines editable forever (tap a Line → drag or type), independent per Space.

**GATE 4:** E2E test (playwright or the existing E2E harness): build the fixture wardrobe — 2 verticals, shelf row 1:1:0.6, one sled, one door — in ≤ 25 interactions; then change the ratio to 1:1:1 **through the pill row** and assert all three shelves moved; detach one and assert only it moves after.

---

## Step 4b — Part shaping ops: corner rounding + cutout (v4 §12.1–12.3)

The founder's own fixtures — treat the interaction as law.

Do:
- **Corner rounding** (`TAs/making round 00/01/03…png`): select Part → `+` chips on 4 corners → tap → radius pill (numeric ✎) + drag handle + live preview → **chain toggle binds all 4** (×4 badge) / unlink for per-corner → ✓ confirm. Op is a deletable object.
- **Cutout** (`TAs/cutting and making hole….png`): «Вырез» tool → rect (+circle) preset → red size pills, grey **lockable 🔒 offset pills** to each edge, drag tabs, center-snap. Locked offsets survive panel resize. Min-web-width validation → amber.
- **Units chip cm⇄mm** in the top bar (display-only; engine stays mm10).
- **L8 (emitted, not shown):** rounded corners and cutouts appear as true contours in the cut list/DXF; kromka meters follow the arc.

**GATE 4b:** unit: rounding a 600×400 top with r=15 linked-×4 → cut-list contour has 4 arcs, kromka length = perimeter with arcs (hand-checked value); cutout with locked 60mm offset, then resize the panel +200 → offset still 60. 📱 on Redmi: full round-and-cutout flow by touch, pills never covered by the finger (readout strip). Export DXF → open it → contours present.

---

## Step 5 — Materials view + slot binding (v4 §3, §7)

Do:
- Materials view: semi-transparent tinting by variable color; filter "only material X"; tap → name/component/material always answered.
- **Slot-binding on insert** (v4 §3.2): inserting a library Component with an unknown role prompts map-or-create; no silent 4th/5th material ever appears.
- SWJ008 material attribute comes from the resolved variable (already partly shipped — verify path).

**GATE 5:** insert a test Component carrying a foreign role → prompt appears; map to B → project still has exactly 3 material vars (unit-assert). Export SWJ008 → material attr matches the mapped decor. 📱 Materials view toggles under 100ms on Redmi.

---

## Step 6 — Kromka (Jiyak) mode + view (v4 §8.1)

Do:
- **Paint metaphor per the fixture** `TAs/kromka mode.png`: K-variable pills (with color swatches) at the bottom; tappable **balls on each edge** of the selected part; pick pill → tap balls to paint. Batch apply on multi-select. Kromka view tinting.
- Cut list emits kromka meters per K-slot per part (L8: emitted, not implied) — including arc edges from Step 4b.

**GATE 6:** assign K1 to 3 visible edges + K2 to 1 via the pill+ball flow → passport/cut list shows exactly those meters (hand-checked fixture number in a unit test); edge-ball colors match the data 1:1; a rounded corner's kromka is arc-length, not chord.

---

## Step 7 — Joints mode (v4 §8.2) — the big one, split in three

**7a — Joint profile + auto-resolution:** JointProfile variable (cam SKU/depth, dowel, System-32 pitch+setbacks, min-margins, top/bottom panel patterns); engine places holes per profile.
**GATE 7a:** generated holes on the fixture cabinet semantically match the factory golden panels (reuse the existing proof-test machinery; unverified fields stay `it.fails` per ENGINE_README convention).

**7b — Interactive rule editor:** each rule rendered as a live diagram (drag min-margin slider → holes move in real time on a sample panel).
**GATE 7b:** 📱 change System-32 setback in the editor → every affected panel's holes update in the 3D/2D views without reload; the value round-trips through save/load.

**7c — Local override + warnings:** any hole/joint selectable & movable; per-sled hole settings; rule-breaking edit → amber warning naming the rule; export gate requires explicit override acknowledgment.
**GATE 7c:** move a cam inside the min-margin → amber appears with rule text; export blocked until «master's override» is ticked; the override is recorded in the export provenance.

---

## Step 8 — Views completion (v4 §7)

Do: Frame view (kromka as K-patterns, progressive-zoom dimension detail), No-facade, X-ray, filter lenses. Views never mutate the model.

**GATE 8:** toggling all views in sequence leaves the project JSON byte-identical (assert); 📱 Frame view at 3 zoom levels shows the imos-style increasing dimension density; screenshots of each view archived in the repo (`docs/views/`).

---

## Step 9 — Application mode + purpose tags (v4 §8.4)

Do: purpose tags on Spaces (incl. **boiler**), low-poly ghost props library (10–15 silhouettes), toggle → furniture near-transparent + contents visible. Boiler tag attaches min-clearance constraints.

**GATE 9:** 📱 tag a space "boiler" → boiler silhouette + clearance check appear; shrink the space below clearance → amber warning. Client-demo test: from Building mode, Application toggle in ≤ 2 taps.

---

## Step 10 — Libraries discipline (v4 §8.5)

Do: Blocks/Components/Accessories libraries with computed auto-categories; «Save as → my library» from any selection; all inserts go through slot binding (step 5).

**GATE 10:** save a nested sled-in-sled as a Component → reinsert into a fresh project with different material vars → binds cleanly, zero stray variables; auto-category assigns it under the right group without manual filing.

---

## Step 11 — Building mode polish (client flow, v4 §2)

Do: border-resize UX on the whole Furniture, premade swapping, Application + decor in front of client, approve/lock step (price snapshot per `PRICING_AND_SCHEMA.md`).

**GATE 11:** 📱 timed run on the Redmi: empty room → placed blocks → boiler shown → decor picked → approved with locked quote in **≤ 8 minutes** (the strategic memo's demo bar), performed by someone who didn't build the app.

---

## Step 12 — Blocker ledger sweep

Walk `CONSTRUCTION_FRAME_v4.md` §12: report the true status of #1 (L-corner), #2 (Merge), #7 (step-aware mounting), #10–13 (verify machining *emitted*, not shown) against your build. Close or schedule each — in writing, in the ledger.

**GATE 12:** updated ledger committed; every 🔴 has either a closing commit hash or a named next step. Nothing silently dropped.

---

## Progress tracker

- [ ] 0 · One repo, tests green on fresh clone
- [ ] 1 · Terms + variables + division rules in the model
- [ ] 2 · Table-law constraint solver
- [ ] 3 · Two selection modes + info card
- [ ] 4 · Add-by-selection + ratios (pill-row editor)
- [ ] 4b · Corner rounding + cutouts + units toggle
- [ ] 5 · Materials view + slot binding
- [ ] 6 · Kromka mode
- [ ] 7 · Joints (7a auto / 7b rule editor / 7c overrides)
- [ ] 8 · Views complete
- [ ] 9 · Application mode + boiler
- [ ] 10 · Libraries
- [ ] 11 · Building mode + 8-minute demo
- [ ] 12 · Ledger sweep

**Start with Step 0 today** — nothing else is possible for the team until the repo is clonable.
