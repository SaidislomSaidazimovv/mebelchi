// #19 — the ghost-prop silhouette library picks its figure from the tagged purpose AND the space's own
// size. A purpose alone is too coarse: a 2 m «hanging» bay holds coats, a 0.6 m one holds shirts, and an
// «appliance» bay is a fridge, an oven or a microwave depending on how tall it is. These tests pin the
// thresholds so a resize can't silently swap a client's fridge for a microwave.

import { describe, expect, it } from "vitest";

import { ghostVariant } from "../apps/app/src/three/structureRenderer.js";

const space = (h: number, w = 0.6, d = 0.56) => ({ w, h, d });

describe("ghostVariant — hanging", () => {
  it("a full-height bay gets long garments", () => {
    expect(ghostVariant("hanging", space(1.8))).toBe("hanging_long");
  });
  it("a short bay gets shirts on hangers", () => {
    expect(ghostVariant("hanging", space(0.6))).toBe("hanging_short");
  });
  it("switches exactly at 1.0 m", () => {
    expect(ghostVariant("hanging", space(1.0))).toBe("hanging_long");
    expect(ghostVariant("hanging", space(0.999))).toBe("hanging_short");
  });
});

describe("ghostVariant — appliance", () => {
  it("tall → fridge", () => expect(ghostVariant("appliance", space(1.8))).toBe("appliance_fridge"));
  it("mid → oven", () => expect(ghostVariant("appliance", space(0.6))).toBe("appliance_oven"));
  it("small → microwave", () => expect(ghostVariant("appliance", space(0.3))).toBe("appliance_micro"));
  it("holds its two thresholds", () => {
    expect(ghostVariant("appliance", space(1.0))).toBe("appliance_fridge");
    expect(ghostVariant("appliance", space(0.999))).toBe("appliance_oven");
    expect(ghostVariant("appliance", space(0.4))).toBe("appliance_oven");
    expect(ghostVariant("appliance", space(0.399))).toBe("appliance_micro");
  });
});

describe("ghostVariant — storage & display", () => {
  it("a deep-enough bay stacks boxes, a shallow one uses trays", () => {
    expect(ghostVariant("storage", space(0.9))).toBe("storage_boxes");
    expect(ghostVariant("storage", space(0.2))).toBe("storage_baskets");
  });
  it("display splits on DEPTH, not height — plates need depth, glasses do not", () => {
    expect(ghostVariant("display", space(0.4, 0.6, 0.35))).toBe("display_plates");
    expect(ghostVariant("display", space(0.4, 0.6, 0.18))).toBe("display_glasses");
  });
});

describe("ghostVariant — single-form purposes", () => {
  it("passes through the ones with only one sensible figure", () => {
    for (const p of ["boiler", "drawer", "structural"]) {
      expect(ghostVariant(p, space(0.5))).toBe(p);
      expect(ghostVariant(p, space(2.0))).toBe(p); // size must not change these
    }
  });
  it("leaves an unknown tag alone so the caller can fall back to a plain block", () => {
    expect(ghostVariant("something_new", space(0.5))).toBe("something_new");
  });
});

describe("the library is actually a library", () => {
  it("covers 12 distinct silhouettes across the tag set", () => {
    const purposes = ["boiler", "hanging", "storage", "appliance", "drawer", "display", "structural"];
    const heights = [0.2, 0.3, 0.5, 0.6, 0.9, 1.0, 1.8];
    const depths = [0.18, 0.35];
    const seen = new Set<string>();
    for (const p of purposes) for (const h of heights) for (const d of depths) seen.add(ghostVariant(p, space(h, 0.6, d)));
    expect(seen.size).toBe(12);
  });
});
