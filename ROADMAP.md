# MEBELCHI — Construction Mode Roadmap

Full step-by-step build plan, distilled from **`CONSTRUCTION_FRAME_v4.md`** (the spec/contract) and
**`HANDOVER_04_SAIDISLOM.md`** (the test-gated build order). This continues Saidislom's July build
(`Mebelchi-Bajarilgan-ishlar.pdf`). Founder interaction fixtures live in [`docs/fixtures/`](docs/fixtures).

**Ground rule (v4 §10):** most of the July build is already shipped (3D, 2D drawing, SWJ008/CNC,
materials, holes, render modes, block library). The genuinely NEW surface is six systems:
**variables + slot-binding (§3), the division-rule solver (§4), two selection modes (§5),
Kromka/Joints/Application focus modes (§8), library discipline (§8.5), corner-rounding + cutout (§12).**

**Rules:** one step at a time, in order · each step ends with a **GATE** (a concrete test that must
pass) · one commit per green gate · 📱 gates run on the Redmi over LAN, not only desktop · fixtures in
`docs/fixtures/` are behavior-normative (build the interaction, styling is free).

Legend: ✅ done · 🆕 new build · ⚠️ large (split into pieces) · 📷 needs a fixture · 🏭 needs factory data.

---

## PHASE A — Foundation

### Step 0 · Repo unification ✅ DONE
- **Does:** all code in one repo; a fresh clone runs in a single `npm install && npm test`.
- **Result:** anyone (founder/team) clones and runs in one command.
- **Status:** ✅ shipped — npm workspaces added, joint_extractor skips when python absent, `tools/`
  committed; fresh clone → 424 tests green. Public repo.
- **Gate 0:** fresh clone → `npm install && npm test` green (engine golden + no failures). ✅

### Step 1 · Terminology + variables + division rules 🆕
- **Does:** rename code to the standard ladder **Part / Component / Block / Furniture / Space / Line**;
  add **Material variables** (A·Fasad / B·Korpus / C·Orqa — each carries decor, thickness, color),
  **Kromka (Jiyak) variables** (K1/K2), a **Joint profile**; put a **DivisionRule
  (Fixed / Ratio / Locked / Flex)** on every Line. Parts reference variable IDs, never raw values.
- **Result:** change material B's thickness 16→18 → every B-part's geometry reflows automatically;
  every division line carries its own rule; save/load round-trips it all.
- **Gate 1:** `tsc` clean; a Furniture with all 4 rule types + 3 material vars + 2 kromka vars saves →
  loads → deep-equal; changing a MaterialVar thickness changes the derived geometry in one assertion.

### Step 2 · Constraint solver — "acts like a table" 🆕 ⚠️
- **Does:** pulling any border (Furniture / Block / Space) re-solves the chain — Fixed stays, Locked
  stays, Ratio shares, Flex absorbs the remainder. Gaps are impossible; amber warning if nothing absorbs.
- **Result:** stretch the whole cabinet by its outer border and everything inside reflows
  proportionally — never a gap.
- **Gate 2:** H 2100→2400 with a Locked sled 180 → sled still 180, shelf ratios preserved <1mm;
  all-Fixed column + resize → warning; 📱 drag the top border → live reflow, no gap ever.

---

## PHASE B — Interaction (the master's core loop)

### Step 3 · Two selection modes + info card 🆕 📷 `03-info-card.jpg`
- **Does:** permanent **▢ Space-select** (add into empty volumes) / **◇ Part-select** (edit parts).
  No Move/Resize buttons — drag = move (distance line + mm), side-handles = 2-axis resize (magnetic).
  Info card: material color bar + component-accent name + 2-axis dims + «⋯» menu; a fixed top-center
  readout during any drag.
- **Result:** tap empty space → add; tap a part → move/resize it directly; tapping anything always
  answers name · component · material.
- **Gate 3:** 📱 scripted 10-tap on-device checklist — every tap lands per mode, readout never hidden.

### Step 4 · Add-by-selection + ratios 🆕 📷 `04-shelf-ratios.jpg`
- **Does:** Space-select toolset «Полка · Стойка · Ящик · Дверь» → tap positions. One shelf = a plain
  Part; a shelf **row** = one Component + Ratio rule (edit the rule → all reflow; Ungroup ✂ to detach
  one). The **ratio pill-row editor** (value pills + dividers + `+` + dashed slot; long-press a pill →
  Fixed/Ratio/Locked). Lines editable forever.
- **Result:** add shelves by tapping; set `1:1:0.6`; change the ratio → all shelves move together;
  detach one to size it alone.
- **Gate 4:** E2E — build the fixture wardrobe (2 verticals, shelf row 1:1:0.6, one sled, one door) in
  ≤ 25 interactions; change the ratio to 1:1:1 via the pill row → all three shelves move; detach one.

### Step 4b · Corner rounding + cutout 🆕 📷 `04b-round-00/01/03`, `04b-cutout`
- **Does:** **corner rounding** — `+` chips on 4 corners → radius pill (numeric ✎) + drag + preview →
  chain toggle binds all 4 (×4) or per-corner → ✓; **cutout** (sink / hob / boiler) — size pills +
  **lockable 🔒 offset pills** per edge + shape presets + center-snap; **cm⇄mm** units toggle. Both
  emit real CNC contours (cut list + DXF), kromka follows the arc.
- **Result:** round a panel's corners; cut a sink/boiler aperture whose offsets survive resize; the
  cut list/DXF carries the true outline.
- **Gate 4b:** unit — round r=15 linked-×4 → 4 arcs, kromka = arc perimeter; cutout locked 60mm offset,
  resize panel +200 → offset still 60; 📱 full round+cutout by touch; DXF has the contours.

---

## PHASE C — Materials & edges

### Step 5 · Materials view + slot binding 🆕
- **Does:** materials view (semi-transparent tint by variable color; "only material X" filter);
  **slot-binding on insert** — a library Component declares roles, not materials; an unknown role
  prompts map-or-create (never a silent 4th/5th material). SWJ008 material from the resolved variable.
- **Result:** see everything by material; inserting library parts never pollutes the project's
  material list.
- **Gate 5:** insert a foreign-role component → prompt → map to B → project still has exactly 3
  material vars; SWJ008 material attr matches the mapped decor.

### Step 6 · Kromka (Jiyak) mode 🆕 📷 `06-kromka-mode.jpg`
- **Does:** the **paint metaphor** — K-variable pills at the bottom (White 1 / Maple …) + tappable
  **balls on each edge**; pick a pill → tap edges to paint; batch on multi-select. Cut list emits real
  kromka meters per edge (incl. arc edges from Step 4b).
- **Result:** "paint" edge-banding per edge by tapping; the cut list shows exact jiyak meters.
- **Gate 6:** assign K1 to 3 edges + K2 to 1 via the pill+ball flow → cut list shows exactly those
  meters; a rounded corner's kromka is arc-length.

---

## PHASE D — Manufacturing

### Step 7 · Joints mode 🆕 ⚠️ 🏭 (3 layers)
- **7a — profile + auto-resolution:** a JointProfile (cam SKU/depth, dowel, System-32 pitch+setbacks,
  min-margins, top/bottom patterns); the engine auto-places holes.
- **7b — interactive rule editor:** each rule a live diagram — drag a min-margin/interval slider →
  holes move in real time on a sample panel.
- **7c — local override + warnings:** any hole selectable/movable; a rule-breaking edit → amber warning
  naming the rule; export gated by an explicit "master's override".
- **Result:** the workshop's drilling rules become a visual editor; holes auto-place; the master
  overrides sovereignly, the file stays safe.
- **Gate 7a/b/c:** generated holes match the factory golden panels; 📱 change a setback → holes update
  live; move a cam inside the min-margin → amber + export blocked until override ticked.
- **Needs:** factory rule data (`FACTORY_CHECKLIST.md` — System-32 setbacks, cam SKU↔depth, hole classes).

---

## PHASE E — Views & the client

### Step 8 · Views completion 🆕
- **Does:** Frame view (kromka as K-patterns, angled-shelf true edges, **progressive-zoom dimension
  detail** — imos-style), No-facade, X-ray, filter lenses. Views never mutate the model.
- **Result:** an imos-like frame view whose dimensions get more detailed as you zoom in.
- **Gate 8:** toggling all views leaves the project JSON byte-identical; 📱 Frame view at 3 zoom levels
  shows increasing dimension density.

### Step 9 · Application mode + purpose tags 🆕
- **Does:** purpose tags on Spaces (incl. **boiler**), a low-poly ghost-props library (10–20
  silhouettes), toggle → furniture near-transparent + contents visible. Boiler tag attaches
  min-clearance constraints.
- **Result:** show the client what goes inside — dishes, clothes, and especially the **wall boiler
  hidden in a cabinet** (a top reason Uzbek clients order custom kitchens).
- **Gate 9:** 📱 tag a space "boiler" → boiler silhouette + clearance check; shrink below clearance →
  amber; from Building mode, Application toggle in ≤ 2 taps.

### Step 11 · Building-mode polish (client flow) 🆕
- **Does:** border-resize the whole Furniture, swap premades, Application + decor in front of the
  client, approve/lock step with a price snapshot.
- **Result:** the client demo — empty room → placed blocks → boiler shown → decor picked → approved
  with a locked quote.
- **Gate 11:** 📱 timed run by someone who didn't build the app: empty room → approved locked quote in
  ≤ 8 minutes.

---

## PHASE F — Discipline

### Step 10 · Libraries discipline 🆕
- **Does:** Blocks / Components / Accessories libraries with **computed auto-categories**; «Save as →
  my library» from any selection; every insert goes through slot binding (Step 5).
- **Result:** organized libraries; save any selection and reinsert cleanly into any project, zero stray
  variables.
- **Gate 10:** save a nested sled-in-sled as a Component → reinsert into a fresh project with different
  material vars → binds cleanly, auto-categorized.

### Step 12 · Blocker ledger sweep 🆕
- **Does:** walk v4 §12/§14 blockers (L-corner, Merge, step-aware mounting, glass rebate, hinge-offset
  revalidation, …) — report each against the live build, close or schedule it in writing.
- **Result:** nothing silently dropped; every 🔴 has a closing commit or a named next step.
- **Gate 12:** updated ledger committed; every open blocker has a hash or a next step.

---

## Order & summary

| Phase | Steps | Fixture | Large / needs data |
|---|---|---|---|
| A · Foundation | 0 ✅ · 1 · 2 | — | Step 2 ⚠️ |
| B · Interaction | 3 · 4 · 4b | ✅ all 4 in `docs/fixtures/` | — |
| C · Materials & edges | 5 · 6 | ✅ kromka | — |
| D · Manufacturing | 7 | — | Step 7 ⚠️ 🏭 |
| E · Views & client | 8 · 9 · 11 | — | — |
| F · Discipline | 10 · 12 | — | — |

**Build order:** `1 → 2` (foundation) → `3 → 4 → 4b` (fixtures ready) → `5 → 6` → `7` → `8 → 9 → 11`
→ `10 → 12`. **Step 2 and Step 7 are large** — split into sub-tasks when reached.

## Progress tracker
- [x] 0 · One repo, tests green on a fresh clone
- [ ] 1 · Terms + variables + division rules in the model
- [ ] 2 · Table-law constraint solver
- [ ] 3 · Two selection modes + info card
- [ ] 4 · Add-by-selection + ratios (pill-row editor)
- [ ] 4b · Corner rounding + cutouts + units toggle
- [ ] 5 · Materials view + slot binding
- [ ] 6 · Kromka (Jiyak) mode
- [ ] 7 · Joints (7a auto / 7b rule editor / 7c overrides)
- [ ] 8 · Views complete
- [ ] 9 · Application mode + boiler
- [ ] 11 · Building mode + 8-minute demo
- [ ] 10 · Libraries
- [ ] 12 · Ledger sweep
