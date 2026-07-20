// duplicateBlock / duplicateFreePart — the gizmo «duplicate» mode. The critical invariant is that the
// COPY shares no ids with the original: findSection / resolveInstance / nestDrawer all resolve by id
// across every block, so a shared id would send an edit aimed at the copy into the original cabinet.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { addInstance, nestDrawer, duplicateBlock, duplicateFreePart, addFreePart } from "../engine/structure/operations.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import type { FreePart, Instance, Section, StructuralModel } from "../engine/contracts/structure.js";

const firstLeaf = (m: StructuralModel) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

/** Every section id in a block (recursively). */
const sectionIds = (m: StructuralModel, bi: number): string[] => {
  const out: string[] = [];
  const walk = (s: Section) => { out.push(s.id); s.children.forEach(walk); };
  m.blocks[bi]!.zones.forEach((z) => walk(z.root));
  return out;
};
/** Every instance id in a block, including nested drawer interiors. */
const instanceIds = (m: StructuralModel, bi: number): string[] => {
  const out: string[] = [];
  const walk = (i: Instance) => { out.push(i.id); (i.interior?.instances ?? []).forEach(walk); };
  m.blocks[bi]!.instances.forEach(walk);
  return out;
};
const overlap = (a: string[], b: string[]) => a.filter((x) => b.includes(x));

/** A demo cabinet carrying a drawer with a NESTED drawer + a free board — the full id surface. */
const rich = (): StructuralModel => {
  const base = buildDemoModel();
  const withDrawer = addInstance(base, firstLeaf(base), "drawer");
  const topInst = withDrawer.blocks[0]!.instances.at(-1)!;
  const nested = nestDrawer(withDrawer, topInst.id);
  const fp: FreePart = { id: "fp1", name: "Erkin", role: "panel", thicknessAxis: "y", box: { x: 0, y: 0, z: 0, w: 3000, h: 160, d: 3000 } };
  return addFreePart(nested, nested.blocks[0]!.id, fp);
};

describe("duplicateBlock — a cabinet copy shares NO ids with the original", () => {
  const src = rich();
  const dup = duplicateBlock(src, src.blocks[0]!.id, "x1");

  it("adds a second block placed clear of the first", () => {
    expect(dup.blocks).toHaveLength(2);
    const a = dup.blocks[0]!.box, b = dup.blocks[1]!.box;
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w); // to the right, no overlap
    expect(dup.blocks[1]!.id).not.toBe(dup.blocks[0]!.id);
  });

  it("re-suffixes every section / instance / component / line / free-part id", () => {
    expect(overlap(sectionIds(dup, 0), sectionIds(dup, 1))).toEqual([]);
    expect(overlap(instanceIds(dup, 0), instanceIds(dup, 1))).toEqual([]);
    expect(overlap(dup.blocks[0]!.components.map((c) => c.id), dup.blocks[1]!.components.map((c) => c.id))).toEqual([]);
    expect(overlap(dup.blocks[0]!.lines.map((l) => l.id), dup.blocks[1]!.lines.map((l) => l.id))).toEqual([]);
    expect(overlap((dup.blocks[0]!.freeParts ?? []).map((f) => f.id), (dup.blocks[1]!.freeParts ?? []).map((f) => f.id))).toEqual([]);
  });

  it("keeps every instance pointing at ITS OWN block's section + component", () => {
    const secs = new Set(sectionIds(dup, 1));
    const comps = new Set(dup.blocks[1]!.components.map((c) => c.id));
    for (const i of dup.blocks[1]!.instances) {
      expect(secs.has(i.sectionId)).toBe(true);
      expect(comps.has(i.componentId)).toBe(true);
    }
  });

  it("the copy manufactures the same content, and ALL part ids stay unique", () => {
    const one = solveStructure(src).length;
    const two = solveStructure(dup);
    expect(two).toHaveLength(one * 2); // the copy cuts exactly what the original does
    expect(new Set(two.map((p) => p.id)).size).toBe(two.length); // no duplicate part ids anywhere
  });

  it("guards: unknown block throws", () => {
    expect(() => duplicateBlock(src, "ghost", "x2")).toThrow("DUP_BLOCK_NOT_FOUND");
  });
});

describe("duplicateFreePart — a board copy lands beside the original", () => {
  it("copies the board with a new id, offset clear along X", () => {
    const src = rich();
    const bId = src.blocks[0]!.id;
    const out = duplicateFreePart(src, bId, "fp1", "fp2");
    const fps = out.blocks[0]!.freeParts!;
    expect(fps).toHaveLength(2);
    const a = fps[0]!, b = fps[1]!;
    expect(b.id).toBe("fp2");
    expect(b.box.x).toBeGreaterThanOrEqual(a.box.x + a.box.w); // beside it, not overlapping
    expect([b.box.w, b.box.h, b.box.d]).toEqual([a.box.w, a.box.h, a.box.d]); // same size
  });

  it("guards: unknown board / duplicate id throw", () => {
    const src = rich();
    const bId = src.blocks[0]!.id;
    expect(() => duplicateFreePart(src, bId, "ghost", "fp9")).toThrow("DUP_FREEPART_NOT_FOUND");
    expect(() => duplicateFreePart(src, bId, "fp1", "fp1")).toThrow("DUP_FREEPART_DUPLICATE_ID");
  });
});
