// Phase 4.d-1 — the L's return leg (leg-B) becomes its own zone/section, so content lives in BOTH legs.
// Converting to an L appends a bare leg-B compartment (z_legB / sec_legB) sized 1:1 to leg-B's carcass; a
// shelf added there solves + places INSIDE the return leg (X in leg-B's width, Z beyond legA.depth). The
// leg-A zone is untouched, converting back drops the leg-B zone (byte-identical round-trip), and re-setting
// leg-B's dims updates the existing zone (no duplicate). Shelves/dividers only — leg-B doors wait for 4.d-2.

import { describe, it, expect } from "vitest";

import { setBlockFootprint, addInstance, LEGB_ZONE_ID, LEGB_SECTION_ID } from "../engine/structure/operations.js";
import { buildCarcassModel, buildLCornerModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGA = { length_mm10: 6000, depth_mm10: 5600 };
const LEGB = { length_mm10: 4000, depth_mm10: 4000 };
/** A 600×720×560 carcass converted to an L (legA = the box, legB 400×400). */
function lModel(): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  return setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB });
}
const blk = (m: StructuralModel) => m.blocks[0]!;

describe("Phase 4.d-1 — leg-B is its own compartment", () => {
  it("converting to L appends a leg-B zone with a bare leaf sized to the return leg", () => {
    const L = lModel();
    expect(blk(L).zones.length).toBe(2);
    const zone = blk(L).zones.find((z) => z.id === LEGB_ZONE_ID)!;
    expect(zone).toBeDefined();
    expect(zone.root.id).toBe(LEGB_SECTION_ID);
    // 1:1 to leg-B's carcass: z origin = legA.depth, width = legB.depth (X), depth = legB.length (Z), shared h
    expect(zone.root.box).toEqual({ x: 0, y: 0, z: LEGA.depth_mm10, w: LEGB.depth_mm10, h: blk(L).box.h, d: LEGB.length_mm10 });
    expect(zone.root.instanceIds).toEqual([]);
    expect(zone.root.children).toEqual([]);
  });

  it("a shelf added to sec_legB places INSIDE leg-B (X in the return width, Z beyond legA.depth)", () => {
    const L = lModel();
    const before = new Set(solveLayout(L, tk).map((p) => p.id));
    const withShelf = addInstance(L, LEGB_SECTION_ID, "shelf");
    const shelf = solveLayout(withShelf, tk).find((p) => !before.has(p.id));
    expect(shelf).toBeDefined();
    // leg-B occupies X ∈ [0, legB.depth], Z ∈ [legA.depth, legA.depth + legB.length]
    expect(shelf!.x_mm10).toBeGreaterThanOrEqual(0);
    expect(shelf!.x_mm10 + shelf!.w_mm10).toBeLessThanOrEqual(LEGB.depth_mm10);
    expect(shelf!.z_mm10).toBeGreaterThanOrEqual(LEGA.depth_mm10);
    expect(shelf!.z_mm10 + shelf!.d_mm10).toBeLessThanOrEqual(LEGA.depth_mm10 + LEGB.length_mm10);
  });

  it("the leg-B shelf is a NEW part (leg-A content is untouched by the leg-B add)", () => {
    const L = lModel();
    const before = solveLayout(L, tk).length;
    const withShelf = addInstance(L, LEGB_SECTION_ID, "shelf");
    expect(solveLayout(withShelf, tk).length).toBe(before + 1); // exactly one shelf added, nothing lost
  });
});

describe("Phase 4.d-1 — round-trip + re-set", () => {
  it("converting back to rectangular drops the leg-B zone (byte-identical)", () => {
    const m = buildCarcassModel(600, 720, 560);
    const L = setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB });
    const back = setBlockFootprint(L, L.blocks[0]!.id, null);
    expect(back.blocks[0]!.footprint).toBeUndefined();
    expect(back.blocks[0]!.zones).toEqual(m.blocks[0]!.zones); // leg-B zone gone, leg-A restored exactly
  });

  it("re-setting leg-B dims updates the existing zone box (no duplicate zone)", () => {
    const L = lModel();
    const wider = setBlockFootprint(L, blk(L).id, { legA: LEGA, legB: { length_mm10: 8000, depth_mm10: 5000 } });
    const zones = wider.blocks[0]!.zones.filter((z) => z.id === LEGB_ZONE_ID);
    expect(zones.length).toBe(1); // still exactly one leg-B zone
    expect(zones[0]!.root.box).toEqual({ x: 0, y: 0, z: LEGA.depth_mm10, w: 5000, h: blk(L).box.h, d: 8000 });
  });
});

describe("Phase 4.d-1 — the L demo carries a leg-B compartment", () => {
  it("buildLCornerModel has a bare leg-B zone alongside leg-A", () => {
    const demo = buildLCornerModel();
    const zone = demo.blocks[0]!.zones.find((z) => z.id === LEGB_ZONE_ID);
    expect(zone).toBeDefined();
    expect(zone!.root.instanceIds).toEqual([]); // empty → adds no part to the demo cut list
  });
});
