// Phase 4.d-2b — a DRAWER on an L return-leg (leg-B) is re-axed to the −X face: the front is thin-in-X at the
// −X opening, the box runs its width along Z (legB.length) and its depth along X (legB.depth). solve
// (drawerBoxFromBox) and layout (drawerBoxPlaceInto) must stay MIRROR-exact — the 3D box must equal the cut
// list panel-for-panel. We prove it by asserting each panel's cut box {length,width,thickness} (as a set)
// equals its placement box {w,h,d} (as a set) — a board is the same box however its axes are labelled. A
// leg-A / rectangular drawer (facing default "-z") is byte-identical. Nested drawer-in-drawer in leg-B is
// deferred (its own step).

import { describe, it, expect } from "vitest";

import { setBlockFootprint, addInstance, setComponentOrganizer } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGA = { length_mm10: 6000, depth_mm10: 5600 };
const LEGB = { length_mm10: 4000, depth_mm10: 4000 };
const sort3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y);

/** A 600×720×560 carcass → an L, then a drawer added to the leg-B compartment. */
function legBDrawerModel(): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const L = setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB });
  return addInstance(L, "blk_main__sec_legB", "drawer");
}
const drawerBase = (m: StructuralModel) => solveStructure(m, tk).find((p) => p.id.endsWith("__front"))!.id.slice(0, -"__front".length);

/** For every drawer panel `base+suf`, the cut box (length/width/thickness) must equal the placement box. */
function assertMirror(m: StructuralModel, suffixes: string[]) {
  const base = drawerBase(m);
  const parts = solveStructure(m, tk);
  const places = solveLayout(m, tk);
  for (const suf of suffixes) {
    const part = parts.find((p) => p.id === base + suf)!;
    const pl = places.find((p) => p.id === base + suf)!;
    expect(part, `cut ${suf}`).toBeDefined();
    expect(pl, `place ${suf}`).toBeDefined();
    expect(sort3(part.length_mm10, part.width_mm10, part.thickness_mm10)).toEqual(sort3(pl.w_mm10, pl.h_mm10, pl.d_mm10));
  }
}

describe("Phase 4.d-2b — leg-B drawer: solve == layout, re-axed to −X", () => {
  it("all 5 panels: the cut box equals the placement box (mirror-exact in the −X frame)", () => {
    assertMirror(legBDrawerModel(), ["__front", "__side_l", "__side_r", "__back", "__bottom"]);
  });

  it("the FRONT sits thin-in-X on the −X face, spanning legB.length in Z", () => {
    const m = legBDrawerModel();
    const base = drawerBase(m);
    const front = solveLayout(m, tk).find((p) => p.id === base + "__front")!;
    expect(front.w_mm10).toBe(tk.facade); // thin in X (the drawer face thickness)
    expect(front.x_mm10).toBe(0); // the −X face (block/section origin)
    expect(front.d_mm10).toBe(LEGB.length_mm10); // spans the return-leg run along Z
  });

  it("with an organizer, the divider panels also mirror (solve == layout)", () => {
    const m0 = legBDrawerModel();
    const b = m0.blocks[0]!;
    const compId = b.instances.map((i) => b.components.find((c) => c.id === i.componentId)).find((c) => c?.drawer)!.id;
    const m = setComponentOrganizer(m0, compId, { dividers: 2, axis: "x" });
    assertMirror(m, ["__front", "__side_l", "__side_r", "__back", "__bottom", "__org_0", "__org_1"]);
  });
});

describe("Phase 4.d-2b — a leg-A / rectangular drawer is byte-identical (default −Z)", () => {
  it("a drawer on a rectangular block keeps the front thin-in-Z (the −X branch never fires)", () => {
    const m = buildCarcassModel(600, 720, 560);
    const withDrawer = addInstance(m, m.blocks[0]!.zones[0]!.root.id, "drawer");
    const base = drawerBase(withDrawer);
    const front = solveLayout(withDrawer, tk).find((p) => p.id === base + "__front")!;
    expect(front.d_mm10).toBe(tk.facade); // thin in Z (the normal front)
    expect(front.w_mm10).toBe(6000); // spans the width in X
    // the default drawer is still mirror-exact too
    assertMirror(withDrawer, ["__front", "__side_l", "__side_r", "__back", "__bottom"]);
  });
});
