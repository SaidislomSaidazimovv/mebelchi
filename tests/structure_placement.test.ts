// Placement (#1) — the add-target section: chosen via setTarget or by tapping a part.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

const S = () => useKarkas.getState();
const shelfInstSection = () => {
  const m = S().model;
  const inst = m.blocks[0]!.instances.find((i) => m.blocks[0]!.components.find((c) => c.id === i.componentId)?.role === "internal_shelf");
  return inst?.sectionId;
};

describe("placement — add-target section", () => {
  it("derive exposes the leaf sections", () => {
    S().setModel(buildCarcassModel(1000, 720, 500));
    expect(S().sections.length).toBe(1);
    S().divideBy("x", 2);
    expect(S().sections.length).toBe(2);
  });

  it("setTarget directs the next add to the chosen compartment", () => {
    S().setModel(buildCarcassModel(1000, 720, 500));
    S().divideBy("x", 2);
    const secs = S().sections;
    S().setTarget(secs[1]!.id);
    S().add("shelf");
    expect(shelfInstSection()).toBe(secs[1]!.id); // landed in the picked section, not the first
  });

  it("tapping a placed part re-targets its section", () => {
    S().setModel(buildCarcassModel(1000, 720, 500));
    S().divideBy("x", 2);
    const secs = S().sections;
    S().setTarget(secs[0]!.id);
    S().add("shelf"); // a shelf in section 0
    const shelf = S().parts.find((p) => p.role === "internal_shelf")!;
    S().tapPart(shelf.id);
    expect(S().targetId).toBe(secs[0]!.id); // tap set the target to the shelf's section
  });
});
