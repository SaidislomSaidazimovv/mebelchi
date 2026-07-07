// A shelf bounded by a carcass side on one edge and a divider on the other must get its pins at the
// SAME world height on BOTH panels — else the shelf tilts. The divider part starts one carcass board
// above the block floor (it's inset), so its face-local pin "height" must be measured from that origin.
// The bug: shelfPinPlan passed the shelf's absolute height to the divider too, so its pins landed 16mm
// high. Also: the 2D drawing must not draw coincident marks twice (side_l + side_r project onto the
// same section spot). Verified end-to-end via blockHoles (world markers) + buildBlockDrawing.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";
import { blockHoles } from "../apps/app/src/three/blockHoles.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";

function model() {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 }); // one vertical divider
  const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
  m = addInstance(m, cols[0]!.id, "shelf"); // 2 shelves in the LEFT column (bounded by side_l + divider)
  m = addInstance(m, cols[0]!.id, "shelf");
  return m;
}

describe("divider shelf-pin height aligns with the side panel (no tilt)", () => {
  it("every Ø5 shelf pin sits at a real shelf height on BOTH the side and the divider", () => {
    const m = model();
    const parts = solveModelToParts(m);
    const places = solveLayout(m);
    // blockHoles reports world markers in mm; placements are mm10 → convert the shelf heights to mm.
    const shelfYs = places.filter((p) => p.id.includes("__inst_")).map((p) => p.y_mm10 / 10).sort((a, b) => a - b);
    expect(shelfYs.length).toBe(2);

    const pins = blockHoles(parts, places).filter((h) => h.normal === "x" && h.r < 5); // Ø5 shelf pins
    expect(pins.length).toBeGreaterThan(0);
    // Each pin's world height (y) must equal one of the shelf heights — the divider ones USED to be
    // +16mm off. Allow 0.1mm rounding slack.
    for (const p of pins) {
      const nearest = shelfYs.reduce((best, y) => (Math.abs(y - p.y) < Math.abs(best - p.y) ? y : best), shelfYs[0]!);
      expect(Math.abs(p.y - nearest), `pin at y=${p.y} should match a shelf height ${shelfYs}`).toBeLessThanOrEqual(0.1);
    }
    // Both bounding panels are represented: for each shelf height there are pins from side_l AND divider,
    // so a shelf height carries ≥2 front + 2 back setback pins (≥4 total before the drawing dedups them).
    for (const y of shelfYs) {
      expect(pins.filter((p) => Math.abs(p.y - y) <= 0.1).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("the section drawing collapses coincident holes (no doubled marks)", () => {
    const m = model();
    const d = buildBlockDrawing(solveLayout(m), solveModelToParts(m));
    const key = (h: { x: number; y: number; r: number }) => `${Math.round(h.x)}:${Math.round(h.y)}:${Math.round(h.r)}`;
    const keys = d.side.holes.map(key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate positions in KESIM A-A
  });
});
