// Phase E — editingBlockId link: re-opening a placed project block tags it so «＋ Loyihaga» updates
// (not duplicates); every other load (file / library / new / template) clears the link.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

const json = () => JSON.stringify({ version: 1, model: buildCarcassModel(600, 720, 500), plan: {} });

describe("Phase E — project-block edit link", () => {
  it("re-opening a project block sets editingBlockId", () => {
    useKarkas.getState().importProject(json(), "pb-123");
    expect(useKarkas.getState().editingBlockId).toBe("pb-123");
  });

  it("a plain load (file / library) clears the link", () => {
    useKarkas.getState().importProject(json(), "pb-9");
    useKarkas.getState().importProject(json()); // no id → not tied to a project block
    expect(useKarkas.getState().editingBlockId).toBeNull();
  });

  it("a new / template model clears the link (setModel + openWith)", () => {
    useKarkas.getState().importProject(json(), "pb-1");
    useKarkas.getState().setModel(buildCarcassModel(400, 400, 400));
    expect(useKarkas.getState().editingBlockId).toBeNull();

    useKarkas.getState().importProject(json(), "pb-2");
    useKarkas.getState().openWith(buildCarcassModel(500, 500, 500));
    expect(useKarkas.getState().editingBlockId).toBeNull();
  });
});
