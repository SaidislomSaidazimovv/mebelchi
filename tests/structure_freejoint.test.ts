// M5 — free-part joinery. A free assembly (a table's legs + top, a bench, a bed frame) used to come out
// of the machine with no way to put it together: the carcass had cam+dowel, the free parts had nothing.
// Two free parts that MEET face-to-face now get two Ø8 dowels — the joint an Uzbek workshop actually uses
// (no cam, founder's call). The part whose LENGTH runs into the joint butts with its END; the other takes
// them on the face it presents. A ROUND leg takes its dowels too, while still taking no panel drilling.

import { describe, it, expect } from "vitest";

import { solveModelToParts } from "../engine/cnc.js";
import { buildTable, buildCarcassModel } from "../engine/structure/demoModel.js";
import type { FreePart, PrimitiveShape, StructuralModel } from "../engine/contracts/structure.js";

const ops = (m: StructuralModel, idEnd: string) =>
  solveModelToParts(m).find((p) => p.id.endsWith(idEnd))!.operations.filter((o) => o.op === "drill" && o.id.startsWith("fdowel_"));

/** A bare block holding exactly two free parts, so a single joint can be pinned down. */
function pair(a: Partial<FreePart> & { box: FreePart["box"] }, b: Partial<FreePart> & { box: FreePart["box"] }): StructuralModel {
  const env = { x: 0, y: 0, z: 0, w: 20000, h: 20000, d: 20000 };
  const mk = (id: string, o: Partial<FreePart> & { box: FreePart["box"] }): FreePart =>
    ({ id, name: id, role: "panel", thicknessAxis: "y", ...o } as FreePart);
  return {
    id: "t", name: "joint",
    blocks: [{
      id: "b", name: "B", box: env, bare: true,
      zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...env }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [], freeParts: [mk("a", a), mk("b", b)],
    }],
    parts: [],
  };
}

describe("M5 — a table now comes out with joinery", () => {
  it("every leg is dowelled into the top (2 dowels each end, 8 on the top)", () => {
    const m = buildTable(1200, 750, 700);
    // each leg butts its END into the top's face → 2 dowels in the leg's end edge
    for (const leg of ["__free_leg_fl", "__free_leg_fr", "__free_leg_bl", "__free_leg_br"]) {
      const o = ops(m, leg);
      expect(o.length, leg).toBe(2);
      expect(o.every((x) => x.face === "edge3" || x.face === "edge4"), leg).toBe(true);
    }
    // the top receives all four joints on its face
    const top = ops(m, "__free_top");
    expect(top.length).toBe(8);
    expect(top.every((x) => x.face === "A")).toBe(true);
  });

  it("a dowel lands INSIDE the part it is drilled into (never off the board)", () => {
    const m = buildTable(1200, 750, 700);
    const part = solveModelToParts(m).find((p) => p.id.endsWith("__free_top"))!;
    for (const o of ops(m, "__free_top")) {
      expect(o.x_mm10).toBeGreaterThanOrEqual(0);
      expect(o.x_mm10).toBeLessThanOrEqual(part.length_mm10);
      expect(o.y_mm10).toBeGreaterThanOrEqual(0);
      expect(o.y_mm10).toBeLessThanOrEqual(part.width_mm10);
    }
  });
});

describe("M5 — only a REAL joint gets dowels", () => {
  it("two parts that do not touch get none", () => {
    const m = pair(
      { box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 }, thicknessAxis: "x" },
      { box: { x: 4000, y: 0, z: 0, w: 6000, h: 300, d: 3000 } }, // far away
    );
    expect(ops(m, "__free_a")).toEqual([]);
    expect(ops(m, "__free_b")).toEqual([]);
  });

  it("a corner graze (overlap under 15 mm) gets none", () => {
    const m = pair(
      { box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 }, thicknessAxis: "x" },
      { box: { x: 500, y: 0, z: 400, w: 6000, h: 300, d: 3000 } }, // touches on x, but overlaps only 100 in z
    );
    expect(ops(m, "__free_a")).toEqual([]);
  });

  it("two faces stacked (no end butting in) get none — ambiguous", () => {
    const m = pair(
      { box: { x: 0, y: 0, z: 0, w: 6000, h: 300, d: 3000 } },
      { box: { x: 0, y: 300, z: 0, w: 6000, h: 300, d: 3000 } }, // a board lying on a board
    );
    expect(ops(m, "__free_a")).toEqual([]);
  });
});

describe("M5 — a ROUND leg is dowelled too, but still takes no panel drilling", () => {
  const roundLegAndApron = (shape?: PrimitiveShape) => pair(
    { box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 }, thicknessAxis: "x", role: "leg", ...(shape ? { shape } : {}) },
    { box: { x: 500, y: 5000, z: 0, w: 6000, h: 800, d: 200 }, thicknessAxis: "z", role: "rail" },
  );

  it("a cylinder leg meeting an apron gets its dowels (the M4 gate lets joinery through)", () => {
    const o = ops(roundLegAndApron("cylinder"), "__free_a");
    expect(o.length).toBe(2);
    expect(ops(roundLegAndApron("cylinder"), "__free_b").length).toBe(2); // the apron's end too
  });

  it("the same joint on a square leg is identical in count (shape changes nothing here)", () => {
    expect(ops(roundLegAndApron(), "__free_a").length).toBe(2);
  });

  it("a FREESTANDING cylinder still gets nothing at all (M4 invariant holds)", () => {
    const m = pair(
      { box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 }, thicknessAxis: "x", shape: "cylinder" },
      { box: { x: 9000, y: 0, z: 9000, w: 500, h: 7000, d: 500 }, thicknessAxis: "x" },
    );
    const p = solveModelToParts(m).find((x) => x.id.endsWith("__free_a"))!;
    expect(p.operations).toEqual([]);
  });
});

describe("M5 — byte-identical where there is no free assembly", () => {
  it("a plain carcass is untouched (no free parts → no free joinery)", () => {
    const parts = solveModelToParts(buildCarcassModel(600, 720, 560));
    expect(parts.every((p) => p.operations.every((o) => !o.id.startsWith("fdowel_")))).toBe(true);
  });
});
