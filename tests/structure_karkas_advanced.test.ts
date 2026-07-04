// Phase 6 — karkasStore advanced ops (32mm doubled build, glazed-grid vitrine, load-bearing
// toggle, engineering warnings).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";

describe("Phase 6 — karkasStore advanced", () => {
  it("add doubled shelf emits a 32mm two-layer build (+2 parts vs +1)", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().add("shelf", { doubled: true });
    expect(useKarkas.getState().parts.length).toBe(before + 2); // layer A + layer B
  });

  it("add glazed-grid door emits a vitrine (frame + muntins + panes)", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const before = useKarkas.getState().parts.length;
    useKarkas.getState().add("door", { glazedGrid: { lights: 3 } });
    // 4 doubled frame members (8) + 2 muntins + 3 glass panes → well over +3
    expect(useKarkas.getState().parts.length).toBeGreaterThan(before + 3);
  });

  it("derive exposes a warnings array (non-blocking engineering ⚠)", () => {
    useKarkas.getState().setModel(buildDemoModel());
    expect(Array.isArray(useKarkas.getState().warnings)).toBe(true);
  });

  it("toggleLoadBearing flips the selected component's declaration", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const shelf = useKarkas.getState().parts.find((p) => p.role === "internal_shelf")!;
    useKarkas.getState().tapPart(shelf.id);
    const comp = useKarkas.getState().selectedComponent()!;
    expect(comp.loadBearing).not.toBe(true);
    useKarkas.getState().toggleLoadBearing();
    const after = useKarkas.getState().model.blocks.flatMap((b) => b.components).find((c) => c.id === comp.id)!;
    expect(after.loadBearing).toBe(true);
  });
});
