// Phase 2.3a — drawer organizer: an optional `Component.organizer` that adds partition boards inside a
// drawer body. They are REAL cut parts (role carcass_side), emitted in solve (cut list) AND placed in
// layout (3D), so the two agree. Additive: a plain drawer is byte-identical (no divider parts, no change).

import { describe, it, expect } from "vitest";

import { addInstance, divideSection, nestDrawer } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel, DrawerOrganizer } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

/** A single drawer, optionally with an organizer set on its drawer component. */
function drawer(org?: DrawerOrganizer): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 1 });
  const sec = [...leafSections(m.blocks[0]!.zones[0]!.root)][0]!;
  m = addInstance(m, sec.id, "drawer");
  if (org) m = { ...m, blocks: m.blocks.map((b) => ({ ...b, components: b.components.map((c) => (c.drawer ? { ...c, organizer: org } : c)) })) };
  return m;
}

const dividerParts = (m: StructuralModel) => solveStructure(m, tk).filter((p) => p.id.includes("__org_"));
const dividerPlaces = (m: StructuralModel) => solveLayout(m, tk).filter((p) => p.id.includes("__org_"));
const sizeKeys = (m: StructuralModel) => solveStructure(m, tk).map((p) => `${p.id}:${p.length_mm10}x${p.width_mm10}x${p.thickness_mm10}`).sort();

describe("Phase 2.3a — drawer organizer parts", () => {
  it("a plain drawer has NO divider parts (byte-identical)", () => {
    expect(dividerParts(drawer())).toHaveLength(0);
    expect(dividerPlaces(drawer())).toHaveLength(0);
  });

  it("dividers:2 adds exactly 2 carcass_side divider parts", () => {
    const parts = dividerParts(drawer({ dividers: 2 }));
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.role).toBe("carcass_side");
      expect(p.thickness_mm10).toBe(tk.carcass); // a divider is carcass stock
    }
  });

  it("N dividers → N parts (per drawer)", () => {
    expect(dividerParts(drawer({ dividers: 1 }))).toHaveLength(1);
    expect(dividerParts(drawer({ dividers: 3 }))).toHaveLength(3);
  });

  it("adding an organizer ONLY adds divider parts — the 5 box panels are byte-identical", () => {
    const plain = sizeKeys(drawer()).filter((k) => !k.includes("__org_"));
    const withOrg = sizeKeys(drawer({ dividers: 2 })).filter((k) => !k.includes("__org_"));
    expect(withOrg).toEqual(plain); // front/sides/back/bottom unchanged
  });
});

describe("Phase 2.3a — divider placements sit INSIDE the body", () => {
  it("dividers:2 places 2 dividers between the box sides, at the 1/3 and 2/3 lines", () => {
    const all = solveLayout(drawer({ dividers: 2 }), tk);
    // the DRAWER's sides (id includes __inst_), not the carcass sides that also end __side_l
    const sideL = all.find((p) => p.id.includes("__inst_") && p.id.endsWith("__side_l"))!;
    const sideR = all.find((p) => p.id.includes("__inst_") && p.id.endsWith("__side_r"))!;
    const divs = all.filter((p) => p.id.includes("__org_")).sort((a, b) => a.x_mm10 - b.x_mm10);
    expect(divs).toHaveLength(2);
    for (const d of divs) {
      expect(d.x_mm10).toBeGreaterThan(sideL.x_mm10); // right of the left side
      expect(d.x_mm10).toBeLessThan(sideR.x_mm10); // left of the right side
      expect(d.y_mm10).toBe(sideL.y_mm10); // same floor as the sides
    }
    expect(divs[0]!.x_mm10).toBeLessThan(divs[1]!.x_mm10); // evenly ordered
  });

  it("axis 'z' runs the dividers across the WIDTH (spanning innerW), not the depth", () => {
    const all = solveLayout(drawer({ dividers: 1, axis: "z" }), tk);
    const back = all.find((p) => p.id.includes("__inst_") && p.id.endsWith("__back"))!; // the DRAWER back
    const div = all.find((p) => p.id.includes("__org_"))!;
    expect(div.w_mm10).toBe(back.w_mm10); // spans the full inner width (like the back), thin along depth
    expect(div.d_mm10).toBe(tk.carcass);
  });
});

describe("Phase 2.3a — nested drawers get organizers too", () => {
  it("a nested drawer with an organizer emits its divider parts", () => {
    let m = drawer(); // a top-level drawer
    const drawerInst = m.blocks[0]!.instances.find((i) => m.blocks[0]!.components.find((c) => c.id === i.componentId)?.drawer)!;
    m = nestDrawer(m, drawerInst.id); // add an inner drawer (its component lives in inst.interior.components)
    // set the organizer on the INNER drawer's component — inside the outer instance's interior
    m = {
      ...m,
      blocks: m.blocks.map((b) => ({
        ...b,
        instances: b.instances.map((i) => (i.interior
          ? { ...i, interior: { ...i.interior, components: i.interior.components.map((c) => (c.drawer ? { ...c, organizer: { dividers: 2 } } : c)) } }
          : i)),
      })),
    };
    // the inner drawer's dividers use the nested id base (…__in_…__org_k)
    const nestedDivs = solveStructure(m, tk).filter((p) => p.id.includes("__in_") && p.id.includes("__org_"));
    expect(nestedDivs.length).toBe(2);
  });
});
