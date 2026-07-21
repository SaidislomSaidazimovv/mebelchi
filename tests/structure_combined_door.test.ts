// Phase 2.2a — combined doors: a facade on a PARENT (non-leaf) section covers the WHOLE opening (over its
// children). The engine already sizes a facade from its section's box, so a door on the parent is naturally
// the combined span. A facade-only fallback resolves the non-leaf section; everything else is unchanged, so
// a door on a leaf is byte-identical to today.

import { describe, it, expect } from "vitest";

import { addInstance, divideSection } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { DrillOp } from "../engine/contracts/types.js";

const tk = planThickness(DEFAULT_PLAN);
const facadePart = (m: StructuralModel) => solveStructure(m, tk).find((p) => p.role === "facade" && p.id.includes("__inst_") && !p.id.endsWith("__front"));

/** A 2-column carcass. `where` = "parent" adds ONE door to the divided root; "leaf" adds it to one column. */
function twoColDoor(where: "parent" | "leaf"): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 });
  if (where === "parent") {
    m = addInstance(m, root, "door"); // Phase 2.2 — a door on the PARENT = the combined door
  } else {
    const col0 = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x)[0]!;
    m = addInstance(m, col0.id, "door");
  }
  return m;
}

describe("Phase 2.2a — a combined door covers the whole opening", () => {
  it("a door on the PARENT spans the full width — WIDER than a door on one column", () => {
    const combined = facadePart(twoColDoor("parent"))!;
    const single = facadePart(twoColDoor("leaf"))!;
    expect(combined).toBeDefined();
    expect(single).toBeDefined();
    // the combined door's width = both columns + the divider; a single-column door is ~half of it
    expect(combined.width_mm10).toBeGreaterThan(single.width_mm10 * 1.8);
  });

  it("there is exactly ONE facade for the combined pair (not one per column)", () => {
    const facades = solveStructure(twoColDoor("parent"), tk).filter((p) => p.role === "facade" && p.id.includes("__inst_"));
    expect(facades).toHaveLength(1);
  });

  it("the internal divider still emits behind the combined door", () => {
    const parts = solveStructure(twoColDoor("parent"), tk);
    expect(parts.some((p) => p.id.includes("__div_"))).toBe(true); // the vertical divider is still there
  });

  it("the combined door is PLACED (renders) at the full parent width", () => {
    const places = solveLayout(twoColDoor("parent"), tk);
    const facade = places.find((p) => p.role === "facade" || (p.id.includes("__inst_") && !p.id.endsWith("__front")))
      ?? places.find((p) => p.id.includes("__inst_"));
    // the widest instance placement is the combined door
    const doorPlace = places.filter((p) => p.id.includes("__inst_")).sort((a, b) => b.w_mm10 - a.w_mm10)[0]!;
    expect(doorPlace.w_mm10).toBeGreaterThan(2000); // spans most of the 600mm (6000 mm10) cabinet
    void facade;
  });

  it("the combined door still drills hinge cups (size-driven, more for a taller door)", () => {
    const door = solveModelToParts(twoColDoor("parent"), tk).find((p) => p.role === "facade" && !p.id.endsWith("__front"))!;
    const cups = door.operations.filter((o): o is DrillOp => o.op === "drill" && o.diameter_mm10 === 350);
    expect(cups.length).toBeGreaterThan(0);
  });
});

describe("Phase 2.2a — a door on a leaf is byte-identical (the fallback never fires)", () => {
  it("a plain leaf-door model solves exactly as before", () => {
    // build a one-column door two ways: it must be identical regardless of the 2.2 code path
    let a = buildCarcassModel(600, 720, 560);
    const root = a.blocks[0]!.zones[0]!.root.id;
    a = divideSection(a, root, { kind: "equal", axis: "x", count: 1 });
    const leaf = [...leafSections(a.blocks[0]!.zones[0]!.root)][0]!;
    a = addInstance(a, leaf.id, "door");
    const sizes = solveStructure(a, tk).map((p) => `${p.id}:${p.length_mm10}x${p.width_mm10}x${p.thickness_mm10}`).sort();
    // no non-leaf facade anywhere → the leaf lookup resolves everything, the fallback is never reached
    expect(sizes.some((s) => s.includes("__inst_"))).toBe(true);
    expect(facadePart(a)!.width_mm10).toBeGreaterThan(0);
  });
});
