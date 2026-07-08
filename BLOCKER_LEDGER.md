# Blocker Ledger — swept against the live build (Step 12)

Walks every blocker from `CONSTRUCTION_FRAME_v4.md` §14 against the shipped code (Steps 0–11, branch
`feat/karkas-engine-port` → `main`). Every 🔴/🟡 has a **closing commit** or a **named next step** — nothing
drops silently (Gate 12). Legend: 🟢 CLOSED · 🟡 PARTIAL · 🔴 OPEN · ⏸ BACKLOG.

_Swept 2026-07-08 by Saidislom; corrected 2026-07-09 after a deep audit (two overstatements fixed: #14 ungroup UI-unwired, #19 ghost props are primitives not a library). Total: 15 closed · 5 partial (each with a scoped next step) · 0 open-without-plan · 2 backlog._

## Known open items surfaced by the 2026-07-09 audit (not §14 blockers, tracked here so nothing drops)

- **Dead info-card «⋮» menu items** — Duplicate / Lock / Rename / Hierarchy / Ungroup / Rotate render `on:false` (disabled). Gate 3 wanted "⋯ items all fire". Ungroup + Hierarchy have engine/UI backing to wire; the rest need new actions.
- **`docs/views/` screenshots** — Gate 8 named this deliverable; only `docs/fixtures/` exists.
- **JointDiagram ignores min-margin** — §8.2.1 wants the min-margin edit to move the sample holes; the diagram only reacts to pitch/setback.
- **Info-card state line** — §5 fixture `info.png` wants «Уникальная деталь / Тип · N / ✂ отвязана»; the card shows colour-bar + name + ⋮ only.
- **Pricing Gate 0 (founder-owned)** — `packages/pricing` snapshot RED (771342 vs 767794; cnc/worktopEdge subgroups differ) and EXCLUDED from root `npm test`. Pre-existing kitchen pricing, not karkas; business must reconcile the hand-checked total.
- **FIXED 2026-07-09 (audit bugs):** `exportOverride` + `future` (redo) + `selectedHole` now reset on openWith/setModel/importProject (were leaking a manufacturing override + corrupting redo across a project load).

| # | Item | v4 status | **Now** | Evidence / next step |
|---|------|-----------|---------|----------------------|
| 1 | L-corner footprint | 🔴 OPEN | 🟢 **CLOSED** | `buildLCornerModel` + `Block.footprint` + `scaleBlockAxis` (footprint resize path); `structure_lcorner_*` tests green. |
| 2 | Merge operation | 🔴 OPEN | 🟢 **CLOSED** | `mergeSections` (operations.ts) — the inverse of divideSection; removes dividers, re-parents instances. |
| 3 | Per-leg/per-block depth | 🟡 PARTIAL | 🟢 **CLOSED** | `resizeBlockDepth` / rule-aware `resolveBlockAxis` on Z; depth flows to cut/price/DXF. |
| 4 | Non-rect outlines | 🟡 AMENDED | 🟡 **PARTIAL** | Angled shelf + lip + **corner rounding (Step 4b, `d0b244f`)** + **cutout (Step 4b)** shipped. **Next:** true free-form polygon outline still deferred — backlog. |
| 5 | Worktop cross-block | ⏸ BACKLOG | ⏸ **BACKLOG** | Kitchen-worktop spanning multiple carcasses. **Next step:** design a cross-block Row worktop when kitchen mode is prioritised. |
| 6 | Corner fillers | ⏸ BACKLOG | 🟢 **CLOSED** | `__corner_filler` (Угловая планка) emitted for L-corner blocks in `solve.ts`. |
| 7 | Step-aware mounting | 🔴 OPEN | 🟢 **CLOSED** | `structure_step_aware.test.ts` green — mounts resolve against the stepped carcass. |
| 8 | Per-face material roles | 🟡 PARTIAL | 🟡 **PARTIAL** | Per-*part* material + per-role plan shipped (Step 5, `120ef8b`). **Next:** per-*face* decor (island back ≠ front) — small op on `Part`, deferred until a real island order needs it. |
| 9 | Span-needs-support | 🟡 PARTIAL | 🟢 **CLOSED** | Load-bearing declaration + `checkStability`/`checkMotion` warnings; wired into `derive()`. |
| 10 | Glass rebate | 🟡 | 🟢 **CLOSED** | Glazed door + grid emit their rebate groove; `checkEmitCompleteness` (emitCheck.ts) **blocks the SWJ008 export** if a declared rebate never machined (L8 "emitted, not shown"). |
| 11 | Band transition | 🟡 | 🟢 **CLOSED** | `resolveBandTransition` + `bandCorners` (banding.ts) — butt / overlap / mitre per corner. |
| 12 | Junction editor | 🟡 | 🟡 **PARTIAL** | Divider move (`moveLine`, Step 3.3b) + per-hole override (Step 7c) cover live junction editing. **Next:** a dedicated junction-type picker if the shop asks for it. |
| 13 | Hinge-offset revalidation | 🟡 | 🟢 **CLOSED** | `hingeCupPattern` **verified: manufacturing** against the door golden fixture (Ø35×13 @ 21.5mm); proof test is a hard gate. |
| 14 | Group intent (keep-linked / differs) | 🟡 | 🟡 **PARTIAL** | Two selection modes (Step 3.2) + the ENGINE `detachInstance`/`reattachInstance`/`dissolveGroup` ops exist and are tested — but they are **NOT wired to the UI** (the info-card «✂ Ajratish» item is `on:false`). **Next:** wire ungroup + the "keep linked vs each differs" prompt to the store/menu. (Audit correction 2026-07-09: was over-claimed as reachable.) |
| 15 | Undo/redo journaled | 🟢 partial | 🟢 **CLOSED** | Undo + **redo** now shipped (Step 12 — `past[]`/`future[]` forward stack; a fresh edit clears redo; «↻ Oldinga» button; `undo_redo` test). Full journal (per-op log) remains optional backlog. |
| 16 | Variable slot-binding on library insert | 🆕 | 🟢 **CLOSED** | Step 5 (`120ef8b`) — `slotBinding.ts` + importProject prompt; never grows the pool silently. |
| 17 | Division-rule solver (Fixed/Ratio/Locked/Flex) | 🆕 | 🟢 **CLOSED** | Step 2 (`282b431`) — `resolveChain` star-sizing + rule-aware resize. |
| 18 | Interactive joint-rule editor | 🆕 | 🟢 **CLOSED** | Step 7 (`2a1032d`) — JointProfile drives drilling, live editor + diagram, margin warnings + export gate + per-hole move. Factory setback 91.5mm landed in the catalog. |
| 19 | Application props + purpose tags | 🆕 | 🟡 **PARTIAL** | Step 9 (`1efb903`) — purpose tags (incl. **boiler**) + boiler-clearance warning fully work; ghost props are **6 primitive shapes** (cylinder/rail/box), not the spec's **10–15 silhouette library**. **Next:** expand `buildGhostProps` into a proper silhouette set. (Audit correction 2026-07-09: was over-claimed as CLOSED.) |
| 20 | Corner-rounding op (linked ×4) | 🆕 | 🟢 **CLOSED** | Step 4b (`d0b244f`) — chain ×4 / per-corner, 3D chips, emits arc contour + arc kromka length. |
| 21 | Cutout op w/ lockable offsets | 🆕 | 🟢 **CLOSED** | Step 4b (`d0b244f`) — size + 🔒 per-edge offsets survive resize, through-pocket CNC contour. |
| 22 | Units toggle cm⇄mm | 🆕 | 🟢 **CLOSED** | Step 4b (`d0b244f`) — display-only on length fields, engine stays mm10. |

## Founder-owned (not a build blocker)

- **System-32 BACK-row setback** — front 91.5mm confirmed (ORTA_BAK + YON_BAK), back row is cabinet-specific
  (91.5 vs 108.5) → the JointProfile editor (Step 7) lets the master set it per project; a per-design back
  row model is a founder decision (`FACTORY_CHECKLIST.md`).
- **`packages/pricing` snapshot** — computes 771342 vs the 767794 baseline (pre-existing, pricing imports
  only engine types/units); business must reconcile the hand-checked total.

## Open items with a next step (nothing silently dropped)

- **#8 per-face decor**, **#4 free-form outline**, **#12 junction picker**, **#14 keep-linked prompt** — each
  scoped above; deferred until a real order needs it, not blocking any current flow.
- **#5 worktop cross-block** — backlog, tied to kitchen mode.
