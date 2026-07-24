// M10.1 — the selection reads as a CYAN CAGE, not a repaint. Moblo outlines the selected board and
// leaves its decor alone; a master showing a client «this one is oak» must still see the oak. So the
// emissive tint drops to a whisper and the board's OWN edge outline turns cyan, stops depth-testing
// (it reads through the piece) and jumps the render order. Everything else stays exactly as it was.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { buildStructureGroup, applyRenderMode, highlightBoard } from "../apps/app/src/three/structureRenderer.js";

const CYAN = 0x22d3ee;
const EDGE = 0xc9bd9e;
const WIRE_EDGE = 0x334155;

const colorOf = (id: string): number => (id.length * 0x010203 + id.charCodeAt(0) * 7) & 0xffffff;
const build = (): any => buildStructureGroup(layoutToScene(solveLayout(buildDemoModel())), colorOf);
/** every board's edge outline is its first child */
const edgeOf = (mesh: any): any => mesh.children[0];
const idOf = (g: any, i = 0): string => g.children[i].userData.partId as string;

describe("M10.1 — the cyan selection cage", () => {
  it("cages the selected board and leaves every other one at rest", () => {
    const g = build();
    const target = idOf(g, 1);
    highlightBoard(g, target);
    for (const mesh of g.children) {
      const on = mesh.userData.partId === target;
      const em = edgeOf(mesh).material;
      expect(em.color.getHex()).toBe(on ? CYAN : EDGE);
      expect(em.depthTest).toBe(!on); // caged edges read THROUGH the piece
      expect(edgeOf(mesh).renderOrder).toBe(on ? 997 : 0);
    }
  });

  it("keeps the board's own decor visible — the tint is a whisper, not a repaint", () => {
    const g = build();
    const target = idOf(g, 1);
    const decor = g.children[1].material.color.getHex();
    highlightBoard(g, target);
    const mat = g.children[1].material;
    expect(mat.color.getHex()).toBe(decor); // the decor colour itself is untouched
    expect(mat.emissiveIntensity).toBeLessThanOrEqual(0.15); // …and barely tinted (was 0.5)
    expect(mat.emissiveIntensity).toBeGreaterThan(0); // still enough to read as picked
  });

  it("deselecting restores the resting edge exactly", () => {
    const g = build();
    highlightBoard(g, idOf(g, 1));
    highlightBoard(g, null);
    for (const mesh of g.children) {
      const em = edgeOf(mesh).material;
      expect(em.color.getHex()).toBe(EDGE);
      expect(em.depthTest).toBe(true);
      expect(edgeOf(mesh).renderOrder).toBe(0);
      expect(mesh.material.emissiveIntensity).toBe(0);
    }
  });

  it("a Visual Style switch under a live selection does not repaint the cage", () => {
    const g = build();
    const target = idOf(g, 1);
    highlightBoard(g, target);
    applyRenderMode(g, "wireframe"); // the style wants WIRE_EDGE on every outline…
    expect(edgeOf(g.children[1]).material.color.getHex()).toBe(CYAN); // …but the caged one keeps cyan
    expect(edgeOf(g.children[0]).material.color.getHex()).toBe(WIRE_EDGE); // the rest follow the style
  });

  it("dropping the cage hands the edge back to the CURRENT style, not the old one", () => {
    const g = build();
    const target = idOf(g, 1);
    highlightBoard(g, target);
    applyRenderMode(g, "wireframe");
    highlightBoard(g, null); // let go while wireframe is on
    expect(edgeOf(g.children[1]).material.color.getHex()).toBe(WIRE_EDGE);
  });

  it("re-asserting the same selection is idempotent", () => {
    const g = build();
    const target = idOf(g, 1);
    highlightBoard(g, target);
    highlightBoard(g, target);
    const em = edgeOf(g.children[1]).material;
    expect(em.color.getHex()).toBe(CYAN);
    expect(edgeOf(g.children[1]).renderOrder).toBe(997);
  });
});
