// M9E.5 — «⛓ Ajratish»: hand a carcass board over to free placement. The rule-driven board leaves the
// shell and an identical FREE board takes its exact place, so the piece looks unchanged the instant it is
// detached and the cut list keeps the same panels — the board only moves from the carcass group to the
// free-part group. From then on it drags, turns and tilts like any free part, and a block resize no longer
// reflows it (standing outside the reflow is the whole point).
import { describe, it, expect, beforeEach } from "vitest";

import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { DetachableSlot } from "../engine/structure/operations.js";

const s = () => useKarkas.getState();
const tk = planThickness(DEFAULT_PLAN);
const blk = () => s().model.blocks[0]!;
/** the cut list reduced to what the saw sees — ids change on detach, the CUTS must not */
const cutSig = () => solveStructure(s().model, tk).map((p) => `${p.width_mm10}x${p.length_mm10}x${p.thickness_mm10}`).sort().join("|");
const price = () => estimate(solveStructure(s().model, tk), DEFAULT_PLAN).priceUzs;
const detach = (partId: string, slot: DetachableSlot) => { s().tapPart(partId); s().detachCarcassPanel(slot); };

beforeEach(() => { s().setModel(buildCarcassModel(600, 720, 560)); });

describe("M9E.5 — a detached carcass board", () => {
  it("leaves the shell and lands in its EXACT place as a free board, already selected", () => {
    const was = solveLayout(s().model, tk).find((p) => p.id === "blk_main__side_l")!;
    detach("blk_main__side_l", "sideL");

    expect(blk().shell?.sideL).toBe(false); // the solver no longer emits it
    const fp = blk().freeParts!.at(-1)!;
    expect(fp.box).toEqual({ x: was.x_mm10, y: was.y_mm10, z: was.z_mm10, w: was.w_mm10, h: was.h_mm10, d: was.d_mm10 });
    expect(s().selectedId).toBe(`blk_main__free_${fp.id}`); // ready to drag straight away
  });

  it("the cut list and the price do not move — the same panels, cut the same way", () => {
    const cuts = cutSig(), was = price();
    detach("blk_main__side_l", "sideL");
    expect(cutSig()).toBe(cuts);
    expect(price()).toBe(was);
  });

  it("all five shell boards can be detached, and each keeps its own cut", () => {
    const cuts = cutSig();
    const slots: [string, DetachableSlot][] = [
      ["blk_main__side_l", "sideL"], ["blk_main__side_r", "sideR"],
      ["blk_main__top", "top"], ["blk_main__bottom", "bottom"], ["blk_main__back", "back"],
    ];
    for (const [id, slot] of slots) detach(id, slot);
    expect(blk().freeParts).toHaveLength(5);
    expect(blk().shell).toEqual({ sideL: false, sideR: false, top: false, bottom: false, back: false });
    expect(cutSig()).toBe(cuts); // every panel still cut, none lost or duplicated
  });

  it("is free of the reflow — a block resize no longer stretches it", () => {
    detach("blk_main__side_l", "sideL");
    const before = { ...blk().freeParts!.at(-1)!.box };
    s().resize("w", 900); // the cabinet grows…
    expect(blk().box.w).toBe(9000);
    expect(blk().freeParts!.at(-1)!.box).toEqual(before); // …the detached board stays put
  });

  it("can then be moved by hand like any free board", () => {
    detach("blk_main__side_l", "sideL");
    const fp = blk().freeParts!.at(-1)!;
    const y0 = fp.box.y;
    s().moveFreePart(fp.id, { x: 0, y: 300, z: 0 }, true);
    expect(blk().freeParts!.at(-1)!.box.y).toBe(y0 + 300);
  });

  it("undo puts the board back into the carcass", () => {
    detach("blk_main__side_l", "sideL");
    expect(blk().shell?.sideL).toBe(false);
    s().undo();
    expect(blk().shell?.sideL).toBeUndefined();
    expect(blk().freeParts ?? []).toHaveLength(0);
  });

  it("a model whose boards were never detached is untouched", () => {
    expect(blk().shell).toBeUndefined();
    expect(blk().freeParts ?? []).toHaveLength(0);
  });
});
