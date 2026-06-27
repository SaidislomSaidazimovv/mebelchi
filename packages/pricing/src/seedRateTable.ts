// Typed loader for the seeded placeholder rate table (PRICING_AND_SCHEMA.md §6.4).
// The JSON's string fields widen on import, so we narrow to RateTable here — the
// same pattern the engine uses for its hardware spec. Replace the JSON's numbers
// with a real eman.uz snapshot later; this loader is untouched.

import type { RateTable } from "../../schema/src/index.js";
import raw from "../seed/rate-table.seed.json" with { type: "json" };

export const seedRateTable = raw as unknown as RateTable;
