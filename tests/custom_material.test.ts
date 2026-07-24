// M9U.3 — the custom-material library. An usta creates a material (colour + sliders) FROM a base stock;
// its price + thickness are INHERITED from that base (auto-price, never hand-typed), and because a
// CustomMaterial shares BoardMaterial's shape it drops into every existing resolver — boardById, hence
// partColor / partBoard / planThickness / estimate / SWJ008 — with zero call-site changes. These tests pin
// the auto-price, the registry, and the invariant that with NO custom material the catalog is untouched.

import { describe, it, expect, afterEach } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import {
  BOARDS,
  DEFAULT_PLAN,
  planThickness,
  boardById,
  allBoards,
  getCustomBoards,
  registerCustomBoard,
  removeCustomBoard,
  mergeCustomBoards,
  createCustomMaterial,
} from "../apps/app/src/three/materials.js";

// The registry is module-level shared state — clear anything a test added so tests stay isolated.
afterEach(() => {
  for (const c of [...getCustomBoards()]) removeCustomBoard(c.id);
});

describe("M9U.3 — a custom material inherits its price + thickness from the base stock", () => {
  it("price + thickness come from the base (auto-price, not hand-typed)", () => {
    const base = boardById("wood_walnut")!;
    const m = createCustomMaterial("wood_walnut", { id: "cust_walnut", name: "Mening yong'og'im", hex: "#5a3a22" });
    expect(m.custom).toBe(true);
    expect(m.baseId).toBe("wood_walnut");
    expect(m.pricePerM2).toBe(base.pricePerM2);
    expect(m.thickness_mm).toBe(base.thickness_mm);
    expect(m.hex).toBe("#5a3a22");
  });

  it("a solid-timber base carries `solid` through to the custom material", () => {
    const m = createCustomMaterial("massiv_yongoq", { id: "cust_massiv", name: "Massiv+", hex: "#6b4a30" });
    expect(m.solid).toBe(true);
    expect(m.pricePerM2).toBe(boardById("massiv_yongoq")!.pricePerM2);
  });

  it("priceOverride wins when a shop wants a bespoke rate", () => {
    const m = createCustomMaterial("ldsp_white", { id: "cust_px", name: "Qimmat oq", hex: "#ffffff", priceOverride: 999999 });
    expect(m.pricePerM2).toBe(999999);
    expect(m.thickness_mm).toBe(boardById("ldsp_white")!.thickness_mm); // thickness still inherited
  });

  it("the three sliders + finish/texture ride onto the material (absent stays absent)", () => {
    const g = createCustomMaterial("mdf_white_gloss", { id: "cust_g", name: "Yaltiroq", hex: "#eeeeee", finish: "gloss", roughness: 0.1, metalness: 0.2, opacity: 0.8 });
    expect(g.finish).toBe("gloss");
    expect(g.roughness).toBe(0.1);
    expect(g.metalness).toBe(0.2);
    expect(g.opacity).toBe(0.8);
    const plain = createCustomMaterial("ldsp_white", { id: "cust_plain", name: "Oddiy", hex: "#f0f0f0" });
    expect(plain.roughness).toBeUndefined();
    expect(plain.metalness).toBeUndefined();
    expect(plain.opacity).toBeUndefined();
  });
});

describe("M9U.3 — the registry: register / resolve / remove / merge", () => {
  it("a registered material resolves through boardById and shows in allBoards", () => {
    const m = createCustomMaterial("ldsp_sonoma", { id: "cust_reg", name: "Reg", hex: "#c9a877" });
    registerCustomBoard(m);
    expect(boardById("cust_reg")).toEqual(m);
    expect(allBoards().some((b) => b.id === "cust_reg")).toBe(true);
    expect(allBoards().length).toBe(BOARDS.length + 1);
  });

  it("register is upsert (same id replaces, never duplicates)", () => {
    registerCustomBoard(createCustomMaterial("ldsp_white", { id: "cust_up", name: "V1", hex: "#111111" }));
    registerCustomBoard(createCustomMaterial("ldsp_white", { id: "cust_up", name: "V2", hex: "#222222" }));
    expect(getCustomBoards().filter((c) => c.id === "cust_up").length).toBe(1);
    expect(boardById("cust_up")!.name).toBe("V2");
  });

  it("mergeCustomBoards dedups by id (project-embed keeps the local one)", () => {
    registerCustomBoard(createCustomMaterial("ldsp_white", { id: "cust_m", name: "Local", hex: "#333333" }));
    mergeCustomBoards([createCustomMaterial("ldsp_white", { id: "cust_m", name: "FromProject", hex: "#444444" })]);
    expect(getCustomBoards().filter((c) => c.id === "cust_m").length).toBe(1);
    expect(boardById("cust_m")!.name).toBe("Local"); // existing id is NOT overwritten by a merge
  });
});

describe("M9U.3 — the catalog is untouched when no custom material exists", () => {
  it("allBoards equals the catalog, and an unknown id stays undefined", () => {
    expect(allBoards().length).toBe(BOARDS.length);
    expect(boardById("cust_ghost")).toBeUndefined();
  });

  it("register then remove restores the exact baseline", () => {
    const before = allBoards().length;
    registerCustomBoard(createCustomMaterial("ldsp_white", { id: "cust_tmp", name: "Tmp", hex: "#ffffff" }));
    expect(allBoards().length).toBe(before + 1);
    removeCustomBoard("cust_tmp");
    expect(allBoards().length).toBe(before);
    expect(boardById("cust_tmp")).toBeUndefined();
  });
});

describe("M9U.3 — a custom material prices a real cabinet exactly like its base", () => {
  it("estimate + planThickness resolve the custom material to its base rate", () => {
    const model = buildCarcassModel(600, 720, 560);
    const base = "wood_walnut";
    const planBase = { ...DEFAULT_PLAN, carcass: base, facade: base, shelf: base };
    const priceBase = estimate(solveStructure(model, planThickness(planBase)), planBase).priceUzs;

    registerCustomBoard(createCustomMaterial(base, { id: "cust_walnut2", name: "Yong'oq+", hex: "#5a3a22" }));
    const planCust = { ...DEFAULT_PLAN, carcass: "cust_walnut2", facade: "cust_walnut2", shelf: "cust_walnut2" };
    const priceCust = estimate(solveStructure(model, planThickness(planCust)), planCust).priceUzs;

    expect(priceCust).toBe(priceBase); // auto-price === base price, resolved through boardById everywhere
  });
});
