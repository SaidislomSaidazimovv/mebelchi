// S3-E2 — drilling integration (shelf-pin line-boring).
// Proves the Layer-1 primitives, formerly dead code, are now invoked automatically by the
// model→parts manufacturing path, that holes land at the REAL shelf positions (not a synthetic
// column), and that the drilled set stays inside the safety gate.
//
// GROUNDING (tests/golden/xml/ORTA_BAK_6_1.XML): a side panel drills a front+back Ø5 pair per
// shelf at the shelf's height — depth 11 mm, 91.5 mm setback. Spec is the dummy catalog
// (verified:false) so the values now MATCH the factory file but full sign-off is S3-E7.

import { describe, expect, it } from "vitest";

import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts } from "../engine/cnc.js";
import { validateParts } from "../engine/core/validate.js";
import type { DrillOp, Part } from "../engine/contracts/types.js";

// The demo block has three internal shelves: LEFT column 2400 / 4800, RIGHT column 3600.
const ROWS = 2; // front + back row per shelf
const pinsOf = (p: Part): DrillOp[] =>
  p.operations.filter((o): o is DrillOp => o.op === "drill" && (o as DrillOp).diameter_mm10 === 50);

describe("S3-E2 drilling integration", () => {
  it("solveStructure alone leaves every panel blank (drilling is a separate pass)", () => {
    const parts = solveStructure(buildDemoModel());
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p.operations.length === 0)).toBe(true);
  });

  it("drills each side ONLY for the shelves in its own column (not every shelf) — C2", () => {
    const parts = solveModelToParts(buildDemoModel());
    const sl = pinsOf(parts.find((p) => p.id.endsWith("__side_l"))!);
    const sr = pinsOf(parts.find((p) => p.id.endsWith("__side_r"))!);
    // left side bounds the left column (2 shelves) → 4 pins; right side the right column (1) → 2 pins
    expect(sl.length).toBe(2 * ROWS);
    expect(sr.length).toBe(1 * ROWS);
    expect([...sl, ...sr].every((o) => o.face === "A" && o.depth_mm10 === 110)).toBe(true);
    expect(new Set(sl.map((o) => o.x_mm10))).toEqual(new Set([2400, 4800]));
    expect(new Set(sr.map((o) => o.x_mm10))).toEqual(new Set([3600]));
  });

  it("the DIVIDER carries shelf pins for BOTH adjacent columns, on BOTH faces — C1 + C4", () => {
    const parts = solveModelToParts(buildDemoModel());
    const div = pinsOf(parts.find((p) => p.id.includes("__div"))!);
    expect(div.length).toBe((2 + 1) * ROWS); // both columns: 2 left + 1 right shelves
    expect(div.filter((o) => o.face === "A").length).toBeGreaterThan(0); // one column
    expect(div.filter((o) => o.face === "B").length).toBeGreaterThan(0); // the other column
  });

  it("shelves / top / bottom / back get NO shelf pins (only sides + dividers carry pins)", () => {
    const parts = solveModelToParts(buildDemoModel());
    const others = parts.filter((p) => !p.id.endsWith("__side_l") && !p.id.endsWith("__side_r") && !p.id.includes("__div"));
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((p) => pinsOf(p).length === 0)).toBe(true);
  });

  it("the drilled part set passes the machining safety gate (all holes in bounds)", () => {
    const validation = validateParts(solveModelToParts(buildDemoModel()));
    expect(validation.ok).toBe(true);
  });

  it("is pure — same model in produces identical drilling out", () => {
    const a = solveModelToParts(buildDemoModel());
    const b = solveModelToParts(buildDemoModel());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
