// Deep check (user report "editing the joint profile changes nothing"): prove the STORE chain
// setJointProfile → model.jointProfile → solveModelToParts actually moves the drilled shelf pins. If this
// passes, the engine + store are correct and any "nothing moves" is a no-shelves / non-positional-field
// situation, not a bug.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore";
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
  m = addInstance(m, cols[0]!.id, "shelf");
  m = addInstance(m, cols[0]!.id, "shelf");
  return m;
}
const pinYs = (m: StructuralModel) =>
  solveModelToParts(m).flatMap((p) => p.operations.filter((o) => o.op === "drill" && Math.abs(o.diameter_mm10 - 50) <= 2).map((o) => (o as { y_mm10: number }).y_mm10));

describe("Step 7a — setJointProfile flows through the store to the drilled holes", () => {
  it("editing the profile in the store moves the shelf pins", () => {
    const st = useKarkas.getState();
    st.openWith(shelfModel());
    const before = pinYs(useKarkas.getState().model);
    expect(before).toContain(915); // factory default

    const prof = defaultJointProfile();
    useKarkas.getState().setJointProfile({ ...prof, system32: { ...prof.system32, frontSetback_mm10: 400, backSetback_mm10: 400 } });

    const model = useKarkas.getState().model;
    expect(model.jointProfile?.system32.frontSetback_mm10).toBe(400); // store persisted it
    const after = pinYs(model);
    expect(after).toContain(400); // and the holes actually moved
    expect(after).not.toContain(915);
  });
});
