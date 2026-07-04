// E4 — corner band-transition model (#39). bandCorners emits, per panel corner where two edges are
// banded, how the bands meet (butt / mitre / overlap) and which runs over — "emitted, not assumed"
// (v3:189). Cosmetic + cut-list precision; not in SWJ008. resolveBandTransition defaults to butt.

import { describe, expect, it } from "vitest";

import { bandCorners, resolveBandTransition } from "../engine/structure/banding.js";
import type { Part } from "../engine/contracts/types.js";

/** A rectangular part with the given per-face band thicknesses (0 = unbanded). */
function part(edges: [number, number, number, number]): Part {
  return { id: "p", name: "P", length_mm10: 8000, width_mm10: 4000, thickness_mm10: 160, grain: "NONE", edges, operations: [] };
}

const ALL: [number, number, number, number] = [10, 10, 10, 10];

describe("E4 — corner band-transition (#39)", () => {
  it("defaults to butt when no transition is declared", () => {
    expect(resolveBandTransition(undefined)).toBe("butt");
    expect(resolveBandTransition(null)).toBe("butt");
    expect(resolveBandTransition({ bandTransition: "mitre" })).toBe("mitre");
  });

  it("a fully-banded panel has four corners; butt runs the length band over", () => {
    const c = bandCorners(part(ALL), "butt");
    expect(c).toHaveLength(4);
    // every corner pairs a length face (1|2) with a width face (3|4); the length band runs over
    for (const corner of c) {
      expect([1, 2]).toContain(corner.faces[0]);
      expect([3, 4]).toContain(corner.faces[1]);
      expect(corner.over).toBe(corner.faces[0]); // length edge runs full (v3:189)
    }
  });

  it("overlap runs the width band over instead; mitre runs neither", () => {
    for (const corner of bandCorners(part(ALL), "overlap")) {
      expect(corner.over).toBe(corner.faces[1]); // width edge runs over
    }
    for (const corner of bandCorners(part(ALL), "mitre")) {
      expect(corner.over).toBeNull(); // both mitred
    }
  });

  it("only counts corners where BOTH edges are banded", () => {
    expect(bandCorners(part([10, 0, 0, 0]), "butt")).toHaveLength(0); // front only → no corner
    const one = bandCorners(part([10, 0, 10, 0]), "butt"); // front + right
    expect(one).toHaveLength(1);
    expect(one[0]!.faces).toEqual([1, 3]);
  });
});
