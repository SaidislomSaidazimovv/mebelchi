// FreePart.rotY_deg — the gizmo «rotate» mode. The invariant that makes this safe: turning a board is a
// RENDER fact, not a manufacturing one. A board turned 30° is the SAME cut panel, so solveStructure must
// be byte-identical while solveLayout carries the angle through to the viewport (mirrors rotX_deg for a
// tilted shelf).
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addFreePart } from "../engine/structure/operations.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const board = (rotY_deg?: number): FreePart => ({
  id: "fp1", name: "Erkin", role: "panel", thicknessAxis: "y",
  box: { x: 500, y: 500, z: 500, w: 3000, h: 160, d: 2000 },
  ...(rotY_deg === undefined ? {} : { rotY_deg }),
});
const withBoard = (rotY_deg?: number): StructuralModel => {
  const m = buildDemoModel();
  return addFreePart(m, m.blocks[0]!.id, board(rotY_deg));
};
const freeId = (m: StructuralModel) => `${m.blocks[0]!.id}__free_fp1`;

describe("FreePart.rotY_deg — render-only rotation", () => {
  it("does NOT change the cut list (a turned board is the same panel)", () => {
    const flat = solveStructure(withBoard());
    const turned = solveStructure(withBoard(30));
    expect(turned).toEqual(flat); // identical parts, identical dimensions — nothing reaches the CNC
  });

  it("carries the angle onto the board's PLACEMENT for the viewport", () => {
    const id = freeId(withBoard());
    const flat = solveLayout(withBoard()).find((p) => p.id === id)!;
    const turned = solveLayout(withBoard(30)).find((p) => p.id === id)!;
    expect(flat.rotY_deg).toBeUndefined(); // an un-rotated board stays square-on (nothing regresses)
    expect(turned.rotY_deg).toBe(30);
    // position + size are untouched — the board spins about its own centre in the renderer
    expect([turned.x_mm10, turned.y_mm10, turned.z_mm10]).toEqual([flat.x_mm10, flat.y_mm10, flat.z_mm10]);
    expect([turned.w_mm10, turned.h_mm10, turned.d_mm10]).toEqual([flat.w_mm10, flat.h_mm10, flat.d_mm10]);
  });

  it("0° is treated as square-on (no stray rotation on the placement)", () => {
    const p = solveLayout(withBoard(0)).find((x) => x.id === freeId(withBoard()))!;
    expect(p.rotY_deg).toBeUndefined();
  });
});
