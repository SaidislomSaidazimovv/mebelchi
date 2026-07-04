// Karkas blocks fold into the kitchen quote + factory handoff — blockPriceUzs / blockCutList solve
// a saved block's {model, plan} JSON fresh and price + list its parts (UZS). Tolerant of bad input.
import { describe, it, expect } from "vitest";
import { blockPriceUzs, blockCutList } from "../apps/app/src/three/estimate.js";
import { cellToKarkasBlock } from "../apps/app/src/three/cellToKarkas.js";
import { mk } from "../apps/app/src/model/cabinet.js";

const blockJson = (cab: Parameters<typeof cellToKarkasBlock>[0]): string => {
  const { model, plan } = cellToKarkasBlock(cab);
  return JSON.stringify({ version: 1, model, plan });
};

describe("blockPriceUzs / blockCutList — placed karkas blocks in quote + handoff", () => {
  it("prices a real block in UZS (> 0) and grows with content", () => {
    const small = blockPriceUzs(blockJson(mk({ fill: "open", count: 0, w: 400, h: 400 })));
    const big = blockPriceUzs(blockJson(mk({ fill: "shelves", count: 3, door: 0, w: 800, h: 2000 })));
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small); // more panels + a door + shelves cost more
  });

  it("lists the block's cut-list rows with real dimensions + material", () => {
    const rows = blockCutList(blockJson(mk({ fill: "shelves", count: 2, door: 0, w: 600, h: 720 })));
    expect(rows.length).toBeGreaterThan(5); // 5 carcass panels + 2 shelves + door
    for (const r of rows) {
      expect(r.lengthMm).toBeGreaterThan(0);
      expect(r.widthMm).toBeGreaterThan(0);
      expect(r.thicknessMm).toBeGreaterThan(0);
      expect(typeof r.material).toBe("string");
    }
  });

  it("is tolerant: malformed / empty JSON prices at 0 with an empty cut list", () => {
    expect(blockPriceUzs("not json")).toBe(0);
    expect(blockPriceUzs(JSON.stringify({ model: { blocks: [] } }))).toBe(0);
    expect(blockCutList("{bad")).toEqual([]);
  });
});
