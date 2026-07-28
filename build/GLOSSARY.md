# Mebelchi — Glossary (Единый язык / Yagona til)

**Purpose:** Every team member speaks these exact terms. No synonyms, no drift.  
**Rule:** Left column = concept · Middle = our word · Right = exact code location.

---

## Structure Hierarchy (the 4-level ladder)

```
МЕБЕЛЬ  ▸  БЛОК  ▸  КОМПОНЕНТ  ▸  ДЕТАЛЬ
  │          │          │            │
  │          │          │         one physical panel,
  │          │          │         cut from a sheet
  │          │          │
  │          │       a reusable assembly
  │          │       of Parts (like a Photoshop smart object)
  │          │
  │       one carcass section (тумба/шкаф)
  │       built of Parts + Components
  │
  everything in the project
```

| Level | EN (code) | RU (UI) | UZ (UI) | Code type |
|-------|-----------|---------|---------|-----------|
| 4 | **Furniture** | Мебель | Mebel | `DesignProject` |
| 3 | **Block** | Блок | Blok | `DesignBlock`, `DesignNode(kind:"cabinet")` |
| 2 | **Component** | Компонент | Komponent | `DesignNode` subtree (reusable) |
| 1 | **Part** | Деталь | Bo'lak | `Part` (computed, never stored) |

> **Never say "template".** We ship a profile that computes geometry. A template is the exact bug we removed.

---

## The 3 Editors (one tree, three zoom levels)

| # | Name RU | Name code | What you edit | Unit |
|---|---------|-----------|---------------|------|
| 1 | **Сборка** | `compose` | Arrange Blocks into furniture, block-by-block | Block |
| 2 | **Блок** | `block` | Open one Block, arrange its Components (shelves, dividers, doors) | Component |
| 3 | **Каркас** | `forge` | Draw ANY component/part from panels, 2-axis | Part |

All three edit the **same `DesignNode[]` tree**. The engine is identical for all — it never knows which editor was used.

---

## Construction Mechanics

| Concept | Our term | Code location |
|---------|----------|---------------|
| Bottom **inset between** sides (W−2t) | **Вкладное** (Vkladnoe) | `bottomPlacement: "vkladnoe"` |
| Bottom **under** sides (full W) | **Накладное** (Nakladnoe) | `bottomPlacement: "nakladnoe"` |
| Stretcher / top rail | **Царга** (Tsarga) | `PartRole: "stretcher"`, `topStyle: "stretchers"` |
| Groove / dado for the back | **Паз** (Paz) | `SawGrooveOp`, `back.treatment: "groove"` |
| Back zone (depth stolen by back panel) | **Зона задней стенки** | `backZone_mm10` |
| Overall / bounding size | **Габаритный** размер | `DesignNode.size { w_mm10, h_mm10, d_mm10 }` |
| Merge adjacent sections | **Объединение** секций | `merge { allowed, strategy, limits }` |
| Plinth / kickboard | **Цоколь** (Tsokol) | `plinth { style, height, placement, role }` |
| Decorative plinth (on legs, no load) | **Декоративный** цоколь | `plinth.role: "decorative"` |
| Structural plinth (carries weight) | **Конструкционный** цоколь | `plinth.role: "structural"` |

---

## Materials & Edges

| Concept | Our term | Code location |
|---------|----------|---------------|
| Edge banding | **Кромка** (UZ: **Jiyak**) | `EdgeKromka`, `KromkaSlot` (K1/K2) |
| Thick edge (1.0mm, visible) | **K1** | `kromka.slots.K1.thickness_mm10: 10` |
| Thin edge (0.4mm, hidden) | **K2** | `kromka.slots.K2.thickness_mm10: 4` |
| Carcass material | **Корпус** (Korpus) | `material.carcass_mm10`, `roleSlot: "korpus"` |
| Front / facade material | **Фасад** (Fasad) | `material.front_mm10`, `roleSlot: "fasad"` |
| Back panel material | **Задняя** / UZ: **Orqa** | `material.back_mm10`, `roleSlot: "orqa"` |
| Grain direction | **Текстура** | `grain: "L"` / `"NONE"`, `grainPolicy` |

---

## Parts (what the engine outputs)

| Concept | Our term | Code: `PartRole` |
|---------|----------|-------------------|
| Side panel | **Бок** | `"side"` |
| Bottom | **Дно** | `"bottom"` |
| Top / lid | **Крышка** | `"top"` |
| Shelf | **Полка** (Polka) | `"shelf"` |
| Vertical divider | **Стойка** / перегородка | `"divider"` |
| Stretcher / rail | **Царга** (Tsarga) | `"stretcher"` |
| Back panel | **Задняя стенка** | `"back"` |
| Worktop / countertop | **Столешница** | `"worktop"` |
| Door / facade | **Дверь** / фасад | `"door"` |
| Plinth panel | **Цоколь** | `"plinth"` |
| Filler panel | **Фальшпанель** / добор | `"filler"` |

---

## Geometry & Units

| Concept | Code | Rule |
|---------|------|------|
| Fixed-point integer (tenths of mm) | `mm10` | 16mm = 160. **No floats inside the engine.** |
| Assigned identity (design, permanent) | `nodeId` | Created once. Never mutated. Never reused. |
| Derived identity (part, recomputed) | `derivePartId(nodeId, role, sub)` | Hash-based. Idempotent. Profile-swap safe. |
| Machining X axis | `length_mm10` | Along the board length |
| Machining Y axis | `width_mm10` | Along the board width |
| Drilling / boring | **Присадка** (Prisadka) | `DrillOp`, `Part.operations` |
| Contour milling | **Фрезеровка** | `ContourOp` |
| Saw groove | **Паз** (пазовка) | `SawGrooveOp` |

---

## Engine Concepts

| Concept | Code | What it means |
|---------|------|---------------|
| The separation law | **DB/27** | Design has zero construction fields. A compile error, not a bug. |
| The decomposer | `panelDecomposition(design, profile)` | Pure function. Same inputs → identical output. |
| Preview (cheap, for gestures) | `solvePreview(project)` | Bounding boxes + drill zones. No SWJ008 ops. |
| Full solve (expensive, for export) | `solveFull(project)` | Full `Part[]` with all operations. |
| Construction cascade | Override → byType → defaults | The ONLY 3 sources. No 4th. A block cannot appear here. |
| Profile swap purity | — | Same design + different profile = different parts, zero design edits. |
| Replay gate | **DB/28** | Rerun decomposition against real factory output. Byte-exact match = pass. |

---

## UI / Modes

| Concept | Our term | Definition |
|---------|----------|------------|
| Building mode (client-facing) | **Сборка** / Yig'ish | Fast, lego-like, premades. Show client, get approval. |
| Construction mode (master's) | **Конструктор** / Konstruktor | Precise, everything editable. |
| Space (empty cell) | **Пространство** / Bo'shliq | Selectable empty volume. Target for adding things INTO. |
| Line (division) | **Линия** / Chiziq | Horizontal/vertical split. Carries a division rule. |
| Division rule | — | `fixed` (mm), `ratio` (1:1:0.6), `flex` |

---

## Naming Discipline (rules)

1. **Part → Component → Block → Furniture** is the 4-level ladder. No 5th word.
2. "Several parts combined" = **Component** (if reusable) or **selection group** (if ad-hoc).
3. Never say **"template"**. We ship a **profile** that computes geometry.
4. Never **store** a Part. If you saved parts to disk, you broke the law — recompute them.
5. `mm10` everywhere inside. Floats only at the **render edge** and the **export edge**.
6. **DesignNode** = what it IS. **ConstructionProfile** = how to BUILD it. **Part** = the RESULT.
