// M1.3b — snap-on-resize + anchor-clear. resizeFreeBoardTo snaps the GROWING face to a nearby part face
// (the same magnet as move-snap), holding the origin. And every MANUAL geometry edit (resize / move /
// rotate) DETACHES the board from its template reflow (drops `anchor`), so a hand-set size or position
// sticks through a later block resize instead of being overwritten by resolveFreePartBox.

import { describe, it, expect } from "vitest";

import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildStool } from "../engine/structure/demoModel.js";
import { resizeBlockWidth } from "../engine/structure/operations.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

/** A bare block with two boards: A at x∈[0,1000], B at x∈[9000,10000]. */
function twoBoards(): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: 20000, h: 5000, d: 5000 };
  const board = (id: string, x: number, w: number) =>
    ({ id, name: id, role: "panel" as const, thicknessAxis: "z" as const, box: { x, y: 0, z: 0, w, h: 5000, d: 300 } });
  return {
    id: "t", name: "t",
    blocks: [{
      id: "b", name: "B", box, bare: true,
      zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...box }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [],
      freeParts: [board("A", 0, 1000), board("B", 9000, 1000)],
    }],
    parts: [],
  };
}
const boardW = (id: string) => useKarkas.getState().model.blocks[0]!.freeParts!.find((f) => f.id === id)!.box.w;
const freePart = (id: string) => useKarkas.getState().model.blocks[0]!.freeParts!.find((f) => f.id === id)!;

describe("M1.3b — snap-on-resize (resizeFreeBoardTo)", () => {
  it("snaps the growing high face to a nearby board face (origin holds)", () => {
    useKarkas.getState().setModel(twoBoards());
    // grow A toward B's near face (9000): 890 mm → high edge 8900, within the 40 mm magnet of 9000 → snaps
    const res = useKarkas.getState().resizeFreeBoardTo("A", "w", 890, true);
    expect(res.snapped).toBe(true);
    expect(res.size).toBe(900); // high face pulled to 9000 → width 9000 mm10 = 900 mm
    expect(boardW("A")).toBe(9000);
  });

  it("does NOT snap when the face is out of magnet reach", () => {
    useKarkas.getState().setModel(twoBoards());
    const res = useKarkas.getState().resizeFreeBoardTo("A", "w", 200, true); // high edge 2000, far from 9000
    expect(res.snapped).toBe(false);
    expect(res.size).toBe(200);
    expect(boardW("A")).toBe(2000);
  });
});

describe("M1.3b — a manual edit detaches the board from the template reflow", () => {
  it("resize drops the anchor, so the size sticks through a later block resize", () => {
    useKarkas.getState().setModel(buildStool(400, 450, 400)); // legs are 40 mm (legSz 400 mm10), anchored
    useKarkas.getState().resizeFreeBoard("leg_fl", "w", 60); // hand-set the front-left leg to 60 mm
    expect(freePart("leg_fl").anchor).toBeUndefined(); // detached
    expect(boardW("leg_fl")).toBe(600);
    // widen the whole block — the detached leg keeps its manual width; an untouched leg still reflows
    const wider = resizeBlockWidth(useKarkas.getState().model, "stl", 8000);
    expect(wider.blocks[0]!.freeParts!.find((f) => f.id === "leg_fl")!.box.w).toBe(600); // stuck (not overwritten)
    expect(wider.blocks[0]!.freeParts!.find((f) => f.id === "leg_fr")!.box.w).toBe(400); // still reflows (anchor intact)
  });

  it("move detaches the board too", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().moveFreePart("leg_fl", { x: 100, y: 0, z: 0 }, true);
    expect(freePart("leg_fl").anchor).toBeUndefined();
  });

  it("rotate detaches the board too", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().rotateFreeBoard("top");
    expect(freePart("top").anchor).toBeUndefined();
  });

  it("an anchorless free board (addFreeBoard) resizes exactly as before — no regression", () => {
    useKarkas.getState().setModel(buildStool());
    useKarkas.getState().addFreeBoard("board");
    const id = useKarkas.getState().model.blocks[0]!.freeParts!.at(-1)!.id;
    expect(freePart(id).anchor).toBeUndefined(); // never had one
    useKarkas.getState().resizeFreeBoard(id, "w", 250);
    expect(boardW(id)).toBe(2500);
  });
});
