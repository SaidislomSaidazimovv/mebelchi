// E2E v2 — the WHOLE karkas chain A–F through the real store: every feature + material, then a
// save/reopen round-trip that must preserve ALL model state (the dependency check).
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate, hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { partColor, boardById, BOARDS } from "../apps/app/src/three/materials.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";

const S = () => useKarkas.getState();
const comps = () => S().model.blocks.flatMap((b) => b.components);

describe("E2E v2 — full A–F chain + round-trip preservation", () => {
  it("builds with every feature, prices/colours/CNCs it, and save→reopen preserves it all", () => {
    // B: blank carcass
    S().setModel(buildCarcassModel(1000, 2000, 500));
    expect(S().parts.length).toBe(5);

    // C2 resize · C3 numeric divide + shelf count
    S().resize("h", 2100);
    expect(S().model.blocks[0]!.box.h).toBe(21000);
    S().divideBy("x", 2);
    S().addShelves(2);

    // A / F3: plain glazed door · A: drawer
    S().add("door", { glazed: true });
    S().add("drawer");
    expect(S().parts.filter((p) => p.role === "internal_shelf").length).toBe(2);
    expect(comps().some((c) => c.glazed === true)).toBe(true);
    expect(comps().some((c) => c.drawer === true)).toBe(true);

    // C4: per-part thickness · F2: per-part material (on the selected shelf's shared component)
    const shelf = S().parts.find((p) => p.role === "internal_shelf")!;
    S().tapPart(shelf.id);
    S().setThickness(18);
    S().setMaterial("ldsp_wenge");
    expect(S().parts.find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180);
    expect(S().parts.some((p) => p.materialId === "ldsp_wenge")).toBe(true);

    // F1/F2: colour resolution — per-part override differs from the role colour
    const sh = S().parts.find((p) => p.materialId === "ldsp_wenge")!;
    expect(partColor(S().plan, sh.role, sh.materialId)).not.toBe(partColor(S().plan, sh.role));

    // 5.C: global plan drives the facade
    S().setPlanMaterial("facade", "mdf_white_matt");

    // estimate: both the per-part override decor AND the facade plan decor are priced
    const e = estimate(S().parts, S().plan);
    expect(e.byMaterial.some((g) => g.name === boardById("ldsp_wenge")!.name)).toBe(true);
    expect(e.byMaterial.some((g) => g.name === boardById("mdf_white_matt")!.name)).toBe(true);
    expect(e.priceRub).toBeGreaterThan(0);

    // 7.2: hardware — hinges (door) + a slide (drawer) + pins (shelves)
    const hw = hardwareEstimate(S().model);
    expect(hw.lines.some((l) => l.name.includes("Петля"))).toBe(true);
    expect(hw.lines.some((l) => l.name.includes("Направляющая"))).toBe(true);
    expect(hw.lines.some((l) => l.name.includes("Полкодержатель"))).toBe(true);

    // CNC: passes the gate, carries the per-part override name
    const xml = exportModelToSWJ008(
      S().model, {},
      { facade: "МДФ Белый мат", carcass_side: "ЛДСП Белый", carcass_top: "ЛДСП Белый", carcass_bottom: "ЛДСП Белый", carcass_back: "ХДФ Белый (задняя)", internal_shelf: "ЛДСП Белый" },
      Object.fromEntries(BOARDS.map((b) => [b.id, b.name])),
    );
    expect(xml).toContain("SWJ008");
    expect(xml).toContain(`Material="${boardById("ldsp_wenge")!.name}"`);

    // B/E: save → reopen (as a placed project block) preserves EVERYTHING
    const json = S().exportProject();
    const before = S().parts.length;
    S().setModel(buildCarcassModel(300, 300, 300)); // clobber
    expect(S().parts.length).not.toBe(before);
    S().importProject(json, "pb-xyz");

    expect(S().editingBlockId).toBe("pb-xyz"); // E — edit link
    expect(S().parts.length).toBe(before); // geometry restored
    expect(S().parts.find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180); // C4 preserved
    expect(S().parts.some((p) => p.materialId === "ldsp_wenge")).toBe(true); // F2 preserved
    expect(comps().some((c) => c.glazed === true)).toBe(true); // F3 preserved
    expect(comps().some((c) => c.drawer === true)).toBe(true); // drawer preserved
    expect(S().plan.facade).toBe("mdf_white_matt"); // plan preserved
  });

  it("is deterministic — a second identical build yields the same part count + price", () => {
    const build = () => {
      S().setModel(buildCarcassModel(800, 1800, 500));
      S().divideBy("y", 3);
      S().addShelves(2);
      S().add("door");
      return { n: S().parts.length, price: estimate(S().parts, S().plan).priceRub };
    };
    const a = build();
    const b = build();
    expect(b).toEqual(a);
  });
});
