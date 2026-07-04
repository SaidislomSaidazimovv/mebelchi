// E6 — hinge ↔ offset revalidation (#13). A facade pushed proud by a #40 junction beyond a standard
// hinge's reach raises a NON-BLOCKING ⚠ (v3:177 "revalidate against the offset"; :228 "must verify
// the revalidation fires"). Depends on E5 (the junction). Reach limit is a flagged S3-E7 placeholder.

import { describe, expect, it } from "vitest";

import { checkHingeFit, HINGE_MAX_PROUD_MM10 } from "../engine/structure/hingeFit.js";
import type { Junction3D, PanelRole, StructuralModel } from "../engine/contracts/structure.js";

function model(role: PanelRole | null, junction?: Junction3D): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "hinge",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Дверь", partIds: [], role }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked", ...(junction ? { junction } : {}) }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const j = (shadowGap: number): Junction3D => ({ oversail_x_mm10: 0, stepBack_y_mm10: 0, shadowGap_z_mm10: shadowGap });

describe("E6 — hinge revalidation (#13)", () => {
  it("flags a facade pushed proud past the hinge reach", () => {
    const f = checkHingeFit(model("facade", j(HINGE_MAX_PROUD_MM10 + 200)));
    expect(f).toHaveLength(1);
    expect(f[0]!.instanceId).toBe("i1");
    expect(f[0]!.proud_mm10).toBe(HINGE_MAX_PROUD_MM10 + 200);
    expect(f[0]!.limit_mm10).toBe(HINGE_MAX_PROUD_MM10);
  });

  it("does NOT flag a facade within reach", () => {
    expect(checkHingeFit(model("facade", j(HINGE_MAX_PROUD_MM10)))).toHaveLength(0); // at the limit
    expect(checkHingeFit(model("facade", j(100)))).toHaveLength(0);
  });

  it("does NOT flag a flush facade (no junction)", () => {
    expect(checkHingeFit(model("facade"))).toHaveLength(0);
  });

  it("ignores a non-facade even when offset (only doors have hinges)", () => {
    expect(checkHingeFit(model("internal_shelf", j(HINGE_MAX_PROUD_MM10 + 500)))).toHaveLength(0);
  });
});
