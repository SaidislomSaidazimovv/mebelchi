// Phase 6.1 — the global workshop profile: persisted factory defaults (materials + joints + per-role board
// thickness) applied across projects. The profile BUNDLES the existing MaterialPlan + JointProfile (no new
// engine type). A per-role thickness override wins over the decor default; absent → byte-identical.

import { describe, it, expect, beforeEach } from "vitest";

import { loadWorkshopProfile, saveWorkshopProfile, clearWorkshopProfile, defaultWorkshopProfile } from "../apps/app/src/three/workshopProfile.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";

// an in-memory localStorage so the profile round-trips deterministically in the test env
const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe("Phase 6.1 — workshopProfile persistence", () => {
  it("an empty / absent store returns the built-in default", () => {
    clearWorkshopProfile();
    const wp = loadWorkshopProfile();
    expect(wp.plan).toEqual(defaultWorkshopProfile().plan);
    expect(wp.jointProfile).toBeDefined();
  });

  it("save → load round-trips the profile (incl. a thickness override)", () => {
    const prof = { ...defaultWorkshopProfile(), thickness: { carcass: 180 } };
    saveWorkshopProfile(prof);
    const back = loadWorkshopProfile();
    expect(back.plan).toEqual(prof.plan);
    expect(back.thickness).toEqual({ carcass: 180 });
  });

  it("corrupt JSON / missing fields falls back to the default (never throws)", () => {
    mem.set("mebelchi.karkas.workshopProfile.v1", "{not json");
    expect(() => loadWorkshopProfile()).not.toThrow();
    expect(loadWorkshopProfile().plan).toEqual(defaultWorkshopProfile().plan);
    mem.set("mebelchi.karkas.workshopProfile.v1", JSON.stringify({ plan: null }));
    expect(loadWorkshopProfile().plan).toEqual(defaultWorkshopProfile().plan); // missing jointProfile → default
  });
});

describe("Phase 6.1 — store thickness override", () => {
  it("setRoleThickness overrides the decor thickness in the cut list (carcass 16 → 18 mm)", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    const before = useKarkas.getState().parts.find((p) => p.role === "carcass_side")!;
    expect(before.thickness_mm10).toBe(160); // ЛДСП 16 from the decor
    useKarkas.getState().setRoleThickness("carcass", 18);
    const after = useKarkas.getState().parts.find((p) => p.role === "carcass_side")!;
    expect(after.thickness_mm10).toBe(180); // the override wins
  });

  it("setRoleThickness(role, 0) clears the override (back to the decor default)", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().setRoleThickness("carcass", 18);
    useKarkas.getState().setRoleThickness("carcass", 0);
    expect(useKarkas.getState().thickness.carcass).toBeUndefined();
    expect(useKarkas.getState().parts.find((p) => p.role === "carcass_side")!.thickness_mm10).toBe(160);
  });
});

describe("Phase 6.1 — save / apply the workshop default", () => {
  it("saveWorkshopDefault persists the current settings WITHOUT changing the model", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().setRoleThickness("carcass", 18);
    const model = useKarkas.getState().model;
    useKarkas.getState().saveWorkshopDefault();
    expect(useKarkas.getState().model).toBe(model); // model untouched — only localStorage changed
    expect(loadWorkshopProfile().thickness).toEqual({ carcass: 180 });
  });

  it("applyWorkshopDefault resets the project's plan + thickness to the saved default", () => {
    // save a profile with a facade decor + a thickness override
    saveWorkshopProfile({ ...defaultWorkshopProfile(), plan: { ...defaultWorkshopProfile().plan, facade: "mdf_white_matt" }, thickness: { carcass: 180 } });
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().setPlanMaterial("facade", "ldsp_white"); // diverge
    useKarkas.getState().applyWorkshopDefault();
    expect(useKarkas.getState().plan.facade).toBe("mdf_white_matt"); // reset to the saved default
    expect(useKarkas.getState().thickness).toEqual({ carcass: 180 });
  });
});
