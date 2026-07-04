// Phase 7.2 — hardware count + price from a model (hinges by door height, shelf pins, carcass kit).
import { describe, it, expect } from "vitest";
import { hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { CAMS_PER_CARCASS, DOWELS_PER_CARCASS, PINS_PER_SHELF, HARDWARE } from "../apps/app/src/three/materials.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { addInstance, divideSection } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";

const firstLeaf = (m: ReturnType<typeof buildDemoModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase 7.2 — hardware estimate", () => {
  it("every carcass block contributes one cam-and-dowel kit", () => {
    const hw = hardwareEstimate(buildDemoModel());
    const cams = hw.lines.find((l) => l.name === HARDWARE.cam.name)!;
    const dowels = hw.lines.find((l) => l.name === HARDWARE.dowel.name)!;
    expect(cams.qty).toBe(CAMS_PER_CARCASS); // demo = 1 block
    expect(dowels.qty).toBe(DOWELS_PER_CARCASS);
    expect(cams.priceRub).toBe(CAMS_PER_CARCASS * HARDWARE.cam.priceRub);
  });

  it("adding a shelf adds 4 pins", () => {
    const m = buildDemoModel();
    const before = hardwareEstimate(m).lines.find((l) => l.name === HARDWARE.pin.name)?.qty ?? 0;
    const m2 = addInstance(m, firstLeaf(m), "shelf");
    const after = hardwareEstimate(m2).lines.find((l) => l.name === HARDWARE.pin.name)!.qty;
    expect(after).toBe(before + PINS_PER_SHELF);
  });

  it("adding a door adds hinges (2–4 by height) and price rises", () => {
    const m = buildDemoModel();
    const before = hardwareEstimate(m);
    const beforeHinges = before.lines.find((l) => l.name === HARDWARE.hinge.name)?.qty ?? 0;
    const m2 = addInstance(m, firstLeaf(m), "door");
    const after = hardwareEstimate(m2);
    const afterHinges = after.lines.find((l) => l.name === HARDWARE.hinge.name)!.qty;
    expect(afterHinges).toBeGreaterThanOrEqual(beforeHinges + 2);
    expect(afterHinges).toBeLessThanOrEqual(beforeHinges + 4);
    expect(after.priceRub).toBeGreaterThan(before.priceRub);
  });

  it("total price is the sum of the line prices", () => {
    const hw = hardwareEstimate(divideSection(buildDemoModel(), "sec_left", { kind: "equal", axis: "x", count: 2 }));
    expect(hw.priceRub).toBe(hw.lines.reduce((a, l) => a + l.priceRub, 0));
  });
});
