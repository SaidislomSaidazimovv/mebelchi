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

**Update (Phase 3, Variant C):** a DIVIDER's X position is now honoured from its
node's fixed `Division` — because *placing* a panel is a visualisation concern the
app owns (see `layout.ts` header), the app can move a divider without any engine
change. So Variant C's seam-drag re-flows compartments correctly on screen.

What is STILL engine-owned and awaits the decompose result carrying placement:
- a SHELF's true height (still evenly spread);
- the manufactured WIDTHS of the parts on either side of a moved divider (a wider
  left compartment should yield a wider left shelf — that per-compartment sizing is
  construction, not layout, so the app cannot compute it).

So Variant C is correct in *interaction and design intent* (the Division is edited,
undo works, the divider moves) but the neighbouring parts' manufactured sizes won't
reflect the move until the engine honours Division. Expected, logged, not a bug.

**Status:** open, founder-owned. Not blocking the 3 variants.
