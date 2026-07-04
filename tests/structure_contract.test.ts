// S1-A — Structural model contract (Construction-mode overlay).
// Type-level smoke tests: a model is constructible from the public surface, the
// Block→Zone→Component→Part hierarchy wires up, the leaf is the existing `Part`,
// every coordinate is an mm10 integer (no floats), and the ✂ exceptions count
// reflects detached instances. No structural OPERATIONS here — those are S1-B.

import { describe, expect, it } from "vitest";

import {
  countExceptions,
  isDetached,
  leafSections,
  type Block,
  type Component,
  type Detail,
  type Instance,
  type Line,
  type Part,
  type Row,
  type Scope,
  type Section,
  type StructuralModel,
  type Zone,
} from "../engine/index.js";

import { fixture0 } from "./fixtures/fixture0.polka.js";

// The leaf of the hierarchy is exactly the manufacturing Part (Деталь).
const shelfPart: Part = fixture0.parts[0]!;

// --- Build a minimal but complete model ------------------------------------
// One block, one zone whose root section is split by one vertical line into two
// leaf sections; one shelf component placed twice (one linked, one detached ✂).

const line: Line = {
  id: "line_1",
  axis: "x",
  position_mm10: 3000,
  boundsPartIds: [shelfPart.id],
  groupId: "lg_verticals",
};

const leftLeaf: Section = {
  id: "sec_left",
  box: { x: 0, y: 0, z: 0, w: 3000, h: 7200, d: 5600 },
  dividers: [],
  children: [],
  instanceIds: ["inst_shelf_a"],
  purpose: "storage",
};

const rightLeaf: Section = {
  id: "sec_right",
  box: { x: 3000, y: 0, z: 0, w: 3000, h: 7200, d: 5600 },
  dividers: [],
  children: [],
  instanceIds: ["inst_shelf_b"],
  purpose: "hanging",
};

const rootSection: Section = {
  id: "sec_root",
  box: { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 },
  dividers: [line.id],
  children: [leftLeaf, rightLeaf],
  instanceIds: [],
  purpose: null,
};

const zone: Zone = {
  id: "zone_body",
  name: "Body",
  rule: "ratio",
  root: rootSection,
};

const shelfComponent: Component = {
  id: "cmp_shelf",
  name: "Shelf",
  partIds: [shelfPart.id],
  role: "internal_shelf",
};

const linkedInstance: Instance = {
  id: "inst_shelf_a",
  componentId: shelfComponent.id,
  sectionId: leftLeaf.id,
  anchor: { x: 0, y: 1800, z: 0 },
  link: "linked",
};

const detachedInstance: Instance = {
  id: "inst_shelf_b",
  componentId: shelfComponent.id,
  sectionId: rightLeaf.id,
  anchor: { x: 3000, y: 2400, z: 0 },
  link: "detached", // ✂ — an exception that overrides the shared definition
};

const baseRow: Row = { id: "row_base", kind: "base", sectionIds: [leftLeaf.id, rightLeaf.id] };
const upperRow: Row = { id: "row_upper", kind: "upper", sectionIds: [] };

const block: Block = {
  id: "blk_1",
  name: "Base cabinet",
  box: { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 },
  zones: [zone],
  components: [shelfComponent],
  instances: [linkedInstance, detachedInstance],
  lines: [line],
  rows: [baseRow, upperRow],
};

const model: StructuralModel = {
  id: "model_1",
  name: "Wall A",
  blocks: [block],
  parts: fixture0.parts, // shares the manufacturing Project's flat part list
};

// --- mm10 integrality (no floats anywhere in the structural model) ----------

function everyCoordIsInteger(m: StructuralModel): boolean {
  const ints: number[] = [];
  const pushBox = (b: { x: number; y: number; z: number; w: number; h: number; d: number }) =>
    ints.push(b.x, b.y, b.z, b.w, b.h, b.d);

  const walkSection = (s: Section): void => {
    pushBox(s.box);
    for (const c of s.children) walkSection(c);
  };

  for (const blk of m.blocks) {
    pushBox(blk.box);
    for (const l of blk.lines) ints.push(l.position_mm10);
    for (const inst of blk.instances) ints.push(inst.anchor.x, inst.anchor.y, inst.anchor.z);
    for (const z of blk.zones) walkSection(z.root);
  }
  return ints.every((n) => Number.isInteger(n));
}

describe("S1-A structural contract — hierarchy + invariants", () => {
  it("constructs Block→Zone→Component→Part from the public surface", () => {
    expect(model.blocks).toHaveLength(1);
    expect(block.zones[0]!.root.children).toHaveLength(2);
    // The leaf binds to the existing manufacturing Part by id.
    expect(shelfComponent.partIds).toContain(shelfPart.id);
    // Detail is the manufacturing Part (type-level identity, exercised at runtime).
    const asDetail: Detail = shelfPart;
    expect(asDetail.id).toBe(shelfPart.id);
  });

  it("wires instances to a real component and leaf section", () => {
    for (const inst of block.instances) {
      expect(block.components.some((c) => c.id === inst.componentId)).toBe(true);
      const leaves = block.zones.flatMap((z) => leafSections(z.root));
      expect(leaves.some((s) => s.id === inst.sectionId)).toBe(true);
    }
  });

  it("collects exactly the leaf sections (recursive)", () => {
    const leaves = leafSections(rootSection);
    expect(leaves.map((s) => s.id)).toEqual(["sec_left", "sec_right"]);
  });

  it("counts detached instances as ✂ exceptions", () => {
    expect(isDetached(linkedInstance)).toBe(false);
    expect(isDetached(detachedInstance)).toBe(true);
    expect(countExceptions(block)).toBe(1);
  });

  it("keeps every coordinate an mm10 integer (no floats)", () => {
    expect(everyCoordIsInteger(model)).toBe(true);
  });

  it("shares the manufacturing Project's part list as the leaf truth", () => {
    expect(model.parts).toBe(fixture0.parts);
  });

  it("exposes the Scope enum (UI scope selector ⇄ engine)", () => {
    const scopes: Scope[] = ["local", "line", "row", "global"];
    expect(scopes).toHaveLength(4);
  });
});
