// M3.4 — materialCategory groups a board for the swatch picker from its finish/texture (not a stored
// field). Every BOARDS entry lands in exactly one of the six groups.

import { describe, it, expect } from "vitest";

import { materialCategory, boardById, BOARDS } from "../apps/app/src/three/materials.js";

const cat = (id: string) => materialCategory(boardById(id)!);

describe("M3.4 — materialCategory", () => {
  it("plain laminates → Laminat", () => {
    expect(cat("ldsp_white")).toBe("Laminat");
    expect(cat("mdf_white_matt")).toBe("Laminat");
    expect(cat("mdf_white_gloss")).toBe("Laminat"); // gloss laminate is still a laminate colour
  });

  it("wood-look ЛДСП decors → Yog'och", () => {
    expect(cat("ldsp_sonoma")).toBe("Yog'och");
    expect(cat("ldsp_wenge")).toBe("Yog'och");
    expect(cat("wood_oak")).toBe("Yog'och");
  });

  // M8.7 — real solid timber reads as «Massiv», NOT the wood-look «Yog'och», even though it draws with
  // the same wood texture: the usta must see the difference, because the price and the reality differ.
  it("solid timber → Massiv (wins over the wood texture)", () => {
    expect(cat("massiv_emand")).toBe("Massiv");
    expect(cat("massiv_yongoq")).toBe("Massiv");
    expect(cat("massiv_terak")).toBe("Massiv");
    // and it still carries the wood texture for the renderer
    expect(boardById("massiv_emand")!.texture).toBe("wood");
    expect(boardById("massiv_emand")!.solid).toBe(true);
  });

  it("a wood-look ЛДСП is NOT solid", () => {
    expect(boardById("ldsp_sonoma")!.solid).toBeUndefined();
    expect(cat("ldsp_sonoma")).not.toBe("Massiv");
  });

  it("glass / frosted → Shisha", () => {
    expect(cat("glass_clear")).toBe("Shisha");
    expect(cat("glass_frost")).toBe("Shisha");
    expect(cat("glass_tint")).toBe("Shisha");
  });

  it("metal / mirror → Metall", () => {
    expect(cat("mirror")).toBe("Metall");
    expect(cat("metal_gold")).toBe("Metall");
    expect(cat("metal_brushed")).toBe("Metall");
  });

  it("marble → Marmar; leather/fabric → Mato", () => {
    expect(cat("marble_white")).toBe("Marmar");
    expect(cat("leather_brown")).toBe("Mato");
    expect(cat("fabric_grey")).toBe("Mato");
  });

  it("every board resolves to one of the seven groups", () => {
    const groups = new Set(["Massiv", "Laminat", "Yog'och", "Shisha", "Metall", "Marmar", "Mato"]);
    for (const b of BOARDS) expect(groups.has(materialCategory(b))).toBe(true);
  });

  it("there are ten solid-timber species, all priced above the wood-look ЛДСП", () => {
    const massiv = BOARDS.filter((b) => b.solid);
    expect(massiv.length).toBe(10);
    const ldspWood = boardById("ldsp_sonoma")!.pricePerM2;
    expect(massiv.every((b) => b.pricePerM2 > ldspWood)).toBe(true);
  });
});
