// S3-E1 — parametric solver (engine/structure/solve.ts).
// A structural model (Block→Zone→Section→Instance) solves into the flat manufacturing
// Part[], with dimensions DERIVED from block/section geometry, and those parts pass the
// manufacturing safety gate. This is the bridge that did not exist before S3-E1.

import { describe, expect, it } from "vitest";

import {
  BOARD_MM10,
  buildDemoModel,
  solveFull,
  solveLayout,
  solvePreview,
  solveStructure,
  type Block,
  type Component,
  type Instance,
  type Line,
  type Section,
  type StructuralModel,
  type Zone,
} from "../engine/index.js";
import { addInstance } from "../engine/structure/operations.js";

const W = 6000; // 600 mm width
const H = 7200; // 720 mm height
const D = 5600; // 560 mm depth
const BOARD = BOARD_MM10; // 160 = 16 mm

const shelfComponent: Component = {
  id: "cmp_shelf",
  name: "Полка",
  partIds: [],
  role: "internal_shelf",
};

function buildModel(opts: { divider?: boolean }): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: W, h: H, d: D };
  const root: Section = {
    id: "sec_root",
    box,
    dividers: [],
    children: [],
    instanceIds: ["inst_a"],
    purpose: "storage",
  };
  const zone: Zone = { id: "z", name: "Body", rule: "manual", root };
  const inst: Instance = {
    id: "inst_a",
    componentId: "cmp_shelf",
    sectionId: "sec_root",
    anchor: { x: 0, y: 1800, z: 0 },
    link: "linked",
  };
  const lines: Line[] = opts.divider
    ? [{ id: "ln1", axis: "x", position_mm10: 3000, boundsPartIds: [], groupId: null }]
    : [];
  const block: Block = {
    id: "blk",
    name: "Cab",
    box,
    zones: [zone],
    components: [shelfComponent],
    instances: [inst],
    lines,
    rows: [],
  };
  return { id: "m", name: "M", blocks: [block], parts: [] };
}

describe("S3-E1 solveStructure — structural model → Part[]", () => {
  it("generates carcass (5: sides+top+bottom+back) + shelf (1), dimensions from geometry", () => {
    const parts = solveStructure(buildModel({}));
    expect(parts).toHaveLength(6);

    const by = (suffix: string) => parts.find((p) => p.id.endsWith(suffix))!;
    // Sides: full height × full depth.
    expect(by("side_l")).toMatchObject({ length_mm10: H, width_mm10: D, thickness_mm10: BOARD });
    expect(by("side_r")).toMatchObject({ length_mm10: H, width_mm10: D });
    // Top / bottom: inner width (between the sides) × depth.
    expect(by("top")).toMatchObject({ length_mm10: W - 2 * BOARD, width_mm10: D });
    expect(by("bottom")).toMatchObject({ length_mm10: W - 2 * BOARD, width_mm10: D });
    // Shelf: spans the section between the sides; full depth; 16 mm.
    expect(by("inst_inst_a")).toMatchObject({
      length_mm10: W - 2 * BOARD,
      width_mm10: D,
      thickness_mm10: BOARD,
    });
  });

  it("adds one divider panel per Line", () => {
    const parts = solveStructure(buildModel({ divider: true }));
    expect(parts).toHaveLength(7);
    const div = parts.find((p) => p.id.includes("div_"))!;
    expect(div).toMatchObject({ length_mm10: H - 2 * BOARD, width_mm10: D, thickness_mm10: BOARD });
  });

  it("keeps every dimension an mm10 integer", () => {
    for (const p of solveStructure(buildModel({ divider: true }))) {
      for (const n of [p.length_mm10, p.width_mm10, p.thickness_mm10]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });

  it("solved parts pass the manufacturing safety gate (solveFull)", async () => {
    const parts = solveStructure(buildModel({ divider: true }));
    const { validation } = await solveFull({ id: "p", name: "P", parts });
    expect(validation.ok).toBe(true);
  });
});

describe("S3-E1 buildDemoModel — starter cabinet renders end-to-end", () => {
  it("solves to carcass(5) + divider(1) + shelves(3) = 9 parts", () => {
    const parts = solveStructure(buildDemoModel());
    expect(parts).toHaveLength(9);
    expect(parts.filter((p) => p.id.includes("div_"))).toHaveLength(1);
    expect(parts.filter((p) => p.id.includes("__inst_"))).toHaveLength(3);
  });

  it("produces a non-empty preview (the UI renders this)", () => {
    const parts = solveStructure(buildDemoModel());
    const preview = solvePreview({ id: "demo", name: "Демо", parts });
    expect(preview.parts).toHaveLength(9);
    for (const p of preview.parts) {
      expect(p.bbox.w).toBeGreaterThan(0);
      expect(p.bbox.h).toBeGreaterThan(0);
    }
  });
});

describe("S3-E1 solveLayout — positioned panels for the 3D viewport", () => {
  it("places the same 8 panels with assembly positions, ids matching solveStructure", () => {
    const model = buildDemoModel();
    const layout = solveLayout(model);
    const parts = solveStructure(model);
    expect(layout).toHaveLength(parts.length);
    // ids match 1:1 (selection → placement)
    expect(new Set(layout.map((p) => p.id))).toEqual(new Set(parts.map((p) => p.id)));
    // sides sit at opposite x edges of the 600mm-wide cabinet
    const left = layout.find((p) => p.id.endsWith("side_l"))!;
    const right = layout.find((p) => p.id.endsWith("side_r"))!;
    expect(left.x_mm10).toBe(0);
    expect(right.x_mm10).toBe(6000 - BOARD_MM10);
    // every panel has positive size and integer coordinates
    for (const p of layout) {
      expect(p.w_mm10).toBeGreaterThan(0);
      expect(p.h_mm10).toBeGreaterThan(0);
      for (const n of [p.x_mm10, p.y_mm10, p.z_mm10, p.w_mm10, p.h_mm10, p.d_mm10]) {
        expect(Number.isInteger(n)).toBe(true);
      }
    }
  });
});

describe("S3 addInstance — add a shelf to a section", () => {
  it("adds a shelf; the cabinet gains one panel; positions stay integer", () => {
    const model = buildDemoModel();
    const before = solveStructure(model).length;
    const next = addInstance(model, "sec_left", "shelf");
    expect(next).not.toBe(model);
    expect(solveStructure(next)).toHaveLength(before + 1);
    for (const p of solveLayout(next)) {
      expect(Number.isInteger(p.y_mm10)).toBe(true);
    }
  });

  it("no-ops for out-of-scope hardware kinds (rail / drawer)", () => {
    const model = buildDemoModel();
    expect(addInstance(model, "sec_left", "rail")).toBe(model);
    expect(addInstance(model, "sec_left", "drawer")).toBe(model);
  });

  it("throws on an unknown section", () => {
    expect(() => addInstance(buildDemoModel(), "nope", "shelf")).toThrow();
  });
});
