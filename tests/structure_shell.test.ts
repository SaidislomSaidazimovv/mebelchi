// M2.1 — Block.shell mask on a rectangular carcass. Each `false` field drops that panel (open shelving /
// back-less / open-top), and solve + layout drop the SAME panels (the cut list and the 3D stay in sync).
// An absent (or all-true) shell is byte-identical to the pre-M2 5-panel carcass. The full CNC path
// (solveModelToParts = solve + features + drilling) must run with a shell without dangling on a gone panel.

import { describe, it, expect } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";
import { buildCarcassModel, buildLCornerModel } from "../engine/structure/demoModel.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { PanelShell, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
function withShell(shell: PanelShell): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  return { ...m, blocks: [{ ...m.blocks[0]!, shell }] };
}
const suffixes = (m: StructuralModel) => solveStructure(m, tk).map((p) => p.id.split("__").pop()!).sort();

describe("M2.1 — Block.shell mask (rectangular carcass)", () => {
  it("absent / empty shell → the full 5-panel carcass (byte-identical)", () => {
    expect(solveStructure(buildCarcassModel(600, 720, 560), tk).length).toBe(5);
    expect(suffixes(withShell({}))).toEqual(suffixes(buildCarcassModel(600, 720, 560)));
    expect(suffixes(withShell({}))).toEqual(["back", "bottom", "side_l", "side_r", "top"]);
  });

  it("back: false drops the back (4 parts, no __back)", () => {
    const parts = solveStructure(withShell({ back: false }), tk);
    expect(parts.length).toBe(4);
    expect(parts.some((p) => p.id.endsWith("__back"))).toBe(false);
  });

  it("each panel is individually droppable", () => {
    const cases: Array<[keyof PanelShell, string]> = [
      ["sideL", "__side_l"], ["sideR", "__side_r"], ["top", "__top"], ["bottom", "__bottom"], ["back", "__back"],
    ];
    for (const [key, id] of cases) {
      const parts = solveStructure(withShell({ [key]: false }), tk);
      expect(parts.length, key).toBe(4);
      expect(parts.some((p) => p.id.endsWith(id)), key).toBe(false);
    }
  });

  it("an open shelf (no back, no top) leaves 2 sides + bottom", () => {
    expect(suffixes(withShell({ back: false, top: false }))).toEqual(["bottom", "side_l", "side_r"]);
  });

  it("solve == layout: both drop the SAME panels", () => {
    const m = withShell({ back: false, sideL: false });
    const solveIds = solveStructure(m, tk).map((p) => p.id).sort();
    const layoutIds = solveLayout(m, tk).map((p) => p.id).sort();
    expect(solveIds).toEqual(layoutIds);
  });

  it("the full CNC path runs with a shell — dropped panels absent, nothing dangles", () => {
    // drilling ops are coordinate holes on a panel's OWN face (no cross-part references), so dropping a
    // panel can never leave a dangling reference — it just removes that panel and its own operations.
    const parts = solveModelToParts(withShell({ back: false, top: false }));
    expect(parts.some((p) => p.id.endsWith("__back"))).toBe(false);
    expect(parts.some((p) => p.id.endsWith("__top"))).toBe(false);
    expect(parts.length).toBeGreaterThan(0); // sides + bottom survive; drilling/joinery didn't throw
  });
});

function lWithShell(shell: PanelShell): StructuralModel {
  const m = buildLCornerModel();
  return { ...m, blocks: [{ ...m.blocks[0]!, shell }] };
}

describe("M2.2 — Block.shell on an L-corner (both legs)", () => {
  it("absent / empty shell → byte-identical L-corner", () => {
    const base = solveStructure(buildLCornerModel(), tk).map((p) => p.id).sort();
    expect(solveStructure(lWithShell({}), tk).map((p) => p.id).sort()).toEqual(base);
  });

  it("back: false drops BOTH legs' backs; other panels survive", () => {
    const parts = solveStructure(lWithShell({ back: false }), tk);
    expect(parts.some((p) => p.id === "blk_l__legA__back")).toBe(false);
    expect(parts.some((p) => p.id === "blk_l__legB__back")).toBe(false);
    expect(parts.some((p) => p.id === "blk_l__legA__side_l")).toBe(true); // a non-back panel is untouched
  });

  it("leg-B's structural corner side stays dropped even with sideR: true", () => {
    const parts = solveStructure(lWithShell({ sideR: true }), tk);
    expect(parts.some((p) => p.id === "blk_l__legB__side_r")).toBe(false); // never resurrected
    expect(parts.some((p) => p.id === "blk_l__legA__side_r")).toBe(true); // leg-A still keeps its right side
  });

  it("solve == layout on an L-corner with a shell (both drop the same panels)", () => {
    const m = lWithShell({ back: false, top: false });
    const solveIds = solveStructure(m, tk).map((p) => p.id).sort();
    const layoutIds = solveLayout(m, tk).map((p) => p.id).sort();
    expect(solveIds).toEqual(layoutIds);
  });
});
