// Phase 7.3 — drawer box: engine addDrawerInstance → 5-panel box, exports cleanly, counts a slide set.
import { describe, it, expect } from "vitest";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { addInstance } from "../engine/structure/operations.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { HARDWARE } from "../apps/app/src/three/materials.js";

const firstLeaf = (m: ReturnType<typeof buildDemoModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase 7.3 — drawer box", () => {
  it("emits a 5-panel box (front facade + 2 sides + back + thin bottom)", () => {
    const m = buildDemoModel();
    const before = solveStructure(m).length;
    const m2 = addInstance(m, firstLeaf(m), "drawer");
    const parts = solveStructure(m2);
    expect(parts.length).toBe(before + 5);
    const box = parts.filter((p) => p.name.startsWith("Ящик"));
    expect(box.length).toBe(5);
    expect(box.find((p) => p.name.includes("фасад"))!.role).toBe("facade");
    expect(box.filter((p) => p.role === "carcass_side").length).toBe(3); // 2 sides + back
    expect(box.find((p) => p.name.includes("дно"))!.role).toBe("carcass_back"); // thin bottom
  });

  it("the drawer's parts still export to valid SWJ008 (passes the safety gate)", () => {
    const m = addInstance(buildDemoModel(), firstLeaf(buildDemoModel()), "drawer");
    const xml = exportModelToSWJ008(m);
    expect(xml).toContain("<Panel");
    expect(xml).toContain("SWJ008");
  });

  it("hardware counts one slide set per drawer, no extra hinges", () => {
    const m = buildDemoModel();
    const before = hardwareEstimate(m);
    const beforeSlides = before.lines.find((l) => l.name === HARDWARE.slide.name)?.qty ?? 0;
    const beforeHinges = before.lines.find((l) => l.name === HARDWARE.hinge.name)?.qty ?? 0;
    const m2 = addInstance(m, firstLeaf(m), "drawer");
    const after = hardwareEstimate(m2);
    expect(after.lines.find((l) => l.name === HARDWARE.slide.name)!.qty).toBe(beforeSlides + 1);
    expect(after.lines.find((l) => l.name === HARDWARE.hinge.name)?.qty ?? 0).toBe(beforeHinges); // no hinges
  });
});
