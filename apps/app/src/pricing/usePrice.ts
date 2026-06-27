// The live ticker. Recomputes priceProject on every store change that affects
// the model — cheap by design (PRICING_AND_SCHEMA.md: BOM × rates at 60fps).
// Returns 0 while there are no modules (quiz / space phases) so the ticker hides.

import { priceProject, seedRateTable } from "@mebelchi/pricing";
import { useStore } from "../store";
import { toProject } from "../model/toProject";

export function usePrice(): number {
  return useStore((s) =>
    s.cabs.length ? priceProject(toProject(s), seedRateTable).total : 0,
  );
}
