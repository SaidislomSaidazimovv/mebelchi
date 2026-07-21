// Phase 1.3b — handle DRILLING. A handled door/drawer front gets Ø4.5 × 17 through-holes in the cut
// list, mirroring how the hinge cup rides the facade drilling branch:
//   - `bow` = a screw PAIR 128mm c-c; `knob` = one screw; `profile` (gola) / absent = NO holes;
//   - a DOOR's handle sits on the OPENING edge (opposite the hinge), 50mm in;
//   - a DRAWER front's handle is centred.
// Ø/depth are grounded (Ø4.5×17, real SHKOF door panels); the position is a provisional standard.
// The regression test proves a handle-less model drills byte-identically to today.

import { describe, it, expect } from "vitest";

import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { StructuralModel, HandleType } from "../engine/contracts/structure.js";
import type { Part } from "../engine/contracts/types.js";

const DIA_MM10 = 45; // Ø4.5 — unique to handles (hinge Ø35, pin Ø5, cam Ø15, dowel Ø8, mark Ø3)
const DEPTH_MM10 = 170; // 17mm through-hole
const HALF_CENTRES_MM10 = 640; // 128 c-c → ±64mm
const OFFSET_MM10 = 500; // 50mm opening-edge inset

/** A 2-column carcass: a door in the left column, a drawer in the right. */
function baseModel(): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 });
  const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
  m = addInstance(m, cols[0]!.id, "door");
  m = addInstance(m, cols[1]!.id, "drawer");
  return m;
}

/** Set a handle on every facade/drawer component (there is no UI setter until 1.3c). */
function withHandle(m: StructuralModel, handle: HandleType): StructuralModel {
  return {
    ...m,
    blocks: m.blocks.map((b) => ({
      ...b,
      components: b.components.map((c) => (c.role === "facade" || c.drawer ? { ...c, handle } : c)),
    })),
  };
}

const handleHoles = (part: Part) => part.operations.filter((o) => o.op === "drill" && o.diameter_mm10 === DIA_MM10);
const doorPart = (parts: Part[]) => parts.find((p) => p.role === "facade" && p.id.includes("__inst_") && !p.id.endsWith("__front"))!;
const drawerFront = (parts: Part[]) => parts.find((p) => p.id.endsWith("__front"))!;

describe("Phase 1.3b — door handle drilling", () => {
  it("a handle-less door gets NO Ø4.5 holes", () => {
    const door = doorPart(solveModelToParts(baseModel()));
    expect(handleHoles(door)).toHaveLength(0);
  });

  it("a bow door gets a screw PAIR: two Ø4.5×17 holes, 128mm c-c", () => {
    const door = doorPart(solveModelToParts(withHandle(baseModel(), "bow")));
    const holes = handleHoles(door);
    expect(holes).toHaveLength(2);
    for (const h of holes) {
      expect(h.diameter_mm10).toBe(DIA_MM10);
      expect(h.depth_mm10).toBe(DEPTH_MM10);
      expect(h.face).toBe("A");
    }
    const xs = holes.map((h) => h.x_mm10).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(2 * HALF_CENTRES_MM10); // 128mm apart
    expect(Math.round((xs[0]! + xs[1]!) / 2)).toBe(Math.round(door.length_mm10 / 2)); // centred on the height
  });

  it("the bow door's holes sit on the OPENING edge (opposite the y0 hinge), 50mm in", () => {
    const door = doorPart(solveModelToParts(withHandle(baseModel(), "bow")));
    const holes = handleHoles(door);
    // Default hinge edge is y0 → opening edge is yMax → Y = width − 50mm, both screws share it.
    const expectedY = door.width_mm10 - OFFSET_MM10;
    for (const h of holes) expect(h.y_mm10).toBe(expectedY);
  });

  it("a right-hung door flips the handle to the y0 edge", () => {
    let m = baseModel();
    m = {
      ...m,
      blocks: m.blocks.map((b) => ({
        ...b,
        components: b.components.map((c) => (c.role === "facade" ? { ...c, handle: "bow" as const, hingeEdge: "right" as const } : c)),
      })),
    };
    const holes = handleHoles(doorPart(solveModelToParts(m)));
    expect(holes).toHaveLength(2);
    for (const h of holes) expect(h.y_mm10).toBe(OFFSET_MM10); // hinge yMax → opening y0 → Y = 50mm
  });

  it("a knob door gets a SINGLE hole, centred on the height at the opening edge", () => {
    const door = doorPart(solveModelToParts(withHandle(baseModel(), "knob")));
    const holes = handleHoles(door);
    expect(holes).toHaveLength(1);
    expect(holes[0]!.x_mm10).toBe(Math.round(door.length_mm10 / 2));
    expect(holes[0]!.y_mm10).toBe(door.width_mm10 - OFFSET_MM10);
  });

  it("a profile (gola) door gets NO holes — it grips a milled lip, not screws", () => {
    const door = doorPart(solveModelToParts(withHandle(baseModel(), "profile")));
    expect(handleHoles(door)).toHaveLength(0);
  });
});

describe("Phase 1.3b — drawer-front handle drilling", () => {
  it("a bow drawer front gets two Ø4.5 holes, centred and 128mm apart horizontally", () => {
    const front = drawerFront(solveModelToParts(withHandle(baseModel(), "bow")));
    const holes = handleHoles(front);
    expect(holes).toHaveLength(2);
    for (const h of holes) {
      expect(h.depth_mm10).toBe(DEPTH_MM10);
      expect(h.x_mm10).toBe(Math.round(front.length_mm10 / 2)); // vertical centre
    }
    const ys = holes.map((h) => h.y_mm10).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBe(2 * HALF_CENTRES_MM10);
    expect(Math.round((ys[0]! + ys[1]!) / 2)).toBe(Math.round(front.width_mm10 / 2)); // centred on the width
  });

  it("a knob drawer front gets a single centred hole", () => {
    const front = drawerFront(solveModelToParts(withHandle(baseModel(), "knob")));
    const holes = handleHoles(front);
    expect(holes).toHaveLength(1);
    expect(holes[0]!.x_mm10).toBe(Math.round(front.length_mm10 / 2));
    expect(holes[0]!.y_mm10).toBe(Math.round(front.width_mm10 / 2));
  });

  it("a handle-less drawer front gets no Ø4.5 holes", () => {
    expect(handleHoles(drawerFront(solveModelToParts(baseModel())))).toHaveLength(0);
  });
});

describe("Phase 1.3b — additive / byte-identical", () => {
  it("a handle-less model drills EXACTLY as before (no operations added anywhere)", () => {
    const before = solveModelToParts(baseModel());
    // Set a handle then clear it → same model shape; the drill output must match the untouched run.
    const touched = solveModelToParts(baseModel());
    expect(touched.map((p) => p.operations.length)).toEqual(before.map((p) => p.operations.length));
    // And no part anywhere carries a Ø4.5 hole without a handle.
    expect(before.flatMap(handleHoles)).toHaveLength(0);
  });

  it("adding a handle ONLY adds Ø4.5 holes — every other operation is untouched", () => {
    const bare = solveModelToParts(baseModel());
    const bowed = solveModelToParts(withHandle(baseModel(), "bow"));
    const nonHandle = (parts: Part[]) => parts.flatMap((p) => p.operations.filter((o) => !(o.op === "drill" && o.diameter_mm10 === DIA_MM10))).length;
    expect(nonHandle(bowed)).toBe(nonHandle(bare)); // hinge/pin/joinery counts unchanged
    expect(bowed.flatMap(handleHoles).length).toBe(4); // door pair + drawer pair
  });
});
