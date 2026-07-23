// M8.4 — pick several free parts and act on them at once: four legs get one decor, three offcuts go in
// one tap. Moblo has a selection tool; on a phone the tap IS the tool.
//
// Two things can go wrong here and both are in these tests: a batch that leaves a locked part unprotected
// (the lock means «leave this one alone», batch or not), and a batch that costs one undo step per part —
// an usta who deletes four legs and taps undo expects four legs back, not one.

import { describe, it, expect, beforeEach } from "vitest";

import { buildTable } from "../engine/structure/demoModel.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const st = () => useKarkas.getState();
const freeParts = () => st().model.blocks[0]!.freeParts ?? [];
const legIds = () => freeParts().filter((f) => f.id.startsWith("leg_")).map((f) => f.id);

/** The table template: a top and four legs — exactly the shape this feature exists for. */
const load = (m: StructuralModel = buildTable(1200, 750, 700)) => { st().setModel(m); st().setMultiMode(true); };

beforeEach(() => load());

describe("M8.4 — ticking parts", () => {
  it("a tap adds, a second tap removes", () => {
    st().toggleMulti("leg_fl");
    expect(st().multiIds).toEqual(["leg_fl"]);
    st().toggleMulti("leg_fl");
    expect(st().multiIds).toEqual([]);
  });

  it("leaving the mode clears the pick — a stale selection must never act by surprise", () => {
    st().toggleMulti("leg_fl");
    st().setMultiMode(false);
    expect(st().multiIds).toEqual([]);
  });
});

describe("M8.4 — one batch, one step", () => {
  it("deletes every ticked part", () => {
    const before = freeParts().length;
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiDelete();
    expect(freeParts().length).toBe(before - 4);
    expect(legIds()).toEqual([]);
  });

  it("ONE undo brings all four legs back (not one)", () => {
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiDelete();
    expect(legIds().length).toBe(0);
    st().undo();
    expect(legIds().length).toBe(4);
  });

  it("gives every ticked part the same decor in one step", () => {
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiSetMaterial("wood_oak");
    expect(freeParts().filter((f) => f.material === "wood_oak").length).toBe(4);
    st().undo();
    expect(freeParts().filter((f) => f.material === "wood_oak").length).toBe(0);
  });

  it("clearing the decor removes the field rather than storing an empty one", () => {
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiSetMaterial("wood_oak");
    st().multiSetMaterial(null);
    expect(freeParts().every((f) => !("material" in f))).toBe(true);
  });

  it("hides and locks every ticked part", () => {
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiSetView("hidden", true);
    expect(freeParts().filter((f) => f.hidden).length).toBe(4);
    st().multiSetView("hidden", false);
    expect(freeParts().filter((f) => f.hidden).length).toBe(0);
  });
});

describe("M8.4 — a pick belongs to ONE project", () => {
  it("loading another model clears it", () => {
    st().toggleMulti("leg_fl");
    st().setModel(buildTable(900, 750, 600));
    expect(st().multiIds).toEqual([]);
  });

  // Found by Antigravity's review of M8.4: importProject swaps the model too, and its ids mean something
  // else in the new file — a batch action would have landed on a part the usta never chose.
  it("IMPORTING another project clears it (and the block tick with it)", () => {
    st().toggleMulti("leg_fl");
    st().toggleBlockSel("tbl");
    st().importProject(JSON.stringify({ model: buildTable(900, 750, 600) }));
    expect(st().multiIds).toEqual([]);
    expect(st().selectedBlockIds).toEqual([]);
  });
});

describe("M8.4 — the lock still means «leave this one alone»", () => {
  it("a locked part survives a batch delete, the rest go", () => {
    st().setFreePartView("leg_fl", "locked", true);
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiDelete();
    expect(legIds()).toEqual(["leg_fl"]);
  });

  it("the untouched part stays ticked, so the usta sees what refused", () => {
    st().setFreePartView("leg_fl", "locked", true);
    legIds().forEach((id) => st().toggleMulti(id));
    st().multiDelete();
    expect(st().multiIds).toEqual(["leg_fl"]);
  });

  it("nothing ticked → every batch action is a no-op (no dead undo step)", () => {
    const before = JSON.stringify(st().model);
    st().multiDelete();
    st().multiSetMaterial("wood_oak");
    st().multiSetView("hidden", true);
    expect(JSON.stringify(st().model)).toBe(before);
  });
});
