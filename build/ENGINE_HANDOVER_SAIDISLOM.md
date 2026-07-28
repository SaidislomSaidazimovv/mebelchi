# Strict Engine Handover — for Saidislom

**Date:** 2026-07-27 · **From:** Founder + Claude Code (engine owner) · **To:** Saidislom (design world)
**Status:** Blueprint. Build the engine BY HAND, in the order of §5. Do not generate templates.
**Ground truth:** `engine/contracts/design.ts`, `engine/contracts/types.ts`, `engine/solver/panelDecomposition.ts`, `engine/catalogs/profiles.ts`. This packet is a reading of that code — if code and packet ever disagree, **the code wins** and this file is fixed.

---

## 0 · The three editors (name the separation)

All three edit the **same design tree** (`DesignNode[]`). They differ only in *how deep you have zoomed in*. The engine (`panelDecomposition`) is identical for all three — it never knows which editor you used.

```
МЕБЕЛЬ ▸ БЛОК ▸ КОМПОНЕНТ ▸ ДЕТАЛЬ
(Furniture)(Block)(Component)(Part)
```

| # | Name (RU / code) | You edit | The unit | Maps to |
|---|---|---|---|---|
| **1** | **Сборка** / `compose` | arrange **Blocks** into furniture, block-by-block (imos/Lego); add spanning rails цоколь/столешница/карниз | Block | a list of `DesignNode(kind:"cabinet")` |
| **2** | **Блок** / `block` | open ONE block, arrange its **Components** (shelves, dividers, doors, drawers, ratios) | Component | `node.children` of one cabinet |
| **3** | **Каркас** / `forge` — *the standalone 3D app (Moblo-like)* | draw ANY component/part from **panels**, 2-axis (design anything) | Part / panel | a `DesignNode` subtree down to leaves |

**Why this is safe:** none of the three can set thickness, kromka, or a hole — there is no field for it (§1). So a block built in editor 1, 2, or 3 is the same kind of object, and the engine builds all of them the same way. The 3rd is a separate app only in UX; in DATA it is the same tree.

---

## 1 · The exact TypeScript interfaces (the DB/27 separation, in code)

Three types matter. Read them in this order. **The proof of the separation is what is ABSENT.**

### 1a · `DesignBlock` / `DesignNode` — INTENT ONLY (shareable, community-authored)

```ts
// from engine/contracts/design.ts
type RoleSlot   = "fasad" | "korpus" | "orqa";
type CabinetType= "kitchen_base"|"kitchen_wall"|"tall"|"drawer_base"|"wardrobe"|"shelf_unit";
type NodeKind   = "cabinet"|"shelf"|"divider"|"door"|"drawer"|"filler"|"rod";
type Division   = { rule:"fixed"; mm:mm10 } | { rule:"ratio"; weight:number } | { rule:"flex" };

interface DesignNode {
  nodeId: string;                 // the ONLY assigned id in the whole system. Never mutated.
  kind: NodeKind;
  cabinetType?: CabinetType;      // design intent → selects the profile's construction scope
  roleSlot?: RoleSlot;
  size?: { w_mm10?: mm10; h_mm10?: mm10; d_mm10?: mm10 };  // габаритный размер (overall)
  division?: Division;            // how a space splits (ratio 1:1:0.6, fixed mm, flex)
  purpose?: string;               // "boiler", "clothes"… drives ergonomics, not construction
  children?: DesignNode[];
  hasDoor?: boolean;              // it changes what it LOOKS like → design
  hasWorktop?: boolean;           // "topped by a worktop" is design; the OVERHANG is construction
}

interface DesignBlock {
  blockId: string;
  name: string;
  author: string;
  schemaVersion: 1;               // unknown version → REJECTED at import, never guessed
  root: DesignNode;
  requiredSlots: RoleSlot[];
  tags?: string[];
}
```

> **⛔ THE PROOF — say this to yourself before every field you add to a node:**
> `DesignNode` has **no** `thickness`, **no** `kromka`, **no** `groove`/`paz`, **no** `joint`/`hole`/`drill`, **no** `bottomPlacement`, **no** `overhang`, **no** `setback`. There is *no field to put them in*. A community author literally **cannot** ship a construction opinion — "Frankenstein" is a **compile error, not a bug**. If you ever feel the need to add one of those to a node — STOP, it belongs in §1b.

### 1b · `ConstructionProfile` — HOW IT'S MADE (one per project, one owner: the workshop)

```ts
type KromkaSlot = "K1" | "K2";
type PartRole   = "side"|"bottom"|"top"|"stretcher"|"shelf"|"back"|"worktop"|"door"|"divider"|"plinth"|"filler";

interface EdgeKromka {   // 6 names: a part's two axes decide WHICH 4 it has
  front:KromkaSlot|null; back:KromkaSlot|null; left:KromkaSlot|null;
  right:KromkaSlot|null; top:KromkaSlot|null;  bottom:KromkaSlot|null;
}

interface TypeConstruction {                 // everything two shops would disagree about
  bottomPlacement: "nakladnoe" | "vkladnoe"; // дно под боками (W) vs между боками (W−2t)
  topStyle: "full" | "stretchers" | "none";  // крышка · 2 царги · нет (столешница сверху)
  stretcherWidth_mm10: mm10;
  back: { treatment:"groove"|"overlay"|"none"; grooveWidth_mm10:mm10; grooveDepth_mm10:mm10; grooveSetback_mm10:mm10 };
  backZone_mm10: mm10;        // depth the back steals from bottom/shelf/divider
  shelfSetback_mm10: mm10;    // extra front clearance on shelves
  plinth: { style:"box"|"strip"|"none"; height_mm10:mm10; placement:"between"|"under"; role:"decorative"|"structural" };
  worktop: { sideOverhang_mm10:mm10; frontOverhang_mm10:mm10 };
  kromkaByRole: Record<PartRole, EdgeKromka>;
  merge: { allowed:boolean; strategy:"shared_divider"; limits:{ maxSheetLength_mm10:mm10; maxSheetWidth_mm10:mm10; maxWeightKg:number } };
  grainPolicy: { mode:"lock_all"|"free_hidden"; hiddenRoles:PartRole[] };
}

interface ConstructionProfile {
  profileId: string;
  name: string;
  material: { carcass_mm10:mm10; back_mm10:mm10; front_mm10:mm10 };  // Карасу: 160 / 160 / 220
  kromka: { slots: Record<KromkaSlot,{ thickness_mm10:mm10 }> };     // Карасу: K1=10 (1.0mm), K2=4 (0.4mm)
  grain: "L" | "NONE";
  defaults: TypeConstruction;                          // used when a type has no scope
  byType: Partial<Record<CabinetType, Partial<TypeConstruction>>>;  // per-type, still ONE owner
}

// project-local, stripped when a block is shared → block purity survives user edits
interface ConstructionOverride {
  nodeId: string;
  field: "topStyle"|"bottomPlacement"|"shelfSetback_mm10"|"plinthHeight_mm10";
  value: string | number;
}
interface DesignProject {
  projectId: string; name: string;
  nodes: DesignNode[];
  slotBindings: Record<RoleSlot, string>;  // A/B/C → the project's real material
  overrides: ConstructionOverride[];
}
```

### 1c · `Part` — the COMPUTED output (never stored, never shared)

```ts
// from engine/contracts/types.ts
type mm10 = number;                 // tenths of a mm. 16mm = 160. NO floats inside the engine.
type Grain = "L" | "W" | "NONE";
type Operation = DrillOp | ContourOp | SawGrooveOp;   // присадка / фрезеровка / паз

interface Part {
  id: string;                       // DERIVED: hash(nodeId + role + sub). Idempotent, stable.
  name: string;                     // "бок левый", "полка 1", "царга передняя"…
  width_mm10: mm10;                 // SWJ008 @Width  (Y machining extent)
  length_mm10: mm10;                // SWJ008 @Length (X machining extent)
  thickness_mm10: mm10;             // ← from PROFILE.material, never from the design
  grain: Grain;                     // ← from PROFILE.grain / grainPolicy
  edges: [mm10, mm10, mm10, mm10];  // kromka thickness on faces [1,2,3,4] ← from PROFILE.kromkaByRole
  operations: Operation[];          // grooves/holes ← from PROFILE (paz) or user
}
```

**The three-line summary of the whole architecture:**
`DesignBlock` = *what* (shareable) · `ConstructionProfile` = *how* (one owner) · `Part` = *the result* (computed by `panelDecomposition(design, profile)`, thrown away, recomputed on every change).

---

## 2 · The state flow (what happens on a click) — the two teaching cases

`panelDecomposition(design, profile) → { parts, flags, provenance }` is **pure**: same inputs → byte-identical output. The UI never edits a Part. It edits the DESIGN (or an OVERRIDE), then re-runs the function and re-renders `parts`.

### CASE A — user clicks **«Добавить полку» (Add Shelf)**

```
1. UI  · a cabinet node is selected. User taps "Add Shelf".
2. UI  · MUTATE DESIGN ONLY:  node.children.push({ nodeId: newId(), kind: "shelf" })
         (the UI has no field for thickness/kromka — it physically cannot set them)
3. UI  · call  panelDecomposition(project, profile)
4. ENG · walk → decomposeCabinet:
           dividers    = children.filter(kind==="divider")
           shelves     = children.filter(kind==="shelf")
           compartments= dividers.length + 1
           shelfW = round((W − 2t − dividers·t) / compartments)   ← compartment-aware (DB/28 B1)
           shelfD = D − backZone − shelfSetback
           for each shelf →  emit("shelf", … thickness=t, grain=profile.grain,
                                   edges = kromkaByRole.shelf → front:K1 )
5. ENG · return { parts, … }.  A new Part "полка N" exists. Its thickness(160),
         grain(L), kromka(front 10) ALL came from the profile, not from the click.
6. UI  · re-render from parts.  Part id = derivePartId(shelfNodeId,"shelf",0) — stable.
```
**Lesson:** adding a shelf is *adding a node*. Everything physical about that shelf is decided by the profile at decomposition time. If a second shelf is added, EVERY shelf's width may change (compartment share) — because the engine recomputes them all, not just the new one. **That is the "change one → all recompute" principle at the heart of the app.**

### CASE B — user clicks **«Заменить верх на 2 царги» (Swap Top for 2 Stretchers)**

```
1. UI  · a cabinet node is selected. User toggles top: full → stretchers.
2. UI  · this is a CONSTRUCTION choice → do NOT touch the design node.
         Write a project-local override:
           project.overrides.push({ nodeId, field:"topStyle", value:"stretchers" })
         (workshop-wide instead of per-cabinet? edit profile.byType[type].topStyle — same effect, wider scope)
3. UI  · call  panelDecomposition(project, profile)
4. ENG · decomposeCabinet resolves the cascade:
           C.topStyle = override("topStyle", nodeId, overrides, profile→...→"full")  ⇒ "stretchers"
         branch:
           was:  topStyle==="full"      → emit ONE  "крышка"  (top,  innerW × bottomD)
           now:  topStyle==="stretchers"→ emit TWO  "царга передняя" / "царга задняя"
                                          (stretcher, innerW × stretcherWidth)
5. ENG · return parts: the "крышка" Part is GONE; two "царга" Parts appear.
         The removed top's id is not reused; the two царги get their own derived ids.
6. UI  · re-render.  Sharing this block later STRIPS the override → the block stays pure.
```
**Lesson (this is the one to build by hand, founder's task):** the *same design node* produced 1 part or 2 parts depending ONLY on the profile/override. The block never changed. This is DB/27 §4's boundary test made real: "full vs 2 stretchers is a thing two competent shops disagree about" → therefore it lives in construction, never in the block.

### The construction cascade (the ONLY path construction reaches a part — memorize)
```
1. project override (user, per node)      ← ConstructionOverride
2. profile.byType[node.cabinetType]       ← per-type measured truth
3. profile.defaults                       ← census aggregate fallback
   (there is NO 4th source. A block cannot appear in this list. That is the law.)
```

---

## 3 · The glossary (one language for the whole team)

Speak these exactly. Left = concept, middle = our word, right = where it is in code.

| EN concept | Our term (RU/UZ) | In the code |
|---|---|---|
| Edge banding | **Кромка** (UZ: **Jiyak**) | `EdgeKromka`, `KromkaSlot` (K1/K2), `Part.edges[4]`, `kromkaByRole` |
| Stretcher / top rail | **Царга** (Tsarga) | `PartRole:"stretcher"`, `topStyle:"stretchers"`, `stretcherWidth_mm10` |
| Groove / dado (for the back) | **Паз** (Paz) | `SawGrooveOp`, `back.treatment:"groove"`, `grooveWidth/Depth/Setback_mm10` |
| Bottom **inset between** the sides (W−2t) | **Вкладное** (Vkladnoe) | `bottomPlacement:"vkladnoe"` |
| Bottom **under** the sides (full W) | **Накладное** (Nakladnoe) | `bottomPlacement:"nakladnoe"` |
| Overall / bounding size | **Габаритный** размер | `DesignNode.size {w_mm10,h_mm10,d_mm10}` |
| Carcass / body | **Корпус** (Korpus) | `material.carcass_mm10`, `roleSlot:"korpus"` |
| Front / facade | **Фасад** (Fasad) | `hasDoor`, `PartRole:"door"`, `material.front_mm10`, `roleSlot:"fasad"` |
| Back panel | **Задняя** / UZ **Orqa** | `PartRole:"back"`, `material.back_mm10`, `roleSlot:"orqa"` |
| Plinth / kickboard | **Цоколь** (Tsokol) | `plinth{style,height,placement,role}`, `PartRole:"plinth"` |
| Shelf | **Полка** (Polka) | `NodeKind:"shelf"`, `PartRole:"shelf"` |
| Vertical divider | **Стойка** / перегородка | `NodeKind:"divider"`, `PartRole:"divider"` |
| Bottom / Top | **Дно** / **Крышка** | `PartRole:"bottom"` / `"top"` |
| Worktop / countertop | **Столешница** | `hasWorktop`, `PartRole:"worktop"`, `worktop.*Overhang` |
| Filler panel | **Фальшпанель** / добор | `NodeKind:"filler"`, `PartRole:"filler"` |
| Merge sections | **Объединение** секций | `TypeConstruction.merge` |
| Drilling / boring | **Присадка** (Prisadka) | `DrillOp` (op:"drill"), `Part.operations` |
| Tenths-of-mm integer | — | `mm10` (16mm ⇒ 160; **no floats inside the engine**) |
| Assigned identity | — | `nodeId` (design, permanent) |
| Derived identity | — | `Part.id = derivePartId(nodeId, role, sub)` (recomputed, stable) |

---

## 4 · The naming discipline (so nobody drifts)
- A **block** is a `DesignNode(kind:"cabinet")`. Its **components** are its `children`. Its **parts** are what the engine emits.
- Never say "template". We do not ship geometry; we ship a **profile** that computes geometry. A "template" is the exact bug we are removing.
- Never store a Part. If you saved parts to disk, you broke the law — recompute them.
- `mm10` everywhere inside. Floats only at the render edge and the export edge.

---

## 5 · Build it by hand — the evolutionary task ladder (tiny, ordered, each with a test)

Do these strictly in order. Each is a commit with a passing test before the next starts. This is the "panel → box → shelf → swap top" path the founder set.

| # | Task | Done when (the test) |
|---|---|---|
| 1 | **A changeable Panel.** `emit()` one `Part` from a node's size + a profile thickness. | `panelDecomposition` on a 1-node design returns 1 Part; changing `carcass_mm10` changes only `thickness_mm10`; changing `size` changes only `length/width`. |
| 2 | **Panels → a Box.** Add sides+bottom+top for a `cabinet` node (the `decomposeCabinet` skeleton). Understand `sideH = H − worktopT − (nakladnoe? t:0)` and `bottomW = vkladnoe? W−2t : W`. | 4–5 parts; flip `bottomPlacement` and watch `bottom` width change W ↔ W−2t, nothing else. |
| 3 | **Add a Shelf** (Case A). Shelf children → compartment-aware `shelfW`. | Add 1 shelf → 1 shelf part at innerW; add a divider → both compartments' shelf widths recompute. |
| 4 | **Swap Top for 2 Stretchers** (Case B). `topStyle` via `ConstructionOverride`. | Override `topStyle:"stretchers"` → the `крышка` part disappears, two `царга` parts appear; remove override → back to one top. |
| 5 | **Double top panels, bound.** Two abutting parts that share identity/edge when merged (the founder's "upper side = double panels binded"). Start from `merge.strategy:"shared_divider"`. | Two adjacent cabinets merged → ONE shared `divider` part replaces two `side` parts; over `merge.limits` → `EXCEEDS_SHEET`/`EXCEEDS_WEIGHT` flag instead of a silent merge. |
| 6 | **Back as a Паз groove.** `backGroove()` from the profile. | `back.treatment:"groove"` adds a `saw_groove` op at `width − grooveSetback`; `"overlay"`/`"none"` add none. |

Rule for every task: **the number comes from the profile, cited to DB/25 or DB/28.** A number with no citation is a bug (see `profiles.ts` — every value carries its source).

---

## 6 · What else to give Saidislom (founder's "advise what else")
1. **The two real profiles** (`QORASU_PROFILE`, `OTHER_SHOP_PROFILE`) — building against BOTH proves profile-swap purity: the same design, two shops, two different part sets, zero design edits.
2. **The identity rule, in writing:** design ids assigned once; part ids derived. Undo must restore *identity*, not just geometry (this is the trap that DB/26 Step 3 flagged — the stretcher swap is exactly where a naive undo breaks).
3. **The task template** from `DB/29 §5` — every task states what it must NOT touch (`engine/contracts/**`) and delivers a Redmi-checkable result. Keep tasks tiny; if one doesn't fit the template, it's too big.
4. **The boundary he owns vs. the boundary you own:** he builds the three editors (§0) and the 3D; he never edits `engine/contracts/**` or the profile schema without your PR. That one rule is the whole org chart (`DB/29`).
5. **The honest engine ledger** (`DB/30`): the spine is proven, the organs are ~40%. The first revenue organ is the **Eman XLSX exporter** (~1 session) — point him at it after task 4 so he sees the Part[] turn into a real cut-list a master can carry to Eman today.

---

*Full context: `DB/27` (the law), `DB/28` (the replay that proved it), `DB/29` (org chart + task template), `DB/30` (what's done vs not), `DB/31` (the app map). This packet is the strict subset Saidislom needs to build the engine by hand.*
