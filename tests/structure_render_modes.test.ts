// Feature #7 — Visual Styles (imos): realistic / wireframe / shaded. applyRenderMode mutates the
// shared box materials: wireframe hides the faces (opacity 0) leaving the edge outlines; shaded
// paints every board one uniform colour; realistic restores each board's decor colour. Exercises the
// real renderer (buildStructureGroup runs three in node), so a regression in the material logic fails.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { buildStructureGroup, applyRenderMode } from "../apps/app/src/three/structureRenderer.js";

// distinct decor per part id, so "realistic" must restore per-board colours (not a single uniform one)
const colorOf = (id: string): number => (id.length * 0x010203 + id.charCodeAt(0) * 7) & 0xffffff;

function boxMats(group: any): any[] {
  return group.children.map((c: any) => c.material);
}

describe("Visual Styles (applyRenderMode)", () => {
  const build = () => {
    let m = buildDemoModel();
    const scene = layoutToScene(solveLayout(m));
    return buildStructureGroup(scene, colorOf);
  };

  it("wireframe hides the faces (opacity 0, transparent) — only edges remain", () => {
    const g = build();
    applyRenderMode(g, "wireframe");
    for (const mat of boxMats(g)) {
      expect(mat.opacity).toBe(0);
      expect(mat.transparent).toBe(true);
    }
  });

  it("shaded paints every board ONE uniform colour, fully opaque", () => {
    const g = build();
    applyRenderMode(g, "shaded");
    const hexes = new Set(boxMats(g).map((mat) => mat.color.getHex()));
    expect(hexes.size).toBe(1); // uniform
    for (const mat of boxMats(g)) expect(mat.opacity).toBe(1);
  });

  it("realistic restores each board's own decor colour, fully opaque", () => {
    const g = build();
    applyRenderMode(g, "shaded"); // go away from decor…
    applyRenderMode(g, "realistic"); // …then back
    for (const child of g.children) {
      const mesh = child as any;
      expect(mesh.material.color.getHex()).toBe(mesh.userData.baseColor);
      expect(mesh.material.opacity).toBe(1);
      expect(mesh.material.transparent).toBe(false);
    }
    // decors differ per board → realistic is NOT uniform
    const hexes = new Set(boxMats(g).map((mat: any) => mat.color.getHex()));
    expect(hexes.size).toBeGreaterThan(1);
  });

  it("round-trips: wireframe → realistic leaves faces opaque again", () => {
    const g = build();
    applyRenderMode(g, "wireframe");
    applyRenderMode(g, "realistic");
    for (const mat of boxMats(g)) {
      expect(mat.opacity).toBe(1);
      expect(mat.transparent).toBe(false);
    }
  });
});
