// Edit seams for #39 / #40 — the write ops the Frame-body controls call. setBandTransition sets a
// component's corner band-transition (E4); setJunction sets/clears an instance's off-plane junction
// (E5). Both pure + no-op-on-unchanged, so the UI can call them freely.

import { describe, expect, it } from "vitest";

import { setBandTransition, setJunction, setLoadBearing, setEdgeBands } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import type { Junction3D, StructuralModel } from "../engine/contracts/structure.js";

function model(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "seams",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null } }],
        components: [{ id: "c", name: "Дверь", partIds: [], role: "facade" }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 0, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

const comp = (m: StructuralModel) => m.blocks[0]!.components[0]!;
const inst = (m: StructuralModel) => m.blocks[0]!.instances[0]!;
const J: Junction3D = { oversail_x_mm10: 200, stepBack_y_mm10: 100, shadowGap_z_mm10: 500 };

describe("edit seams — setBandTransition (#39)", () => {
  it("sets the component's corner band-transition", () => {
    expect(comp(setBandTransition(model(), "c", "mitre")).bandTransition).toBe("mitre");
    expect(comp(setBandTransition(model(), "c", "overlap")).bandTransition).toBe("overlap");
  });

  it("is a no-op when unchanged or the component is unknown", () => {
    const m = setBandTransition(model(), "c", "butt"); // absent === butt default
    expect(setBandTransition(m, "c", "butt")).toBe(m);
    const base = model();
    expect(setBandTransition(base, "nope", "mitre")).toBe(base);
  });
});

describe("edit seams — setJunction (#40)", () => {
  it("sets and clears an instance's junction", () => {
    const withJ = setJunction(model(), "i1", J);
    expect(inst(withJ).junction).toEqual(J);
    const cleared = setJunction(withJ, "i1", null);
    expect(inst(cleared).junction).toBeUndefined();
  });

  it("is a no-op when unchanged", () => {
    const withJ = setJunction(model(), "i1", J);
    expect(setJunction(withJ, "i1", J)).toBe(withJ);
    const flush = model();
    expect(setJunction(flush, "i1", null)).toBe(flush); // already flush
  });

  it("throws for an unknown instance", () => {
    expect(() => setJunction(model(), "nope", J)).toThrow();
  });
});

describe("edit seams — setLoadBearing (L5)", () => {
  it("declares and clears a component as load-bearing", () => {
    const on = setLoadBearing(model(), "c", true);
    expect(comp(on).loadBearing).toBe(true);
    expect(comp(setLoadBearing(on, "c", false)).loadBearing).toBe(false);
  });

  it("is a no-op when unchanged or the component is unknown", () => {
    const base = model(); // absent === not declared
    expect(setLoadBearing(base, "c", false)).toBe(base);
    expect(setLoadBearing(base, "nope", true)).toBe(base);
    const on = setLoadBearing(base, "c", true);
    expect(setLoadBearing(on, "c", true)).toBe(on);
  });
});

describe("edit seams — setEdgeBands (#39 kromka)", () => {
  it("sets and clears a component's per-edge band override", () => {
    const withE = setEdgeBands(model(), "c", [10, 0, 10, 0]);
    expect(comp(withE).edgeBands).toEqual([10, 0, 10, 0]);
    expect(comp(setEdgeBands(withE, "c", null)).edgeBands).toBeUndefined();
  });

  it("is a no-op when unchanged or the component is unknown", () => {
    const base = model();
    expect(setEdgeBands(base, "c", null)).toBe(base); // already absent
    expect(setEdgeBands(base, "nope", [10, 0, 0, 0])).toBe(base);
    const withE = setEdgeBands(base, "c", [10, 0, 0, 0]);
    expect(setEdgeBands(withE, "c", [10, 0, 0, 0])).toBe(withE);
  });

  it("the solver applies the override to the emitted facade part (in place of the default)", () => {
    const overridden = setEdgeBands(model(), "c", [10, 0, 10, 0]); // was all-banded (facade default)
    const part = solveStructure(overridden).find((p) => p.id === "blk__inst_i1");
    expect(part?.edges).toEqual([10, 0, 10, 0]);
  });
});
