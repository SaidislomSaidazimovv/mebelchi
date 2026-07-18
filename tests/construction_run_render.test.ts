// E1.4 — a Run RENDERS and MANUFACTURES as one unit. solveLayout already positions every block by its
// box.x (`carcassPlace(block.id, "", block.box, …)`) and solveStructure concatenates all blocks' parts,
// so a multi-block run — built by groupBlocks + resolveRun, which keep each block's sections BLOCK-LOCAL
// with box-origin carrying the run position — lays out end-to-end and cuts every block's panels. This
// verifies that latent multi-block capability end-to-end (no engine change needed).
import { describe, it, expect } from "vitest";
import { groupBlocks, resolveRun } from "../engine/structure/operations.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveModelToParts } from "../engine/cnc.js";
import type { Block, Section, StructuralModel } from "../engine/contracts/structure.js";

const mkBlock = (id: string, w: number): Block => {
  const box = { x: 0, y: 0, z: 0, w, h: 7200, d: 5600 };
  const root: Section = { id: `${id}_root`, box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: "storage" };
  return { id, name: id, box, zones: [{ id: `${id}_z`, name: "Корпус", rule: "manual", root }], components: [], instances: [], lines: [], rows: [] };
};

const twoBlockRun = (wall: number): StructuralModel => {
  const model: StructuralModel = { id: "m", name: "m", blocks: [mkBlock("b1", 6000), mkBlock("b2", 6000)], parts: [] };
  return resolveRun(groupBlocks(model, ["b1", "b2"], { id: "run1" }), "run1", wall);
};

const placementX = (ps: { id: string; x_mm10: number }[], id: string) => ps.find((p) => p.id === id)!.x_mm10;

describe("E1.4 · a Run lays out end-to-end and manufactures every block", () => {
  it("solveLayout positions the two blocks side-by-side with no gap or overlap (3m wall → 1500+1500)", () => {
    const ps = solveLayout(twoBlockRun(30000)); // two flex members → 1500mm each
    expect(placementX(ps, "b1__side_l")).toBe(0); // block 1 starts at the run origin
    expect(placementX(ps, "b2__side_l")).toBe(15000); // block 2 starts exactly where block 1 ends
    // The run spans the whole 3000mm wall: block 2's right side reaches ~30000 (minus its own thickness).
    const b2r = placementX(ps, "b2__side_r");
    expect(b2r + 160).toBe(30000); // 15000 + 15000 − carcass(160) + 160 = 30000
    // Blocks don't overlap: every b1 panel's left edge < every b2 panel's left edge boundary (15000).
    expect(ps.filter((p) => p.id.startsWith("b1__")).every((p) => p.x_mm10 < 15000)).toBe(true);
    expect(ps.filter((p) => p.id.startsWith("b2__")).every((p) => p.x_mm10 >= 15000)).toBe(true);
  });

  it("solveModelToParts cuts BOTH blocks' panels (manufacturing concatenates the run)", () => {
    const parts = solveModelToParts(twoBlockRun(30000));
    expect(parts).toHaveLength(10); // two blank carcasses × 5 panels
    expect(parts.filter((p) => p.id.startsWith("b1__"))).toHaveLength(5);
    expect(parts.filter((p) => p.id.startsWith("b2__"))).toHaveLength(5);
  });

  it("re-fitting the run to a different wall re-lays both blocks (any length)", () => {
    const ps = solveLayout(twoBlockRun(48000)); // 4.8m wall → 2400+2400
    expect(placementX(ps, "b1__side_l")).toBe(0);
    expect(placementX(ps, "b2__side_l")).toBe(24000); // block 2 moves to the new midpoint
  });
});
