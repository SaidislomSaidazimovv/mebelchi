// SAFETY NET for the "rich Cell → BOM/CNC" work. Locks the CURRENT price + cut-list output of the
// legacy pipeline (cabToModule → pricing / production) for representative cabinets, so any change
// that alters a SIMPLE cabinet's factory output fails loudly. Snapshots are the baseline BEFORE the
// rich-Cell change; simple cabinets must stay byte-identical, only intended cases may update.
import { describe, it, expect } from "vitest";
import { priceCabs } from "../apps/app/src/model/toProject.js";
import { production } from "../apps/app/src/model/cncExport.js";
import { mk } from "../apps/app/src/model/cabinet.js";
import type { Cabinet } from "../apps/app/src/model/cabinet.js";

const snap = (cab: Cabinet) => {
  const prod = production([cab]);
  return {
    price: priceCabs([cab]),
    panels: prod.panels.length,
    boardM2: prod.boardM2,
    cut: prod.panels.map((p) => `${p.part} · ${p.material} · ${p.lengthMm}×${p.widthMm}×${p.thicknessMm}`),
    hardware: prod.hardware.map((h) => `${h.name} ×${h.qty}`),
  };
};

describe("rich-Cell safety net — legacy pipeline baseline (must not regress for simple cabinets)", () => {
  it("base · shelves ×2 · door", () => { expect(snap(mk({ kind: "base", w: 600, h: 720, fill: "shelves", count: 2, door: 0 }))).toMatchInlineSnapshot(`
    {
      "boardM2": 2.94,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 720×560×16",
        "Бок правый · ЛДСП 16мм, белый · 720×560×16",
        "Дно · ЛДСП 16мм, белый · 568×560×16",
        "Крышка · ЛДСП 16мм, белый · 568×560×16",
        "Задняя стенка · ЛДСП 16мм, белый · 600×720×16",
        "Полка 1 · ЛДСП 16мм, белый · 568×560×16",
        "Полка 2 · ЛДСП 16мм, белый · 568×560×16",
        "Фасад · МДФ фасад фрезерованный 18мм · 720×600×18",
      ],
      "hardware": [
        "Петля накладная с доводчиком ×2",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 8,
      "price": 806960,
    }
  `); });
  it("base · drawers ×3", () => { expect(snap(mk({ kind: "base", w: 600, h: 720, fill: "drawers", count: 3 }))).toMatchInlineSnapshot(`
    {
      "boardM2": 2.31,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 720×560×16",
        "Бок правый · ЛДСП 16мм, белый · 720×560×16",
        "Дно · ЛДСП 16мм, белый · 568×560×16",
        "Крышка · ЛДСП 16мм, белый · 568×560×16",
        "Задняя стенка · ЛДСП 16мм, белый · 600×720×16",
        "Фасад ящика 1 · МДФ фасад фрезерованный 18мм · 240×600×18",
        "Фасад ящика 2 · МДФ фасад фрезерованный 18мм · 240×600×18",
        "Фасад ящика 3 · МДФ фасад фрезерованный 18мм · 240×600×18",
      ],
      "hardware": [
        "Направляющая шариковая 450мм (комплект) ×3",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 8,
      "price": 848124,
    }
  `); });
  it("upper · open", () => { expect(snap(mk({ kind: "upper", w: 800, h: 700, fill: "open", count: 0 }))).toMatchInlineSnapshot(`
    {
      "boardM2": 2.15,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 700×350×16",
        "Бок правый · ЛДСП 16мм, белый · 700×350×16",
        "Дно · ЛДСП 16мм, белый · 768×350×16",
        "Крышка · ЛДСП 16мм, белый · 768×350×16",
        "Задняя стенка · ЛДСП 16мм, белый · 800×700×16",
        "Фасад · МДФ фасад фрезерованный 18мм · 700×800×18",
      ],
      "hardware": [
        "Петля накладная с доводчиком ×2",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 6,
      "price": 614922,
    }
  `); });
  it("tall · shelves ×4 · door", () => { expect(snap(mk({ kind: "tall", w: 600, h: 2000, fill: "shelves", count: 4, door: 0 }))).toMatchInlineSnapshot(`
    {
      "boardM2": 6.55,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 2000×560×16",
        "Бок правый · ЛДСП 16мм, белый · 2000×560×16",
        "Дно · ЛДСП 16мм, белый · 568×560×16",
        "Крышка · ЛДСП 16мм, белый · 568×560×16",
        "Задняя стенка · ЛДСП 16мм, белый · 600×2000×16",
        "Полка 1 · ЛДСП 16мм, белый · 568×560×16",
        "Полка 2 · ЛДСП 16мм, белый · 568×560×16",
        "Полка 3 · ЛДСП 16мм, белый · 568×560×16",
        "Полка 4 · ЛДСП 16мм, белый · 568×560×16",
        "Фасад · МДФ фасад фрезерованный 18мм · 2000×600×18",
      ],
      "hardware": [
        "Петля накладная с доводчиком ×4",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 10,
      "price": 1212508,
    }
  `); });
  // HYBRID (Fill-Editor layout: left = 3 drawers, right = a door). Legacy sees only whole-cabinet
  // fill/count; the rich path decomposes the real Cell tree via the karkas engine.
  it("HYBRID · cols[drawers | door]", () => { expect(snap(mk({ kind: "base", w: 800, h: 720, fill: "shelves", count: 2, door: 0, layout: { split: "cols", sizes: [0.5, 0.5], children: [{ split: "rows", sizes: [1, 1, 1], children: [{ front: "drawer" }, { front: "drawer" }, { front: "drawer" }] }, { front: "door" }] } }))).toMatchInlineSnapshot(`
    {
      "boardM2": 5.52,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 720×560×16",
        "Бок правый · ЛДСП 16мм, белый · 720×560×16",
        "Верх · ЛДСП 16мм, белый · 768×560×16",
        "Низ · ЛДСП 16мм, белый · 768×560×16",
        "Задняя стенка · ЛДСП 16мм, белый · 800×720×16",
        "Перегородка · ЛДСП 16мм, белый · 688×560×16",
        "Перегородка · ЛДСП 16мм, белый · 368×560×16",
        "Перегородка · ЛДСП 16мм, белый · 368×560×16",
        "Ящик · фасад · МДФ фасад фрезерованный 18мм · 240×400×18",
        "Ящик · бок Л · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · бок П · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · задняя · ЛДСП 16мм, белый · 342×208×16",
        "Ящик · дно · ЛДСП 16мм, белый · 342×560×16",
        "Ящик · фасад · МДФ фасад фрезерованный 18мм · 240×400×18",
        "Ящик · бок Л · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · бок П · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · задняя · ЛДСП 16мм, белый · 342×208×16",
        "Ящик · дно · ЛДСП 16мм, белый · 342×560×16",
        "Ящик · фасад · МДФ фасад фрезерованный 18мм · 240×400×18",
        "Ящик · бок Л · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · бок П · ЛДСП 16мм, белый · 560×208×16",
        "Ящик · задняя · ЛДСП 16мм, белый · 342×208×16",
        "Ящик · дно · ЛДСП 16мм, белый · 342×560×16",
        "Дверь · МДФ фасад фрезерованный 18мм · 720×400×18",
        "Полка · ЛДСП 16мм, белый · 368×560×16",
        "Полка · ЛДСП 16мм, белый · 368×560×16",
      ],
      "hardware": [
        "Петля накладная с доводчиком ×2",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 26,
      "price": 1152410,
    }
  `); });
  // custom depth 400 — currently INCONSISTENT (cut list ignores it, drill honors it); the depth fix
  // will change THIS snapshot (intended), while the simple cabinets above stay identical.
  it("base · custom depth 400", () => { expect(snap(mk({ kind: "base", w: 600, h: 720, fill: "shelves", count: 2, door: 0, depth: 400 }))).toMatchInlineSnapshot(`
    {
      "boardM2": 2.35,
      "cut": [
        "Бок левый · ЛДСП 16мм, белый · 720×400×16",
        "Бок правый · ЛДСП 16мм, белый · 720×400×16",
        "Дно · ЛДСП 16мм, белый · 568×400×16",
        "Крышка · ЛДСП 16мм, белый · 568×400×16",
        "Задняя стенка · ЛДСП 16мм, белый · 600×720×16",
        "Полка 1 · ЛДСП 16мм, белый · 568×400×16",
        "Полка 2 · ЛДСП 16мм, белый · 568×400×16",
        "Фасад · МДФ фасад фрезерованный 18мм · 720×600×18",
      ],
      "hardware": [
        "Петля накладная с доводчиком ×2",
        "Шкант 8x30мм ×8",
        "Стяжка эксцентриковая (минификс) ×8",
      ],
      "panels": 8,
      "price": 750536,
    }
  `); });
});
