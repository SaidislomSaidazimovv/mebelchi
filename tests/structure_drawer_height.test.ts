// Per-drawer height: Instance.drawerHeight_mm10 overrides the 200mm default box/front height, and the
// solver clamps the top at the section (bay) so an over-tall value just fills the opening — never pokes out.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance, nestDrawer } from "../engine/structure/operations.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { mm10 } from "../engine/contracts/types.js";

const firstLeaf = (m: StructuralModel) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

// Set drawerHeight_mm10 on every instance in the model (the test models have exactly one).
const withDrawerHeight = (m: StructuralModel, h: mm10): StructuralModel => ({
  ...m,
  blocks: m.blocks.map((b) => ({ ...b, instances: b.instances.map((i) => ({ ...i, drawerHeight_mm10: h })) })),
});

const facadeLen = (m: StructuralModel) => solveStructure(m).find((p) => p.name.includes("Ящик · фасад"))!.length_mm10;
const sideH = (m: StructuralModel) => solveStructure(m).find((p) => p.name.includes("Ящик · бок Л"))!.width_mm10;

describe("per-drawer height (drawerHeight_mm10)", () => {
  const base = buildDemoModel();
  const drawer = addInstance(base, firstLeaf(base), "drawer");

  it("defaults the front height to 200mm (2000 mm10)", () => {
    expect(facadeLen(drawer)).toBe(2000);
  });

  it("a smaller override shrinks the front and the side height by the same amount", () => {
    const small = withDrawerHeight(drawer, 1000 as mm10); // 100mm
    expect(facadeLen(small)).toBe(1000);
    expect(facadeLen(small)).toBeLessThan(facadeLen(drawer));
    // sides follow the front (sideH = box.h − 2·carcass), so the delta matches exactly
    expect(sideH(drawer) - sideH(small)).toBe(1000);
  });

  it("an over-tall override is clamped to the bay (fills the opening, never pokes out)", () => {
    const huge = withDrawerHeight(drawer, 100000 as mm10); // 10m — far taller than any section
    const bay = facadeLen(huge); // clamped to the section box height
    expect(bay).toBeGreaterThan(2000); // the demo bay is taller than the 200mm default…
    expect(facadeLen(drawer)).toBe(2000); // …so the default really was clamped by height, not the bay
    // clamping again with a value above the bay yields the same bay height (idempotent ceiling)
    expect(facadeLen(withDrawerHeight(drawer, (bay + 5000) as mm10))).toBe(bay);
  });

  // Regression — a NESTED drawer's height is INDEPENDENT of its parent (bug: editing a nested drawer
  // resized the whole stack because only the top-level height existed).
  it("a nested drawer honours its OWN height, leaving the parent untouched", () => {
    const topInst = drawer.blocks[0]!.instances.at(-1)!;
    const nested = nestDrawer(drawer, topInst.id); // drawer-in-drawer
    // the nested drawer, unset, FILLS the parent's clear volume (much taller than a 90mm box)
    const fill = solveStructure(nested).find((p) => p.name.includes("Ящик · фасад") && p.id.includes("__in_"))!.length_mm10;
    expect(fill).toBeGreaterThan(900);
    // set ONLY the nested drawer's height to 90mm (900 mm10)
    const withNested: StructuralModel = {
      ...nested,
      blocks: nested.blocks.map((b) => ({
        ...b,
        instances: b.instances.map((i) => (i.id !== topInst.id ? i : { ...i, interior: { ...i.interior!, instances: i.interior!.instances.map((ni) => ({ ...ni, drawerHeight_mm10: 900 as mm10 })) } })),
      })),
    };
    const fronts = solveStructure(withNested).filter((p) => p.name.includes("Ящик · фасад"));
    const topFront = fronts.find((p) => !p.id.includes("__in_"))!;
    const nestedFront = fronts.find((p) => p.id.includes("__in_"))!;
    expect(nestedFront.length_mm10).toBe(900); // the nested drawer took its own height…
    expect(topFront.length_mm10).toBe(2000); // …and the parent kept its 200mm default (unchanged)
  });
});
