// Regression: a doubled (32mm) / partial-double / glazed-frame part is emitted by solveStructure as
// two boards (`X__a`/`X__b`) or a base+strip (`X`/`X__front`), while solveLayout draws ONE render
// box. partColorLookup must colour that single box from the split parts, else it falls back to bare
// WOOD — the "karkas ranglar ishlamayapti" report for 32mm shelves/doors + витрина frames, in both
// the editor and the placed room block.

import { describe, it, expect } from "vitest";
import { partColorLookup, partColor, hexToInt, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";

const GRAPHITE = hexToInt("#4a4d52");
const plan = { ...DEFAULT_PLAN, shelf: "ldsp_graphite", facade: "ldsp_graphite" };

describe("partColorLookup — doubled / split parts colour their single render board", () => {
  it("maps a doubled part's base id to the layer colour (outer __a wins)", () => {
    const parts = [
      { id: "X__a", role: "internal_shelf", materialId: "ldsp_graphite" },
      { id: "X__b", role: "internal_shelf", materialId: "ldsp_graphite" },
      { id: "Y", role: "carcass_side" },
    ];
    const f = partColorLookup(parts, DEFAULT_PLAN);
    expect(f("X")).toBe(GRAPHITE); // the single render board solveLayout draws
    expect(f("X__a")).toBe(GRAPHITE);
    expect(f("Y")).toBe(partColor(DEFAULT_PLAN, "carcass_side"));
    expect(f("nope")).toBeUndefined();
  });

  it("partial-double: base id keeps its own colour, __front strip does not clobber it", () => {
    const parts = [
      { id: "Z", role: "internal_shelf", materialId: "ldsp_graphite" },
      { id: "Z__front", role: "internal_shelf", materialId: "ldsp_graphite" },
    ];
    const f = partColorLookup(parts, DEFAULT_PLAN);
    expect(f("Z")).toBe(GRAPHITE);
  });

  it("every solveLayout board resolves a colour for a model with a 32mm doubled shelf", () => {
    // demo → divide a leaf so there's an empty section → drop a 32mm (doubled) shelf into it
    let m = buildDemoModel();
    const leafId = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = divideSection(m, leafId, { kind: "equal", axis: "x", count: 2 });
    const leaves = leafSections(m.blocks[0]!.zones[0]!.root);
    const emptyId = (leaves.find((s) => s.id !== leafId) ?? leaves[0]!).id;
    m = addInstance(m, emptyId, "shelf", { doubled: true });

    const parts = solveStructure(m);
    expect(parts.some((p) => p.id.endsWith("__a"))).toBe(true); // a doubled part really exists
    const colorOf = partColorLookup(parts, plan);
    const uncovered = solveLayout(m).filter((b) => colorOf(b.id) === undefined);
    expect(uncovered.map((b) => b.id)).toEqual([]);
  });
});
