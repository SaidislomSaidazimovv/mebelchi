# Code-review brief for the 3D construction app (read this once, then review)

You are reviewing **`packages/design/**` only** — the 3D furniture-construction app
Saidislom is building for the founder. Read this whole file before your first review.
It tells you the one law, the boundary, and how to start. Nothing else in the repo is
yours to flag.

---

## 1. What this app is (one paragraph)

A standalone 3D app where a master builds and edits the **construction** of a cabinet
with a finger. It is being built in **3 variants** that differ ONLY in the interaction
model (how you edit with a finger). Same data, same content, same engine. The founder
opens all three on his Redmi and picks one.

## 2. The one law you enforce (this is 80% of the review)

> **A panel is an OUTPUT. The app edits the design and asks the engine for panels.**

The only legal edit loop is:

```
user drags → mutate a DesignNode → panelDecomposition(design, profile) → new Parts → update matrices
```

**REJECT any code that does the opposite:**

- ❌ Setting a panel/part size, position, or geometry directly.
  (`part.length_mm10 = …`, `mesh.scale.set(…)` as the source of truth, moving a panel
  instead of the design node behind it.)
- ❌ Storing Parts as app state, or snapshotting Parts for undo.
  Parts are re-derived. **Undo = restore a DesignNode snapshot**, never a Part snapshot.
- ❌ Keying selection / undo / UI state on `part.id`. Part ids are DERIVED and disappear
  when the design output changes. **Key on `nodeId`** (assigned once, never changes).
  Use `result.provenance[part.id].nodeId` to go from "tapped panel" → "which node to edit".
- ❌ Computing construction in the app: thickness, kromka, groove, hole, setback,
  bottom-placement. There is no field for these in a DesignNode and there must be none
  in the app. Construction comes only from the `ConstructionProfile`.

If you see any of these, that is the highest-severity finding. Everything else is minor
next to it.

## 3. The render rules (already proven — flag regressions, not the rules)

- Panels = one shared box geometry, transformed per instance. **Never rebuilt** during a
  drag. If `renderer.info.memory.geometries` climbs while dragging, a rebuild leaked in —
  flag it.
- **No CSG, no booleans, no geometry cutting.** Holes are `InstancedMesh` markers, not
  subtractions.
- Live edit = **matrix updates only** (`setMatrixAt` + `needsUpdate`).
- Continuous input (drag, pinch) must not `setState` per frame in React and re-render the
  tree — flag it (this is the documented Mali-device killer).
- mm → metres scale = 0.001.

## 4. The boundary — DO NOT flag these as issues

These are outside the design app. They are the founder's, frozen, or already proven.
Do **not** suggest changes to them; do **not** count their state as a defect:

- `packages/construction/**` — the engine, contracts, profile, primitives. Read-only law.
  (Known and expected: `panelDecomposition` emits zero drilling and is not exported from
  `engine/index.ts` yet. That is the founder's seam work, NOT an app defect. So **X-ray
  showing no holes is EXPECTED**, not a bug — do not flag it.)
- `engine/**` — the separate old v4 world.
- `tests/**` — the golden suite.
- `packages/render-spike/**` — the proven render foundation. The app borrows its render
  pattern; the spike itself is not under review.
- Any `.md` spec file, `.gitignore`, config.

If you believe something in `packages/construction/**` genuinely must change, say so as a
**note to the founder ("contract conversation")**, not as an app finding to fix.

## 5. What "good" looks like (the founder's acceptance)

The founder checks these on his Redmi. Review the code as serving them:

1. Resize a cabinet with a finger — obvious, lands where expected.
2. Add/move a shelf and a divider; a door.
3. X-ray on → holes appear **from the engine** (empty until the founder wires primitives —
   see §4).
4. Undo returns exactly the previous state (design snapshot).
5. **≥30 fps during every edit** (the overlay proves it).
6. Explainable to a mebelchi in 20 seconds.

## 6. How to start a review (mechanical)

1. Review the **diff of `packages/design/**`** for the phase just finished. Ignore the
   rest of the repo.
2. First pass — the law (§2): grep the diff for direct panel mutation, Part-keyed state,
   Part snapshots, construction math. These are blockers.
3. Second pass — render discipline (§3): per-frame setState, geometry rebuilds in drag,
   CSG, non-matrix edits.
4. Third pass — ordinary correctness: undo edge cases, selection identity, dead code,
   the interaction actually doing what the variant claims.
5. Report blockers first, then minors. For each: file:line, the rule it breaks, the fix.

## 7. Cadence (when you run)

- After **each phase** completes (the shared core, then each of the 3 variants) — before
  the founder sees it.
- Before **any commit** on `packages/design/`.
- Not on every small edit. Review reviewable chunks.

---

**The single line, if you read nothing else:**
> The app edits DesignNodes and renders whatever `panelDecomposition` returns. The moment
> the app sets a panel directly, computes a hole, or snapshots a Part, the law is broken —
> that is the finding that matters most.
