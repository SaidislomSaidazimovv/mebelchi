// three/handles.ts — Phase 1.3d. Derive world-space handle FITTINGS (bar/knob placements) from the
// Ø4.5 handle screw holes the drilling pass already emits (1.3b). The holes ARE the single source of
// truth: `handleScrewPattern` stamps each with an id `handle_<panel>_<i>`, so a fitting can never drift
// from the drilling — move the holes and the 3D handle follows for free.
//
// This is a RENDER derivation, not a manufacturing one, so it lives app-side (it reuses blockHoles +
// layoutBounds, both app-side) rather than in the pure engine. `buildHandleGroup` (structureRenderer)
// turns these fittings into meshes.

import type { Part } from "../../../../engine/contracts/types.js";
import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import { blockHoles, type HoleMarker } from "./blockHoles.js";
import { layoutBounds } from "./structureScene.js";

export type HandleKind = "bow" | "knob";

/** One handle to draw: its screw seats (mm, placement space), the outward normal, and — for a bow — the
 *  unit axis its bar runs along (seat-to-seat). Everything is in the SAME space blockHoles reports. */
export interface HandleFitting {
  /** the door / drawer-front part this handle sits on */
  id: string;
  kind: HandleKind;
  /** screw seat centres in mm, placement space (as blockHoles reports them) */
  seats: [number, number, number][];
  /** the board-thickness axis the handle stands off along */
  normal: "x" | "y" | "z";
  /** unit vector pointing OUT of the door face (away from the layout centre) */
  out: [number, number, number];
  /** unit vector along the bar (bow only; undefined for a knob) */
  along?: [number, number, number];
}

const pick = (v: [number, number, number], a: "x" | "y" | "z"): number => (a === "x" ? v[0] : a === "y" ? v[1] : v[2]);

/** Handle fittings for a solved+drilled model. Empty when nothing carries a handle → an empty render group,
 *  so a handle-less model looks byte-identical to today. */
export function handleFittings(parts: readonly Part[], places: readonly PanelPlacement[]): HandleFitting[] {
  const holes = blockHoles(parts, places).filter((h) => h.opId.startsWith("handle_"));
  if (holes.length === 0) return [];
  const b = layoutBounds(places); // ctr in mm10; hole coords are in mm → ×10 to compare
  const ctr = { x: b.ctrX, y: b.ctrY, z: b.ctrZ };

  const byPart = new Map<string, HoleMarker[]>();
  for (const h of holes) {
    const list = byPart.get(h.partId);
    if (list) list.push(h);
    else byPart.set(h.partId, [h]);
  }

  const out: HandleFitting[] = [];
  for (const [partId, hs] of byPart) {
    const seats = hs.map((h) => [h.x, h.y, h.z] as [number, number, number]);
    const normal = hs[0]!.normal;
    // Outward = away from the layout centre along the thin axis (mirrors buildHoleMarkers' inner/outer
    // test, flipped: a marker sits on the INNER face, a handle stands off the OUTER one).
    const sign = pick(seats[0]!, normal) * 10 >= ctr[normal] ? 1 : -1;
    const outV: [number, number, number] = [normal === "x" ? sign : 0, normal === "y" ? sign : 0, normal === "z" ? sign : 0];
    const kind: HandleKind = seats.length >= 2 ? "bow" : "knob";
    let along: [number, number, number] | undefined;
    if (kind === "bow") {
      const [a, c] = [seats[0]!, seats[1]!];
      const d: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      along = [d[0] / len, d[1] / len, d[2] / len];
    }
    out.push({ id: partId, kind, seats, normal, out: outV, along });
  }
  return out;
}
