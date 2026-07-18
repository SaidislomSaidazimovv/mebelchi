// E0.1 — SAFETY NET for the engine-v5 deepening (block grouping · nested drawers · free assembly).
//
// Locks the CURRENT manufacturing output (`solveModelToParts`: geometry + panel features + drilling)
// of the three demo models, so the additive v5 changes — a Run/BlockGroup entity, drawer-as-container
// nesting, free primitive parts — cannot SILENTLY alter the existing single-block cabinet output.
// A snapshot only updates on an INTENDED change; an unexpected diff fails loudly.
import { describe, it, expect } from "vitest";
import {
  buildCarcassModel,
  buildDemoModel,
  buildLCornerModel,
} from "../engine/structure/demoModel.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Part } from "../engine/contracts/types.js";

// Compact projection: part count + per-part "name · L×W×T · op-count" — captures geometry AND that
// drilling/features still emit, without pinning every hole coordinate (those have their own tests).
const snap = (parts: readonly Part[]) => ({
  count: parts.length,
  parts: parts.map(
    (p) => `${p.name} · ${p.length_mm10}×${p.width_mm10}×${p.thickness_mm10} · ops:${p.operations.length}`,
  ),
});

describe("engine-v5 safety net — demo models' manufacturing output must not regress", () => {
  it("buildDemoModel — 2-column cabinet, three shelves", () => {
    expect(snap(solveModelToParts(buildDemoModel()))).toMatchInlineSnapshot(`
      {
        "count": 9,
        "parts": [
          "Бок левый · 7200×5600×160 · ops:8",
          "Бок правый · 7200×5600×160 · ops:6",
          "Верх · 5680×5600×160 · ops:4",
          "Низ · 5680×5600×160 · ops:4",
          "Задняя стенка · 6000×7200×160 · ops:0",
          "Перегородка · 6880×5600×160 · ops:6",
          "Полка · 2760×5600×160 · ops:0",
          "Полка · 2760×5600×160 · ops:0",
          "Полка · 2760×5600×160 · ops:0",
        ],
      }
    `);
  });

  it("buildCarcassModel — blank 600×720×560 carcass", () => {
    expect(snap(solveModelToParts(buildCarcassModel(600, 720, 560)))).toMatchInlineSnapshot(`
      {
        "count": 5,
        "parts": [
          "Бок левый · 7200×5600×160 · ops:4",
          "Бок правый · 7200×5600×160 · ops:4",
          "Верх · 5680×5600×160 · ops:4",
          "Низ · 5680×5600×160 · ops:4",
          "Задняя стенка · 6000×7200×160 · ops:0",
        ],
      }
    `);
  });

  it("buildLCornerModel — L-corner wardrobe", () => {
    expect(snap(solveModelToParts(buildLCornerModel()))).toMatchInlineSnapshot(`
      {
        "count": 11,
        "parts": [
          "Плечо A · Бок левый · 7200×6000×160 · ops:2",
          "Плечо A · Бок правый · 7200×6000×160 · ops:2",
          "Плечо A · Верх · 9680×6000×160 · ops:0",
          "Плечо A · Низ · 9680×6000×160 · ops:0",
          "Плечо A · Задняя стенка · 10000×7200×160 · ops:0",
          "Плечо B · Бок левый · 7200×4000×160 · ops:0",
          "Плечо B · Верх · 7680×4000×160 · ops:0",
          "Плечо B · Низ · 7680×4000×160 · ops:0",
          "Плечо B · Задняя стенка · 8000×7200×160 · ops:0",
          "Угловая планка · 7200×500×160 · ops:0",
          "Полка · 9680×6000×160 · ops:0",
        ],
      }
    `);
  });
});
