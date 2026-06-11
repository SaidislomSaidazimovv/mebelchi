// hingeCupPattern — NO ground truth yet: this cabinet has no doors, so there are no
// Ø35 holes in any factory file (15_PRIMITIVES_STEP2.md). The proof against real
// geometry is therefore a TODO pending a Bazis door export (golden fixture 4).
// We still prove the function's structure + that every number comes from the spec.

import { describe, expect, it } from "vitest";

import { hingeCupPattern } from "../../engine/primitives/hingeCupPattern.js";
import { loadHardwareSpec } from "../../engine/catalogs/hardwareSpec.js";
import type { Panel } from "../../engine/primitives/types.js";

const spec = loadHardwareSpec();
const hinge = spec.hinges.DUMMY_CUP_110!;

// Synthetic door (no factory door exists). 600mm wide x 716mm tall, 18mm — arbitrary
// dimensions used only to exercise structure, not fidelity.
const door: Panel = { id: "door_synthetic", width_mm10: 6000, length_mm10: 7160, thickness_mm10: 180 };
const positionsY = [1000, 3580, 6160];

describe("hingeCupPattern", () => {
  const ops = hingeCupPattern(door, "left", positionsY, hinge);

  it("emits one cup + N mounting holes per hinge, all on the interior face", () => {
    const perHinge = 1 + hinge.mountingHoles.count;
    expect(ops).toHaveLength(positionsY.length * perHinge);
    expect(ops.every((o) => o.face === "B")).toBe(true);
  });

  it("cup diameter/depth and screw diameter/depth come from the spec (no literals)", () => {
    const cups = ops.filter((o) => o.diameter_mm10 === hinge.cup.diameter * 10);
    const screws = ops.filter((o) => o.diameter_mm10 === hinge.mountingHoles.diameter * 10);
    expect(cups).toHaveLength(positionsY.length);
    expect(screws).toHaveLength(positionsY.length * hinge.mountingHoles.count);
    expect(cups[0]!.depth_mm10).toBe(hinge.cup.depth * 10);
    expect(screws[0]!.depth_mm10).toBe(hinge.mountingHoles.depth * 10);
  });

  it("cup centre is set in from the hinge edge by cupCenterFromDoorEdge", () => {
    const cup = ops.find((o) => o.diameter_mm10 === hinge.cup.diameter * 10)!;
    expect(cup.x_mm10).toBe(Math.round(hinge.cupCenterFromDoorEdge * 10)); // left edge
  });

  // No Ø35 factory data exists to diff against — get a door export first.
  it.todo("PROOF vs real door panel — pending Bazis door export (golden fixture 4)");
});
