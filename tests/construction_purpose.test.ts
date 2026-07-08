// Step 9 — purpose tags + boiler clearance (Gate 9): a space can be tagged (incl. "boiler"), and a
// boiler space smaller than the boiler's minimum footprint is flagged for the amber warning.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { setSectionPurpose, checkBoilerClearance, BOILER_MIN } from "../engine/structure/operations.js";

const rootId = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.zones[0]!.root.id;
const rootPurpose = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.zones[0]!.root.purpose;

describe("Step 9 — purpose tags + boiler clearance", () => {
  it("tags a space with a purpose (and clears it)", () => {
    let m = buildCarcassModel(600, 900, 560);
    m = setSectionPurpose(m, rootId(m), "boiler");
    expect(rootPurpose(m)).toBe("boiler");
    m = setSectionPurpose(m, rootId(m), null);
    expect(rootPurpose(m)).toBeNull();
  });

  it("is a no-op (same ref) on a missing section or an unchanged tag", () => {
    const m = buildCarcassModel(600, 900, 560);
    expect(setSectionPurpose(m, "nope", "storage")).toBe(m); // section not found
    const tagged = setSectionPurpose(m, rootId(m), "storage");
    expect(setSectionPurpose(tagged, rootId(tagged), "storage")).toBe(tagged); // re-tag same value → same ref
  });

  it("a boiler space that MEETS the minimum raises no warning", () => {
    let m = buildCarcassModel(600, 900, 560); // 6000×9000×5600 mm10 ≥ 5000×8000×3000
    m = setSectionPurpose(m, rootId(m), "boiler");
    expect(checkBoilerClearance(m)).toEqual([]);
  });

  it("a boiler space BELOW the minimum is flagged (Gate 9)", () => {
    let m = buildCarcassModel(400, 600, 560); // 4000<5000 wide, 6000<8000 tall
    m = setSectionPurpose(m, rootId(m), "boiler");
    const finds = checkBoilerClearance(m);
    expect(finds).toHaveLength(1);
    expect(finds[0]!.need).toEqual(BOILER_MIN);
    expect(finds[0]!.have.w).toBe(4000);
  });

  it("a non-boiler space is never clearance-checked", () => {
    let m = buildCarcassModel(400, 600, 560);
    m = setSectionPurpose(m, rootId(m), "storage");
    expect(checkBoilerClearance(m)).toEqual([]);
  });
});
