// Step-aware mounting (blocker #7, CONSTRUCTION_FRAME_v3 Piece 3): a part meeting a partially-
// doubled top's underside resolves to the REAL plane it touches — 32mm under the front strip,
// 16mm behind the step. This is the resolution core; wiring real pedestal/blade parts to it needs
// a mounting-relationship field (follow-up). v3-authoritative (deep research: #7 is v3-only).

import { describe, expect, it } from "vitest";

import { undersidePlaneAt, BOARD_MM10 } from "../engine/structure/solve.js";

describe("step-aware mounting resolution", () => {
  const W = 5600; // 560mm-deep top
  const FRONT = 1000; // 100mm doubled front strip → the step sits at W − FRONT = 4600

  it("resolves 16mm behind the step (the real plane a pedestal rests on)", () => {
    expect(undersidePlaneAt(W, FRONT, 0)).toBe(BOARD_MM10); // 160 = 16mm
    expect(undersidePlaneAt(W, FRONT, 4000)).toBe(BOARD_MM10);
    expect(undersidePlaneAt(W, FRONT, 4599)).toBe(BOARD_MM10);
  });

  it("resolves 32mm under the front strip (the oversail region)", () => {
    expect(undersidePlaneAt(W, FRONT, 4600)).toBe(2 * BOARD_MM10); // 320 = 32mm at the step
    expect(undersidePlaneAt(W, FRONT, 5600)).toBe(2 * BOARD_MM10); // front edge
  });
});
