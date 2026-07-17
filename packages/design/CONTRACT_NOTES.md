# Contract notes to the founder

Things the design app CANNOT do without a change in `packages/construction` (the
engine). These are not app bugs — they are seam/contract gaps. Per TASK_3D: if the
design app needs the engine to change, it is a contract conversation, logged here,
not a code change we make ourselves.

---

## 1. Shelf / divider position is not in the decompose result (Phase 0.4a)

`panelDecomposition` returns Parts with dimensions only — no height, no anchor, no
compartment index. So when the app lays a cabinet out in 3D, it cannot know a
shelf's true height or a divider's true position; it spreads them evenly as a
placeholder.

This means a node's `Division` (fixed / ratio / flex) — which the design model
already carries — has no effect on where the shelf renders, because the fact never
reaches the app.

**To fix (engine side):** the decompose result would need to carry, per part, its
placement or at least an anchor/compartment index — e.g. extend `provenance` with a
position, or add a placed-part output. Then the app renders shelves at their real
height and honours Division.

**Until then:** even spread is a deliberate placeholder, correct in count and
identity, approximate in height. Acceptance ("add/move a shelf") still works — the
shelf exists, is selectable, and re-decomposes correctly; only its exact Y is
nominal.

**Status:** open, founder-owned. Not blocking the 3 variants.
