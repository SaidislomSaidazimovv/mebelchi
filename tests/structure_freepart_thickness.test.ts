// A free part's THICKNESS comes from its box, not from a stale declaration.
//
// `thicknessAxis` is fixed when the part is created, but the master then resizes it — and a board turned
// on its side kept the old axis. Building a bed from free parts produced a headboard listed as
// "900 × 25 × 1610 thick": no workshop can order 1610mm stock, and the sheet count and price follow the
// thickness. A board's thickness IS its smallest dimension; the declaration now only settles a tie.

import { describe, expect, it } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const envelope = { x: 0, y: 0, z: 0, w: 20000, h: 20000, d: 20000 };

function model(fp: FreePart): StructuralModel {
  return {
    id: "t",
    name: "thickness",
    blocks: [
      {
        id: "b", name: "B", box: envelope, bare: true,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...envelope }, dividers: [], children: [], instanceIds: [], purpose: null } }],
        components: [], instances: [], lines: [], rows: [],
        freeParts: [fp],
      },
    ],
    parts: [],
  };
}

const part = (fp: FreePart) => solveStructure(model(fp))[0]!;
const dims = (fp: FreePart) => { const p = part(fp); return [p.length_mm10, p.width_mm10, p.thickness_mm10]; };
const board = (box: FreePart["box"], thicknessAxis: FreePart["thicknessAxis"]): FreePart =>
  ({ id: "f", name: "Doska", role: "panel", thicknessAxis, box });

describe("free part thickness", () => {
  it("uses the declared axis when it really is the thinnest", () => {
    // a flat board: 1200 wide, 16 thick, 600 deep, declared thin on Y
    expect(dims(board({ x: 0, y: 0, z: 0, w: 12000, h: 160, d: 6000 }, "y"))).toEqual([12000, 6000, 160]);
  });

  it("ignores a STALE axis after the board is turned on its side", () => {
    // declared thin on X, but the box is now thin on Z — the headboard case
    const d = dims(board({ x: 0, y: 0, z: 0, w: 16100, h: 9000, d: 250 }, "x"));
    expect(d[2]).toBe(250); // thickness is the 25 mm, not the 1610 mm span
    expect(d.slice(0, 2).sort((a, b) => b - a)).toEqual([16100, 9000]);
  });

  it("never reports a thickness larger than the other two", () => {
    for (const axis of ["x", "y", "z"] as const) {
      for (const box of [
        { x: 0, y: 0, z: 0, w: 16100, h: 9000, d: 250 },
        { x: 0, y: 0, z: 0, w: 160, h: 18000, d: 6000 },
        { x: 0, y: 0, z: 0, w: 8000, h: 6000, d: 200 },
      ]) {
        const [L, W, T] = dims(board(box, axis));
        expect(T).toBeLessThanOrEqual(L);
        expect(T).toBeLessThanOrEqual(W);
      }
    }
  });

  it("keeps the three dimensions a permutation of the box — nothing invented, nothing lost", () => {
    const box = { x: 0, y: 0, z: 0, w: 16100, h: 9000, d: 250 };
    expect(dims(board(box, "x")).sort((a, b) => a - b)).toEqual([250, 9000, 16100]);
  });

  it("lets the declaration settle a tie — a square post is the same part either way", () => {
    const post = { x: 0, y: 0, z: 0, w: 500, h: 7100, d: 500 };
    expect(dims(board(post, "x"))).toEqual([7100, 500, 500]);
    expect(dims(board(post, "z"))).toEqual([500, 7100, 500]);
  });

  it("handles a cube without breaking", () => {
    const cube = { x: 0, y: 0, z: 0, w: 3000, h: 3000, d: 3000 };
    expect(dims(board(cube, "y"))).toEqual([3000, 3000, 3000]);
  });
});
