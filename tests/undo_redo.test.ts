// Step 12 (#15) — redo closes the last undo/redo gap: undo pushes the current model onto a forward
// stack, redo pops it back, and a fresh edit clears the stack.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

const width = () => useKarkas.getState().model.blocks[0]!.box.w;

describe("Step 12 — undo / redo", () => {
  it("undo → redo round-trips an edit, and a new edit clears redo", () => {
    useKarkas.getState().openWith(buildCarcassModel(600, 720, 560));
    expect(useKarkas.getState().canRedo()).toBe(false);
    const w0 = width();

    useKarkas.getState().resize("w", 800); // an edit → width 8000 mm10
    const w1 = width();
    expect(w1).not.toBe(w0);

    useKarkas.getState().undo();
    expect(width()).toBe(w0);
    expect(useKarkas.getState().canRedo()).toBe(true);

    useKarkas.getState().redo();
    expect(width()).toBe(w1); // stepped forward
    expect(useKarkas.getState().canRedo()).toBe(false);

    useKarkas.getState().undo(); // back to w0, redo available
    useKarkas.getState().resize("w", 900); // a FRESH edit invalidates the redo branch
    expect(useKarkas.getState().canRedo()).toBe(false);
  });
});
