// E2.1 — nested-drawer foundation: the DrawerInterior contract + drawerInteriorBox (a drawer's clear
// inner volume). This is the block-local box a nested drawer (or any content) sits in. Verified against
// the REAL drawer body: the interior must be exactly the space between the box sides, above the bottom,
// behind the facade — so later steps can drop a drawer into it.
import { describe, it, expect } from "vitest";
import { drawerInteriorBox, resolveThickness } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
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
        "h": 6720,
        "w": 5100,
        "x": 450,
        "y": 320,
        "z": 160,
      }
    `);
  });
});

/** An inner drawer nested inside `outerInstId`'s drawer, sized to fill the given interior box. */
const nestInDrawer = (interior: DrawerInterior, innerId: string): DrawerInterior => ({
  ...interior,
  components: [...interior.components, { id: `cmp_${innerId}`, name: "Ящик внутр", partIds: [], role: null, drawer: true }],
  instances: [...interior.instances, { id: innerId, componentId: `cmp_${innerId}`, sectionId: "", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
});

/** The demo drawer with a nested drawer inside (and optionally a drawer inside THAT). */
const mkNested = (depth: 1 | 2): StructuralModel => {
  const { model, block, section } = mkDrawer();
  const t = resolveThickness({});
  const innerBox = drawerInteriorBox(block, section, t);
  let interior: DrawerInterior = nestInDrawer({ box: innerBox, components: [], instances: [] }, "in1");
  if (depth === 2) {
    // The level-2 drawer nests inside the level-1 drawer's own interior.
    const lvl2Box = { ...innerBox, x: innerBox.x + 500, y: innerBox.y + 500, w: innerBox.w - 1000, h: innerBox.h - 1000, d: innerBox.d - 1000 };
    interior = {
      ...interior,
      instances: [{ ...interior.instances[0]!, interior: nestInDrawer({ box: lvl2Box, components: [], instances: [] }, "in2") }],
    };
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
