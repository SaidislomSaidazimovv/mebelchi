// The bill of materials — the normalised list the pricing layer consumes
// (PRICING_AND_SCHEMA.md §3). The engine derives panels/operations/hardware;
// each becomes a `BomLine`.

/** Quote grouping used by both `BomLine.group` and `Quote.groups`. */
export type QuoteGroup =
  | "carcassFacade"
  | "hardware"
  | "worktopEdge"
  | "cnc"
  | "delivery";

export type BomKind =
  | "panel"
  | "edge"
  | "hardware"
  | "operation"
  | "worktop"
  | "labor"
  | "delivery";

export type BomUnit = "m2" | "m" | "unit" | "hole" | "panel" | "module";

export interface BomLine {
  kind: BomKind;
  /** Material/sku/operation id. */
  ref: string;
  qty: number;
  unit: BomUnit;
  /** From the RateTable. */
  rate: number;
  /** qty * rate. */
  amount: number;
  group: QuoteGroup;
}

/**
 * What the engine emits before rates are applied — `buildBom`'s return shape
 * (PRICING_AND_SCHEMA.md §3). The pricing layer fills in `rate`, `amount` and
 * `group` to produce a full `BomLine`.
 */
export type RawBomLine = Omit<BomLine, "rate" | "amount" | "group">;
