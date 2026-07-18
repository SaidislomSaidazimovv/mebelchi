// E3.1 — FreePart foundation (free primitive assembly, v5): a board placed FREELY by its own box, the
// primitive of "build any furniture" (a table = a top + legs). Verifies it emits a cut Part with the
// right length × width × thickness (thickness = the thicknessAxis dimension) and renders at its box.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const mkBlockWithFree = (freeParts: FreePart[]): StructuralModel => {
  const box = { x: 0, y: 0, z: 0, w: 12000, h: 7200, d: 6000 };
  return {
    id: "m", name: "m",
    blocks: [{
      id: "b", name: "b", box,
      zones: [{ id: "z", name: "Корпус", rule: "manual", root: { id: "root", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [],
      freeParts,
    }],
    parts: [],
  };
};

// A table top: a horizontal board (thickness along Y), 1200 × 600 face, 40 mm thick, near the top.
const tableTop: FreePart = { id: "top", name: "Столешница", role: "top", thicknessAxis: "y", box: { x: 0, y: 6800, z: 0, w: 12000, h: 400, d: 6000 } };

describe("E3.1 · FreePart — a freely-placed board emits + renders", () => {
  it("emits a cut Part with length × width × thickness = the two face dims and the thicknessAxis dim", () => {
    const top = solveStructure(mkBlockWithFree([tableTop])).find((p) => p.id === "b__free_top")!;
    expect(top).toBeDefined();
    // thicknessAxis Y → thickness = box.h (400); face = box.w (12000) × box.d (6000).
    expect([top.length_mm10, top.width_mm10, top.thickness_mm10]).toEqual([12000, 6000, 400]);
  });

  it("places the board at its own box, lifted to world by the block origin", () => {
    const top = solveLayout(mkBlockWithFree([tableTop])).find((p) => p.id === "b__free_top")!;
    expect([top.x_mm10, top.y_mm10, top.z_mm10]).toEqual([0, 6800, 0]);
    expect([top.w_mm10, top.h_mm10, top.d_mm10]).toEqual([12000, 400, 6000]);
  });

  it("thicknessAxis x and z map the face dims correctly", () => {
    const legX: FreePart = { id: "lx", name: "Нога", role: "leg", thicknessAxis: "x", box: { x: 0, y: 0, z: 0, w: 400, h: 7000, d: 400 } };
    const backZ: FreePart = { id: "bz", name: "Задняя", role: "back", thicknessAxis: "z", box: { x: 0, y: 0, z: 0, w: 12000, h: 7000, d: 160 } };
    const parts = solveStructure(mkBlockWithFree([legX, backZ]));
    expect(["length_mm10", "width_mm10", "thickness_mm10"].map((k) => (parts.find((p) => p.id === "b__free_lx") as any)[k])).toEqual([7000, 400, 400]); // x → h,d,w
    expect(["length_mm10", "width_mm10", "thickness_mm10"].map((k) => (parts.find((p) => p.id === "b__free_bz") as any)[k])).toEqual([12000, 7000, 160]); // z → w,h,d
  });

  it("carries a material override onto the emitted part", () => {
    const top: FreePart = { ...tableTop, material: "OAK_DECOR" };
    expect(solveStructure(mkBlockWithFree([top])).find((p) => p.id === "b__free_top")!.materialId).toBe("OAK_DECOR");
  });

  it("additive — a block with no free parts is unchanged (carcass still 5 panels, no free parts)", () => {
    const parts = solveStructure(mkBlockWithFree([]));
    expect(parts.filter((p) => p.id.startsWith("b__free_"))).toHaveLength(0);
    expect(parts).toHaveLength(5); // just the carcass
  });
});

/** A table: a BARE block (no carcass) whose whole body is free parts — a top + four legs. */
const mkTable = (): StructuralModel => {
  const box = { x: 0, y: 0, z: 0, w: 12000, h: 7200, d: 6000 };
  const top: FreePart = { id: "top", name: "Столешница", role: "top", thicknessAxis: "y", box: { x: 0, y: 6800, z: 0, w: 12000, h: 400, d: 6000 } };
  const leg = (id: string, x: number, z: number): FreePart => ({ id, name: "Нога", role: "leg", thicknessAxis: "x", box: { x, y: 0, z, w: 500, h: 6800, d: 500 } });
  return {
    id: "t", name: "Стол",
    blocks: [{
      id: "b", name: "b", box, bare: true,
      zones: [{ id: "z", name: "Корпус", rule: "manual", root: { id: "root", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [],
      freeParts: [top, leg("l1", 0, 0), leg("l2", 11500, 0), leg("l3", 0, 5500), leg("l4", 11500, 5500)],
    }],
    parts: [],
  };
};

describe("E3.2 · bare block — a table has NO carcass, just its free parts", () => {
  it("a bare table emits only its 5 free boards (a top + 4 legs), no carcass shell", () => {
    const parts = solveStructure(mkTable());
    expect(parts).toHaveLength(5); // top + 4 legs — NO sides/top/bottom/back
    expect(parts.every((p) => p.id.startsWith("b__free_"))).toBe(true);
    expect(parts.filter((p) => p.id === "b__side_l" || p.id === "b__back")).toHaveLength(0);
  });

  it("the table renders its 5 boards and nothing else", () => {
    const ps = solveLayout(mkTable());
    expect(ps).toHaveLength(5);
    expect(ps.map((p) => p.id).sort()).toEqual(["b__free_l1", "b__free_l2", "b__free_l3", "b__free_l4", "b__free_top"]);
  });
});
