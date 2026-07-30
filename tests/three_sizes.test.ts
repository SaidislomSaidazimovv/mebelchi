import { describe, it, expect } from "vitest";
import { threeSizes } from "../engine/structure/sizes.js";

describe("threeSizes", () => {
  it("Rohmaß subtracts front/back kromka from width and side kromka from length", () => {
    const s = threeSizes(7200, 5600, [10, 0, 0, 0], 0);
    expect(s.fertigLength).toBe(7200);
    expect(s.fertigWidth).toBe(5600);
    expect(s.rohWidth).toBe(5590);
    expect(s.rohLength).toBe(7200);
    expect(s.zuschnittWidth).toBe(5590);
    expect(s.zuschnittLength).toBe(7200);
  });

  it("all four edges banded 1mm reduce each dimension by 2mm", () => {
    const s = threeSizes(7200, 5600, [10, 10, 10, 10], 0);
    expect(s.rohWidth).toBe(5580);
    expect(s.rohLength).toBe(7180);
  });

  it("allowance is added onto the raw size for the cut size", () => {
    const s = threeSizes(7200, 5600, [10, 0, 0, 0], 20);
    expect(s.rohWidth).toBe(5590);
    expect(s.zuschnittWidth).toBe(5610);
    expect(s.zuschnittLength).toBe(7220);
  });
});
