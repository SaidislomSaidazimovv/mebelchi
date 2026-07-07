// Step 7a — the JointProfile becomes the source of truth for hole placement: it seeds from the factory
// catalog, and retyping a System-32 setback moves the auto-placed shelf pins.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { solveModelToParts, defaultJointProfile } from "../engine/cnc.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

function shelfModel(): StructuralModel {
  let m = buildCarcassModel(600, 720, 560);
  const root = m.blocks[0]!.zones[0]!.root.id;
  m = divideSection(m, root, { kind: "equal", axis: "x", count: 2 });
  const cols = [...leafSections(m.blocks[0]!.zones[0]!.root)].sort((a, b) => a.box.x - b.box.x);
  m = addInstance(m, cols[0]!.id, "shelf"); // 2 shelves bounded by side_l + the divider → real pins
  m = addInstance(m, cols[0]!.id, "shelf");
  return m;
}

// the Ø5 shelf-pin drill y positions (= the System-32 front/back setback), across every part
const pinYs = (m: StructuralModel): number[] =>
  solveModelToParts(m).flatMap((p) => p.operations.filter((o) => o.op === "drill" && Math.abs(o.diameter_mm10 - 50) <= 2).map((o) => (o as { y_mm10: number }).y_mm10));

describe("Step 7a — JointProfile drives hole placement", () => {
  it("defaultJointProfile mirrors the factory catalog (System-32 32mm pitch, 91.5mm setback)", () => {
    const p = defaultJointProfile();
    expect(p.system32.pitch_mm10).toBe(320); // 32mm industry standard
    expect(p.system32.frontSetback_mm10).toBe(915); // 91.5mm, grounded against ORTA_BAK
  });

  it("no profile → the catalog setback (a pin row at 91.5mm = 915 mm10)", () => {
    expect(pinYs(shelfModel())).toContain(915);
  });

  it("retyping the setback in the profile MOVES the shelf pins", () => {
    const base = shelfModel();
    const prof = defaultJointProfile();
    const withProfile: StructuralModel = { ...base, jointProfile: { ...prof, system32: { ...prof.system32, frontSetback_mm10: 400, backSetback_mm10: 400 } } };
    const ys = pinYs(withProfile);
    expect(ys).toContain(400); // pins snapped to the new 40mm setback
    expect(ys).not.toContain(915); // nothing left at the old factory row
  });
});
