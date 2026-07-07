// Step 7c — the min-edge-margin safety rule (§8.2.3): a face hole closer than the margin to an edge is
// flagged by name; a comfortably-placed hole is not; edge drills are exempt.
import { describe, it, expect } from "vitest";
import { checkJointConstraints } from "../engine/structure/jointConstraints.js";
import type { Part } from "../engine/contracts/types.js";

const part = (ops: Part["operations"]): Part => ({
  id: "p", name: "Бок", width_mm10: 4000, length_mm10: 6000, thickness_mm10: 160, grain: "NONE", edges: [0, 0, 0, 0], operations: ops,
});
const drill = (id: string, x: number, y: number, face: "A" | "B" | "edge1" = "A") =>
  ({ op: "drill" as const, id, face, x_mm10: x, y_mm10: y, diameter_mm10: 50, depth_mm10: 110, source: "auto" as const });

describe("Step 7c — min-edge-margin joint constraint", () => {
  it("flags a hole closer than the margin to an edge, naming the rule", () => {
    const f = checkJointConstraints([part([drill("h1", 50, 2000)])], 100); // 5mm from the left edge, min 10mm
    expect(f.length).toBe(1);
    expect(f[0]!.rule).toBe("minEdgeMargin");
    expect(f[0]!.opId).toBe("h1");
  });

  it("passes a hole with comfortable clearance", () => {
    expect(checkJointConstraints([part([drill("h1", 500, 2000)])], 100)).toEqual([]);
  });

  it("checks all four edges (a hole near the far edge is caught too)", () => {
    expect(checkJointConstraints([part([drill("h1", 5990, 2000)])], 100)).toHaveLength(1); // 1mm from length end
  });

  it("exempts edge drills (dowels run along the edge)", () => {
    expect(checkJointConstraints([part([drill("d1", 10, 2000, "edge1")])], 100)).toEqual([]);
  });

  it("a zero/absent margin disables the check", () => {
    expect(checkJointConstraints([part([drill("h1", 1, 1)])], 0)).toEqual([]);
  });
});
