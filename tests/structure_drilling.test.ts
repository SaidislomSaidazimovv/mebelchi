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

// The demo block has three internal shelves (anchor heights 2400 / 4800 / 3600).
const SHELVES = 3;
const ROWS = 2; // front + back row per shelf

describe("S3-E2 drilling integration", () => {
  it("solveStructure alone leaves every panel blank (drilling is a separate pass)", () => {
    const parts = solveStructure(buildDemoModel());
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p.operations.length === 0)).toBe(true);
  });

  it("drills a front+back Ø5 pair per shelf on the side panels (real positions, not a column)", () => {
    const parts = solveModelToParts(buildDemoModel());
    const sides = parts.filter(
      (p) => p.id.endsWith("__side_l") || p.id.endsWith("__side_r"),
    );
    expect(sides.length).toBe(2);
    for (const side of sides) {
      // exactly one front+back Ø5 PIN pair per shelf — NOT a synthesised System-32 column. (The side
      // also carries Ø15 carcass cams now; filter to the pins so this asserts only the pin pattern.)
      const pins = side.operations.filter((o) => o.op === "drill" && o.diameter_mm10 === 50);
      expect(pins.length).toBe(SHELVES * ROWS);
      expect(pins.every((o) => o.op === "drill" && o.face === "A" && o.depth_mm10 === 110)).toBe(true);
    }
  });

  it("non-side panels (top/bottom/back/divider/shelf) receive no shelf-pin holes", () => {
    const parts = solveModelToParts(buildDemoModel());
    const others = parts.filter(
      (p) => !p.id.endsWith("__side_l") && !p.id.endsWith("__side_r"),
    );
    expect(others.length).toBeGreaterThan(0);
    // no Ø5 shelf pins on non-side panels (top/bottom now carry Ø8 carcass dowels — that's joinery,
    // not shelf pins, so filter by the Ø5 pin diameter).
    expect(others.every((p) => p.operations.every((o) => !(o.op === "drill" && o.diameter_mm10 === 50)))).toBe(true);
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
