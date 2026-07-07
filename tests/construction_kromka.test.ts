// Step 6 (Gate 6) — per-edge kromka (jiyak) accounting: assign K-variables to edges, the cut list gets
// exactly those running metres per K; a rounded corner makes a fully-banded edge arc-length.
import { describe, it, expect } from "vitest";
import { edgeLengths, kromkaMetersByVariable, outlinePerimeter } from "../engine/structure/features.js";

describe("Step 6 — kromka metres per variable", () => {
  it("edge lengths are [front, back, side, side] = [L, L, W, W]", () => {
    expect(edgeLengths(6000, 4000)).toEqual([6000, 6000, 4000, 4000]);
  });

  it("K1 on 3 edges + K2 on 1 → exactly those metres (Gate 6)", () => {
    const m = kromkaMetersByVariable(6000, 4000, ["K1", "K1", "K1", "K2"]);
    expect(m.K1).toBe(6000 + 6000 + 4000); // front + back + one side = 16000
    expect(m.K2).toBe(4000); // the other side
  });

  it("a bare (null) edge contributes no kromka", () => {
    const m = kromkaMetersByVariable(6000, 4000, ["K1", null, null, null]);
    expect(m.K1).toBe(6000);
    expect(Object.keys(m)).toEqual(["K1"]);
  });

  it("no kromka overlay → no metres", () => {
    expect(kromkaMetersByVariable(6000, 4000, undefined)).toEqual({});
  });

  it("a fully-banded panel with rounded corners bands the ARC perimeter, not the box", () => {
    const r = 150;
    const m = kromkaMetersByVariable(6000, 4000, ["K1", "K1", "K1", "K1"], [r, r, r, r]);
    expect(m.K1).toBe(outlinePerimeter(6000, 4000, [r, r, r, r]));
    expect(m.K1).toBeLessThan(2 * (6000 + 4000)); // shorter than the sharp-cornered box
  });
});
