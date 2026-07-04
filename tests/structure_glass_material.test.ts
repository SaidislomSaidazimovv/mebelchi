// Phase F1-fix — glass panes are their own role: coloured/priced as glass, and never take a board
// material override (audit finding F1).
import { describe, it, expect } from "vitest";
import { addInstance, setComponentMaterial } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { leafSections } from "../engine/contracts/structure.js";
import { partColor, partBoard, GLASS_HEX, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

const firstLeaf = (m: ReturnType<typeof buildCarcassModel>) => leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;

describe("Phase F1-fix — glass panes", () => {
  it("glazed-grid panes carry role 'glass'", () => {
    const base = buildCarcassModel(600, 720, 500);
    const parts = solveStructure(addInstance(base, firstLeaf(base), "door", { glazedGrid: { lights: 3 } }));
    expect(parts.filter((p) => p.role === "glass").length).toBe(3);
  });

  it("partColor / partBoard treat glass as glass, not a carcass board", () => {
    expect(partColor(DEFAULT_PLAN, "glass")).toBe(GLASS_HEX);
    expect(partBoard(DEFAULT_PLAN, "glass")).toBeUndefined();
    // a real board role still resolves
    expect(partBoard(DEFAULT_PLAN, "carcass_side")).toBeDefined();
  });

  it("a material override on the vitrine stamps the frame but NOT the glass", () => {
    const base = buildCarcassModel(600, 720, 500);
    let m = addInstance(base, firstLeaf(base), "door", { glazedGrid: { lights: 2 } });
    const door = m.blocks[0]!.components.find((c) => c.role === "facade")!;
    m = setComponentMaterial(m, door.id, "ldsp_wenge");
    const parts = solveStructure(m);
    expect(parts.filter((p) => p.role === "glass").every((p) => p.materialId === undefined)).toBe(true);
    expect(parts.some((p) => p.role === "facade" && p.materialId === "ldsp_wenge")).toBe(true);
  });
});
