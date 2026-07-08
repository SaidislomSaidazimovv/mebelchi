// Step 10 — the library auto-categorises a saved karkas block by what it CONTAINS (function-first), so
// entries organise themselves with zero manual filing (Gate 10).
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { addInstance } from "../engine/structure/operations.js";
import { karkasCategory, libraryItemFromKarkas } from "../apps/app/src/model/library";
import { DEFAULT_PLAN } from "../apps/app/src/three/materials";
import type { StructuralModel } from "../engine/contracts/structure.js";

const json = (m: StructuralModel) => JSON.stringify({ version: 1, model: m, plan: DEFAULT_PLAN });
const leaf = (m: StructuralModel) => m.blocks[0]!.zones[0]!.root.id;
const withKind = (kind: "shelf" | "door" | "drawer") => {
  const m = buildCarcassModel(600, 720, 560);
  return addInstance(m, leaf(m), kind);
};

describe("Step 10 — library auto-category", () => {
  it("an empty carcass → «Bo'sh karkas»", () => {
    expect(karkasCategory(json(buildCarcassModel(600, 720, 560)))).toBe("Bo'sh karkas");
  });
  it("shelves → «Ochiq polka»", () => {
    expect(karkasCategory(json(withKind("shelf")))).toBe("Ochiq polka");
  });
  it("a door → «Eshikli shkaf»", () => {
    expect(karkasCategory(json(withKind("door")))).toBe("Eshikli shkaf");
  });
  it("a drawer → «Yashikli»", () => {
    expect(karkasCategory(json(withKind("drawer")))).toBe("Yashikli");
  });
  it("a drawer wins over a shelf (it's a drawer unit)", () => {
    let m = withKind("shelf");
    m = addInstance(m, leaf(m), "drawer");
    expect(karkasCategory(json(m))).toBe("Yashikli");
  });
  it("malformed json → «Boshqa» (never throws)", () => {
    expect(karkasCategory("not json")).toBe("Boshqa");
  });
  it("libraryItemFromKarkas stamps the computed category", () => {
    const item = libraryItemFromKarkas("Mening shkafim", json(withKind("door")));
    expect(item.category).toBe("Eshikli shkaf");
    expect(item.karkasJson).toBeTruthy();
  });
});
