// A3 — the 3D render must use the SAME per-role board thickness the cut list does. `solveLayout`
// used to hardcode 16mm everywhere, so a thin ХДФ back (3mm), an 18mm МДФ facade, or a 32mm doubled
// shelf/door rendered at 16mm — disagreeing with `solveStructure`. Now `solveLayout(model, spec)`
// resolves the same ThicknessSpec and each placement's thin axis matches its cut-list part thickness.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure, type ThicknessSpec } from "../engine/structure/solve.js";
import { solveLayout, type PanelPlacement } from "../engine/structure/layout.js";

// Deliberately all-distinct, non-default thicknesses so a wrong axis can't accidentally match.
const SPEC: ThicknessSpec = { carcass: 180, back: 30, shelf: 170, facade: 190, divider: 200 };

// The board thickness of a placement = its smallest dimension (thickness << length/width for a panel).
const thinOf = (p: PanelPlacement) => Math.min(p.w_mm10, p.h_mm10, p.d_mm10);

function modelWithEverything() {
  let m = buildCarcassModel(900, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 }); // a vertical divider
  const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
  m = addInstance(m, cols[0]!.id, "shelf"); // shelf in the left column
  m = addInstance(m, cols[0]!.id, "door"); // door on the left column
  m = addInstance(m, cols[1]!.id, "drawer"); // drawer in the right column
  return m;
}

describe("render thickness mirrors the cut list (A3)", () => {
  it("every placed board's thin axis equals its cut-list part thickness under a non-default spec", () => {
    const m = modelWithEverything();
    const parts = solveStructure(m, SPEC);
    const places = solveLayout(m, SPEC);
    const byId = new Map(places.map((p) => [p.id, p]));

    let checked = 0;
    for (const part of parts) {
      if (part.role === "glass") continue; // panes are 3mm glass, handled separately
      const place = byId.get(part.id);
      if (!place) continue; // parts without a 1:1 render box (none here) are asserted elsewhere
      expect.soft(thinOf(place), `${part.id} (role ${part.role})`).toBe(part.thickness_mm10);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(8); // carcass(5) + divider + shelf + door + drawer(5) all matched
  });

  it("the carcass back renders at the thin back thickness, not the carcass board", () => {
    const m = buildCarcassModel(600, 720, 560);
    const back = solveLayout(m, SPEC).find((p) => p.id.endsWith("__back"))!;
    expect(thinOf(back)).toBe(SPEC.back); // 30 (3mm ХДФ), not 180
    expect(back.d_mm10).toBe(SPEC.back); // the thin axis is depth (Z) for a run-along-X carcass
  });

  it("a doubled shelf renders as ONE box at 2× the board (32mm), matching the glued build", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = m.blocks[0]!.zones[0]!.root.id;
    m = addInstance(m, leaf, "shelf", { doubled: true });
    const shelf = solveLayout(m, SPEC).find((p) => p.id.includes("__inst_"))!;
    expect(thinOf(shelf)).toBe(2 * SPEC.shelf!); // 340 = two 170 boards glued
  });

  it("defaults are unchanged — no spec renders everything at 16mm (backward compatible)", () => {
    const m = buildCarcassModel(600, 720, 560);
    const back = solveLayout(m).find((p) => p.id.endsWith("__back"))!;
    const side = solveLayout(m).find((p) => p.id.endsWith("__side_l"))!;
    expect(thinOf(back)).toBe(160);
    expect(thinOf(side)).toBe(160);
  });
});
