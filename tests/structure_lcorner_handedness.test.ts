// Phase 4 polish — L-corner handedness. A right-hand L is the MIRROR of the return leg (leg-B + filler +
// worktop_b + plinth_b) about leg-A's X-centre; leg-A / worktop_a / plinth_a are symmetric → untouched. The
// leg-B section origin + facing follow the hand ("+x" for right), so shelves/doors/drawers land in the mirrored
// leg. The CUT LIST is identical for both hands (lCornerParts is orientation-agnostic). Left (hand absent) is
// byte-identical to today.

import { describe, it, expect } from "vitest";

import { setBlockFootprint, addInstance } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGA = { length_mm10: 6000, depth_mm10: 5600 };
const LEGB = { length_mm10: 4000, depth_mm10: 4000 };
const XSPAN = LEGA.length_mm10; // leg-A X extent (block.box.x = 0), so mirror x' = XSPAN − x − w

/** A 600×720×560 carcass → an L (worktop + plinth on, so worktop_b/plinth_b exist) with a given hand. */
function lModel(hand?: "left" | "right"): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const L = setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB, ...(hand ? { hand } : {}) });
  const b = L.blocks[0]!;
  return { ...L, blocks: [{ ...b, worktop: true, plinth_mm10: 1000 }] };
}
const isLegB = (id: string) =>
  id.includes("__legB__") || id.endsWith("__corner_filler") || id.endsWith("__worktop_b") || id.endsWith("__plinth_b");
const sort3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y);

describe("Phase 4 polish — right-hand L mirrors the return leg", () => {
  it("leg-B / filler / worktop_b / plinth_b flip to the max-X end; leg-A stays put", () => {
    const lp = new Map(solveLayout(lModel(), tk).map((p) => [p.id, p]));
    for (const rp of solveLayout(lModel("right"), tk)) {
      const l = lp.get(rp.id)!;
      if (isLegB(rp.id)) {
        expect(rp.x_mm10).toBe(XSPAN - l.x_mm10 - l.w_mm10); // mirrored X
        expect([rp.y_mm10, rp.z_mm10, rp.w_mm10, rp.h_mm10, rp.d_mm10]).toEqual([l.y_mm10, l.z_mm10, l.w_mm10, l.h_mm10, l.d_mm10]);
      } else {
        expect(rp).toEqual(l); // leg-A / worktop_a / plinth_a — untouched
      }
    }
  });

  it("the leg-B section origin + facing follow the hand", () => {
    const rz = lModel("right").blocks[0]!.zones.find((z) => z.id.endsWith("z_legB"))!;
    expect(rz.root.box.x).toBe(LEGA.length_mm10 - LEGB.depth_mm10); // 2000 (max-X end)
    expect(rz.facing).toBe("+x");
    const lz = lModel().blocks[0]!.zones.find((z) => z.id.endsWith("z_legB"))!;
    expect(lz.root.box.x).toBe(0);
    expect(lz.facing).toBe("-x");
  });
});

describe("Phase 4 polish — right-hand leg-B facades hang on the +X face", () => {
  it("a right-hand leg-B DOOR is thin-in-X on the +X face, spanning legB.length in Z", () => {
    const R = addInstance(lModel("right"), "blk_main__sec_legB", "door");
    const facade = solveStructure(R, tk).find((p) => p.role === "facade")!;
    const pl = solveLayout(R, tk).find((p) => p.id === facade.id)!;
    expect(pl.w_mm10).toBe(tk.facade); // thin in X
    expect(pl.d_mm10).toBe(LEGB.length_mm10); // spans the leg run (Z)
    expect(pl.x_mm10 + pl.w_mm10).toBe(LEGA.length_mm10); // its outer face IS the block's max-X edge (+X)
  });

  it("a right-hand leg-B DRAWER is mirror-exact (solve==layout) with its front on the +X face", () => {
    const R = addInstance(lModel("right"), "blk_main__sec_legB", "drawer");
    const parts = solveStructure(R, tk), places = solveLayout(R, tk);
    const base = parts.find((p) => p.id.endsWith("__front"))!.id.slice(0, -"__front".length);
    for (const suf of ["__front", "__side_l", "__side_r", "__back", "__bottom"]) {
      const part = parts.find((p) => p.id === base + suf)!, pl = places.find((p) => p.id === base + suf)!;
      expect(sort3(part.length_mm10, part.width_mm10, part.thickness_mm10)).toEqual(sort3(pl.w_mm10, pl.h_mm10, pl.d_mm10));
    }
    const front = places.find((p) => p.id === base + "__front")!;
    expect(front.w_mm10).toBe(tk.facade); // thin in X
    expect(front.x_mm10 + front.w_mm10).toBe(LEGA.length_mm10); // front sits on the +X face
  });
});

describe("Phase 4 polish — invariants", () => {
  it("the CUT LIST is byte-identical between left and right (lCornerParts is orientation-agnostic)", () => {
    const cut = (m: StructuralModel) => solveStructure(m, tk).map((p) => `${p.id}:${p.length_mm10}x${p.width_mm10}x${p.thickness_mm10}`).sort();
    expect(cut(lModel("right"))).toEqual(cut(lModel()));
  });

  it("hand absent === hand:'left' (byte-identical default)", () => {
    expect(solveLayout(lModel("left"), tk)).toEqual(solveLayout(lModel(), tk));
  });
});
