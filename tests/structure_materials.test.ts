// Phase 5.C — material catalog + plan resolution.
import { describe, it, expect } from "vitest";
import { BOARDS, EDGES, DEFAULT_PLAN, boardById, edgeById, planSlotForRole, boardForRole } from "../apps/app/src/three/materials.js";

describe("Phase 5.C — materials", () => {
  it("catalog entries are well-formed and uniquely id'd", () => {
    expect(BOARDS.length).toBeGreaterThan(0);
    expect(EDGES.length).toBeGreaterThan(0);
    expect(new Set(BOARDS.map((b) => b.id)).size).toBe(BOARDS.length);
    expect(new Set(EDGES.map((e) => e.id)).size).toBe(EDGES.length);
    for (const b of BOARDS) {
      expect(b.pricePerM2).toBeGreaterThan(0);
      expect(b.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const e of EDGES) expect(e.pricePerM).toBeGreaterThan(0);
  });

  it("DEFAULT_PLAN references real catalog ids", () => {
    expect(boardById(DEFAULT_PLAN.carcass)).toBeDefined();
    expect(boardById(DEFAULT_PLAN.back)).toBeDefined();
    expect(boardById(DEFAULT_PLAN.shelf)).toBeDefined();
    expect(boardById(DEFAULT_PLAN.facade)).toBeDefined();
    expect(edgeById(DEFAULT_PLAN.edge)).toBeDefined();
  });

  it("planSlotForRole maps roles to the right slot", () => {
    expect(planSlotForRole("facade")).toBe("facade");
    expect(planSlotForRole("carcass_back")).toBe("back");
    expect(planSlotForRole("internal_shelf")).toBe("shelf");
    expect(planSlotForRole("carcass_side")).toBe("carcass");
    expect(planSlotForRole("carcass_top")).toBe("carcass");
    expect(planSlotForRole(undefined)).toBe("carcass"); // untagged falls back to carcass
  });

  it("boardForRole resolves the decor a role is cut from under a plan", () => {
    expect(boardForRole(DEFAULT_PLAN, "facade")?.id).toBe(DEFAULT_PLAN.facade);
    expect(boardForRole(DEFAULT_PLAN, "carcass_back")?.id).toBe(DEFAULT_PLAN.back);
    expect(boardForRole(DEFAULT_PLAN, "carcass_side")?.id).toBe(DEFAULT_PLAN.carcass);
    expect(boardForRole(DEFAULT_PLAN, undefined)?.id).toBe(DEFAULT_PLAN.carcass);
  });
});
