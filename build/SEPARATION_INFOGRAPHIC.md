# Mebelchi — Separation Infographic
### The Core Principle: Why Furniture = Blocks = Components = Parts

> **Print this. Pin it above Saidislom's monitor.**

---

## 1 · The 3 Apps (one tree, three zoom levels)

```
┌─────────────────────────────────────────────────────────────────┐
│                    МЕБЕЛЬ (Furniture)                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  БЛОК 1  │  │  БЛОК 2  │  │  БЛОК 3  │  │  БЛОК 4  │       │
│  │  (Base)   │  │  (Sink)  │  │ (Corner) │  │  (Wall)  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │             │
│       ▼              ▼              ▼              ▼             │
│   Components     Components     Components     Components       │
│   ┌─┬─┬─┐       ┌─┬─┬─┐       ┌─┬─┬─┐       ┌─┬─┬─┐         │
│   │S│D│F│       │S│D│S│       │S│S│B│       │S│S│D│         │
│   └─┴─┴─┘       └─┴─┴─┘       └─┴─┴─┘       └─┴─┴─┘         │
│                                                                 │
│  S=shelf  D=divider  F=filler  B=back                          │
└─────────────────────────────────────────────────────────────────┘
```

```
 APP 1: СБОРКА (compose)        APP 2: БЛОК (block)        APP 3: КАРКАС (forge)
 ─────────────────────          ──────────────────          ────────────────────
 You see: all blocks            You see: one block         You see: raw panels
 You edit: block positions      You edit: components       You edit: anything
 Zoom: furniture level          Zoom: cabinet level        Zoom: panel level
 User: client + master          User: master               User: advanced master
 
 ┌───┬───┬───┬───┐             ┌──────────────┐            ┌──────────┐
 │ 1 │ 2 │ 3 │ 4 │             │  ┌─┐  ┌─┐   │            │          │
 │   │   │   │   │    ──►      │  │ │  │ │   │    ──►     │  ══════  │
 │   │   │   │   │             │  │ │  │ │   │            │  ══════  │
 └───┴───┴───┴───┘             │  └─┘  └─┘   │            │          │
                                └──────────────┘            └──────────┘
```

> **Key:** All three apps edit the **same data type** (`DesignNode[]`). The engine is identical. It never knows which editor created the tree.

---

## 2 · The Firewall (DB/27) — What CAN'T Be in a Block

This is the core of Mebelchi. A `DesignNode` (what gets shared, what the community builds) has **ZERO construction fields**:

```
                    DesignNode                          ConstructionProfile
                    ══════════                          ════════════════════
                    
                    ✅ nodeId                           ✅ material thickness
                    ✅ kind (shelf/divider/door)        ✅ kromka per role
                    ✅ cabinetType                      ✅ groove specs
                    ✅ size (габаритный)                ✅ bottomPlacement
                    ✅ division (1:1:0.6)               ✅ topStyle
                    ✅ purpose                          ✅ plinth
                    ✅ children                         ✅ worktop overhang
                    ✅ hasDoor                          ✅ grain policy
                    ✅ hasWorktop                       ✅ merge rules
                    
                    ❌ NO thickness                     
                    ❌ NO kromka                        
                    ❌ NO groove/paz                    
                    ❌ NO holes/drills                  
                    ❌ NO bottomPlacement               
                    ❌ NO overhang                      
                    ❌ NO joints                        
```

```
     ⛔ THE TEST: "Would two competent workshops disagree on this number?"
     
         YES → it goes in ConstructionProfile
         NO  → it goes in DesignNode
         
     Example: "Is this a shelf?"     → NO disagreement  → DesignNode.kind
     Example: "16mm or 18mm thick?"  → YES disagreement → profile.material.carcass_mm10
     Example: "Bottom under or between sides?" → YES    → profile.bottomPlacement
```

> **Why this matters:** When a community member shares a block, it contains **zero construction opinions**. You cannot build a Frankenstein (12 workshops in one kitchen). This is a **compile error**, not a bug — there is literally no field to put thickness in.

---

## 3 · The Data Flow (the heart of the app)

```
  ╔═══════════════╗        ╔══════════════════════╗        ╔═══════════════╗
  ║  DESIGN NODE  ║        ║  panelDecomposition() ║        ║     PARTS     ║
  ║  (Intent)     ║───────►║  (pure function)      ║───────►║  (Physical)   ║
  ║               ║        ║                       ║        ║               ║
  ║  WHAT it is   ║        ║  Same inputs =        ║        ║  thickness ✓  ║
  ║  0 thickness  ║        ║  identical output     ║        ║  kromka ✓     ║
  ║  0 kromka     ║        ║                       ║        ║  grooves ✓    ║
  ║  0 holes      ║        ║  NEVER stored.        ║        ║  drills ✓     ║
  ╚═══════════════╝        ║  Recomputed on        ║        ╚═══════════════╝
                           ║  EVERY change.        ║                ▼
  ╔═══════════════╗        ║                       ║        ╔═══════════════╗
  ║  PROFILE      ║───────►║                       ║        ║  SWJ008 XML   ║
  ║  (Workshop)   ║        ╚══════════════════════╝        ║  Eman XLSX    ║
  ║               ║                                         ║  GibLab       ║
  ║  HOW to build ║                                         ╚═══════════════╝
  ║  16mm thick   ║
  ║  K1=1.0mm     ║
  ║  paz 4×8@12   ║
  ╚═══════════════╝
```

---

## 4 · The Construction Cascade (the ONLY 3 sources)

When the engine needs a construction value (e.g., "is the bottom вкладное or накладное?"), it checks exactly 3 places, in order. There is no 4th.

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   1. project.overrides                                      │
  │      (user said "this specific cabinet is вкладное")        │
  │      ──► if found, USE IT                                   │
  │                                                             │
  │   2. profile.byType[node.cabinetType]                       │
  │      (the shop measured: "shelf_units are вкладное")        │
  │      ──► if found, USE IT                                   │
  │                                                             │
  │   3. profile.defaults                                       │
  │      (census aggregate: "most cabinets are накладное")      │
  │      ──► always exists, USE IT                              │
  │                                                             │
  │   ⛔ A BLOCK CANNOT APPEAR IN THIS LIST.                    │
  │      That is the law.                                       │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘
```

---

## 5 · "Change One → All Recompute" (the principle)

This is what makes us different from "template" software. **Nothing is pre-baked.**

### Example: Add a shelf

```
  BEFORE (1 shelf)                    AFTER (2 shelves)
  ─────────────────                   ──────────────────
  ┌──────────────┐                    ┌──────────────┐
  │              │                    │              │
  │  полка 1     │  W = 988mm        │  полка 1     │  W = 988mm  ← SAME
  │══════════════│                    │══════════════│
  │              │                    │  полка 2     │  W = 988mm  ← NEW
  │              │                    │══════════════│
  │              │                    │              │
  └──────────────┘                    └──────────────┘
  
  Design: children = [shelf]          Design: children = [shelf, shelf]
  Engine recomputes ALL parts.        Both shelves get width from (W−2t)/1
```

### Example: Add a shelf + a divider

```
  BEFORE (1 shelf, 0 dividers)       AFTER (1 shelf, 1 divider)
  ─────────────────────────          ────────────────────────────
  ┌──────────────┐                   ┌──────┬───────┐
  │              │                   │      │       │
  │  полка 1     │  W = 988mm       │ п.1  │  п.1  │  W = 486mm EACH
  │══════════════│                   │══════│═══════│   ← BOTH changed!
  │              │                   │      │       │
  └──────────────┘                   └──────┴───────┘
  
  shelfW = (W − 2t) / 1 = 988       shelfW = (W − 2t − 1×t) / 2 = 486
                                     (compartment-aware: divider eats 16mm)
```

> **This is why we never store Parts.** Adding a divider changed the shelf width. If shelves were stored, you'd have stale data. Recomputation = always correct.

### Example: Swap top for 2 stretchers (same design, different profile)

```
  topStyle: "full"                   topStyle: "stretchers"
  ────────────────                   ──────────────────────
  ┌══════════════┐  ← крышка        ┌══════════════┐  ← царга передняя (80mm)
  │              │     (1 part,      │              │     
  │              │      full depth)  │              │     (2 parts,
  │              │                   │              │      80mm width each)
  └──────────────┘                   └══════════════┘  ← царга задняя (80mm)
  
  Same DesignNode.                   Same DesignNode.  
  Profile says "full".               Override says "stretchers".
  Engine emits 1 top Part.           Engine emits 2 stretcher Parts.
  
  ⚡ The DESIGN never changed. Only the CONSTRUCTION opinion changed.
     The block is still shareable. Overrides are stripped on share.
```

---

## 6 · Profile Swap (the ultimate proof)

Same block. Two workshops. Zero design changes. Different parts.

```
  ╔═════════════════════╗       ╔═════════════════════╗
  ║  QORASU WORKSHOP    ║       ║  OTHER WORKSHOP     ║
  ║  (Eman, Карасу)     ║       ║  (for proof only)   ║
  ╠═════════════════════╣       ╠═════════════════════╣
  ║  carcass: 16mm      ║       ║  carcass: 18mm      ║
  ║  back: 16mm ЛДСП    ║       ║  back: 4mm ХДФ      ║
  ║  K1: 1.0mm          ║       ║  K1: 2.0mm          ║
  ║  K2: 0.4mm          ║       ║  K2: 0.4mm          ║
  ║  bottom: вкладное   ║       ║  bottom: вкладное   ║
  ║  back: overlay      ║       ║  back: overlay      ║
  ║  grain: locked all  ║       ║  grain: free hidden  ║
  ╚═════════════════════╝       ╚═════════════════════╝
          │                              │
          ▼                              ▼
  ┌─────────────────┐           ┌─────────────────┐
  │  Side: 1020×520 │           │  Side: 1020×520 │  ← same design size
  │  t=160 (16mm)   │           │  t=180 (18mm)   │  ← different thickness!
  │  K1 front+back  │           │  K1 front+back  │
  │                 │           │                 │
  │  Bottom: 988×503│           │  Bottom: 984×503│  ← W−2t: 2×16=32 vs 2×18=36
  │  t=160          │           │  t=180          │
  └─────────────────┘           └─────────────────┘
  
  Same block. Different shop. Different cut list. No design edit needed.
```

---

## Summary: One Sentence

> **DesignBlock = WHAT** (shareable, community-authored, zero construction)  
> **ConstructionProfile = HOW** (one per project, one owner: the workshop)  
> **Part = THE RESULT** (computed by `panelDecomposition(design, profile)`, thrown away, recomputed on every change)

This is the entire architecture. Everything else is implementation detail.
