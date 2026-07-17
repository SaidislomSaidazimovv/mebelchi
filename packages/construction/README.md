# @mebelchi/construction — the construction world

DB/29 §3 **Option A**. This is one of the two worlds:

```
packages/construction/   profile · panelDecomposition · engine · goldens   → FOUNDER (PR-gated)
packages/design/         3D · blocks · editing · navigation                → SAIDISLOM  (to build)
```

## The law it enforces (DB/27, SACRED)

- A `DesignBlock` carries **intent** — it has no field for thickness, kromka, groove,
  hole, or placement. A community author *cannot* ship a construction opinion.
- Construction lives in exactly one `ConstructionProfile` per project.
- `panelDecomposition(design, profile) → Part[]` is the only bridge. Parts are
  **computed, never stored, never shared.**

## Public surface

```ts
import { QORASU_PROFILE } from "@mebelchi/construction/profiles";
import { panelDecomposition } from "@mebelchi/construction/decompose";
import type { DesignNode, DesignProject, ConstructionProfile } from "@mebelchi/construction/design";
```

## Do not touch (from TASK_3D_CONSTRUCTION.md)

The design world **reads** this package and never writes it. Changing anything here
is a contract conversation, not a code change. `panelDecomposition`, the contracts,
the profile, and the primitives are the founder's, PR-gated.

## Status (DB/30)

Spine done and proven; organs ~40%. `panelDecomposition` emits panels + back grooves
and **zero drilling** (primitives exist but are not wired into the decomposer yet),
and it is **not yet exported from `engine/index.ts`** — the seam to `solveFull` is
unjoined. Both are the founder's items, not the design app's.

## History

Moved here from a founder drop that unzipped into `engine/engine/` (with `__MACOSX`
junk). Placed per Option A; the existing v4 `../../engine/` (StructuralModel, the
shipped beta) is the separate old world and is untouched.
