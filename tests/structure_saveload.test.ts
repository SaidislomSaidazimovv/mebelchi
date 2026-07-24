// Phase 7.1 — project save / load (JSON round-trip).
import { describe, it, expect, afterEach } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel, buildLCornerModel } from "../engine/structure/demoModel.js";
import { registerCustomBoard, removeCustomBoard, createCustomMaterial, boardById, getCustomBoards } from "../apps/app/src/three/materials.js";

afterEach(() => { for (const c of [...getCustomBoards()]) removeCustomBoard(c.id); }); // keep the custom library clean between tests

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
    expect(JSON.parse(json)).toMatchObject({ version: 2, plan: { facade: "mdf_white_matt" } });

    useKarkas.getState().setPlanMaterial("facade", "ldsp_white"); // change it
    useKarkas.getState().importProject(json);
    expect(useKarkas.getState().plan.facade).toBe("mdf_white_matt");
  });

  it("M9U.3 — a custom material embeds on export and restores on import (else it would open as bare wood)", () => {
    registerCustomBoard(createCustomMaterial("wood_walnut", { id: "cust_save", name: "Saqlash", hex: "#5a3a22", roughness: 0.2 }));
    useKarkas.getState().setModel(buildDemoModel());
    useKarkas.getState().setPlanMaterial("facade", "cust_save");
    const json = useKarkas.getState().exportProject();
    const parsed = JSON.parse(json) as { version: number; customMaterials?: unknown[] };
    expect(parsed.version).toBe(2);
    expect(parsed.customMaterials).toEqual([expect.objectContaining({ id: "cust_save", hex: "#5a3a22", custom: true, baseId: "wood_walnut" })]);

    // simulate opening on a device that never had this material — clear the local library
    removeCustomBoard("cust_save");
    expect(boardById("cust_save")).toBeUndefined();

    // import re-registers the embedded material and applies the plan WITHOUT a foreign-decor binding prompt
    useKarkas.getState().importProject(json);
    expect(boardById("cust_save")).toBeTruthy();
    expect(boardById("cust_save")!.roughness).toBe(0.2);
    expect(useKarkas.getState().plan.facade).toBe("cust_save");
    expect(useKarkas.getState().pendingBinding).toBeNull();
  });

  it("a v1 project (no customMaterials) still imports cleanly", () => {
    useKarkas.getState().setModel(buildDemoModel());
    const json = useKarkas.getState().exportProject();
    const v1 = JSON.stringify({ ...JSON.parse(json), version: 1, customMaterials: undefined });
    expect(() => useKarkas.getState().importProject(v1)).not.toThrow();
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
