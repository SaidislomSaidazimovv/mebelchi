# 3D Construction App — roadmap (small, verifiable steps)

Task: `TASK_3D_CONSTRUCTION.md`. Law: `27_DESIGN_CONSTRUCTION_SEPARATION.md`.
Foundation: `packages/render-spike/`. Engine: `packages/construction/` (read-only).

**Working rules (every step obeys these):**
- Before each step, re-read TASK + §27. Ask: *does this step ever set a panel directly?*
  If yes, stop.
- Never touch `packages/construction/**`, `engine/**`, `tests/**`, the render rules.
- After each step: **watcher review** (diff vs the law) → **report to Saidislom** → next.
- Small steps only. If a step can't be verified in one sitting, split it.

Legend: ⬜ todo · 🔨 in progress · ✅ done (verified) · 👀 watcher-reviewed

---

## Phase 0 — Shared core (the seam that makes the 3 variants cheap)

All three variants import this. Only the interaction layer will differ.

| # | Step | Verify | State |
|---|---|---|---|
| 0.1 | Vite skeleton in `packages/design/`: 3 entry points (`main-a/b/c.ts`) + shared `index.html` per variant | `npm run build` produces 3 bundles | ✅ 👀 |
| 0.2 | `core/designModel.ts` — `DesignProject`/`DesignNode` state + **pure** mutations: `resize`, `addShelf`, `addDivider`, `toggleDoor`. Types from `@mebelchi/construction/design`. | unit-free: a mutation returns a new tree, old tree unchanged | ✅ 👀 |
| 0.3 | `core/decompose.ts` — call `panelDecomposition(design, profile)`, memoized on the design snapshot | logs N parts for a demo cabinet | ✅ 👀 |
| 0.4 | `render/layout.ts` (0.4a) + `render/scene.ts` (0.4b) — layout by role/orientation, then instanced render driven by decompose output (NOT by hand) | a cabinet renders from a `DesignProject` | ✅ 👀 |
| 0.5 | `render/overlay.ts` — fps + draw-call overlay (from render-spike) | overlay shows draws 1 / geom 1 | ✅ 👀 |
| 0.6 | `core/undo.ts` — snapshot the **design**, not parts; undo/redo restores it | undo returns the exact previous tree | ✅ 👀 |
| 0.7 | Phase gate: one cabinet, renders via decompose, ≥30fps, one build opens | all 3 variants render, 0 errors, draws 1 / geom 1, fps green. **agy review now.** | ✅ |

**Deliverable:** a static build that shows one cabinet from a DesignProject. No editing yet.

---

## Phase 1 — Variant A · Direct-manipulation handles

Edit by grabbing handles on the 3D.

| # | Step | Verify | State |
|---|---|---|---|
| 1.1 | Selection: tap a panel → `provenance[part.id].nodeId` → highlight the node | tap logs the right nodeId | ✅ 👀 |
| 1.2 | Resize handle: drag → mutate node `size` → re-decompose → **matrices only** | width changes, `geometries` count constant | ✅ 👀 |
|  | ↳ Watcher 0.4b #2: `setPanels` re-stamps ALL matrices per call. For a live drag, add a targeted update (only the changed cabinet's panels, like the spike's `applyWidth`) so drag cost is O(changed), not O(all). Do it here. | — | ⬜ |
|  | ↳ Watcher 0.5 #1: call `metrics.reset()` at drag START so the headline FPS reflects the edit being tested, not the preceding idle-orbit mean (the founder's "≥30 fps during every edit" bar). | — | ⬜ |
|  | ↳ Watcher 1.1 note: do NOT route drag frames through `commit` (one undo entry + full engine per frame). Use a PREVIEW path — live rerender WITHOUT `history.push` during the drag, then `commit` a single snapshot on pointerup. The `rerender`/`commit` split already supports this. Call controller methods as `app.method()` ( `this` binding). | — | ⬜ |
| 1.3 | Add shelf / divider / door via on-3D affordances | each appears, priced from the profile | ✅ 👀 |
| 1.4 | Undo wired to the gizmo edits | undo steps back exactly | 🔨 (watcher review) |
| 1.5 | Build URL A · watcher + agy review · report | founder can open on Redmi | ⬜ |

---

## Phase 2 — Variant B · Tap-then-numpad

Same edits, same data. Tap a panel, type the number.

| # | Step | Verify | State |
|---|---|---|---|
| 2.1 | Reuse core + render + selection from Phase 0/1 | no engine/render change | ⬜ |
| 2.2 | Tap panel → numeric pad → set node size by number | width set by typing | ⬜ |
| 2.3 | Add shelf/divider/door from a menu | same result as A | ⬜ |
| 2.4 | Undo | steps back | ⬜ |
| 2.5 | Build URL B · watcher + agy review · report | Redmi | ⬜ |

---

## Phase 3 — Variant C · Line/seam dragging

Same edits. Drag the seams between compartments.

| # | Step | Verify | State |
|---|---|---|---|
| 3.1 | Reuse core + render + selection | no engine/render change | ⬜ |
| 3.2 | Draw seam handles between compartments; drag a seam → re-flow via division rules | compartments resize | ⬜ |
| 3.3 | Add shelf/divider/door by tapping a seam/zone | same result | ⬜ |
| 3.4 | Undo | steps back | ⬜ |
| 3.5 | Build URL C · watcher + agy review · report | Redmi | ⬜ |

---

## After all three

- Founder opens A / B / C on the Redmi, picks one.
- Losers deleted. No PR merges until he picks (DB/29 §4 Way 3).
- X-ray holes stay empty until the founder wires primitives into the decomposer
  (his seam work, DB/30) — expected, not a bug.

## Progress log (append one line per completed step)

- 2026-07-17 · Phase 0 setup: engine placed at `packages/construction` (Option A), brief written.
- 2026-07-17 · Phase 0 COMPLETE (0.1–0.7): shared core done — design model, decompose bridge, layout, instanced render, fps/draw-call overlay, undo/redo. All watcher-reviewed, all fixes applied. Gate: 3 variants render one cabinet, 0 errors, draws 1 / geom 1, fps green. Ready for agy phase review, then Phase 1 (Variant A).
- 2026-07-17 · Phase 1.1 — tap-to-select + highlight (nodeId, not part id). Watcher-reviewed. Commit 828a095.
- 2026-07-17 · Phase 1.2 — Variant A resize by direct manipulation (preview-during-drag, one commit on release). Watcher-reviewed. Commit c6a56ab (scene.ts support committed later with 1.3 — c6a56ab alone was missing it).
- 2026-07-17 · Phase 1.3 — add shelf/divider/door via on-screen action bar; findCabinetOf targets owning cabinet by nodeId; geom stays 1 on add. Watcher-reviewed, no blockers. Commit a8f1a9c.
- 2026-07-17 · Phase 1.4 — undo/redo buttons wired to History; app.undo/redo rerender + emitChange so bar refreshes. In-browser: undo steps back exactly, geom stays 1, 0 errors. Watcher review in progress.
