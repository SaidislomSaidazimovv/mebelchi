// M9U.4 — the 3-axis rotate gizmo drives setFreePartTilt / rotateFreePartTo. A drag turns the part many
// times a second, so it must open ONE undo step (the FIRST turn), then live-update. `setFreePartTilt`
// gained a `first` flag mirroring `rotateFreePartTo`; this pins that a whole drag is a single undo step,
// while a keypad entry (first defaults to true) stays one committed edit. The angle itself is render-only
// (engine invariants live in structure_freepart_rotate / structure_tilt).
import { describe, it, expect, beforeEach } from "vitest";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildDemoModel } from "../engine/structure/demoModel.js";

const s = () => useKarkas.getState();
const lastFree = () => s().model.blocks[0]!.freeParts!.at(-1)!;

beforeEach(() => { s().setModel(buildDemoModel()); s().addFreeBoard(); });

describe("M9U.4 — a gizmo rotate drag is ONE undo step", () => {
  it("setFreePartTilt: the first turn opens a step, the rest live-update (no new steps)", () => {
    const fp = lastFree();
    const base = s().past.length;
    s().setFreePartTilt(fp.id, "x", 5, true); // drag start
    const afterFirst = s().past.length;
    s().setFreePartTilt(fp.id, "x", 10, false); // dragging…
    s().setFreePartTilt(fp.id, "x", 25, false);
    expect(afterFirst).toBe(base + 1); // exactly one step opened
    expect(s().past.length).toBe(afterFirst); // …and none added while dragging
    expect(lastFree().rotX_deg).toBe(25); // the live value still lands
  });

  it("a keypad entry (first defaults to true) is its own single undo step", () => {
    const fp = lastFree();
    const base = s().past.length;
    s().setFreePartTilt(fp.id, "z", 15); // no `first` → true
    expect(s().past.length).toBe(base + 1);
    expect(lastFree().rotZ_deg).toBe(15);
  });

  it("all three axes coexist on one free part (X tilt · Y turn · Z tilt)", () => {
    const fp = lastFree();
    s().setFreePartTilt(fp.id, "x", 30, true);
    s().rotateFreePartTo(fp.id, 45, true);
    s().setFreePartTilt(fp.id, "z", 20, true);
    const f = lastFree();
    expect([f.rotX_deg, f.rotY_deg, f.rotZ_deg]).toEqual([30, 45, 20]);
  });
});
