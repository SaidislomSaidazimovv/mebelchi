// M9U.6 — the PROJECT-level note (Moblo «Notes»): the condition that governs the whole order rather than
// one panel. It rides on the model, so a save/open round-trip keeps it for free, and it prints above the
// per-part notes on the drawing. Inert by design: nothing is solved, cut, drilled or priced from it.
import { describe, it, expect, beforeEach } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";

const s = () => useKarkas.getState();

beforeEach(() => { s().setModel(buildDemoModel()); });

describe("M9U.6 — the project note", () => {
  it("is stored on the model, trimmed, in ONE undo step", () => {
    const before = s().past.length;
    s().setProjectNotes("  Yetkazib berish 3-qavatga  ");
    expect(s().model.notes).toBe("Yetkazib berish 3-qavatga");
    expect(s().past.length).toBe(before + 1);
  });

  it("empty text DROPS the field — a note-less project serialises exactly as before", () => {
    s().setProjectNotes("bir narsa");
    expect("notes" in s().model).toBe(true);
    s().setProjectNotes("   ");
    expect("notes" in s().model).toBe(false);
    expect(s().model.notes).toBeUndefined();
  });

  it("re-setting the same text is a no-op (no dead undo step)", () => {
    s().setProjectNotes("bir xil");
    const base = s().past.length;
    s().setProjectNotes("bir xil");
    s().setProjectNotes("  bir xil  "); // trims to the same text
    expect(s().past.length).toBe(base);
  });

  it("changes NOTHING that is cut, drilled or exported", () => {
    const cuts = JSON.stringify(solveStructure(s().model));
    const cnc = exportModelToSWJ008(s().model);
    s().setProjectNotes("Mijoz: eshiklar chapga ochilsin");
    expect(JSON.stringify(solveStructure(s().model))).toBe(cuts);
    expect(exportModelToSWJ008(s().model)).toBe(cnc);
  });

  it("survives a save → open round-trip (it rides on the model)", () => {
    s().setProjectNotes("Montaj: 2-kun ertalab");
    const json = s().exportProject();
    s().setModel(buildDemoModel()); // clobber with a fresh project
    expect(s().model.notes).toBeUndefined();
    s().importProject(json);
    expect(s().model.notes).toBe("Montaj: 2-kun ertalab");
  });

  it("undo puts the note back the way it was", () => {
    s().setProjectNotes("birinchi");
    s().setProjectNotes("ikkinchi");
    expect(s().model.notes).toBe("ikkinchi");
    s().undo();
    expect(s().model.notes).toBe("birinchi");
  });
});
