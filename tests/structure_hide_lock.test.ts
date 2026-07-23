// M7.4 — hide and lock. Both are VIEW state, and both have one dangerous failure mode each:
//   • a hidden part quietly dropping out of the cut list / price / CNC file — the usta hides a door to
//     see the shelves behind it, sends the job to the workshop, and the doors are never cut;
//   • a locked part moving anyway — the lock is a promise that a pinned worktop will not shift while
//     the legs beneath it are dragged.
// These tests exist for those two failures, not for the flags themselves.

import { describe, it, expect, beforeEach } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008, solveModelToParts } from "../engine/cnc.js";
import { setComponentView } from "../engine/structure/operations.js";
import { buildCarcassModel, buildDemoModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const ID = "blk_main__free_top";

function cabinet(flags: Partial<Pick<FreePart, "hidden" | "locked">> = {}): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const fp: FreePart = {
    id: "top", name: "Stoleshnitsa", role: "top", thicknessAxis: "y",
    box: { x: 0, y: 7200, z: 0, w: 6000, h: 300, d: 5600 },
    ...flags,
  };
  return { ...m, blocks: [{ ...b, freeParts: [fp] }] };
}

describe("M7.4 — a HIDDEN part disappears from the view and from nowhere else", () => {
  it("the placement is marked hidden, so the viewport can skip it", () => {
    expect(solveLayout(cabinet({ hidden: true }), tk).find((p) => p.id === ID)!.hidden).toBe(true);
    expect(solveLayout(cabinet(), tk).find((p) => p.id === ID)!.hidden).toBeUndefined();
  });

  it("it is STILL cut, still priced and still in the CNC file (the dangerous one)", () => {
    const hid = estimate(solveStructure(cabinet({ hidden: true }), tk), DEFAULT_PLAN);
    const shown = estimate(solveStructure(cabinet(), tk), DEFAULT_PLAN);
    expect(hid.parts.some((p) => p.id === ID)).toBe(true);
    expect(hid.count).toBe(shown.count);
    expect(hid.priceUzs).toBe(shown.priceUzs);
    expect(exportModelToSWJ008(cabinet({ hidden: true }))).toContain(ID);
  });

  it("its holes are drilled exactly as before — hiding is not a change of build", () => {
    const ops = (m: StructuralModel) => JSON.stringify(solveModelToParts(m).find((p) => p.id === ID)!.operations);
    expect(ops(cabinet({ hidden: true }))).toBe(ops(cabinet()));
  });

  it("a hidden COMPONENT hides every panel it draws, and no other", () => {
    const model = buildDemoModel();
    const compId = model.blocks[0]!.components[0]!.id;
    const hidden = setComponentView(model, compId, "hidden", true);
    const after = solveLayout(hidden, tk);
    expect(after.some((p) => p.hidden)).toBe(true);
    // the carcass itself is untouched
    expect(after.filter((p) => p.hidden).every((p) => p.id.includes("__inst_"))).toBe(true);
    // …and the cut list is the same length as before
    expect(solveStructure(hidden, tk).length).toBe(solveStructure(model, tk).length);
  });

  it("hidden=false removes the flag entirely (byte-identical to a part that never had one)", () => {
    const model = buildDemoModel();
    const compId = model.blocks[0]!.components[0]!.id;
    const back = setComponentView(setComponentView(model, compId, "hidden", true), compId, "hidden", false);
    expect("hidden" in back.blocks[0]!.components[0]!).toBe(false);
    expect(setComponentView(model, compId, "hidden", false)).toBe(model); // no-op → same object, no undo step
  });
});

describe("M7.4 — a LOCKED part refuses every edit", () => {
  const load = (m: StructuralModel) => { useKarkas.getState().setModel(m); };
  const box = () => useKarkas.getState().model.blocks[0]!.freeParts!.find((f) => f.id === "top")!.box;

  beforeEach(() => load(cabinet({ locked: true })));

  it("it cannot be moved", () => {
    const before = { ...box() };
    useKarkas.getState().moveFreePart("top", { x: 500, y: 0, z: 0 }, true);
    expect(box()).toEqual(before);
  });

  it("it cannot be dragged to a position (and the caller is told where it still is)", () => {
    const before = { ...box() };
    const r = useKarkas.getState().moveFreePartTo("top", "x", 9999, true);
    expect(box()).toEqual(before);
    expect(r.pos).toBe(before.x);
  });

  it("it cannot be resized", () => {
    const before = { ...box() };
    useKarkas.getState().resizeFreeBoard("top", "w", 1234);
    useKarkas.getState().resizeFreeBoardTo("top", "w", 1234, true);
    expect(box()).toEqual(before);
  });

  it("it cannot be rotated, reshaped or deleted", () => {
    const parts = () => useKarkas.getState().model.blocks[0]!.freeParts!;
    const before = JSON.stringify(parts());
    useKarkas.getState().rotateFreeBoard("top");
    useKarkas.getState().setFreeBoardShape("top", "cylinder");
    useKarkas.getState().removeFreeBoard("top");
    expect(JSON.stringify(parts())).toBe(before);
  });

  it("unlocked, the very same edits go through — the lock is the only thing stopping them", () => {
    load(cabinet());
    const before = { ...box() };
    useKarkas.getState().moveFreePart("top", { x: 500, y: 0, z: 0 }, true);
    expect(box().x).not.toBe(before.x);
    useKarkas.getState().removeFreeBoard("top");
    expect(useKarkas.getState().model.blocks[0]!.freeParts!.length).toBe(0);
  });
});
