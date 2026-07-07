// Step 7c (override) — the master moves an individual auto-placed hole: the override rewrites just that
// drill (to source:"user"), survives the full solve, and leaves everything else untouched.
import { describe, it, expect } from "vitest";
import { applyHoleOverrides, holeKey } from "../engine/structure/holeOverride.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Part } from "../engine/contracts/types.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const part = (): Part => ({
  id: "p", name: "Бок", width_mm10: 4000, length_mm10: 6000, thickness_mm10: 160, grain: "NONE", edges: [0, 0, 0, 0],
  operations: [{ op: "drill", id: "h1", face: "A", x_mm10: 915, y_mm10: 2000, diameter_mm10: 50, depth_mm10: 110, source: "auto" }],
});

function shelfModel(): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 });
  const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
  m = addInstance(m, cols[0]!.id, "shelf");
  m = addInstance(m, cols[0]!.id, "shelf");
  return m;
}

describe("Step 7c — per-hole override", () => {
  it("moves the matching hole and re-stamps it user; no-op passes through", () => {
    const out = applyHoleOverrides([part()], { [holeKey("p", "h1")]: { x_mm10: 300, y_mm10: 1000 } });
    const op = out[0]!.operations[0]!;
    expect(op.op === "drill" && op.x_mm10).toBe(300);
    expect(op.op === "drill" && op.y_mm10).toBe(1000);
    expect(op.source).toBe("user");
    const same = [part()];
    expect(applyHoleOverrides(same, {})).toBe(same); // empty → same reference
  });

  it("survives the full solve pipeline (a real shelf pin moves)", () => {
    const m = shelfModel();
    const p0 = solveModelToParts(m).find((p) => p.operations.some((o) => o.op === "drill" && Math.abs(o.diameter_mm10 - 50) <= 2))!;
    const pin = p0.operations.find((o) => o.op === "drill" && Math.abs(o.diameter_mm10 - 50) <= 2)!;
    const m2: StructuralModel = { ...m, holeOverrides: { [holeKey(p0.id, pin.id)]: { x_mm10: 111, y_mm10: 222 } } };
    const moved = solveModelToParts(m2).find((p) => p.id === p0.id)!.operations.find((o) => o.id === pin.id)!;
    expect(moved.op === "drill" && moved.x_mm10).toBe(111);
    expect(moved.op === "drill" && moved.y_mm10).toBe(222);
    expect(moved.source).toBe("user");
  });
});
