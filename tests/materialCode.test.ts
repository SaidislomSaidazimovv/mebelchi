import { describe, it, expect } from "vitest";

import { buildMaterialCoding } from "../apps/app/src/three/materialCode";
import { groupSpecs, type PartSpec } from "../apps/app/src/three/estimate";

const spec = (o: Partial<PartSpec> & { id: string }): PartSpec => ({
  name: "Полка", w_mm: 300, l_mm: 560, t_mm: 16, rohW_mm: 299, rohL_mm: 560, cutW_mm: 299, cutL_mm: 560, areaM2: 0.168, edgeM: 0.56,
  bands: [true, false, false, false], materialName: "ЛДСП Белый", priceUzs: 1000, ...o,
});
const coding = (specs: PartSpec[]) => buildMaterialCoding(groupSpecs(specs));

describe("material coding — М codes", () => {
  it("distinct (material, thickness) pairs get М1, М2, М3 in first-appearance order", () => {
    const c = coding([
      spec({ id: "a", materialName: "ЛДСП Белый", t_mm: 16 }),
      spec({ id: "b", materialName: "ЛДСП Сонома", t_mm: 16, name: "Бок" }),
      spec({ id: "c", materialName: "МДФ Белый", t_mm: 18, name: "Фасад" }),
    ]);
    expect(c.mats.map((m) => m.code)).toEqual(["М1", "М2", "М3"]);
    expect(c.matOf("ЛДСП Белый", 16)).toBe("М1");
    expect(c.matOf("ЛДСП Сонома", 16)).toBe("М2");
    expect(c.matOf("МДФ Белый", 18)).toBe("М3");
  });

  it("same material name but different thickness is a different code", () => {
    const c = coding([
      spec({ id: "a", materialName: "ЛДСП Белый", t_mm: 16 }),
      spec({ id: "b", materialName: "ЛДСП Белый", t_mm: 18, name: "Бок" }),
    ]);
    expect(c.mats.length).toBe(2);
    expect(c.matOf("ЛДСП Белый", 16)).toBe("М1");
    expect(c.matOf("ЛДСП Белый", 18)).toBe("М2");
  });

  it("the same (material, thickness) keeps one code however often it appears", () => {
    const c = coding([
      spec({ id: "a", materialName: "ЛДСП Белый", t_mm: 16, name: "Полка" }),
      spec({ id: "b", materialName: "ЛДСП Белый", t_mm: 16, name: "Бок" }),
      spec({ id: "c", materialName: "ЛДСП Белый", t_mm: 16, name: "Дно" }),
    ]);
    expect(c.mats.length).toBe(1);
    expect(c.matOf("ЛДСП Белый", 16)).toBe("М1");
  });

  it("an unknown material or thickness resolves to «—»", () => {
    const c = coding([spec({ id: "a" })]);
    expect(c.matOf("Нет такого", 16)).toBe("—");
    expect(c.matOf("ЛДСП Белый", 25)).toBe("—");
  });

  it("the full descriptor is «name · thickness мм · sheet»", () => {
    const c = coding([spec({ id: "a", materialName: "ЛДСП Белый", t_mm: 16 })]);
    expect(c.mats[0]!.full).toBe("ЛДСП Белый · 16 мм · 2750×1830");
    expect(c.mats[0]!.sheet).toBe("2750×1830");
    expect(c.mats[0]!.t_mm).toBe(16);
  });
});

describe("edge coding — К codes", () => {
  it("distinct edges get К1, К2 in order; parts without an edge are ignored", () => {
    const c = coding([
      spec({ id: "a", edgeName: "ПВХ Белый 0.4" }),
      spec({ id: "b", edgeName: undefined, name: "Задняя" }),
      spec({ id: "c", edgeName: "ПВХ Дуб 2.0", name: "Фасад" }),
    ]);
    expect(c.edges.map((e) => e.code)).toEqual(["К1", "К2"]);
    expect(c.edgeOf("ПВХ Белый 0.4")).toBe("К1");
    expect(c.edgeOf("ПВХ Дуб 2.0")).toBe("К2");
  });

  it("an undefined or unknown edge resolves to «—»", () => {
    const c = coding([spec({ id: "a", edgeName: "ПВХ Белый 0.4" })]);
    expect(c.edgeOf(undefined)).toBe("—");
    expect(c.edgeOf("Нет")).toBe("—");
  });
});
