// Phase 4.a — create/convert an L-corner via `setBlockFootprint`. Converting a rectangle keeps leg-A === the
// original box (so the section + content stay valid), grows box.d by the return leg, and toggling off restores
// a byte-identical rectangle. The L then solves a real L carcass (leg-A 5 panels + leg-B 4 + a corner filler).

import { describe, it, expect } from "vitest";

import { setBlockFootprint } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel, LCornerFootprint } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const rect = (): StructuralModel => buildCarcassModel(600, 720, 560); // box mm10 = 6000×7200×5600
const box = (m: StructuralModel) => m.blocks[0]!.box;
const cutIds = (m: StructuralModel) => solveStructure(m, tk).map((p) => p.id).sort();
const LEGB: LCornerFootprint["legB"] = { length_mm10: 4000, depth_mm10: 4000 };
const toL = (m: StructuralModel): StructuralModel =>
  setBlockFootprint(m, m.blocks[0]!.id, { legA: { length_mm10: box(m).w, depth_mm10: box(m).d }, legB: LEGB });

describe("Phase 4.a — setBlockFootprint (convert to L)", () => {
  it("attaches the footprint; leg-A = the box, box.d grows by legB.length, box.h unchanged", () => {
    const m = rect();
    const L = toL(m);
    expect(L.blocks[0]!.footprint).toEqual({ legA: { length_mm10: 6000, depth_mm10: 5600 }, legB: LEGB });
    expect(box(L).w).toBe(6000);
    expect(box(L).d).toBe(5600 + 4000); // legA.depth + legB.length
    expect(box(L).h).toBe(box(m).h);
  });

  it("the leg-A zone is untouched; a leg-B compartment (zone) is appended (Phase 4.d-1)", () => {
    const m = rect();
    const L = toL(m);
    expect(L.blocks[0]!.zones.length).toBe(m.blocks[0]!.zones.length + 1); // + the leg-B zone
    expect(L.blocks[0]!.zones[0]).toEqual(m.blocks[0]!.zones[0]); // leg-A zone byte-identical (no surgery)
    const legB = L.blocks[0]!.zones.find((z) => z.id.endsWith("z_legB"))!;
    // leg-B leaf sized 1:1 to the return leg: z=legA.depth, w=legB.depth, d=legB.length, shared height
    expect(legB.root.box).toEqual({ x: 0, y: 0, z: 5600, w: 4000, h: 7200, d: 4000 });
    expect(legB.root.instanceIds).toEqual([]); // a bare compartment
  });

  it("the L block solves an L carcass — a corner filler appears + more parts than the rectangle", () => {
    const m = rect();
    const parts = solveStructure(toL(m), tk);
    expect(parts.some((p) => p.id.endsWith("__corner_filler"))).toBe(true);
    expect(parts.length).toBeGreaterThan(solveStructure(m, tk).length); // leg-B panels + filler added
  });
});

describe("Phase 4.a — round-trip + no-op", () => {
  it("toggling OFF restores the rectangle byte-identically (cut list + box.d)", () => {
    const m = rect();
    const L = toL(m);
    const back = setBlockFootprint(L, L.blocks[0]!.id, null);
    expect(back.blocks[0]!.footprint).toBeUndefined();
    expect(box(back).d).toBe(box(m).d); // 5600 restored
    expect(cutIds(back)).toEqual(cutIds(m)); // the cut list matches the original rectangle
  });

  it("clearing a rectangle / an unknown block is a no-op (same ref)", () => {
    const m = rect();
    expect(setBlockFootprint(m, m.blocks[0]!.id, null)).toBe(m); // already rectangular
    expect(setBlockFootprint(m, "nope", { legA: LEGB, legB: LEGB })).toBe(m); // no such block
  });
});

describe("Phase 4.a — edit the return leg", () => {
  it("changing legB updates box.d without touching leg-A", () => {
    const m = rect();
    const L = toL(m);
    const wider = setBlockFootprint(L, L.blocks[0]!.id, { legA: L.blocks[0]!.footprint!.legA, legB: { length_mm10: 8000, depth_mm10: 5000 } });
    expect(wider.blocks[0]!.footprint!.legB).toEqual({ length_mm10: 8000, depth_mm10: 5000 });
    expect(box(wider).d).toBe(5600 + 8000); // legA.depth + the new legB.length
    expect(box(wider).w).toBe(6000); // leg-A length unchanged
  });
});
