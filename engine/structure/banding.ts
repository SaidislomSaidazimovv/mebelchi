// engine/structure/banding.ts — corner band-transition model (#39, E4).
//
// CONSTRUCTION_FRAME_v3 surface #39 (:135, :176, :189, :226): where a 32mm band meets a 16mm band
// at a corner, HOW they meet must be specified — "butt / mitre / overlap … emitted, not assumed".
// It is "cosmetic + cut-list precision" (:226) and is NOT expressible in the factory SWJ008 export
// (confirmed by earlier fixture research — the format carries no corner-band metadata; mitre's 45°
// geometry is a V2 item). So E4 models the CHOICE and emits a per-corner descriptor the cut-list /
// renderer can consume, without touching drilling or the SWJ008 path. Pure + Metro-safe.
//
// Face convention (SWJ008 edge faces, see solve.ts): face1 = front (Y=Width), face2 = back (Y=0),
// face3 = right (X=Length), face4 = left (X=0). face1/2 run along Length; face3/4 run along Width.

import type { BandTransition, Component } from "../contracts/structure.js";
import type { Part } from "../contracts/types.js";

export type Face = 1 | 2 | 3 | 4;

/** One panel corner where two banded edges meet, and how (#39). `over` = the face whose band runs
 *  UNBROKEN through the corner (the other butts into it); `null` for a mitre (both cut 45°). */
export interface BandCorner {
  readonly faces: readonly [Face, Face];
  readonly transition: BandTransition;
  readonly over: Face | null;
}

/** The four corners of a rectangular panel: a length edge (front/back) with a width edge (side). */
const CORNERS: readonly (readonly [Face, Face])[] = [
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
];

/** The transition a component uses at its corners (#39). Absent = "butt" (v3 default, line 189). */
export function resolveBandTransition(component?: Pick<Component, "bandTransition"> | null): BandTransition {
  return component?.bandTransition ?? "butt";
}

/**
 * Per-corner band-transition descriptors for a part (#39) — only the corners where BOTH adjacent
 * edges are actually banded. Under "butt" the length-edge band runs over (v3:189 "front band runs
 * full, side bands meet it"); under "overlap" the width-edge band runs over; under "mitre" neither
 * (both mitred). This is the "emitted, not assumed" representation the cut-list/renderer reads.
 */
export function bandCorners(part: Part, transition: BandTransition): BandCorner[] {
  const banded = (f: Face): boolean => (part.edges[f - 1] ?? 0) > 0;
  const out: BandCorner[] = [];
  for (const [lengthFace, widthFace] of CORNERS) {
    if (!banded(lengthFace) || !banded(widthFace)) continue;
    const over: Face | null =
      transition === "mitre" ? null : transition === "overlap" ? widthFace : lengthFace;
    out.push({ faces: [lengthFace, widthFace], transition, over });
  }
  return out;
}
