// M9U.5 — «⇩ Yerga» (Moblo «Put on ground»). Dropping a free board onto the block floor is a PLACEMENT
// act, not a manufacturing one: the panel keeps its cut, so the spec and the CNC file never see it. The
// button promises the FLOOR, so it is exact — the magnetic drag is what lands a board on a shelf.
import { describe, it, expect, beforeEach } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";

const s = () => useKarkas.getState();
const lastFree = () => s().model.blocks[0]!.freeParts!.at(-1)!;
/** the cut list reduced to what actually reaches the saw */
const cuts = () => JSON.stringify(solveStructure(s().model).map((p) => [p.id, p.width_mm10, p.length_mm10, p.thickness_mm10]));

beforeEach(() => { s().setModel(buildDemoModel()); s().addFreeBoard(); });

describe("M9U.5 — «⇩ Yerga» drops a free part onto the block floor", () => {
  it("the board's LOW edge lands at y = 0; x/z are untouched; ONE undo step", () => {
    const fp = lastFree();
    s().moveFreePart(fp.id, { x: 0, y: 500, z: 0 }, true); // lift it off the floor first
    const lifted = lastFree();
    expect(lifted.box.y).toBeGreaterThan(0);
    const { x, z } = lifted.box;

    const before = s().past.length;
    s().putFreePartOnGround(fp.id);
    const f = lastFree();
    expect(f.box.y).toBe(0);
    expect([f.box.x, f.box.z]).toEqual([x, z]); // only the vertical moved
    expect(s().past.length).toBe(before + 1); // exactly one undo step
  });

  it("a part already on the floor is a no-op (no dead undo step)", () => {
    const fp = lastFree();
    s().putFreePartOnGround(fp.id); // addFreeBoard already drops it at the floor
    const base = s().past.length;
    s().putFreePartOnGround(fp.id);
    expect(s().past.length).toBe(base);
    expect(lastFree().box.y).toBe(0);
  });

  it("a LOCKED part refuses, like every other free-part edit", () => {
    const fp = lastFree();
    s().moveFreePart(fp.id, { x: 0, y: 500, z: 0 }, true);
    s().setFreePartView(fp.id, "locked", true);
    const y = lastFree().box.y;
    s().putFreePartOnGround(fp.id);
    expect(lastFree().box.y).toBe(y); // unchanged
  });

  it("render-only: dropping a part changes NOTHING that is cut", () => {
    const fp = lastFree();
    s().moveFreePart(fp.id, { x: 0, y: 500, z: 0 }, true);
    const lifted = cuts();
    s().putFreePartOnGround(fp.id);
    expect(cuts()).toBe(lifted); // same panels, same dimensions — only the placement moved
  });
});
