// Feature #2 — display shelf front lip / border (imos AS_O_Shelf_type · CP_O_1_Angle_Shelf). A lip
// turns a plain shelf into a display shelf: an upstand at the FRONT edge that (a) becomes its own
// cut part and (b) renders standing at the front, tilted WITH the shelf. Plain shelves are unchanged
// (the field is additive), and every drawn lip maps to a real part (so it colours, not bare WOOD).
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance, setComponentLip, setComponentAngle } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";

function withShelf() {
  let m = buildDemoModel();
  const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
  m = addInstance(m, leaf, "shelf");
  const inst = m.blocks[0]!.instances.find((i) => i.sectionId === leaf)!;
  return { m, instId: inst.id, compId: inst.componentId };
}

describe("display-shelf front lip (lip_mm10)", () => {
  it("a plain shelf emits NO lip part (unchanged from before)", () => {
    const { m, instId } = withShelf();
    const lip = solveStructure(m).find((p) => p.id.endsWith(`__inst_${instId}__lip`));
    expect(lip).toBeUndefined();
  });

  it("a lipped shelf emits an extra __lip cut part sized length × lip height", () => {
    const s = withShelf();
    const m = setComponentLip(s.m, s.compId, 300); // 30mm lip
    const shelf = solveStructure(m).find((p) => p.id.endsWith(`__inst_${s.instId}`))!;
    const lip = solveStructure(m).find((p) => p.id.endsWith(`__inst_${s.instId}__lip`))!;
    expect(lip).toBeTruthy();
    expect(lip.length_mm10).toBe(shelf.length_mm10); // same span as the shelf
    expect(lip.width_mm10).toBe(300); // the upstand height
  });

  it("the lip is drawn AND maps to a real part (colours, no bare WOOD)", () => {
    const s = withShelf();
    const m = setComponentLip(s.m, s.compId, 300);
    const partIds = new Set(solveStructure(m).map((p) => p.id));
    const lipPlace = solveLayout(m).find((p) => p.id.endsWith(`__inst_${s.instId}__lip`));
    expect(lipPlace).toBeTruthy();
    expect(partIds.has(lipPlace!.id)).toBe(true); // every drawn board maps to a part
    expect(lipPlace!.h_mm10).toBe(300); // stands up by the lip height
  });

  it("the lip stands WORLD-VERTICAL even when the shelf is tilted (a retention rail, not tilted)", () => {
    const s = withShelf();
    let m = setComponentLip(s.m, s.compId, 300);
    m = setComponentAngle(m, s.compId, 15);
    const shelf = solveLayout(m).find((p) => p.id.endsWith(`__inst_${s.instId}`) && !p.id.endsWith("__lip"))!;
    const lip = solveLayout(m).find((p) => p.id.endsWith(`__inst_${s.instId}__lip`))!;
    expect(shelf.rotX_deg).toBeGreaterThan(0); // the shelf DOES tilt
    expect(lip.rotX_deg).toBeUndefined(); // but the lip stays vertical → never swings out of the carcass
  });

  it("clamps 0..80mm and drops the field at 0", () => {
    const s = withShelf();
    const big = setComponentLip(s.m, s.compId, 5000); // over-range → 800 (80mm)
    expect(big.blocks[0]!.components.find((c) => c.id === s.compId)!.lip_mm10).toBe(800);
    const flat = setComponentLip(big, s.compId, 0); // → field removed
    expect(flat.blocks[0]!.components.find((c) => c.id === s.compId)!.lip_mm10).toBeUndefined();
  });

  it("no-op returns the SAME model reference when the lip is unchanged", () => {
    const s = withShelf();
    expect(setComponentLip(s.m, s.compId, 0)).toBe(s.m); // already no lip → identical ref
  });
});
