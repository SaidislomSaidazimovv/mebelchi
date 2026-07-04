// Phase C2 — live block resize incl. the new height axis. Risk #3 check: content survives a resize
// (the subtree scales proportionally, so shelves/doors are preserved, not orphaned).
import { describe, it, expect } from "vitest";
import { resizeBlockWidth, resizeBlockHeight, resizeBlockDepth, addInstance } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase C2 — block resize (height + content safety)", () => {
  it("height resize preserves content (shelves survive) and sets the box", () => {
    let m = buildCarcassModel(600, 720, 560);
    m = addInstance(m, firstLeaf(m), "shelf");
    m = addInstance(m, firstLeaf(m), "shelf"); // 2 shelves
    const before = solveStructure(m).length;
    const m2 = resizeBlockHeight(m, m.blocks[0]!.id, 20000); // 720 → 2000 mm
    expect(m2.blocks[0]!.box.h).toBe(20000);
    expect(solveStructure(m2).length).toBe(before); // no orphaning
  });

  it("width resize grows the carcass top and keeps part count", () => {
    const m = buildCarcassModel(600, 720, 560);
    const topBefore = solveStructure(m).find((p) => p.role === "carcass_top")!;
    const m2 = resizeBlockWidth(m, m.blocks[0]!.id, 12000); // → 1200 mm
    expect(m2.blocks[0]!.box.w).toBe(12000);
    const topAfter = solveStructure(m2).find((p) => p.role === "carcass_top")!;
    expect(topAfter.length_mm10).toBeGreaterThan(topBefore.length_mm10);
    expect(solveStructure(m2).length).toBe(solveStructure(m).length);
  });

  it("depth resize sets the box", () => {
    const m = buildCarcassModel(600, 720, 560);
    const m2 = resizeBlockDepth(m, m.blocks[0]!.id, 4000); // → 400 mm
    expect(m2.blocks[0]!.box.d).toBe(4000);
  });

  it("resizing to the same extent is a no-op (same reference)", () => {
    const m = buildCarcassModel(600, 720, 560);
    expect(resizeBlockHeight(m, m.blocks[0]!.id, 7200)).toBe(m);
    expect(resizeBlockWidth(m, m.blocks[0]!.id, 6000)).toBe(m);
  });
});
