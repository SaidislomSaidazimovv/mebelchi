// Step 1.3 (HANDOVER_04 Step 1 gate) — project save/load round-trips ALL of the v4 model, end to end.
// The app's exportProject/importProject serialize the WHOLE model via JSON.stringify({version, model,
// plan}) / JSON.parse (karkasStore.ts:325,329), so the new v4 fields (materialVars, kromkaVars,
// jointProfile, per-line DivisionRule) survive automatically. Here we build a REALISTIC model through
// the operations (divide stamps line rules), attach the global variables, and assert a full round-trip
// mirroring the app's ProjectFile shape is deep-equal.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { divideSection } from "../engine/structure/operations.js";
import type { StructuralModel } from "../engine/contracts/structure.js";
import type { MaterialVar, KromkaVar, JointProfile } from "../engine/contracts/variables.js";

const materialVars: MaterialVar[] = [
  { id: "mv_a", label: "A", role: "fasad", sku: "mdf_white_matt", thickness_mm10: 180, color: "#f2efe9" },
  { id: "mv_b", label: "B", role: "korpus", sku: "ldsp_white", thickness_mm10: 160, color: "#e7ddc9" },
  { id: "mv_c", label: "C", role: "orqa", sku: "hdf_white", thickness_mm10: 30, color: "#d8d2c4" },
];
const kromkaVars: KromkaVar[] = [{ id: "kv_1", label: "K1", sku: "pvc_white_2", thickness_mm10: 20, color: "#fff" }];
const jointProfile: JointProfile = {
  id: "jp", camSku: "minifix_15", camSeatDepth_mm10: 125,
  system32: { pitch_mm10: 320, frontSetback_mm10: 915, backSetback_mm10: 915 }, minEdgeMargin_mm10: 500,
};

// The app persists exactly this shape (karkasStore ProjectFile).
interface ProjectFileLike { version: number; model: StructuralModel; plan: { carcass: string } }

describe("Step 1.3 — save/load round-trips the whole v4 model", () => {
  it("a real divided model + global variables survives a ProjectFile JSON round-trip deep-equal", () => {
    let m = buildCarcassModel(900, 720, 560);
    m = divideSection(m, m.blocks[0]!.zones[0]!.root.id, { kind: "ratio", axis: "x", ratio: [1, 1, 0.6] });
    // attach the project's global variable slots (v4 §3)
    const model: StructuralModel = { ...m, materialVars, kromkaVars, jointProfile };

    const file: ProjectFileLike = { version: 1, model, plan: { carcass: "ldsp_white" } };
    const loaded = JSON.parse(JSON.stringify(file)) as ProjectFileLike;

    expect(loaded).toEqual(file); // full deep-equal after save → load
    // the v4 additions specifically survived:
    expect(loaded.model.materialVars).toHaveLength(3);
    expect(loaded.model.kromkaVars).toHaveLength(1);
    expect(loaded.model.jointProfile?.camSku).toBe("minifix_15");
    // and the per-zone division rules the divide stamped came back intact (3 zones for ratio [1,1,0.6])
    expect(loaded.model.blocks[0]!.zones[0]!.root.children.map((c) => c.rule?.kind)).toEqual(["ratio", "ratio", "ratio"]);
  });
});
