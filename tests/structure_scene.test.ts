// Phase 2 — the pure structureScene adapter (apps/app/src/three/structureScene.ts).
// Verifies solveLayout() → centred, metre-scaled render boards.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { layoutToScene, boxesToScene } from "../apps/app/src/three/structureScene.js";

describe("Phase 2 — structureScene adapter", () => {
  const model = buildDemoModel();
  const panels = solveLayout(model);
  const scene = layoutToScene(panels);

  it("produces one board per placed panel", () => {
    expect(panels.length).toBeGreaterThan(0);
    expect(scene.boards.length).toBe(panels.length);
  });

  it("boards carry the placement ids 1:1 (for selection)", () => {
    const ids = new Set(scene.boards.map((b) => b.id));
    for (const p of panels) expect(ids.has(p.id)).toBe(true);
  });

  it("sizes are metres (mm10/10000), positive and small", () => {
    for (const b of scene.boards) {
      expect(b.size[0]).toBeGreaterThan(0);
      expect(b.size[1]).toBeGreaterThan(0);
      expect(b.size[2]).toBeGreaterThan(0);
      expect(Math.max(...b.size)).toBeLessThan(10); // a cabinet is metres, not thousands
    }
  });

  it("cabinet is centred on X/Z and stands on the floor (minY ≈ 0)", () => {
    expect(Math.abs(scene.center[0])).toBeLessThan(1e-9);
    expect(Math.abs(scene.center[2])).toBeLessThan(1e-9);
    const minBottom = Math.min(...scene.boards.map((b) => b.pos[1] - b.size[1] / 2));
    expect(Math.abs(minBottom)).toBeLessThan(1e-6);
  });

  it("empty input → empty scene, no crash", () => {
    expect(boxesToScene([]).boards.length).toBe(0);
  });
});
