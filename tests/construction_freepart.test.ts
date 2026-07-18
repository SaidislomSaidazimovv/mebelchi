// E3.1 — FreePart foundation (free primitive assembly, v5): a board placed FREELY by its own box, the
// primitive of "build any furniture" (a table = a top + legs). Verifies it emits a cut Part with the
// right length × width × thickness (thickness = the thicknessAxis dimension) and renders at its box.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addFreePart, removeFreePart, resizeBlockHeight, resizeBlockWidth, resolveFreePartBox } from "../engine/structure/operations.js";
import { buildTable } from "../engine/structure/demoModel.js";
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

describe("E3.3 · buildTable + addFreePart / removeFreePart", () => {
  it("buildTable(1200×720×600) makes a bare table: a top + four corner legs, cut correctly", () => {
    const parts = solveStructure(buildTable(1200, 720, 600));
    expect(parts).toHaveLength(5); // no carcass
    const top = parts.find((p) => p.id === "tbl__free_top")!;
    expect([top.length_mm10, top.width_mm10, top.thickness_mm10]).toEqual([12000, 6000, 400]); // 1200×600×40
    const leg = parts.find((p) => p.id === "tbl__free_leg_fl")!;
    expect([leg.length_mm10, leg.width_mm10, leg.thickness_mm10]).toEqual([6800, 500, 500]); // height 680mm, 50×50 post
  });

  it("the legs sit at the four corners and the top rides on them", () => {
    const ps = solveLayout(buildTable(1200, 720, 600));
    const at = (id: string) => { const p = ps.find((q) => q.id === id)!; return [p.x_mm10, p.y_mm10, p.z_mm10]; };
    expect(at("tbl__free_leg_fl")).toEqual([0, 0, 0]);
    expect(at("tbl__free_leg_br")).toEqual([11500, 0, 5500]); // W−legSz , 0 , D−legSz
    expect(at("tbl__free_top")).toEqual([0, 6800, 0]); // sits on top of the 680mm legs
  });

  it("addFreePart adds a board (e.g. an apron rail); removeFreePart drops one", () => {
    const rail: FreePart = { id: "rail", name: "Царга", role: "rail", thicknessAxis: "z", box: { x: 0, y: 6200, z: 0, w: 12000, h: 600, d: 200 } };
    const added = addFreePart(buildTable(1200, 720, 600), "tbl", rail);
    expect(solveStructure(added)).toHaveLength(6); // 5 + the rail
    const removed = removeFreePart(added, "tbl", "leg_fl");
    expect(solveStructure(removed)).toHaveLength(5); // 6 − one leg
  });

  it("guards: unknown block and duplicate free-part id throw; removing a missing one is a no-op", () => {
    const t = buildTable(1200, 720, 600);
    const dup: FreePart = { id: "top", name: "x", role: "top", thicknessAxis: "y", box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 } };
    expect(() => addFreePart(t, "ghost", dup)).toThrow("ADD_FREEPART_BLOCK_NOT_FOUND");
    expect(() => addFreePart(t, "tbl", dup)).toThrow("ADD_FREEPART_DUPLICATE_ID");
    expect(removeFreePart(t, "tbl", "nope")).toBe(t); // no-op, same ref
  });
});

describe("E3.4 · free-part anchors reflow on block resize (the table law)", () => {
  const fpBox = (m: StructuralModel, id: string) => m.blocks[0]!.freeParts!.find((f) => f.id === id)!.box;

  it("resolveFreePartBox spans and corner-pins correctly", () => {
    const box = { x: 0, y: 0, z: 0, w: 10000, h: 8000, d: 6000 };
    const top = resolveFreePartBox({
      x: { start: { ref: "lo", offset_mm10: 0 }, end: { ref: "hi", offset_mm10: 0 } }, // span W
      y: { start: { ref: "hi", offset_mm10: 400 }, end: { ref: "hi", offset_mm10: 0 } }, // top slab 400
      z: { start: { ref: "lo", offset_mm10: 0 }, end: { ref: "hi", offset_mm10: 0 } }, // span D
    }, box);
    expect(top).toEqual({ x: 0, y: 7600, z: 0, w: 10000, h: 400, d: 6000 });
  });

  it("resizing a table's WIDTH spans the top and moves the right legs to the new corner", () => {
    const wide = resizeBlockWidth(buildTable(1200, 720, 600), "tbl", 20000); // 2000mm wide
    expect(fpBox(wide, "top").w).toBe(20000); // the top spans the new width
    expect(fpBox(wide, "leg_fl").x).toBe(0); // left legs stay put
    expect(fpBox(wide, "leg_fr").x).toBe(19500); // right legs = W − legSz
    expect(solveStructure(wide).find((p) => p.id === "tbl__free_top")!.length_mm10).toBe(20000); // the cut grows too
  });

  it("resizing HEIGHT re-lengths the legs and lifts the top", () => {
    const tall = resizeBlockHeight(buildTable(1200, 720, 600), "tbl", 8000); // 800mm tall
    expect(fpBox(tall, "top").y).toBe(7600); // top rides at H − topThickness
    expect(fpBox(tall, "leg_fl").h).toBe(7600); // legs grow floor → under the top
  });
});
