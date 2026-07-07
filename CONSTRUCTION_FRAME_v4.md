# MEBELCHI — Construction Mode · Frame v4.1

**Supersedes:** `CONSTRUCTION_FRAME_v3.md`. Incorporates the founder's full Construction-UI input of 2026-07-07 (groups/components/variables, views×modes, kromka, joints, libraries, application mode), the founder's **UI fixtures** in `UI Examples liked/TAs/` (§13 — behavior-normative), and the July build reality (Saidislom's live Vercel build, `Mebelchi-Bajarilgan-ishlar.pdf`).
**What this is:** the complete interaction + data contract for the Construction part, with a standardized vocabulary, so the next build follows one document.
**What this is NOT:** not visual styling (colors/type come later), not the engine spec (that's `ENGINE_README.md` + CORE docs).
**Companion:** `HANDOVER_04_SAIDISLOM.md` (the step-by-step, test-gated build plan against this frame).

---

## 0 · What changed since v3

| Topic | v3 said | v4 says | Why |
|---|---|---|---|
| Thickness | L1: 16mm stock only; L6: height not a drag axis | **Thickness is a property of the Material variable** (LDSP 16 / MDF 18 / HDF 3…). Resize stays 2-axis (L6 survives). "16mm-only" is retired; doubling (32mm = 2×16 glued) survives as a build technique. | Founder 2026-07-07 + Saidislom already shipped per-part thickness. The law was about *not dragging thickness*, and that part stands. |
| Selection | Adaptive group model (§1 of v3) | Survives, extended by the **two permanent selection modes** (Space-select / Part-select, §5) and the **variable-slot binding** rule (§3). | Founder input. |
| Modes | One mode, stackable lenses (L7) | L7 survives, refined: **2 top modes** (Building / Construction) + **focus modes** inside Construction (Kromka, Joints, Accessories) + **views** as stackable lenses available everywhere. Modes set verbs; views set visibility. | Founder input. |
| Blockers | Ledger §9 | Ledger carried forward in §12 — nothing dropped. | META-B law. |

---

## 1 · TERMINOLOGY STANDARD (use these words everywhere — UI, code, docs)

The founder asked to fix the naming so we stop messing up. This table is the law. Code identifiers use the English column.

| EN (code) | RU (UI) | UZ (UI) | Definition |
|---|---|---|---|
| **Part** | Деталь | Bo'lak | One physical panel, cut from sheet. Has: material (via variable), kromka per edge (via variable), holes. The atom. |
| **Component** | Компонент | Komponent | A reusable, parametric assembly of Parts with its own internal variables — like a Photoshop *smart object*. Examples: sled (drawer box), shelf-set-with-ratio, glazed door, nested sled-in-sled. Instances stay linked; editing the component updates all instances; can be detached (ungrouped). Shown in the **component accent color** in info panels. |
| **Block** | Блок | Blok | One carcass unit (тумба/шкаф section) built of Parts + Components. What the room is furnished with; what the Blocks library stores. |
| **Furniture** (Project) | Мебель | Mebel | Everything in the project. In Building mode it behaves as one body ("like a table"). |
| **Space** | Пространство | Bo'shliq | An empty cell/volume between panels. Selectable. The target you add things *into*. |
| **Line** | Линия | Chiziq | A division line (horizontal or vertical) splitting a Space. First-class, draggable, carries a division rule (§4). |
| **Material variable** | Материал A/B/C | Material A/B/C | Global named material slot (§3). Carries: decor/SKU, **thickness**, price, and a **view color**. |
| **Kromka variable** | Кромка K1/K2 | **Jiyak** K1/K2 | Global edge-band slot (§3). Yes — Uzbek term is **jiyak**; use it in the UZ UI. |
| **Joint profile** | Профиль соединений | Birikma profili | Global rules for holes/joints (§8.2) — the workshop's way of drilling. |
| **Building mode** | Сборка | Yig'ish | Client-facing top mode: fast, lego-like, premades, approve. |
| **Construction mode** | Конструктор | Konstruktor | Master's top mode: precise, everything editable. |

Naming answer to your question: **Part → Component → Block → Furniture** is the correct 4-level ladder. "Several parts combined" = Component (if reusable/parametric) or just a *selection group* (if ad-hoc). Don't introduce a fifth word.

---

## 2 · THE TWO TOP MODES

**Purpose split (the founder's frame):**

1. **Building mode — in front of the client.** Goal: assemble a believable furniture fast from premade Blocks/Components, show Application view (what goes inside, incl. the boiler), show decor, get approval. Editing here is coarse: place blocks, stretch the whole Furniture by its borders, swap premades, pick materials.
2. **Construction mode — the actual construction.** Goal: the master models anything. Spaces, lines, ratios, kromka, joints, per-part everything.

**Building-mode resize law ("acts like a table"):** the Furniture resizes **by its outer borders**, never by moving one block and leaving a gap. Pulling the top border re-solves every Block's height through the constraint system (§4); locked Components (e.g., sleds) keep their height, flexible zones absorb the change. Gaps are impossible by construction; an intentional gap is an explicit *empty Block*.

**Mode × View law (L7, kept):** Modes change the toolset (verbs). Views change visibility/coloring (info). Views are available in *both* top modes; focus modes (§8) exist inside Construction.

---

## 3 · THE VARIABLES SYSTEM (the deep answer to "think deeper on this")

Everything the workshop repeats is a **global variable** with: a short name, a color, an icon, and per-project values.

**3.1 Material variables.** Project defines named slots — default three, extensible:
- **A · Fasad** (facade), **B · Korpus** (main/carcass), **C · Orqa** (back). D, E… allowed.
- Each slot = {decor/SKU, thickness, price/m², view color}. **Thickness travels with the material** — changing B from LDSP-16 to MDF-18 re-solves geometry everywhere (engine reflow), because parts reference the slot, not a number.
- Every Part references a slot, never a concrete material.

**3.2 The slot-binding rule (the "5th material mess" fix).** Components do **not** contain concrete materials. A Component declares **roles** (fasad/korpus/orqa/custom). On insert into a project, roles bind to the project's global slots (fasad→A, korpus→B, orqa→C). If a Component declares a role the project doesn't have (the "5th material"), the UI asks once: **map it to an existing slot, or create slot D** — never silently import a stray material. Same rule for kromka and joint profiles. This keeps a project's variable list clean no matter how many library components you insert.

**3.3 Kromka (jiyak) variables.** K1 (e.g., 2mm visible), K2 (0.4mm hidden), K3… Each = {band SKU, thickness, pattern (for Frame view), color (for Kromka view)}. Parts reference K-slots per edge (4 edges). No component may carry a private kromka — same binding rule.

**3.4 Joint/hole profile.** Yes — make holes global too (your question §"or it's too much"): **it's not too much, it's the same pattern.** One **Joint profile** per project (inherited from the workshop profile): cam SKU + seat depth, dowel spec, System-32 pitch + setbacks, min-margins, interval rules. Gets an icon + color like every variable. Per-joint overrides allowed with a warning (§8.2).

**3.5 The linked-shelf scenario (your test case).** Shelves placed as *one Component instance + ratio rule*: you drag one shelf → you are editing the **ratio rule**, all reflow together (that's the point). You want ONE shelf different → **ungroup** (detach) that instance first — explicit button, explicit ✂ badge — then it edits alone. Nobody is ever surprised, because the info card says which world you're in (v3 §1 adaptive model, unchanged).

---

## 4 · STRUCTURE MODEL: Lines, Ratios, Locks (the ratio system, thought deep)

A Block's interior is a recursive grid: **Space → split by Lines → child Spaces**. Top half split horizontally, bottom half split vertically — fine: each Space has its own independent split. **Lines are editable forever, like a table** — select any Line, drag it or type a number, at any time, regardless of how it was created.

**Every Line carries a division rule** — this is the whole ratio system in one enum:

| Rule | Meaning | Example |
|---|---|---|
| **Fixed (mm)** | absolute distance | plinth 100mm |
| **Ratio (weight)** | proportional share | shelves 1 : 1 : 0.6 |
| **Locked (component)** | dimension owned by the Component in the space | sled height 180mm — Building-mode resize can NOT change it |
| **Flex** | absorbs leftover | the hanging zone |

Resize (any level: Furniture border, Block, Space) = re-solve the constraint chain: Fixed stays, Locked stays, Ratio shares proportionally, Flex absorbs the remainder. If nothing can absorb → amber warning (non-blocking inside; hard gate only at export — the standing doctrine).

**Adding shelves (the flow you specified):** Space-select → tool «Полка» → tap each position where a shelf appears → then open the division rule and set precise ratio (`1:1:0.6`) or numbers. One shelf is added by hand; *rows of shelves* are one Component + Ratio rule. Same for verticals.

**The ratio editor widget (normative fixture: `TAs/shelf adding ratios.png`):** a horizontal **pill row** — one editable value pill per zone (`1 | 1 | 0.6`), thin divider bars between pills mirroring the physical Lines, a **`+` pill** that appends a zone, and a **dashed empty slot** showing where the new zone will land. Tap a pill → numpad; pills accept decimals; a pill can also be toggled to **Fixed (mm)** or **Locked** right there (long-press the pill → rule picker). The pill row *is* the division rule made visible.

**Nested sled (2-level SLED):** yes — a sled is a Component; its front can host another Space with its own inner sled. Components nest. The inner one binds to the same global variables (§3.2). Save the pair as one Component — that's the "make it easily and alter into component" path.

---

## 5 · SELECTION MODEL (answers "how better implement it?")

**Two permanent selection-mode buttons** (always visible in Construction, left rail):

- **▢ Space-select** — taps land on empty volumes. Toolset becomes *add*: «Полка · Стойка · Ящик (Sled) · Дверь». Select space → pick tool → tap where it goes.
- **◇ Part-select** — taps land on Parts/Components (adaptive group rule from v3 §1: unique part → itself; 2+ siblings → the type). Toolset becomes *edit*.

**No Move button, no Resize button** (your call, confirmed): in Part-select, drag = move (with live **distance line + mm readout**, magnetic snap); grab **one of the 4 side handles** = resize that side (2-axis only — thickness comes from the material, L6). Numeric entry: tap any readout → numpad. Rotate is rare → lives only in the selection card's «⋯» / two-finger-double-tap extra menu.

**The info card** (bottom sheet, compact):
- **Material color bar** before the name — a thin vertical bar in the part's material-variable color; a Component of several materials shows a striped multi-color bar.
- Name — in **component accent color** if it's a Component instance (smart-object convention), plain ink if a raw Part.
- Dimensions of the selection — **2 axes only** (the two that are editable); thickness shown as the material chip (`B · LDSP 16`).
- State line: «Уникальная деталь» / «Тип · 3 детали» / «✂ отвязана» (v3 card, kept).
- **«⋯» menu:** Duplicate · Block (lock) · Hide · Rename · Show hierarchy · Save as (component/block) · Delete. Plus Ungroup when a linked Component is selected, and Rotate.

**Readout law:** while dragging/resizing, the live numbers appear in a **fixed top-center readout strip** — never at the finger, never overlapped by the hand. (The floating chips near the object are secondary; the top strip is the guaranteed-visible truth.)

---

## 6 · GESTURES (sorted across the two modes — approved earlier, restated as law)

| Gesture | Building (client) | Construction |
|---|---|---|
| 1-finger drag on empty | orbit | orbit |
| 2-finger | zoom/pan | zoom/pan |
| Double-tap object | zoom-to-section + select frame; double-tap elsewhere = zoom back | same |
| Tap | select Block | select per active selection mode (§5) |
| Drag selected | move Block (snap) | move Part/Component (distance line + mm) |
| Side-handle drag | stretch Furniture borders (table law §2) | resize Part, 2-axis, magnetic |
| Long-press | — | multi-select |
| Long-press a bottom tool | opens its second-layer tools | same |
| Two-finger double-tap | — | extra menu (Rotate, ortho, snap settings) |

Top chrome: **zoom buttons + 3D nav-cube top-right** (fixed). Render style: imos translucent grey, red selection (refs in `UI Examples liked/3D itself`).

---

## 7 · VIEWS (stackable lenses — each changes info AND available tools)

Views are a dropdown/toggle group, available in both top modes. Confirmed set (all the ones you depicted):

| View | Shows | Tool change |
|---|---|---|
| **Realistic** | decors applied | default tools |
| **Materials** | every part **semi-transparent, tinted by its material variable's color** (A/B/C…) + filter "show only material X" | tap part → material info card; reassign slot |
| **Frame (каркас)** | wireframe like imos: edges as lines, **kromka drawn as per-K-slot patterns**, angled shelves' true edges, margins; **progressive zoom shows mm-accuracy dimensions** (imos-style: more zoom → more dimension detail) | line/edge editing |
| **No-facade** | fronts hidden | interior editing |
| **X-ray (transparent)** | all translucent + holes/joints visible | joint tap-through |
| **Kromka view** | each edge tinted by K-slot color; colored dots per side for quick read | kromka editing (§8.1) |
| **Hinges/Joints view** | only hardware + holes emphasized | §8.2 tools |
| **Application view** | furniture goes near-transparent; **contents appear** (§8.4) | content placement |
| **Filter lenses** | by material / only accessories / only components | — |

**Info-tap law (any view):** tapping any Part always answers three questions — **name · which Component it belongs to · which material it uses** — in the info card. "This is for to be sure."

---

## 8 · FOCUS MODES (inside Construction — tools change fully)

### 8.1 Kromka (Jiyak) mode
- **The paint metaphor (normative fixture: `TAs/kromka mode.png`):** at the bottom, a row of **K-variable pills** (K1 · K2 · none, each with its color swatch, like the White 1/Maple pills in the fixture); on the selected Part, a tappable **ball sits on each edge**. Pick a pill → tap edge balls to paint them; each ball takes the K-slot's color. The roller tool in the fixture = this mode's icon.
- Batch: select many parts (long-press) → apply the picked K-pill to all outer/inner edges at once.
- Quick-read: the edge balls double as **colored dots** (laconic, no text). Overall Kromka *view* (semi-transparent K-colors) is available from any mode for checking.
- Kromka is **global variables only** (§3.3): a component cannot smuggle in a third kromka — binding rule applies.
- Cut-list emission: every K-assignment emits real kromka meters per edge in the passport/cut list (L8: emitted, not implied).

### 8.2 Joints mode (yes — its own mode; it's a big deal)
Three layers, from global to local:

1. **Rules (the workshop's law).** An interactive **rule editor**: each rule (min edge margin, hole interval, System-32 pitch/setback, cams-per-length, top/bottom panel joint pattern) is shown as a **live diagram** — a sample panel where dragging the min-margin or interval slider **moves the holes in real time**. The master *sees* the rule, not a form. Rules make up the project's **Joint profile** (§3.4), inherited from the workshop profile.
2. **Auto-resolution.** The engine places joints per rules (doc-16 machinery). This is the default; the master does nothing.
3. **Local override.** In Joints mode, every joint/hole is selectable and movable; per-sled hole settings editable ("each selected sled → its holes"). Any edit that breaks a global rule shows an **amber warning with the rule named** («нарушает: мин. отступ 50мм») — non-blocking while editing, **hard-gated at export** with an explicit "master's override" acknowledge. Master stays sovereign; the file stays safe.

What I need to build the *rules content* (not the UI): the workshop answers still open in `FACTORY_CHECKLIST.md` — System-32 setbacks (37 vs 91.5), cam SKU ↔ seat depth, the 22 unidentified hole classes, and each master's preferred eccentric SKU (different masters use different ones → that's exactly why the Joint profile is a per-workshop variable).

### 8.3 Accessories mode
Only hardware & accessories are opaque/highlighted; carcass goes semi-transparent (same visual grammar as other focus modes). Add/replace from the Accessories library; each accessory carries its joint requirements (a hinge brings its cup pattern) which feed the Joints layer automatically.

### 8.4 Application mode (client-facing gold)
Toggle → furniture near-transparent, **contents appear**: plates, spoons/knives (tray), short/long dresses, shoes, appliances — and the **boiler**. Contents come from the Space's *purpose tag* (the §7-of-19_FUNCTION_MAP purpose system): tag a space "boiler" → a boiler model appears AND min-clearance constraints attach. Modeling answer: **don't model items realistically — use a small library of low-poly silhouette props** (10–20 items), gray/ghosted, one per purpose tag. They're communication, not CAD.
This is a selling feature, not decoration: *hiding the wall boiler is one of the top reasons Uzbek clients order custom kitchens* (no central heating; small apartments). Building mode must show it in one tap.

### 8.5 Libraries (be very wise here)
Three libraries, one discipline:
- **Blocks library** (~100 items already in Saidislom's build) — auto-grouped by: type (base/tall/upper/corner) × purpose (sink/hob/boiler/wardrobe…) × size class. Grouping is computed from block properties (auto-categories), not hand-sorted folders.
- **Components library** — sleds, shelf-sets, doors, nested assemblies. **Every entry stores roles, not materials** (§3.2) — the library can never pollute a project's variables. Auto-grouped by function.
- **Accessories library** — joints (per-master eccentric SKUs), hinges, slides, rods, lifts. Grouped by function × brand; workshop profile pins the master's defaults to the top.
- Personal saves: «Save as → my library» from any selection (the founder's standing requirement).

---

## 9 · TOOLBARS

- **Bottom main bar, 2-layer:** top-level tools per current mode; **long-press a tool → its inner layer slides up** (e.g., Move → numeric entry + current distance; Полка → ratio presets). Confirmed pattern from v6-3d.
- **Tools swap with mode/view** (§7/§8) — the bar is contextual, the *positions* are stable.
- **Left rail:** the two selection-mode buttons (§5) — permanent.
- **Top:** readout strip (center), zoom + nav-cube (right), mode switch Building/Construction (left).

---

## 10 · WHAT'S ALREADY TRUE IN CODE (so we don't respec what exists)

From the July build (Saidislom, per `Mebelchi-Bajarilgan-ishlar.pdf`): block library + free placement, carcass engine port with per-part thickness, 3D + exact panel picking, in-place editor with undo, spec/price/SWJ008 export, material catalog + per-part roles + decor pricing, component-tree panel (imos style), live W×H×D fields, numeric division + shelf count, dimension numbers on 3D, angled shelf + lip, room integration, 2D dimensioned drawings (front/top/section) with hole markers, render modes (realistic/wire/shadow), hybrid wardrobe → real panels, cam+dowel holes, E2E tests. **v4 is largely a formalization + extension of that trajectory** — the genuinely new build surface is: variables-with-binding (§3), division-rule system (§4), two selection modes (§5), Kromka/Joints/Application focus modes (§8), libraries discipline (§8.5).

---

## 11 · ANSWERED QUESTIONS (founder's inline asks, resolved)

| Question | Call |
|---|---|
| How to select/edit inside spaces? | Two permanent selection modes (§5). Move/resize implicit, no buttons. |
| One shelf vs many? | One by tap; rows via Component + Ratio rule (§4). |
| 2-level sled? | Yes — Components nest (§4). |
| Holes global — too much? | Not too much: Joint profile variable with icon+color, overridable with warning (§3.4, §8.2). |
| Top/bottom panel joint rules? | Part of the Joint profile rules set (§8.2.1). |
| Kromka = jiyak? | Yes. UZ UI uses **Jiyak**. |
| Naming ladder? | Part → Component → Block → Furniture (§1). |
| Mode split? | Building (client/lego/table-resize) + Construction (precise); focus modes inside Construction; views everywhere (§2, §7, §8). |
| Component info coloring? | Material color bar + component accent name + «⋯» menu (§5). |
| Locked dimensions? | Division rule **Locked** (§4) — sled heights survive Building-mode resize. |

---

## 12 · FOUNDER UI FIXTURES (`UI Examples liked/TAs/`) — behavior-normative

The founder authored/curated these seven images. **Law: the *behavior* in each fixture must be achieved; the *styling* is free** ("as is, not 1-to-1"). Every fixture has an owner section and a handover gate.

| Fixture | What it fixes as law | Spec § | Gate |
|---|---|---|---|
| `info.png` | Info pill: **multi-segment vertical material color bar** before the name (one segment per material in the selection) + name + ⋯ menu | §5 | G3 |
| `shelf adding ratios.png` | The **ratio pill-row editor** (value pills + dividers + `+` + dashed slot) | §4 | G4 |
| `kromka mode.png` | Kromka **paint metaphor**: K-pills at bottom + tappable **edge balls** on the part | §8.1 | G6 |
| `making round 00.png` | Corner ops enter via **`+` chips on each of the 4 corners** of a selected part | §12.1 | G4b |
| `making round 01.png` | Radius editing: **numeric pill (✎) + drag handle + live preview + green confirm**; ops deletable | §12.1 | G4b |
| `making round 03 binded 4 corners.png` | **Chain toggle binds all 4 corners** to one radius (×4 badge); unlink → per-corner values | §12.1 | G4b |
| `cutting and making hole info given in santimeters.png` | **Cutout op** with editable size pills + **lockable offset pills** from each edge + drag tabs + shape presets + center-snap; **units toggle (cm/mm)** in top bar | §12.2, §12.3 | G4b |

### 12.1 Corner rounding (amends L4)
v3's L4 ("rectangle outlines only in V1") is **amended**: **rounded corners ship in V1** — they are the founder's fixture, not a deferral candidate. Select a Part → corner `+` chips appear → tap one → radius pill (numeric, ✎) + drag handle, live preview → **chain icon links all 4** (one radius everywhere, ×4 badge) or unlinked per-corner values → ✓ confirm. The op is a first-class, deletable object on the part.
**L8 applies:** a rounded corner must *emit* — the cut list carries the true outline (CNC contour), and kromka meters are computed along the arc, not the chord. Free-form/arbitrary outlines beyond rounding remain deferred (ledger #4).

### 12.2 Cutout / aperture op (new — the boiler & sink tool)
Rectangular (V1: rect + circle presets) hole in a panel: select Part → «Вырез» → shape preset → the cutout appears with **red size pills** (editable) and **grey offset pills** to each panel edge, each pill **lockable 🔒** — a locked offset survives panel resize (the Locked rule of §4 applied at part level). Drag tabs on each cutout edge; center-snap button. Uses: sink, hob, ventilation, cable pass, **boiler pipes** (§8.4). **L8:** emitted as a real CNC contour in export, gated by min-web-width validation (cutout too close to an edge → amber).

### 12.3 Units display toggle
Top bar carries a **units chip (см ⇄ мм)** — display-only conversion; the engine stays mm10 internally. Masters quote in cm to clients and mm to the saw; both must read naturally.

---

## 13 · TRACEABILITY — every founder input → where it lives → which gate proves it

Audit of the full 2026-07-07 input (+ TAs fixtures). **Nothing is unassigned.**

| # | Founder input | Spec § | Gate |
|---|---|---|---|
| 1 | Two purposes: client showcase vs construction | §2 | G11 |
| 2 | Group + component, 2 levels; user creates any way | §1, §3 | G1, G10 |
| 3 | Shelves by ratio 1:1:0.6, as variable/component | §4 | G4 |
| 4 | ≥3 material colors (fasad/main/back), different colors | §3.1, §7 | G5 |
| 5 | Automatic grouping; 5th-material mess prevention | §3.2, §8.5 | G5, G10 |
| 6 | Global variables applying inside every component | §3 | G1, G5 |
| 7 | Change-one-shelf-others-don't scenario | §3.5 | G4 |
| 8 | Views change info AND tools | §7 | G8 |
| 9 | Tap any detail → name · component · material | §7 (info-tap law) | G3, G8 |
| 10 | Modes/views incl. materials, hinges, use/purpose | §7, §8 | G8, G9 |
| 11 | Split view vs mode | §2 (L7), §7/§8 | G8 |
| 12 | Frame view: angled-shelf edges, kromka patterns, margin | §7 Frame | G8 |
| 13 | imos-style progressive zoom → mm accuracy | §7 Frame | G8 |
| 14 | Tools change per view/mode; 2-level buttons | §9 | G3 |
| 15 | Material variables A/B/C + coloring, semi-transparent | §3.1, §7 | G5 |
| 16 | Info card: color bar, ⋯ menu (Duplicate·Block·Hide·Rename·Hierarchy·Save as·Delete) | §5 + fixture | G3 |
| 17 | Component name in accent color (smart object) | §5 | G3 |
| 18 | Space vs part selection — how? | §5 (two permanent modes) | G3 |
| 19 | Part dims shown — 2 axes only | §5 | G3 |
| 20 | Add one shelf; rest via ratio settings | §4 | G4 |
| 21 | Move/resize with no dedicated buttons | §5 | G3 |
| 22 | Size info above, never under fingers | §5 readout law | G3 |
| 23 | Ungroup shelves to edit sides separately | §3.5, §5 | G4 |
| 24 | Buttons on selection: rotate etc. | §5 ⋯ menu | G3 |
| 25 | Space tools: shelf/vertical/drawer/door; add by tapping places | §4, §5 | G4 |
| 26 | Lines editable forever, like a table | §4 | G4 |
| 27 | 2-level SLED (nested drawer) → component | §4 | G10 |
| 28 | Whole-furniture resize by borders, no gaps, like a table | §2 table law, §4 | G2 |
| 29 | 2-layer premades: Blocks + Components (naming fixed) | §1, §8.5 | G10 |
| 30 | Standard terms | §1 | G1 |
| 31 | Locked dimensions (sled height survives resize) | §4 Locked | G2 |
| 32 | Kromka mode: 4 sides, colored dots, global vars, per-part editing, jiyak | §8.1, §3.3 | G6 |
| 33 | Accessories mode (semi-transparent focus) | §8.3 | G8 |
| 34 | Libraries: blocks/components/accessories, auto-categories, no variable mess | §8.5 | G10 |
| 35 | Joints = separate mode; rules as interactive visuals; overrides + warnings; per-sled holes; global holes var + icon/color; top/bottom panel rules | §8.2, §3.4 | G7a–c |
| 36 | Application mode: transparent furniture + contents; **boiler insight** | §8.4 | G9 |
| 37 | Ratio pill editor UI | §4 + fixture | G4 |
| 38 | Corner rounding, linked 4 corners | §12.1 | G4b |
| 39 | Cutout with cm info + lockable offsets | §12.2, §12.3 | G4b |
| 40 | Kromka paint-balls UI | §8.1 + fixture | G6 |
| 41 | Gestures sorted across 2 modes (rotate hidden, magnetic resize, distance line, numeric move, layers panel, 2-layer bottom bar, zoom+cube top, imos render styles, line arrows) | §6, §9 | G3, G8 |

---

## 14 · BLOCKER LEDGER (carried — nothing drops)

| # | Item | Status | Note |
|---|---|---|---|
| 1 | **L-corner footprint** | 🔴 OPEN | Still the top structural blocker (L-wardrobe/kitchen). Verify whether Saidislom's July build closed it — the PDF doesn't name it. |
| 2 | **Merge operation** | 🔴 OPEN | Same — verify against the live build. |
| 3 | Per-leg/per-block depth | 🟡 PARTIAL | "Order depth honored in cut/price/DXF" (Jul 5) suggests progress — verify. |
| 4 | Non-rect outlines | 🟡 AMENDED | Angled shelf + lip shipped (Jul 6); **rounded corners now V1 per §12.1 (founder fixture)**; free-form outlines still deferred. |
| 5 | Worktop cross-block | ⏸ BACKLOG | |
| 6 | Corner fillers | ⏸ BACKLOG | |
| 7 | Step-aware mounting | 🔴 OPEN | |
| 8 | Per-face material roles | 🟡 PARTIAL | per-part roles shipped Jul 4; per-*face* still open (island case). |
| 9 | Span-needs-support | 🟡 PARTIAL | load-bearing + warnings shipped Jul 4. |
| 10–13 | Glass rebate / band transition / junction editor / hinge-offset revalidation | 🟡 | Glazed door shipped (Jul 4–5) — **verify machining is emitted, not shown** (L8). |
| 14 | Group intent ("keep linked / each differs") | 🟡 | Now folded into §3.5/§5 — needs build + founder gut-check. |
| 15 | Undo/redo journaled | 🟢 partial | Undo shipped Jul 4; redo + full journal to verify. |
| **16** | **Variable slot-binding on library insert** | 🆕 | §3.2 — new, load-bearing. |
| **17** | **Division-rule solver (Fixed/Ratio/Locked/Flex)** | 🆕 | §4 — new, load-bearing. |
| **18** | **Interactive joint-rule editor** | 🆕 | §8.2 — needs factory rule data (FACTORY_CHECKLIST). |
| **19** | **Application props library + purpose tags** | 🆕 | §8.4 — incl. boiler. |
| **20** | **Corner-rounding op (linked ×4)** | 🆕 | §12.1 — founder fixture; must emit contour + arc kromka (L8). |
| **21** | **Cutout op w/ lockable offsets** | 🆕 | §12.2 — min-web validation; emits CNC contour. |
| **22** | **Units toggle cm⇄mm** | 🆕 | §12.3 — display only, engine stays mm10. |

---

*v4 closes the vocabulary and the interaction contract. The build order, with a test gate after every step, lives in `HANDOVER_04_SAIDISLOM.md`.*
