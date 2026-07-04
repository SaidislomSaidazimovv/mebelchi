// Phase 7.1 — project save / load (JSON round-trip).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel, buildLCornerModel } from "../engine/structure/demoModel.js";

describe("Phase 7.1 — project save/load", () => {
  it("export → import round-trips the model exactly (same parts)", () => {
    useKarkas.getState().setModel(buildLCornerModel());
    useKarkas.getState().add("shelf"); // make it non-trivial
    const before = useKarkas.getState().parts.map((p) => p.id);
    const json = useKarkas.getState().exportProject();

    useKarkas.getState().setModel(buildDemoModel()); // clobber with something else
    expect(useKarkas.getState().parts.map((p) => p.id)).not.toEqual(before);

    useKarkas.getState().importProject(json); // restore
    expect(useKarkas.getState().parts.map((p) => p.id)).toEqual(before);
  });

  it("export carries the material plan; import restores it", () => {
    useKarkas.getState().setModel(buildDemoModel());
    useKarkas.getState().setPlanMaterial("facade", "mdf_white_matt");
    const json = useKarkas.getState().exportProject();
    expect(JSON.parse(json)).toMatchObject({ version: 1, plan: { facade: "mdf_white_matt" } });

    useKarkas.getState().setPlanMaterial("facade", "ldsp_white"); // change it
    useKarkas.getState().importProject(json);
    expect(useKarkas.getState().plan.facade).toBe("mdf_white_matt");
  });

  it("import resets history and clears selection", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const json = useKarkas.getState().exportProject();
    useKarkas.getState().add("shelf");
    expect(useKarkas.getState().canUndo()).toBe(true);
    useKarkas.getState().importProject(json);
    expect(useKarkas.getState().canUndo()).toBe(false);
    expect(useKarkas.getState().selectedId).toBeNull();
  });

  it("a malformed payload throws (not silently accepted)", () => {
    expect(() => useKarkas.getState().importProject("{}")).toThrow();
    expect(() => useKarkas.getState().importProject('{"model":{}}')).toThrow();
    expect(() => useKarkas.getState().importProject("not json")).toThrow();
  });
});
