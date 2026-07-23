// M8.5 — the cabinet's OWN boards finally get a voice. Until now the side, top, bottom and back were
// the only parts an usta could say nothing about: they are not Components, so they took no note, could
// not be hidden to look inside, and followed their role's decor with no way to make just this one
// different.
//
// Everything here is documentation or view state. The failure this file guards is the same one M7.4
// named and is worse here, because these are the cabinet's structural boards: a HIDDEN side must still
// be cut, drilled, priced and exported. Hiding a wall to look inside must never mean the wall is not
// built.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel, buildLCornerModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { carcassSlotOf } from "../apps/app/src/three/karkasStore.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { Block, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const cab = (panels?: Block["panels"]): StructuralModel => {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  return { ...m, blocks: [panels ? { ...b, panels } : b] };
};
const part = (m: StructuralModel, id: string) => solveStructure(m, tk).find((p) => p.id === id);

describe("M8.5 — which board an id names", () => {
  for (const [id, slot] of [
    ["blk_main__side_l", "sideL"], ["blk_main__side_r", "sideR"], ["blk_main__top", "top"],
    ["blk_main__bottom", "bottom"], ["blk_main__back", "back"], ["blk_main__plinth", "plinth"],
    ["blk_main__worktop", "worktop"],
  ] as const) {
    it(`${id} → ${slot}`, () => expect(carcassSlotOf(id)).toBe(slot));
  }

  it("an L-corner's two legs and the two worktop halves resolve to the SAME slot — one override covers both", () => {
    expect(carcassSlotOf("blk__legA__side_l")).toBe("sideL");
    expect(carcassSlotOf("blk__legB__side_l")).toBe("sideL");
    expect(carcassSlotOf("blk__worktop_a")).toBe("worktop");
    expect(carcassSlotOf("blk__worktop_b")).toBe("worktop");
  });

  it("a shelf, a free part or a divider is not a carcass board", () => {
    expect(carcassSlotOf("blk_main__inst_l1")).toBeNull();
    expect(carcassSlotOf("blk_main__free_leg")).toBeNull();
    expect(carcassSlotOf("blk_main__div_x1")).toBeNull();
  });
});

describe("M8.5 — a note and a decor reach the board", () => {
  it("the note lands on the part, and from there on the cut list and the drawing", () => {
    expect(part(cab({ back: { note: "ХДФ, mijozniki" } }), "blk_main__back")!.note).toBe("ХДФ, mijozniki");
  });

  it("a per-board decor overrides the role's decor for THAT board only", () => {
    const m = cab({ sideL: { material: "wood_walnut" } });
    expect(part(m, "blk_main__side_l")!.materialId).toBe("wood_walnut");
    expect(part(m, "blk_main__side_r")!.materialId).toBeUndefined(); // the other side is untouched
  });

  it("every slot works, including the plinth and the worktop", () => {
    const withExtras = (): StructuralModel => {
      const m = cab({ plinth: { note: "sokol" }, worktop: { note: "stol usti" }, top: { note: "tepa" } });
      const b = m.blocks[0]!;
      return { ...m, blocks: [{ ...b, plinth_mm10: 1000, worktop: true }] };
    };
    const parts = solveStructure(withExtras(), tk);
    expect(parts.find((p) => p.id === "blk_main__plinth")!.note).toBe("sokol");
    expect(parts.find((p) => p.id === "blk_main__worktop")!.note).toBe("stol usti");
    expect(parts.find((p) => p.id === "blk_main__top")!.note).toBe("tepa");
  });

  it("on an L-corner block one entry covers BOTH legs (as `shell` does)", () => {
    const m = buildLCornerModel();
    const b = m.blocks[0]!;
    const parts = solveStructure({ ...m, blocks: [{ ...b, panels: { top: { note: "ikkalasi" } }, footprint: b.footprint }] }, tk);
    const tops = parts.filter((p) => p.id.endsWith("__top"));
    expect(tops.length).toBeGreaterThan(1);
    expect(tops.every((p) => p.note === "ikkalasi")).toBe(true);
  });
});

describe("M8.5 — HIDDEN is the view only: the board is still built", () => {
  const hidden = cab({ sideL: { hidden: true } });

  it("the placement is marked, so the viewport can skip it", () => {
    expect(solveLayout(hidden, tk).find((p) => p.id === "blk_main__side_l")!.hidden).toBe(true);
  });

  it("…but it is STILL cut, still priced and still in the CNC file (the dangerous one)", () => {
    const e = estimate(solveStructure(hidden, tk), DEFAULT_PLAN);
    const plain = estimate(solveStructure(cab(), tk), DEFAULT_PLAN);
    expect(e.parts.some((p) => p.id === "blk_main__side_l")).toBe(true);
    expect(e.count).toBe(plain.count);
    expect(e.priceUzs).toBe(plain.priceUzs);
    expect(exportModelToSWJ008(hidden)).toContain("blk_main__side_l");
  });

  it("its holes are drilled exactly as before", () => {
    const ops = (m: StructuralModel) => JSON.stringify(solveModelToParts(m).find((p) => p.id === "blk_main__side_l")!.operations);
    expect(ops(hidden)).toBe(ops(cab()));
  });
});

describe("M8.5 — absent = byte-identical, and it composes with the shell", () => {
  it("no panels map → every part and placement is what it was before M8.5", () => {
    expect(JSON.stringify(solveStructure(cab({}), tk))).toBe(JSON.stringify(solveStructure(cab(), tk)));
    expect(JSON.stringify(solveLayout(cab({}), tk))).toBe(JSON.stringify(solveLayout(cab(), tk)));
  });

  it("an override on a board the SHELL removed changes nothing and throws nothing", () => {
    const m = cab({ back: { note: "yozildi", hidden: true } });
    const b = m.blocks[0]!;
    const noBack = { ...m, blocks: [{ ...b, shell: { back: false } }] };
    expect(solveStructure(noBack, tk).some((p) => p.id === "blk_main__back")).toBe(false);
    expect(solveLayout(noBack, tk).some((p) => p.id === "blk_main__back")).toBe(false);
  });
});
