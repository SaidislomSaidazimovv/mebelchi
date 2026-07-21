// Phase 2.1d — a lift door renders OPEN (tilted up) via the facade placement's `rotX_deg`. This is
// RENDER-ONLY: the tilt never touches the cut size, so `solveStructure` (the cut list) is byte-identical
// with or without a lift. Proves: a lift facade carries a non-zero rotX_deg (swing ≠ parallel), a lift-less
// door carries none, and the manufactured part sizes are unchanged.

import { describe, it, expect } from "vitest";

import { addInstance, divideSection, setComponentLift } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel, LiftType } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

function door(lift?: LiftType): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
  const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
  m = addInstance(m, sec.id, "door");
  if (lift) m = setComponentLift(m, m.blocks[0]!.components.find((c) => c.role === "facade")!.id, lift);
  return m;
}

const facade = (m: StructuralModel) => solveLayout(m, tk).find((p) => p.id.includes("__inst_") && !p.id.endsWith("__front"))!;
/** The cut list as comparable size tuples (id → L×W×T mm10), so a render-only change is provably invisible here. */
const cutSizes = (m: StructuralModel) => solveStructure(m, tk).map((p) => `${p.id}:${p.length_mm10}x${p.width_mm10}x${p.thickness_mm10}`).sort();

describe("Phase 2.1d — a lift door renders open (rotX_deg), cut size unchanged", () => {
  it("a lift-less door's facade has NO rotX_deg", () => {
    expect(facade(door()).rotX_deg).toBeUndefined();
  });

  it("a swing lift facade tilts open UP (positive rotX_deg — the bottom swings up over the front)", () => {
    const r = facade(door("swing")).rotX_deg;
    expect(r).toBeDefined();
    expect(r!).toBeGreaterThan(0); // positive = swings UP from the top edge
  });

  it("parallel tilts differently from swing (a distinct open pose)", () => {
    expect(facade(door("parallel")).rotX_deg).not.toBe(facade(door("swing")).rotX_deg);
  });

  it("the CUT LIST is byte-identical with or without a lift (rotX_deg is render-only)", () => {
    expect(cutSizes(door("swing"))).toEqual(cutSizes(door()));
    expect(cutSizes(door("parallel"))).toEqual(cutSizes(door()));
  });

  it("only the facade tilts — every other placement keeps rotX_deg absent", () => {
    const others = solveLayout(door("swing"), tk).filter((p) => !(p.id.includes("__inst_") && !p.id.endsWith("__front")));
    for (const p of others) expect(p.rotX_deg).toBeUndefined();
  });
});
