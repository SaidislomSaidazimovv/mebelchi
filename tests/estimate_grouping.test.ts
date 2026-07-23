// M8.2 — the cut list an usta carries to the saw. A wardrobe wants four identical shelves; printing
// them as four lines made his paper three times longer than the work, and he had to count by eye.
// Rows now fold into «×N», and he picks the order he cuts in.
//
// The danger is arithmetic: a fold must never lose a panel, a square metre or a som. Every test here
// exists for that — the grouped list must add up to exactly the ungrouped one.

import { describe, it, expect } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel, buildBookshelf, buildDemoModel } from "../engine/structure/demoModel.js";
import { estimate, groupSpecs, sortSpecs, type PartSpec } from "../apps/app/src/three/estimate.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

const tk = planThickness(DEFAULT_PLAN);
const specsOf = (m: Parameters<typeof solveStructure>[0]) => estimate(solveStructure(m, tk), DEFAULT_PLAN).parts;

const spec = (o: Partial<PartSpec> & { id: string }): PartSpec => ({
  name: "Polka", w_mm: 300, l_mm: 560, t_mm: 16, areaM2: 0.168, edgeM: 0.56,
  bands: [true, false, false, false], materialName: "ЛДСП Белый", priceUzs: 1000, ...o,
});

describe("M8.2 — a fold never loses anything", () => {
  for (const [label, make] of [["stellaj", buildBookshelf], ["namuna shkaf", buildDemoModel], ["shkaf", () => buildCarcassModel(600, 720, 560)]] as const) {
    it(`${label}: the quantities add back up to every panel`, () => {
      const specs = specsOf(make());
      const rows = groupSpecs(specs);
      expect(rows.reduce((n, r) => n + r.qty, 0)).toBe(specs.length);
      expect(rows.flatMap((r) => r.ids).sort()).toEqual(specs.map((s) => s.id).sort()); // every id survives
    });

    it(`${label}: area, kromka and price are identical grouped or not`, () => {
      const specs = specsOf(make());
      const rows = groupSpecs(specs);
      const sum = (f: (s: { areaM2: number; edgeM: number; priceUzs: number }) => number) =>
        +(specs.reduce((n, s) => n + f(s), 0)).toFixed(6) === +(rows.reduce((n, r) => n + f(r), 0)).toFixed(6);
      expect(sum((s) => s.areaM2)).toBe(true);
      expect(sum((s) => s.edgeM)).toBe(true);
      expect(sum((s) => s.priceUzs)).toBe(true);
    });
  }
});

describe("M8.2 — what counts as the SAME cut", () => {
  it("same name, size, decor and banding → one row of ×2", () => {
    const rows = groupSpecs([spec({ id: "a" }), spec({ id: "b" })]);
    expect(rows.length).toBe(1);
    expect(rows[0]!.qty).toBe(2);
    expect(rows[0]!.ids).toEqual(["a", "b"]);
  });

  it("a different BANDING pattern is a different part — the edge work is not the same", () => {
    const rows = groupSpecs([spec({ id: "a" }), spec({ id: "b", bands: [true, true, false, false] })]);
    expect(rows.length).toBe(2);
  });

  for (const [what, patch] of [["length", { l_mm: 561 }], ["width", { w_mm: 301 }], ["thickness", { t_mm: 18 }],
    ["decor", { materialName: "ЛДСП Венге" }], ["name", { name: "Yon panel" }]] as const) {
    it(`a different ${what} is a different row`, () => {
      expect(groupSpecs([spec({ id: "a" }), spec({ id: "b", ...patch })]).length).toBe(2);
    });
  }

  it("rows keep the order the panels first appeared in (the cabinet's own order)", () => {
    const rows = groupSpecs([spec({ id: "a", name: "Tepa" }), spec({ id: "b", name: "Yon" }), spec({ id: "c", name: "Tepa" })]);
    expect(rows.map((r) => r.name)).toEqual(["Tepa", "Yon"]);
    expect(rows[0]!.qty).toBe(2);
  });
});

describe("M8.2 — the order the usta cuts in", () => {
  const rows = () => groupSpecs([
    spec({ id: "a", name: "Yon", l_mm: 700, materialName: "ЛДСП Венге" }),
    spec({ id: "b", name: "Polka", l_mm: 560, materialName: "ЛДСП Белый" }),
    spec({ id: "c", name: "Tepa", l_mm: 900, materialName: "ЛДСП Белый" }),
  ]);

  it("«model» leaves the cabinet's own order alone", () => {
    expect(sortSpecs(rows(), "model").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("«length» puts the longest first — the saw starts big", () => {
    expect(sortSpecs(rows(), "length").map((r) => r.l_mm)).toEqual([900, 700, 560]);
  });

  it("«name» and «material» sort alphabetically", () => {
    expect(sortSpecs(rows(), "name").map((r) => r.name)).toEqual(["Polka", "Tepa", "Yon"]);
    expect(sortSpecs(rows(), "material").map((r) => r.materialName)[0]).toBe("ЛДСП Белый");
  });

  it("sorting never adds, drops or changes a row", () => {
    const base = rows();
    for (const by of ["model", "name", "length", "material"] as const) {
      const s = sortSpecs(base, by);
      expect(s.length).toBe(base.length);
      expect(s.map((r) => r.id).sort()).toEqual(base.map((r) => r.id).sort());
    }
  });
});
