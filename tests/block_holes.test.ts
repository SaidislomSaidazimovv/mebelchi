// Drilling markers: blockHoles maps face-local (x,y) drill ops onto world positions via the
// thin-axis/extent rule. Verified against real solveModelToParts data — a side panel's Ø5 shelf pins
// drill along X (show in the section view); a door's Ø35 hinge cups drill along Z (show in front).
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { blockHoles } from "../apps/app/src/three/blockHoles.js";

function drilledDemo() {
  let m = buildDemoModel();
  const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  m = addInstance(m, leaf, "shelf");
  m = addInstance(m, leaf, "door");
  return { parts: solveModelToParts(m), places: solveLayout(m) };
}

describe("blockHoles", () => {
  it("side-panel shelf pins drill along X (normal x) with a small Ø5 radius", () => {
    const { parts, places } = drilledDemo();
    const holes = blockHoles(parts, places);
    const pins = holes.filter((h) => h.normal === "x" && h.r < 5); // Ø<10mm → pins
    expect(pins.length).toBeGreaterThan(0);
    // pin radius ≈ 2.5mm (Ø5), and it sits mid-thickness of the 16mm side (x ≈ 8mm from the panel origin)
    expect(pins[0]!.r).toBeCloseTo(2.5, 1);
  });

  it("door hinge cups drill along Z (normal z) with a large Ø35 radius", () => {
    const { parts, places } = drilledDemo();
    const holes = blockHoles(parts, places);
    const cups = holes.filter((h) => h.normal === "z" && h.r > 10); // Ø35 → r 17.5
    expect(cups.length).toBeGreaterThan(0);
    expect(cups[0]!.r).toBeCloseTo(17.5, 1);
  });

  it("every marker is within the block bounds (no stray holes)", () => {
    const { parts, places } = drilledDemo();
    const holes = blockHoles(parts, places);
    let maxX = 0, maxY = 0, maxZ = 0;
    for (const p of places) { maxX = Math.max(maxX, (p.x_mm10 + p.w_mm10) / 10); maxY = Math.max(maxY, (p.y_mm10 + p.h_mm10) / 10); maxZ = Math.max(maxZ, (p.z_mm10 + p.d_mm10) / 10); }
    for (const h of holes) {
      expect(h.x).toBeGreaterThanOrEqual(-1); expect(h.x).toBeLessThanOrEqual(maxX + 1);
      expect(h.y).toBeGreaterThanOrEqual(-1); expect(h.y).toBeLessThanOrEqual(maxY + 1);
      expect(h.z).toBeGreaterThanOrEqual(-1); expect(h.z).toBeLessThanOrEqual(maxZ + 1);
    }
  });

  it("no face holes → no markers (empty carcass with nothing drilled on faces)", () => {
    const holes = blockHoles([], solveLayout(buildDemoModel()));
    expect(holes).toEqual([]);
  });
});
