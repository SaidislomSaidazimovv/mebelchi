// Magnetic snapping — the foundation of building furniture from nothing.
//
// Pushing boards together by hand is only workable if they CLICK. These tests pin the rule the whole
// free-assembly experience rests on: either face of the moving board may click to either face of a
// target, middles align to middles, edges never cross-match with middles, and nothing outside the pull
// distance moves at all. Units are mm10; the editor's pull is 400 (= 40 mm).

import { describe, expect, it } from "vitest";

import { snapBox, snapCandidates, snapSpan } from "../engine/structure/snap.js";
import type { Box3D } from "../engine/contracts/structure.js";

const PULL = 400; // mm10 — the editor's magnet reach
const box = (x: number, y: number, z: number, w: number, h: number, d: number): Box3D => ({ x, y, z, w, h, d });
const edges = (...at: number[]) => at.map((a) => ({ at: a, kind: "edge" as const }));

describe("snapCandidates", () => {
  it("offers both faces and the middle of each target", () => {
    const c = snapCandidates([box(0, 0, 0, 1000, 500, 600)], "x");
    expect(c.filter((k) => k.kind === "edge").map((k) => k.at).sort((a, b) => a - b)).toEqual([0, 1000]);
    expect(c.filter((k) => k.kind === "centre").map((k) => k.at)).toEqual([500]);
  });

  it("reads the right dimension per axis", () => {
    const b = [box(10, 20, 30, 100, 200, 300)];
    expect(snapCandidates(b, "x").filter((k) => k.kind === "edge").map((k) => k.at)).toEqual([10, 110]);
    expect(snapCandidates(b, "y").filter((k) => k.kind === "edge").map((k) => k.at)).toEqual([20, 220]);
    expect(snapCandidates(b, "z").filter((k) => k.kind === "edge").map((k) => k.at)).toEqual([30, 330]);
  });

  it("collapses duplicates — a flush stack must not offer one coordinate many times", () => {
    const stacked = [box(0, 0, 0, 100, 10, 10), box(0, 0, 0, 100, 10, 10), box(0, 0, 0, 100, 10, 10)];
    expect(snapCandidates(stacked, "x").filter((k) => k.kind === "edge")).toHaveLength(2);
  });

  it("returns nothing for no targets", () => {
    expect(snapCandidates([], "x")).toEqual([]);
  });
});

describe("snapSpan — which end does the clicking", () => {
  it("pulls the LOW face onto a target face", () => {
    const r = snapSpan(1030, 500, edges(1000), PULL);
    expect(r).toMatchObject({ pos: 1000, snapped: true, to: 1000, kind: "edge" });
  });

  it("pulls the HIGH face onto a target face — a board pushed from the other side", () => {
    // span [700..1200]; its high end is 1200, a face sits at 1000 → the box slides back to [500..1000]
    const r = snapSpan(700, 500, edges(1000), PULL);
    expect(r.pos).toBe(500);
    expect(r.to).toBe(1000);
  });

  it("does NOT move when the nearest face is beyond the pull", () => {
    const r = snapSpan(1500, 500, edges(1000), PULL);
    expect(r).toMatchObject({ pos: 1500, snapped: false, to: null, kind: null });
  });

  it("takes the NEAREST of several faces", () => {
    const r = snapSpan(1030, 500, edges(0, 1000, 2000), PULL);
    expect(r.pos).toBe(1000);
  });

  it("snaps exactly at the pull distance, and not one unit past it", () => {
    expect(snapSpan(1000 + PULL, 500, edges(1000), PULL).snapped).toBe(true);
    expect(snapSpan(1000 + PULL + 1, 500, edges(1000), PULL).snapped).toBe(false);
  });

  it("leaves an already-flush board exactly where it is", () => {
    const r = snapSpan(1000, 500, edges(1000), PULL);
    expect(r.pos).toBe(1000);
  });

  it("returns the input untouched when there are no candidates", () => {
    expect(snapSpan(1234, 500, [], PULL)).toMatchObject({ pos: 1234, snapped: false });
  });
});

describe("snapSpan — centres", () => {
  it("aligns middle to middle", () => {
    // moving span is 200 wide, its middle at 1120; a target middle sits at 1000 → middle lands on 1000
    const cands = [{ at: 1000, kind: "centre" as const }];
    const r = snapSpan(1020, 200, cands, PULL);
    expect(r.pos).toBe(900); // 1000 − 200/2
    expect(r.kind).toBe("centre");
  });

  it("never lets a FACE click onto a middle", () => {
    // a face 10 away from a centre-only candidate must not move at all
    const cands = [{ at: 1000, kind: "centre" as const }];
    expect(snapSpan(1010, 5000, cands, PULL).snapped).toBe(false);
  });

  it("never lets a MIDDLE click onto a face", () => {
    // the moving middle sits 10 from an edge-only candidate; only its faces may use it, and they are far
    expect(snapSpan(990 - 5000, 10000, edges(1000), PULL).snapped).toBe(false);
  });

  it("prefers a FACE when a face and a middle are equally near — flush is the common intent", () => {
    // span [1050..1150]: its low face is 50 from the edge at 1000, its middle (1100) is 50 from the
    // centre at 1150 — a genuine tie, which the edge must win
    const cands = [{ at: 1000, kind: "edge" as const }, { at: 1150, kind: "centre" as const }];
    const r = snapSpan(1050, 100, cands, PULL);
    expect(r.kind).toBe("edge");
    expect(r.pos).toBe(1000);
  });
});

describe("snapBox — a whole board against its neighbours", () => {
  const table = box(0, 6800, 0, 12000, 400, 7000); // a table top: 1200 × 700, 40 thick, at height 680

  it("clicks a leg up under the top — the move that builds a table", () => {
    // a 680-tall leg standing 5 mm too high: its TOP is at 6850, the top's underside at 6800
    const leg = box(120, 50, 130, 500, 6800, 500);
    const r = snapBox(leg, [table], PULL);
    expect(r.snapped.y).toBe(true);
    expect(r.y + leg.h).toBe(table.y); // the leg's TOP now meets the top's underside
    expect(r.x).toBe(0); // and its sides pull flush to the top's edges
    expect(r.z).toBe(0);
  });

  it("judges each axis on its own — near on one, free on the others", () => {
    const b = box(20, 60000, 60000, 500, 500, 500); // x is close, y and z are far away
    const r = snapBox(b, [table], PULL);
    expect(r.snapped).toEqual({ x: true, y: false, z: false });
    expect(r.x).toBe(0);
    expect(r.y).toBe(60000);
    expect(r.z).toBe(60000);
  });

  it("aligns a second leg to the first — the move that repeats it", () => {
    const legA = box(0, 0, 0, 500, 6800, 500);
    const legB = box(11480, 0, 30, 500, 6800, 500); // meant for the far corner, 3 mm out in z
    const r = snapBox(legB, [legA], PULL);
    expect(r.z).toBe(0); // pulled into line with the first leg
  });

  it("never snaps a board to itself", () => {
    const b = box(137, 251, 373, 500, 500, 500);
    const r = snapBox(b, [b], PULL);
    expect([r.x, r.y, r.z]).toEqual([137, 251, 373]);
    expect(r.snapped).toEqual({ x: false, y: false, z: false });
  });

  it("leaves a board alone in an EMPTY document — nothing to click to", () => {
    const b = box(500, 500, 500, 100, 100, 100);
    const r = snapBox(b, [], PULL);
    expect([r.x, r.y, r.z]).toEqual([500, 500, 500]);
  });

  it("is idempotent — snapping an already-snapped board changes nothing", () => {
    const leg = box(120, 6750, 130, 500, 6800, 500);
    const once = snapBox(leg, [table], PULL);
    const twice = snapBox({ ...leg, x: once.x, y: once.y, z: once.z }, [table], PULL);
    expect([twice.x, twice.y, twice.z]).toEqual([once.x, once.y, once.z]);
  });

  it("does not mutate the input box", () => {
    const b = box(120, 6750, 130, 500, 6800, 500);
    const snapshot = { ...b };
    snapBox(b, [table], PULL);
    expect(b).toEqual(snapshot);
  });

  it("picks the nearest neighbour when several are in reach", () => {
    const near = box(1000, 0, 0, 100, 100, 100);
    const far = box(1350, 0, 0, 100, 100, 100);
    const moving = box(1080, 0, 0, 100, 100, 100); // 20 from `near`'s high face, 270 from `far`'s low
    expect(snapBox(moving, [near, far], PULL).x).toBe(1100);
  });
});
