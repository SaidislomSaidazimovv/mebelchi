// E2E — the full usta workflow, exercising A (engine+editor), B (from-scratch+library) and
// C (imos-editor: resize / numeric divide / per-part thickness) together through the real store.
import { describe, it, expect } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate, hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { libraryItemFromKarkas } from "../apps/app/src/model/library.js";
import { boardById } from "../apps/app/src/three/materials.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { leafSections, type StructuralModel } from "../engine/contracts/structure.js";

const S = () => useKarkas.getState();
const leafCount = (m: StructuralModel) => m.blocks.flatMap((b) => b.zones).reduce((n, z) => n + leafSections(z.root).length, 0);

describe("E2E — full usta workflow (A + B + C)", () => {
  it("build → resize → divide → fill → thickness → material → hardware → CNC → save → reopen", () => {
    // ── B: start a blank carcass at the client's size (0 dan) ──
    S().setModel(buildCarcassModel(800, 2000, 500));
    expect(S().parts.length).toBe(5); // bare box: 2 sides + top + bottom + back
    expect(S().model.blocks[0]!.box).toMatchObject({ w: 8000, h: 20000, d: 5000 });

    // ── C2: live resize (height) ──
    S().resize("h", 2200);
    expect(S().model.blocks[0]!.box.h).toBe(22000);

    // ── C3: numeric divide into 2 columns, then fill with 3 shelves ──
    S().divideBy("x", 2);
    expect(leafCount(S().model)).toBe(2);
    S().addShelves(3);
    expect(S().parts.filter((p) => p.role === "internal_shelf").length).toBe(3);

    // ── A: content — a door + a drawer box ──
    S().add("door");
    S().add("drawer");
    expect(S().parts.some((p) => p.role === "facade")).toBe(true);
    expect(S().parts.some((p) => p.name.startsWith("Ящик"))).toBe(true);

    // ── C4: per-part thickness — select a shelf, make it 18mm, selection stays ──
    const shelf = S().parts.find((p) => p.role === "internal_shelf")!;
    S().tapPart(shelf.id);
    S().setThickness(18);
    expect(S().selectedId).toBe(shelf.id);
    expect(S().parts.find((p) => p.role === "internal_shelf")!.thickness_mm10).toBe(180);

    // ── A/5.C: material plan drives the price ──
    S().setPlanMaterial("facade", "mdf_white_matt");
    const est = estimate(S().parts, S().plan);
    expect(est.priceRub).toBeGreaterThan(0);
    expect(est.byMaterial.some((g) => g.name === boardById("mdf_white_matt")!.name)).toBe(true);

    // ── A/7.2: hardware counted (hinges + a drawer slide + shelf pins) ──
    const hw = hardwareEstimate(S().model);
    expect(hw.priceRub).toBeGreaterThan(0);
    expect(hw.lines.some((l) => l.name.includes("Петля"))).toBe(true);
    expect(hw.lines.some((l) => l.name.includes("Направляющая"))).toBe(true);

    // all the edits so far are undoable
    expect(S().canUndo()).toBe(true);

    // ── A: CNC export passes the safety gate + carries the decor names ──
    const xml = exportModelToSWJ008(S().model, {}, {
      facade: "МДФ Белый мат", carcass_side: "ЛДСП Белый", carcass_top: "ЛДСП Белый",
      carcass_bottom: "ЛДСП Белый", carcass_back: "ХДФ Белый (задняя)", internal_shelf: "ЛДСП Белый",
    });
    expect(xml).toContain("SWJ008");
    expect(xml).toContain('Material="МДФ Белый мат"');

    // ── B: save to «Mening bloklarim» → reopen round-trips the whole design + plan ──
    const designed = S().parts.length;
    const item = libraryItemFromKarkas("Usta bloki", S().exportProject());
    S().setModel(buildCarcassModel(400, 400, 400)); // clobber
    expect(S().parts.length).not.toBe(designed);
    S().importProject(item.karkasJson!);
    expect(S().parts.length).toBe(designed);
    expect(S().plan.facade).toBe("mdf_white_matt");

    // ── A: engineering warnings computed (no crash); import correctly reset history ──
    expect(Array.isArray(S().warnings)).toBe(true);
    expect(S().canUndo()).toBe(false); // importProject loads fresh → undo history cleared
  });
});
