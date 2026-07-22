// Phase 4.c — an L-corner block gets a worktop + plinth, emitted PER LEG (2 slabs + 2 toe-kicks) so the
// worktop is L-shaped (covers both legs, abutting at the corner), not a rectangle over the empty void.
// Reuses the carcass_worktop / carcass_plinth roles. A bare L (no worktop/plinth) is byte-identical.

import { describe, it, expect } from "vitest";

import { setBlockFootprint } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure, WORKTOP_OVERHANG_MM10 } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGA = { length_mm10: 6000, depth_mm10: 5600 };
const LEGB = { length_mm10: 4000, depth_mm10: 4000 };

/** A 600×720×560 carcass converted to an L, optionally with a worktop + plinth. */
function lModel(opts: { worktop?: boolean; plinth?: number } = {}): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const L = setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB });
  const b = L.blocks[0]!;
  return { ...L, blocks: [{ ...b, ...(opts.worktop ? { worktop: true } : {}), ...(opts.plinth ? { plinth_mm10: opts.plinth } : {}) }] };
}
const part = (m: StructuralModel, suffix: string) => solveStructure(m, tk).find((p) => p.id.endsWith(suffix));
const place = (m: StructuralModel, suffix: string) => solveLayout(m, tk).find((p) => p.id.endsWith(suffix));

describe("Phase 4.c — L worktop (two abutting slabs)", () => {
  it("emits worktop A (leg-A + overhang) and worktop B (leg-B), both carcass_worktop", () => {
    const m = lModel({ worktop: true });
    const a = part(m, "__worktop_a")!, b = part(m, "__worktop_b")!;
    expect(a.role).toBe("carcass_worktop");
    expect(b.role).toBe("carcass_worktop");
    expect(a.length_mm10).toBe(LEGA.length_mm10);
    expect(a.width_mm10).toBe(LEGA.depth_mm10 + WORKTOP_OVERHANG_MM10); // front overhang
    expect(b.length_mm10).toBe(LEGB.depth_mm10);
    expect(b.width_mm10).toBe(LEGB.length_mm10);
  });

  it("the two worktop slabs ABUT at z + legA.depth (no overlap, no gap)", () => {
    const m = lModel({ worktop: true });
    const a = place(m, "__worktop_a")!, b = place(m, "__worktop_b")!;
    // A's far edge (z + d) === B's near edge (z) === z0 + legA.depth
    expect(a.z_mm10 + a.d_mm10).toBe(b.z_mm10);
    expect(b.z_mm10).toBe(a.z_mm10 + WORKTOP_OVERHANG_MM10 + LEGA.depth_mm10); // A started at z−overhang
  });

  it("a NON-L block still emits a single __worktop (unchanged)", () => {
    const rect = buildCarcassModel(600, 720, 560);
    const wt = { ...rect, blocks: [{ ...rect.blocks[0]!, worktop: true }] };
    expect(part(wt, "__worktop")).toBeDefined();
    expect(part(wt, "__worktop_a")).toBeUndefined(); // the L split is L-only
  });
});

describe("Phase 4.c — L plinth (two toe-kicks)", () => {
  it("emits plinth A (leg-A front) + plinth B (leg-B front), both carcass_plinth", () => {
    const m = lModel({ plinth: 1000 });
    expect(part(m, "__plinth_a")!.role).toBe("carcass_plinth");
    expect(part(m, "__plinth_b")!.role).toBe("carcass_plinth");
    expect(part(m, "__plinth_a")!.length_mm10).toBe(LEGA.length_mm10 - 2 * tk.carcass);
    expect(part(m, "__plinth_b")!.length_mm10).toBe(LEGB.length_mm10 - 2 * tk.carcass);
  });
});

describe("Phase 4.c — a bare L is byte-identical", () => {
  it("no worktop/plinth → no worktop/plinth parts (the existing L is unchanged)", () => {
    const bare = lModel();
    const ids = solveStructure(bare, tk).map((p) => p.id);
    expect(ids.some((id) => id.includes("__worktop"))).toBe(false);
    expect(ids.some((id) => id.includes("__plinth"))).toBe(false);
    // the corner filler + both legs are still there
    expect(ids.some((id) => id.endsWith("__corner_filler"))).toBe(true);
  });
});
