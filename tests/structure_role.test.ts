// Phase 5.C — the structure solver stamps a PanelRole on each carcass / shelf / facade part,
// so a material plan can price and label them by role (additive; untagged parts fall back).
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";

describe("Phase 5.C — part role stamping", () => {
  const parts = solveStructure(buildDemoModel());

  it("stamps the carcass box roles", () => {
    const byId = (suffix: string) => parts.find((p) => p.id.endsWith(suffix));
    expect(byId("__side_l")?.role).toBe("carcass_side");
    expect(byId("__side_r")?.role).toBe("carcass_side");
    expect(byId("__top")?.role).toBe("carcass_top");
    expect(byId("__bottom")?.role).toBe("carcass_bottom");
    expect(byId("__back")?.role).toBe("carcass_back");
  });

  it("stamps shelves as internal_shelf", () => {
    const shelves = parts.filter((p) => p.role === "internal_shelf");
    expect(shelves.length).toBeGreaterThan(0);
  });

  it("every stamped role is a known PanelRole value", () => {
    const KNOWN = new Set(["carcass_side", "carcass_top", "carcass_bottom", "carcass_back", "facade", "internal_shelf"]);
    for (const p of parts) {
      if (p.role !== undefined) expect(KNOWN.has(p.role)).toBe(true);
    }
  });
});
