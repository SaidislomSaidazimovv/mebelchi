// Phase 3 — karkasStore (StructuralModel editing state).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildLCornerModel, buildDemoModel } from "../engine/structure/demoModel.js";

describe("Phase 3 — karkasStore", () => {
  it("boots with a derived demo model (parts + scene populated, closed)", () => {
    const s = useKarkas.getState();
    expect(s.parts.length).toBeGreaterThan(0);
    expect(s.scene.boards.length).toBe(s.parts.length);
    expect(s.open).toBe(false);
    expect(s.selectedId).toBeNull();
  });

  it("openWith loads a model, derives it, and opens the editor", () => {
    useKarkas.getState().openWith(buildLCornerModel());
    const s = useKarkas.getState();
    expect(s.open).toBe(true);
    expect(s.parts.length).toBeGreaterThan(0);
    expect(s.scene.boards.length).toBe(s.parts.length);
  });

  it("tapPart sets/clears selection; close closes", () => {
    useKarkas.getState().tapPart("some-id");
    expect(useKarkas.getState().selectedId).toBe("some-id");
    useKarkas.getState().tapPart(null);
    expect(useKarkas.getState().selectedId).toBeNull();
    useKarkas.getState().close();
    expect(useKarkas.getState().open).toBe(false);
  });

  it("add('shelf') adds exactly one panel", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().add("shelf");
    expect(useKarkas.getState().parts.length).toBe(before + 1);
  });

  it("divide preserves the section's content (no orphaned shelves) and undo reverts", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().divide();
    // the split adds a divider and re-homes the section's shelves into a child leaf, so the
    // part count never DROPS (before the re-home fix, dividing a content section lost its shelves)
    expect(useKarkas.getState().parts.length).toBeGreaterThanOrEqual(before);
    expect(useKarkas.getState().canUndo()).toBe(true);
    useKarkas.getState().undo();
    expect(useKarkas.getState().parts.length).toBe(before); // exact revert
  });
});
