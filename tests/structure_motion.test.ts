// E9 — sliding-accessory motion envelope (v3 Piece 1 step 6, "component with motion envelope"). A
// component with `motion` sweeps a clearance volume as it slides; checkMotionClearance raises a
// NON-BLOCKING ⚠ when that swept envelope is obstructed by another instance. Envelope model only —
// no drawer/rail hardware (out of scope).

import { describe, expect, it } from "vitest";

import { checkMotionClearance } from "../engine/structure/motion.js";
import { solveLayout } from "../engine/structure/layout.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

/** A block with a sliding accessory (travel T along Y at y=5000) and a fixed shelf at y=8000. */
function model(travel: number): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 20000, d: 5600 };
  return {
    id: "t",
    name: "motion",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1", "i2"], purpose: null } }],
        components: [
          { id: "cm", name: "Брючница", partIds: [], role: null, motion: { axis: "y", travel_mm10: travel } },
          { id: "cs", name: "Полка", partIds: [], role: "internal_shelf" },
        ],
        instances: [
          { id: "i1", componentId: "cm", sectionId: "sec", anchor: { x: 0, y: 5000, z: 0 }, link: "linked" },
          { id: "i2", componentId: "cs", sectionId: "sec", anchor: { x: 0, y: 8000, z: 0 }, link: "linked" },
        ],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

describe("E9 — motion envelope + clearance", () => {
  it("renders the sliding accessory in the layout", () => {
    expect(solveLayout(model(500)).some((p) => p.id === "blk__inst_i1")).toBe(true);
  });

  it("flags when the swept envelope reaches a fixed shelf", () => {
    const f = checkMotionClearance(model(5000)); // 500mm travel reaches the shelf at y=8000
    expect(f).toHaveLength(1);
    expect(f[0]!.instanceId).toBe("i1");
    expect(f[0]!.blockerId).toBe("blk__inst_i2");
  });

  it("does NOT flag when the travel clears everything", () => {
    expect(checkMotionClearance(model(500))).toHaveLength(0); // 50mm travel stays clear of y=8000
  });

  it("ignores a component with no motion", () => {
    // i2 (the shelf) has no motion → never a source of a finding
    expect(checkMotionClearance(model(500)).every((x) => x.instanceId !== "i2")).toBe(true);
  });
});
