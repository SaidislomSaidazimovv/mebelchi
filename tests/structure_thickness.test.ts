// TEMP: prove Phase-1 arbitrary per-part thickness works, and that the default (no spec)
// reproduces the legacy 16mm geometry. Deleted after verification.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure, BOARD_MM10, doublePanel } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import type { Part } from "../engine/contracts/types.js";

const model = buildDemoModel();
const find = (parts: Part[], sub: string) => parts.find((p) => p.id.includes(sub));

describe("Phase 1 — arbitrary thickness", () => {
  it("default (no spec) keeps the carcass at 16mm (BOARD_MM10=160)", () => {
    const parts = solveStructure(model);
    expect(find(parts, "side_l")!.thickness_mm10).toBe(BOARD_MM10); // 160
    expect(find(parts, "__top")!.thickness_mm10).toBe(BOARD_MM10);
    expect(find(parts, "__back")!.thickness_mm10).toBe(BOARD_MM10);
  });

  it("carcass:180 → sides/top become 18mm AND inner width shrinks by 2×(180−160)=40", () => {
    const p16 = solveStructure(model, {});
    const p18 = solveStructure(model, { carcass: 180 });
    expect(find(p18, "side_l")!.thickness_mm10).toBe(180);
    expect(find(p18, "__top")!.thickness_mm10).toBe(180);
    // top length = inner width = block.w − 2·carcass → 18mm removes 40 more than 16mm
    expect(find(p16, "__top")!.length_mm10 - find(p18, "__top")!.length_mm10).toBe(40);
  });

  it("thin back (10mm HDF) sets back thickness WITHOUT changing carcass geometry", () => {
    const base = solveStructure(model, {});
    const thin = solveStructure(model, { back: 100 });
    expect(find(thin, "__back")!.thickness_mm10).toBe(100);
    expect(find(base, "side_l")!.length_mm10).toBe(find(thin, "side_l")!.length_mm10);
  });

  it("doublePanel respects the base thickness (18mm base → two 18mm layers)", () => {
    const base: Part = { id: "x", name: "x", length_mm10: 500, width_mm10: 500, thickness_mm10: 180, grain: "L", edges: [0, 0, 0, 0], operations: [] };
    const [a, b] = doublePanel(base);
    expect(a.thickness_mm10).toBe(180);
    expect(b.thickness_mm10).toBe(180); // 2×18 = 36mm doubled, not 2×16
  });

  it("END-TO-END: exportModelToSWJ008 threads thickness → CNC XML carries 18mm", () => {
    const xml18 = exportModelToSWJ008(model, { carcass: 180 });
    expect(xml18).toContain("18.000"); // mm10ToMmString(180)
    const xml16 = exportModelToSWJ008(model); // default → no 18mm anywhere
    expect(xml16).not.toContain("18.000");
  });
});
