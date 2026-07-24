// M10.10 — «⧉ N×»: repeat one free part along an axis. Moblo's pergola has twenty identical rafters;
// building that here meant twenty rounds of duplicate-and-drag. One action now makes the whole run, and
// one undo takes it away again. The copies are the SAME part in every respect but position — same size,
// material, note, tilt, lock — so the cut list simply gains N more of a panel it already knew.
import { describe, it, expect, beforeEach } from "vitest";

import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { arrayFreePart } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const s = () => useKarkas.getState();
const tk = planThickness(DEFAULT_PLAN);
const free = () => s().model.blocks[0]!.freeParts ?? [];
const panelCount = () => solveStructure(s().model, tk).length;
/** add one free board and select it — the state every «⧉ N×» starts from */
const seed = (): string => {
  s().addFreeBoard("board");
  const fp = free().at(-1)!;
  s().tapPart(`blk_main__free_${fp.id}`);
  return fp.id;
};

beforeEach(() => { s().setModel(buildCarcassModel(600, 720, 560)); });

describe("M10.10 — arrayFreePart (engine)", () => {
  const base = (): StructuralModel => {
    s().setModel(buildCarcassModel(600, 720, 560));
    s().addFreeBoard("board");
    return s().model;
  };

  it("adds exactly `count` copies, each one step further along", () => {
    const m = base();
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    const out = arrayFreePart(m, m.blocks[0]!.id, fp.id, { axis: "x", step_mm10: 3000, count: 3, idAt: (i) => `c${i}` });
    const list = out.blocks[0]!.freeParts!;
    expect(list).toHaveLength(4); // the original + 3
    expect(list.slice(1).map((f) => f.box.x)).toEqual([fp.box.x + 3000, fp.box.x + 6000, fp.box.x + 9000]);
  });

  it("leaves the original exactly where it was", () => {
    const m = base();
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    const was = { ...fp.box };
    const out = arrayFreePart(m, m.blocks[0]!.id, fp.id, { axis: "z", step_mm10: 1000, count: 5, idAt: (i) => `c${i}` });
    expect(out.blocks[0]!.freeParts![0]!.box).toEqual(was);
  });

  it("copies everything but the id and the one axis", () => {
    const m = base();
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    const out = arrayFreePart(m, m.blocks[0]!.id, fp.id, { axis: "y", step_mm10: 2000, count: 1, idAt: () => "c1" });
    const copy = out.blocks[0]!.freeParts!.at(-1)!;
    expect(copy).toEqual({ ...fp, id: "c1", box: { ...fp.box, y: fp.box.y + 2000 } });
  });

  it("a negative step marches the other way", () => {
    const m = base();
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    const out = arrayFreePart(m, m.blocks[0]!.id, fp.id, { axis: "x", step_mm10: -1500, count: 2, idAt: (i) => `c${i}` });
    expect(out.blocks[0]!.freeParts!.slice(1).map((f) => f.box.x)).toEqual([fp.box.x - 1500, fp.box.x - 3000]);
  });

  it("refuses a bad count, a zero step, an unknown part and a colliding id", () => {
    const m = base();
    const b = m.blocks[0]!.id;
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    expect(() => arrayFreePart(m, b, fp.id, { axis: "x", step_mm10: 100, count: 0, idAt: (i) => `c${i}` })).toThrow(/BAD_COUNT/);
    expect(() => arrayFreePart(m, b, fp.id, { axis: "x", step_mm10: 100, count: 201, idAt: (i) => `c${i}` })).toThrow(/BAD_COUNT/);
    expect(() => arrayFreePart(m, b, fp.id, { axis: "x", step_mm10: 1.5, count: 2, idAt: (i) => `c${i}` })).not.toThrow(); // a fractional step rounds
    expect(() => arrayFreePart(m, b, fp.id, { axis: "x", step_mm10: 0, count: 2, idAt: (i) => `c${i}` })).toThrow(/BAD_STEP/);
    expect(() => arrayFreePart(m, b, "nope", { axis: "x", step_mm10: 100, count: 2, idAt: (i) => `c${i}` })).toThrow(/NOT_FOUND/);
    expect(() => arrayFreePart(m, b, fp.id, { axis: "x", step_mm10: 100, count: 2, idAt: () => fp.id })).toThrow(/DUPLICATE_ID/);
  });

  it("does not touch the model it was given", () => {
    const m = base();
    const fp = m.blocks[0]!.freeParts!.at(-1)!;
    const before = JSON.stringify(m);
    arrayFreePart(m, m.blocks[0]!.id, fp.id, { axis: "x", step_mm10: 500, count: 4, idAt: (i) => `c${i}` });
    expect(JSON.stringify(m)).toBe(before);
  });
});

describe("M10.10 — arraySelected (store)", () => {
  it("makes the whole run, and ONE undo takes all of it back", () => {
    seed();
    expect(free()).toHaveLength(1);
    s().arraySelected("x", 200, 5);
    expect(free()).toHaveLength(6);
    s().undo();
    expect(free()).toHaveLength(1); // one action, one undo — not five
  });

  it("every copy reaches the cut list", () => {
    seed();
    const was = panelCount();
    s().arraySelected("x", 200, 3);
    expect(panelCount()).toBe(was + 3);
  });

  it("the copies get distinct ids", () => {
    seed();
    s().arraySelected("z", 150, 6);
    expect(new Set(free().map((f) => f.id)).size).toBe(free().length);
  });

  it("does nothing when no free part is selected", () => {
    seed();
    s().tapPart("blk_main__side_l"); // a carcass board is rule-driven — there is nothing to repeat
    s().arraySelected("x", 200, 4);
    expect(free()).toHaveLength(1);
  });

  it("a rejected run leaves the model untouched", () => {
    seed();
    const before = JSON.stringify(s().model);
    s().arraySelected("x", 200, 0); // count below the floor → the op throws, the store swallows it
    expect(JSON.stringify(s().model)).toBe(before);
  });
});
