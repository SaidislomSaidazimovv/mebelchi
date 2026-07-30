import { describe, it, expect } from "vitest";

import { densityFor, partWeightKg, rowsWeightKg } from "../apps/app/src/three/weight";
import { groupSpecs, type PartSpec } from "../apps/app/src/three/estimate";

const spec = (o: Partial<PartSpec> & { id: string }): PartSpec => ({
  name: "Полка", w_mm: 300, l_mm: 560, t_mm: 16, rohW_mm: 299, rohL_mm: 560, cutW_mm: 299, cutL_mm: 560, areaM2: 0.168, edgeM: 0.56,
  bands: [true, false, false, false], materialName: "ЛДСП Белый", priceUzs: 1000, ...o,
});

describe("densityFor", () => {
  it("real glass and mirror are 2500", () => {
    expect(densityFor("Стекло прозрачное")).toBe(2500);
    expect(densityFor("Стекло матовое")).toBe(2500);
    expect(densityFor("Зеркало")).toBe(2500);
  });

  it("board families use their grounded density", () => {
    expect(densityFor("ЛДСП Белый")).toBe(700);
    expect(densityFor("МДФ Белый мат")).toBe(750);
    expect(densityFor("ХДФ Белый (задняя)")).toBe(800);
  });

  it("solid timber is per species", () => {
    expect(densityFor("Массив Бук")).toBe(710);
    expect(densityFor("Массив Терак (тополь)")).toBe(450);
    expect(densityFor("Массив Эманд (дуб)")).toBe(720);
  });

  it("metal- and marble-look decors keep board density, not steel/stone", () => {
    expect(densityFor("Металл шлифованный")).toBe(700);
    expect(densityFor("Мрамор белый")).toBe(700);
  });

  it("an unknown material falls back to board density", () => {
    expect(densityFor("Нет такого материала")).toBe(700);
  });
});

describe("partWeightKg", () => {
  it("computes volume × density in kg", () => {
    expect(partWeightKg(2750, 1830, 16, "ЛДСП Белый")).toBeCloseTo(56.364, 2);
    expect(partWeightKg(1000, 500, 4, "Стекло прозрачное")).toBeCloseTo(5, 5);
    expect(partWeightKg(2000, 1000, 18, "МДФ Белый мат")).toBeCloseTo(27, 5);
  });

  it("guards against non-positive dimensions", () => {
    expect(partWeightKg(0, 500, 16, "ЛДСП Белый")).toBe(0);
    expect(partWeightKg(560, -1, 16, "ЛДСП Белый")).toBe(0);
    expect(partWeightKg(560, 300, 0, "ЛДСП Белый")).toBe(0);
  });
});

describe("rowsWeightKg", () => {
  it("sums part weight across quantities", () => {
    const rows = groupSpecs([spec({ id: "a" }), spec({ id: "b" })]);
    const one = partWeightKg(560, 300, 16, "ЛДСП Белый");
    expect(rowsWeightKg(rows)).toBeCloseTo(one * 2, 6);
  });

  it("mixes materials by their own density", () => {
    const rows = groupSpecs([
      spec({ id: "a", materialName: "ЛДСП Белый" }),
      spec({ id: "b", name: "Стекло", materialName: "Стекло прозрачное", t_mm: 4 }),
    ]);
    const expected = partWeightKg(560, 300, 16, "ЛДСП Белый") + partWeightKg(560, 300, 4, "Стекло прозрачное");
    expect(rowsWeightKg(rows)).toBeCloseTo(expected, 6);
  });
});
