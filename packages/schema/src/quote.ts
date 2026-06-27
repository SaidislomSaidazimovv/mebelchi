// The quote — the grouped total shown as a live ticker (PRICING_AND_SCHEMA.md §4).
// Produced by the pure `priceProject(project, rates)` function in packages/pricing.

import type { BomLine, QuoteGroup } from "./bom.js";

export interface Quote {
  currency: "UZS";
  total: number;
  groups: Record<QuoteGroup, number>;
  lines: BomLine[];
  itemCount: number;
}
