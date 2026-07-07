// Step 4b — the PanelFeatures overlay (corner rounding + cutout) is a model-level, id-keyed extra that
// must round-trip through the app's JSON save/load untouched (it isn't on the derived Part). Additive:
// a model without it saves exactly as before.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import type { StructuralModel, PanelFeatures } from "../engine/contracts/structure.js";

describe("Step 4b — PanelFeatures round-trip", () => {
  it("corner radii + a locked cutout survive a JSON save/load unchanged", () => {
    const base = buildCarcassModel(600, 720, 560);
    const pid = `${base.blocks[0]!.id}__side_l`; // a stable derived-Part id (parts materialise at solve time)
    const feat: PanelFeatures = {
      corners: [150, 150, 0, 0], // TL + TR rounded r=15mm, BR/BL square
      cutouts: [{ id: "c1", w_mm10: 3000, h_mm10: 2000, offset: [600, 600, 600, 600], locked: [true, false, true, false] }],
    };
    const model: StructuralModel = { ...base, features: { [pid]: feat } };

    const round = JSON.parse(JSON.stringify(model)) as StructuralModel;
    expect(round.features?.[pid]).toEqual(feat);
    expect(round.features?.[pid]?.corners).toEqual([150, 150, 0, 0]);
    expect(round.features?.[pid]?.cutouts?.[0]?.locked).toEqual([true, false, true, false]);
  });

  it("a model with no features round-trips as before (field stays absent)", () => {
    const base = buildCarcassModel(600, 720, 560);
    const round = JSON.parse(JSON.stringify(base)) as StructuralModel;
    expect(round.features).toBeUndefined();
  });
});
