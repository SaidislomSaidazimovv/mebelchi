// Shared primitives for the Mebelchi product schema.
// See PRICING_AND_SCHEMA.md §1. All dimensions are millimetres; the engine's own
// machining contract uses mm10 (engine/contracts/types.ts) — this product-level
// schema is coarser and human-facing.

/** A stable identifier (UUID v4 string). */
export type UUID = string;

/** A linear dimension in whole millimetres. */
export type MM = number;
