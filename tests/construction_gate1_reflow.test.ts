// Step 1.4 — GATE 1 (HANDOVER_04 Step 1): "changing MaterialVar B's thickness 16→18 changes the
// derived geometry of every B-part in one assertion." v4 §3.1 — thickness travels with the material.
// `thicknessSpecFromVars` maps the global material slots to the solver's per-role thickness, so editing
// the korpus slot re-solves every carcass part (same ids, reflowed geometry — nothing added/removed).
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveStructure, thicknessSpecFromVars } from "../engine/structure/solve.js";
import type { MaterialVar } from "../engine/contracts/variables.js";

// The "B" (korpus) slot is the one we retype 16→18; fasad + orqa stay fixed.
const vars = (korpus_mm10: number): MaterialVar[] => [
  { id: "mv_a", label: "A", role: "fasad", sku: "mdf", thickness_mm10: 180, color: "#eee" },
  { id: "mv_b", label: "B", role: "korpus", sku: "ldsp", thickness_mm10: korpus_mm10, color: "#ddd" },
  { id: "mv_c", label: "C", role: "orqa", sku: "hdf", thickness_mm10: 30, color: "#ccc" },
];

// Roles that belong to the korpus (B) slot — the carcass family.
const KORPUS_ROLES = new Set(["carcass_side", "carcass_top", "carcass_bottom", "internal_shelf"]);

function model() {
  let m = buildCarcassModel(900, 720, 560);
  m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "equal", axis: "x", count: 2 }); // a divider
  const col = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x)[0]!.id;
  m = addInstance(m, col, "shelf");
  m = addInstance(m, col, "door");
  return m;
}

describe("GATE 1 — retyping MaterialVar B (korpus) thickness reflows every B-part", () => {
  it("every korpus part follows B (16→18); fasad/orqa parts do NOT change; same parts reflow", () => {
    const m = model();
    const p16 = solveStructure(m, thicknessSpecFromVars(vars(160)));
    const p18 = solveStructure(m, thicknessSpecFromVars(vars(180)));

    const korpus16 = p16.filter((p) => p.role && KORPUS_ROLES.has(p.role));
    const korpus18 = p18.filter((p) => p.role && KORPUS_ROLES.has(p.role));

    expect(korpus16.length).toBeGreaterThan(4);
    expect(korpus18.length).toBe(korpus16.length); // no B-part added or dropped — they REFLOW

    // THE gate: every B-part's thickness moved 160 → 180
    expect(korpus16.every((p) => p.thickness_mm10 === 160)).toBe(true);
    expect(korpus18.every((p) => p.thickness_mm10 === 180)).toBe(true);

    // and the geometry actually reflowed: a thicker carcass shrinks the inner width of the top panel
    const top16 = p16.find((p) => p.id.endsWith("__top"))!;
    const top18 = p18.find((p) => p.id.endsWith("__top"))!;
    expect(top18.length_mm10).toBeLessThan(top16.length_mm10); // innerW = w − 2·carcass, so 18mm → narrower

    // the fasad (A) + orqa (C) parts are untouched by a korpus edit
    const facade16 = p16.find((p) => p.role === "facade")!;
    const facade18 = p18.find((p) => p.role === "facade")!;
    expect(facade18.thickness_mm10).toBe(facade16.thickness_mm10); // still 180 (fasad slot), unchanged
    const back16 = p16.find((p) => p.role === "carcass_back")!;
    const back18 = p18.find((p) => p.role === "carcass_back")!;
    expect(back18.thickness_mm10).toBe(back16.thickness_mm10); // still 30 (orqa slot), unchanged
  });

  it("thicknessSpecFromVars maps the three slots to the carcass/facade/back families", () => {
    const spec = thicknessSpecFromVars(vars(160));
    expect(spec).toEqual({ carcass: 160, shelf: 160, divider: 160, facade: 180, back: 30 });
  });
});
