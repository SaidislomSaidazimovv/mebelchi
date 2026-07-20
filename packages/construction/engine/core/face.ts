// The Face A/B mapping is a locked core constant (13 v2.0 failure register:
// "SWJ008 charset/face error → wrong hole type"). One place, tested.

import type { PanelFace } from "../contracts/types.js";

/** Engine face -> SWJ008 numeric Face attribute. */
export const FACE_TO_SWJ: Record<PanelFace, number> = {
  A: 5,
  B: 6,
  edge1: 1,
  edge2: 2,
  edge3: 3,
  edge4: 4,
};

/** SWJ008 numeric Face -> engine face. */
export const SWJ_TO_FACE: Record<number, PanelFace> = {
  5: "A",
  6: "B",
  1: "edge1",
  2: "edge2",
  3: "edge3",
  4: "edge4",
};

/** A/B faces are drilled perpendicular (SWJ008 Type 2); edges horizontally (Type 1). */
export function swjMachiningType(face: PanelFace): 1 | 2 {
  return face === "A" || face === "B" ? 2 : 1;
}

export function isEdgeFace(face: PanelFace): boolean {
  return swjMachiningType(face) === 1;
}
