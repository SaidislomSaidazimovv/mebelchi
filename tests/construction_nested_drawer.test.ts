// E2.1 — nested-drawer foundation: the DrawerInterior contract + drawerInteriorBox (a drawer's clear
// inner volume). This is the block-local box a nested drawer (or any content) sits in. Verified against
// the REAL drawer body: the interior must be exactly the space between the box sides, above the bottom,
// behind the facade — so later steps can drop a drawer into it.
import { describe, it, expect } from "vitest";
import { drawerInteriorBox, resolveThickness } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { nestDrawer } from "../engine/structure/operations.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Block, Component, DrawerInterior, Instance, Section, StructuralModel } from "../engine/contracts/structure.js";

const mkDrawer = (): { model: StructuralModel; block: Block; section: Section } => {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  const section: Section = { id: "sec", box: { ...box }, dividers: [], children: [], instanceIds: ["d1"], purpose: "drawer" };
  const drawer: Component = { id: "cmp_d", name: "Ящик", partIds: [], role: null, drawer: true };
  const inst: Instance = { id: "d1", componentId: "cmp_d", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" };
  const block: Block = {
    id: "b", name: "b", box,
    zones: [{ id: "z", name: "Корпус", rule: "manual", root: section }],
    components: [drawer], instances: [inst], lines: [], rows: [],
  };
  return { model: { id: "m", name: "m", blocks: [block], parts: [] }, block, section };
};

describe("E2.1 · drawerInteriorBox — a drawer's clear inner volume", () => {
  it("is the exact space between the drawer's box sides / bottom / back (ties to the real placement)", () => {
    const { model, block, section } = mkDrawer();
    const t = resolveThickness({});
    const inner = drawerInteriorBox(block, section, t);
    const ps = solveLayout(model);
    const sideL = ps.find((p) => p.id === "b__inst_d1__side_l")!;
    const sideR = ps.find((p) => p.id === "b__inst_d1__side_r")!;
    // The interior starts at the inner face of the left box side and ends at the inner face of the right.
    expect(inner.x).toBe(sideL.x_mm10 + sideL.w_mm10);
    expect(inner.x + inner.w).toBe(sideR.x_mm10);
    // Behind the facade (same front face as the box sides), above the bottom board.
    expect(inner.z).toBe(sideL.z_mm10);
    expect(inner.y).toBe(sideL.y_mm10 + t.back);
  });

  it("sits strictly inside the section with positive dimensions", () => {
    const { block, section } = mkDrawer();
    const inner = drawerInteriorBox(block, section, resolveThickness({}));
    expect(inner.x).toBeGreaterThan(section.box.x);
    expect(inner.x + inner.w).toBeLessThan(section.box.x + section.box.w);
    expect(inner.w).toBeGreaterThan(0);
    expect(inner.h).toBeGreaterThan(0);
    expect(inner.d).toBeGreaterThan(0);
  });

  it("exact clear volume (regression lock)", () => {
    const { block, section } = mkDrawer();
    expect(drawerInteriorBox(block, section, resolveThickness({}))).toMatchInlineSnapshot(`
      {
        "d": 5120,
        "h": 1520,
        "w": 5100,
        "x": 450,
        "y": 320,
        "z": 160,
      }
    `);
  });
});

/** A drawer nested inside the given interior — no stored box (the solver computes the clear volume). */
const nestInDrawer = (interior: DrawerInterior, innerId: string): DrawerInterior => ({
  components: [...interior.components, { id: `cmp_${innerId}`, name: "Ящик внутр", partIds: [], role: null, drawer: true }],
  instances: [...interior.instances, { id: innerId, componentId: `cmp_${innerId}`, sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
});

/** The demo drawer with a nested drawer inside (and optionally a drawer inside THAT). */
const mkNested = (depth: 1 | 2): StructuralModel => {
  const { model, block } = mkDrawer();
  let interior: DrawerInterior = nestInDrawer({ components: [], instances: [] }, "in1");
  if (depth === 2) {
    // The level-2 drawer nests inside the level-1 drawer's own interior; its clear box is solved, not set.
    interior = { ...interior, instances: [{ ...interior.instances[0]!, interior: nestInDrawer({ components: [], instances: [] }, "in2") }] };
  }
  const outer = { ...block.instances[0]!, interior };
  return { ...model, blocks: [{ ...block, instances: [outer] }] };
};

describe("E2.2 · nested drawer parts — drawer-in-drawer manufactures every box", () => {
  it("a drawer with one nested drawer cuts BOTH boxes (carcass 5 + outer 5 + nested 5 = 15 panels)", () => {
    const parts = solveModelToParts(mkNested(1));
    expect(parts).toHaveLength(15); // 5 block carcass + 5 outer drawer + 5 nested drawer
    expect(parts.filter((p) => p.id.startsWith("b__inst_d1"))).toHaveLength(10); // outer + nested drawer boxes
    const innerFront = parts.find((p) => p.id === "b__inst_d1__in_in1__front"); // nested facade
    expect(innerFront).toBeDefined();
    // The nested drawer's facade fills the outer's interior box (length = box.h, width = box.w).
    const innerBox = drawerInteriorBox(mkDrawer().block, mkDrawer().section, resolveThickness({}));
    expect(innerFront!.length_mm10).toBe(innerBox.h);
    expect(innerFront!.width_mm10).toBe(innerBox.w);
  });

  it("arbitrary depth: drawer-in-drawer-in-drawer cuts three boxes (carcass + 3×5 = 20 panels)", () => {
    const parts = solveModelToParts(mkNested(2));
    expect(parts).toHaveLength(20); // 5 carcass + 3 drawer boxes × 5
    expect(parts.find((p) => p.id === "b__inst_d1__in_in1__in_in2__front")).toBeDefined(); // level-2 facade
  });
});

describe("E2.3 · nested drawer RENDERS inside the outer drawer", () => {
  it("the nested drawer's box is placed in the outer's clear interior volume", () => {
    const ps = solveLayout(mkNested(1));
    const innerBox = drawerInteriorBox(mkDrawer().block, mkDrawer().section, resolveThickness({}));
    const innerFront = ps.find((p) => p.id === "b__inst_d1__in_in1__front")!;
    // The block sits at the origin, so world == block-local: the nested facade fills the interior box.
    expect([innerFront.x_mm10, innerFront.y_mm10, innerFront.z_mm10]).toEqual([innerBox.x, innerBox.y, innerBox.z]);
    expect([innerFront.w_mm10, innerFront.h_mm10]).toEqual([innerBox.w, innerBox.h]);
    // …and it sits strictly inside the outer drawer's front opening.
    const outerFront = ps.find((p) => p.id === "b__inst_d1__front")!;
    expect(innerFront.x_mm10).toBeGreaterThan(outerFront.x_mm10);
    expect(innerFront.x_mm10 + innerFront.w_mm10).toBeLessThan(outerFront.x_mm10 + outerFront.w_mm10);
  });
});

describe("E2.4 · nestDrawer op — create a drawer-in-drawer without hand-built geometry", () => {
  it("nestDrawer adds a working nested drawer (no stored box; the solver sizes it)", () => {
    const out = nestDrawer(mkDrawer().model, "d1");
    const parts = solveModelToParts(out);
    expect(parts).toHaveLength(15); // 5 carcass + 5 outer + 5 nested
    expect(parts.find((p) => p.id === "b__inst_d1__in_d1__nd1__front")).toBeDefined();
  });

  it("nestDrawer twice appends a second nested drawer", () => {
    const out = nestDrawer(nestDrawer(mkDrawer().model, "d1"), "d1");
    expect(solveModelToParts(out)).toHaveLength(20); // 5 carcass + 5 outer + 5 + 5
  });

  it("guards: unknown outer instance throws", () => {
    expect(() => nestDrawer(mkDrawer().model, "ghost")).toThrow("NEST_OUTER_NOT_FOUND");
  });
});

describe("E2.5 · drawer slide — open state (layout only)", () => {
  const openInst = (m: StructuralModel, open: number): StructuralModel => ({
    ...m,
    blocks: [{ ...m.blocks[0]!, instances: [{ ...m.blocks[0]!.instances[0]!, open }] }],
  });

  it("an open drawer slides forward by open × travel (body depth); a shut one is unchanged", () => {
    const { model } = mkDrawer();
    const t = resolveThickness({});
    const travel = 5600 - t.facade - t.carcass; // section depth − facade − carcass
    const shut = solveLayout(model).find((p) => p.id === "b__inst_d1__front")!;
    const open = solveLayout(openInst(model, 1)).find((p) => p.id === "b__inst_d1__front")!;
    expect(open.z_mm10 - shut.z_mm10).toBe(travel); // fully out
    const half = solveLayout(openInst(model, 0.5)).find((p) => p.id === "b__inst_d1__front")!;
    expect(half.z_mm10 - shut.z_mm10).toBe(Math.round(travel / 2)); // half out
  });

  it("open is LAYOUT-ONLY — the manufacturing parts never change", () => {
    const { model } = mkDrawer();
    expect(solveModelToParts(openInst(model, 1))).toEqual(solveModelToParts(model));
  });

  it("a nested drawer slides WITH its parent, and its own open composes on top", () => {
    const base = nestDrawer(mkDrawer().model, "d1"); // outer d1 + nested d1__nd1
    const nid = "b__inst_d1__in_d1__nd1__front";
    const t = resolveThickness({});
    const outerTravel = 5600 - t.facade - t.carcass; // 5280
    const innerBox = drawerInteriorBox(mkDrawer().block, mkDrawer().section, t);
    const innerTravel = innerBox.d - t.facade - t.carcass;

    const shutZ = solveLayout(base).find((p) => p.id === nid)!.z_mm10;
    // Outer opens → the nested box moves with it by the outer travel.
    const outerOpen = solveLayout(openInst(base, 1)).find((p) => p.id === nid)!.z_mm10;
    expect(outerOpen - shutZ).toBe(outerTravel);
    // Outer AND nested open → the shifts compose (nested moves by both).
    const both: StructuralModel = {
      ...base,
      blocks: [{ ...base.blocks[0]!, instances: [{
        ...base.blocks[0]!.instances[0]!, open: 1,
        interior: { ...base.blocks[0]!.instances[0]!.interior!, instances: [{ ...base.blocks[0]!.instances[0]!.interior!.instances[0]!, open: 1 }] },
      }] }],
    };
    expect(solveLayout(both).find((p) => p.id === nid)!.z_mm10 - shutZ).toBe(outerTravel + innerTravel);
  });
});
