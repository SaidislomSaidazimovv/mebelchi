import { describe, it, expect } from "vitest";

import { sellingPrice } from "../apps/app/src/model/pricing";

describe("sellingPrice", () => {
  it("adds the margin percentage on top of cost", () => {
    expect(sellingPrice(1_000_000, 25)).toBe(1_250_000);
    expect(sellingPrice(1_000_000, 30)).toBe(1_300_000);
    expect(sellingPrice(2_000_000, 20)).toBe(2_400_000);
  });

  it("returns the cost unchanged at 0% margin", () => {
    expect(sellingPrice(1_000_000, 0)).toBe(1_000_000);
    expect(sellingPrice(0, 25)).toBe(0);
  });

  it("rounds to whole som", () => {
    expect(sellingPrice(999, 25)).toBe(1249);
    expect(sellingPrice(1234567, 25)).toBe(Math.round(1234567 * 1.25));
  });
});
