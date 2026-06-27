# @mebelchi/pricing

Pure pricing over [`@mebelchi/schema`](../schema). No network, no UI, no file I/O on
the hot path — same model + same rates → same quote (PRICING_AND_SCHEMA.md §4).

```
Project ──buildBom──▶ BOM (RawBomLine[]) ──priceProject(× RateTable)──▶ Quote
```

## API

| Function | Signature | Notes |
| --- | --- | --- |
| `modulesToParts` | `(project) → Part[]` | The "turn a Project into a list of parts" step — emits **engine** `Part` objects (mm10, the engine's locked contract). Feed to `solveFull` for the manufacturing path. |
| `buildBom` | `(project) → RawBomLine[]` | Normalised BOM: panels, edges, hardware, operations, worktop, labor, delivery. Quantities + refs only — no rates. |
| `priceProject` | `(project, rateTable) → Quote` | Applies rates, rounds each line to whole сум, rolls up into the 5 UI groups + total. This is the live ticker. |
| `seedRateTable` | `RateTable` | Typed loader for the placeholder seed. |

## Decomposition (placeholder — frameless LDSP carcass)

Per module: 2 sides + top + bottom + back + `count` shelves + `dividers` →
carcass panels; one door **or** `count` drawer fronts → facade panels. Hardware:
2–4 hinges/door, one slide set/drawer, 8 cams + 8 dowels/carcass. Holes, cuts and
edge-banding metres are counted from that geometry. All tunables live in
[`src/constants.ts`](src/constants.ts) — these are engineering assumptions, **not**
rates (rates stay in the `RateTable`). When the engine's Layer-2 parametric solver
lands, this decomposition moves behind it and pricing keeps reading the same table.

Known simplifications: the back is priced as carcass material (the schema's
`MaterialSelection` has no separate back material); hardware is one default kit
keyed by SKU (`DEFAULT_HARDWARE_SKUS`) until a per-module hardware model exists.

### Group mapping

`panel`,`labor` → **Корпус и фасад** · `edge`,`worktop` → **Столешница и кромка** ·
`hardware` → **Фурнитура** · `operation` → **Сверловка/ЧПУ** · `delivery` → **Доставка**.

## Test

[`test/priceProject.test.ts`](test/priceProject.test.ts) prices one example kitchen
(one 600×720×560 base cabinet) against the seed table and asserts the
**hand-checked total of 767 794 UZS**, the group breakdown, and the
Σgroups = Σlines = total invariant.

```sh
# from the repo root, using the root-installed vitest:
node_modules/.bin/vitest run --config packages/pricing/vitest.config.ts
```
