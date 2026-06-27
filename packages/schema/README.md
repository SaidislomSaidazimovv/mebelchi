# @mebelchi/schema

The **one shared schema** — the central contract that engine, pricing, UI and the
RoomPlan plugin all read from. Types only, no logic.

See [`PRICING_AND_SCHEMA.md`](../../PRICING_AND_SCHEMA.md).

```
Project (parametric model) → BOM → × RateTable → Quote
```

## Types

| File | Exports |
| --- | --- |
| `common.ts` | `UUID`, `MM` |
| `space.ts` | `Space`, `SpaceConstraint`, `Opening` |
| `module.ts` | `Module` (+ `ModuleKind`, `ModuleFill`, `DoorStyle`, `HandleType`, …) |
| `project.ts` | `Project`, `MaterialSelection`, `ProjectPricing`, `ProjectMeta` |
| `rates.ts` | `RateTable` (+ `MaterialRate`, `EdgeRate`, `HardwareRate`, …) |
| `bom.ts` | `BomLine`, `RawBomLine`, `BomKind`, `BomUnit`, `QuoteGroup` |
| `quote.ts` | `Quote` |

Everything is re-exported from `src/index.ts`.

## Notes

- All dimensions are whole **millimetres** (`MM`). The engine's lower-level
  machining contract uses `mm10` (tenths) separately.
- `Opening` is referenced but left undefined in the spec; the shape here is a
  minimal placeholder pending the scan-normalisation contract.
- `RawBomLine = Omit<BomLine, 'rate' | 'amount' | 'group'>` is the engine's
  `buildBom` output, before the pricing layer applies rates.

## Typecheck

```sh
npm run typecheck    # tsc --noEmit
```
