// Phase F3 — a plain glazed door (single pane) via addInstance opts.glazed.
import { describe, it, expect } from "vitest";
import { addInstance } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase F3 — plain glazed door", () => {
  it("marks the facade component glazed (not a grid)", () => {
    const m = addInstance(buildCarcassModel(600, 720, 500), firstLeaf(buildCarcassModel(600, 720, 500)), "door", { glazed: true });
    const door = m.blocks[0]!.components.find((c) => c.role === "facade")!;
    expect(door.glazed).toBe(true);
    expect(door.glazedGrid).toBeUndefined();
  });

  it("emits a facade + still exports valid SWJ008 (rebate machining passes the emit gate)", () => {
    const base = buildCarcassModel(600, 720, 500);
    const m = addInstance(base, firstLeaf(base), "door", { glazed: true });
    expect(solveStructure(m).some((p) => p.role === "facade")).toBe(true);
    const xml = exportModelToSWJ008(m);
    expect(xml).toContain("SWJ008");
  });

  it("a plain door and a glazed door are distinct components (keyed apart)", () => {
    const base = buildCarcassModel(1200, 720, 500);
    let m = addInstance(base, firstLeaf(base), "door"); // plain
    m = addInstance(m, firstLeaf(m), "door", { glazed: true }); // glazed
    const facades = m.blocks[0]!.components.filter((c) => c.role === "facade");
    expect(facades.length).toBe(2);
    expect(facades.filter((c) => c.glazed === true).length).toBe(1);
  });
});
