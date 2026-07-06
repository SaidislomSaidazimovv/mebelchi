// #3+#4 — 2D orthographic drawing views (imos Drawing Views). buildBlockDrawing projects a solved
// layout to FRONT (X–Y), PLAN (X–Z) and SIDE/Section (Z–Y). The three views must share axes
// consistently (front & plan share width X; front & side share height Y; plan & side share depth),
// and a tilted shelf's incline must appear ONLY in the side view (that's the plane it lives in).
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addInstance, setComponentAngle, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts } from "../engine/cnc.js";
import { buildBlockDrawing } from "../apps/app/src/three/blockDrawing.js";

describe("buildBlockDrawing — orthographic projection", () => {
  it("the three views agree on shared axes and the overall size", () => {
    let m = buildDemoModel();
    const id = m.blocks[0]!.id;
    m = resizeBlockDepth(resizeBlockHeight(resizeBlockWidth(m, id, 8000), id, 9000), id, 5000);
    const d = buildBlockDrawing(solveLayout(m));
    // overall block = 800 × 900 × 500 mm
    expect(d.overall).toEqual({ w: 800, h: 900, d: 500 });
    // FRONT is X×Y, PLAN is X×depth, SIDE is depth×Y
    expect(d.front.w).toBeCloseTo(800, 1);
    expect(d.front.h).toBeCloseTo(900, 1);
    expect(d.plan.w).toBeCloseTo(800, 1); // shares width X with front
    expect(d.plan.h).toBeCloseTo(500, 1); // depth
    expect(d.side.w).toBeCloseTo(500, 1); // depth, shares with plan.h
    expect(d.side.h).toBeCloseTo(900, 1); // shares height Y with front
  });

  it("every panel appears in all three views", () => {
    const d = buildBlockDrawing(solveLayout(buildDemoModel()));
    const n = solveLayout(buildDemoModel()).length;
    expect(d.front.rects.length).toBe(n);
    expect(d.plan.rects.length).toBe(n);
    expect(d.side.rects.length).toBe(n);
  });

  it("a tilted shelf shows its incline ONLY in the side (section) view", () => {
    let m = buildDemoModel();
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "shelf");
    const inst = m.blocks[0]!.instances.find((i) => i.sectionId === leaf)!;
    m = setComponentAngle(m, inst.componentId, 20);
    const d = buildBlockDrawing(solveLayout(m));
    const key = `__inst_${inst.id}`;
    const sideRect = d.side.rects.find((r) => r.id.endsWith(key))!;
    const frontRect = d.front.rects.find((r) => r.id.endsWith(key))!;
    const planRect = d.plan.rects.find((r) => r.id.endsWith(key))!;
    expect(sideRect.rotDeg).toBeGreaterThan(0); // incline visible in the section
    expect(frontRect.rotDeg).toBeUndefined(); // not in front
    expect(planRect.rotDeg).toBeUndefined(); // not in plan
  });

  it("classifies carcass panels (for line weight / hatch)", () => {
    const d = buildBlockDrawing(solveLayout(buildDemoModel()));
    expect(d.front.rects.some((r) => r.kind === "carcass")).toBe(true);
  });

  it("empty model → empty views (no throw)", () => {
    const d = buildBlockDrawing([]);
    expect(d.overall).toEqual({ w: 0, h: 0, d: 0 });
    expect(d.front.rects.length).toBe(0);
  });

  it("drill holes land in the right view: shelf pins in the section, hinge cups in front", () => {
    let m = buildDemoModel();
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "shelf");
    m = addInstance(m, leaf, "door");
    const d = buildBlockDrawing(solveLayout(m), solveModelToParts(m));
    // side-panel Ø5 pins → section (side) view; door Ø35 cups → front view
    expect(d.side.holes.length).toBeGreaterThan(0);
    expect(d.side.holes.some((h) => h.r < 5)).toBe(true); // small pins
    expect(d.front.holes.some((h) => h.r > 10)).toBe(true); // big hinge cups
    // no holes without the drilled parts (backward-compatible default)
    expect(buildBlockDrawing(solveLayout(m)).side.holes.length).toBe(0);
  });
});
