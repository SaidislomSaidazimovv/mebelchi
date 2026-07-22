// Phase 4.d-2a — a DOOR on an L return-leg (leg-B) lands on the −X face (rotated 90° from the normal −Z
// front). Because drilling is part-local (hinge cups run along the door's own length, handle along its width)
// and the renderer/handles derive orientation from the placement's thinnest axis, the ONLY engine changes are
// the facade cut width (solve) + the placement axes (layout), gated by the owning zone's facing = "-x".
// A leg-A / rectangular door (facing default "-z") is byte-identical.

import { describe, it, expect } from "vitest";

import { setBlockFootprint, addInstance } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGA = { length_mm10: 6000, depth_mm10: 5600 };
const LEGB = { length_mm10: 4000, depth_mm10: 4000 };
const H = 7200; // box height (mm10) of a 600×720×560 carcass

/** A 600×720×560 carcass → an L, then a plain door added to the leg-B compartment. */
function legBDoorModel(): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const L = setBlockFootprint(m, m.blocks[0]!.id, { legA: LEGA, legB: LEGB });
  return addInstance(L, "sec_legB", "door");
}
const facadePart = (m: StructuralModel) => solveStructure(m, tk).find((p) => p.role === "facade")!;
const facadePlace = (m: StructuralModel, id: string) => solveLayout(m, tk).find((p) => p.id === id)!;

describe("Phase 4.d-2a — leg-B door cut + placement (−X)", () => {
  it("the facade PART is cut to span the leg LENGTH (box.d), not the leg depth (box.w)", () => {
    const p = facadePart(legBDoorModel());
    expect(p.length_mm10).toBe(H); // door height (hinge axis) unchanged
    expect(p.width_mm10).toBe(LEGB.length_mm10); // 4000 — spans the return-leg run (Z), NOT legB.depth
  });

  it("the PLACEMENT is thin-in-X on the −X face, spanning legB.length in Z", () => {
    const m = legBDoorModel();
    const pl = facadePlace(m, facadePart(m).id);
    expect(pl.w_mm10).toBe(tk.facade); // thin in X (the door thickness)
    expect(pl.d_mm10).toBe(LEGB.length_mm10); // spans the leg length along Z
    expect(pl.h_mm10).toBe(H); // full height
    expect(pl.x_mm10).toBe(0); // the −X face (block.box.x + section.box.x = 0)
    expect(pl.rotY_deg).toBeUndefined(); // axes swapped, NOT a render-only rotation
  });

  it("hinge/handle drilling lands on face A within the door's OWN length×width (local-face, unchanged)", () => {
    const m = legBDoorModel();
    const p = solveModelToParts(m).find((q) => q.role === "facade")!;
    const drills = p.operations.filter((o) => o.op === "drill");
    expect(drills.length).toBeGreaterThan(0); // drilling still fires on the −X door
    for (const o of drills) {
      expect(o.face).toBe("A");
      expect(o.x_mm10).toBeGreaterThanOrEqual(0);
      expect(o.x_mm10).toBeLessThanOrEqual(H); // along the door's own length
      expect(o.y_mm10).toBeGreaterThanOrEqual(0);
      expect(o.y_mm10).toBeLessThanOrEqual(LEGB.length_mm10); // along the door's own width
    }
  });
});

describe("Phase 4.d-2a — a leg-A / rectangular door is byte-identical (default −Z)", () => {
  it("a door on a rectangular block cuts width = box.w and places thin-in-Z (the −X branch never fires)", () => {
    const m = buildCarcassModel(600, 720, 560);
    const withDoor = addInstance(m, m.blocks[0]!.zones[0]!.root.id, "door");
    const p = facadePart(withDoor);
    expect(p.width_mm10).toBe(6000); // box.w (default door width), NOT box.d
    const pl = facadePlace(withDoor, p.id);
    expect(pl.d_mm10).toBe(tk.facade); // thin in Z (the normal front)
    expect(pl.w_mm10).toBe(6000); // spans the width in X
  });
});
