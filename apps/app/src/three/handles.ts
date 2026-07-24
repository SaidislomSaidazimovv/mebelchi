// three/handles.ts — Phase 1.3d. Derive world-space handle FITTINGS (bar/knob placements) from the
// Ø4.5 handle screw holes the drilling pass already emits (1.3b). The holes ARE the single source of
// truth: `handleScrewPattern` stamps each with an id `handle_<panel>_<i>`, so a fitting can never drift
// from the drilling — move the holes and the 3D handle follows for free.
//
// This is a RENDER derivation, not a manufacturing one, so it lives app-side (it reuses blockHoles +
// layoutBounds, both app-side) rather than in the pure engine. `buildHandleGroup` (structureRenderer)
// turns these fittings into meshes.

import type { Part } from "../../../../engine/contracts/types.js";
import type { HandleType, StructuralModel } from "../../../../engine/contracts/structure.js";
import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import { blockHoles, type HoleMarker } from "./blockHoles.js";
import { layoutBounds } from "./structureScene.js";

/** The handle shapes the renderer can DRAW. `profile`/`gola` are glued-on lips: they drill nothing, so no
 *  fitting is ever derived for them and they never appear here (M9E.4). */
export type HandleKind = "bow" | "knob" | "round_knob" | "long_pull";

/** M9E.4 — the instance id inside a solved part id (`<block>__inst_<id>__<part>`), or null when the part
 *  is not an instance's. The handle KIND lives on the instance's component; the drill holes don't carry it. */
function instIdOf(partId: string): string | null {
  const marker = "__inst_";
  const i = partId.indexOf(marker);
  if (i === -1) return null;
  const rest = partId.slice(i + marker.length);
  const end = rest.indexOf("__");
  return end === -1 ? rest : rest.slice(0, end);
}

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
export function handleFittings(parts: readonly Part[], places: readonly PanelPlacement[], model?: StructuralModel): HandleFitting[] {
  const holes = blockHoles(parts, places).filter((h) => h.opId.startsWith("handle_"));
  if (holes.length === 0) return [];
  const b = layoutBounds(places); // ctr in mm10; hole coords are in mm → ×10 to compare
  const ctr = { x: b.ctrX, y: b.ctrY, z: b.ctrZ };
  // M9E.4 — the screw COUNT alone cannot tell a bow from a long pull (both drill a pair) or a knob from a
  // brass round knob (both drill one), so when the model is at hand read the component's declared handle and
  // draw exactly that. Without a model we fall back to the old count rule, so every existing caller is
  // byte-identical.
  const handleByInst = new Map<string, HandleType>();
  if (model) {
    for (const blk of model.blocks) {
      for (const inst of blk.instances) {
        const h = blk.components.find((c) => c.id === inst.componentId)?.handle;
        if (h) handleByInst.set(inst.id, h);
      }
    }
  }

  const placeById = new Map(places.map((p) => [p.id, p]));
  const byPart = new Map<string, HoleMarker[]>();
  for (const h of holes) {
    const list = byPart.get(h.partId);
    if (list) list.push(h);
    else byPart.set(h.partId, [h]);
  }

  const out: HandleFitting[] = [];
  for (const [partId, hs] of byPart) {
    let seats = hs.map((h) => [h.x, h.y, h.z] as [number, number, number]);
    const normal = hs[0]!.normal;
    // Outward = away from the layout centre along the thin axis (mirrors buildHoleMarkers' inner/outer
    // test, flipped: a marker sits on the INNER face, a handle stands off the OUTER one).
    const sign = pick(seats[0]!, normal) * 10 >= ctr[normal] ? 1 : -1;
    let outV: [number, number, number] = [normal === "x" ? sign : 0, normal === "y" ? sign : 0, normal === "z" ? sign : 0];
    const declared = handleByInst.get(instIdOf(partId) ?? "");
    const kind: HandleKind = declared === "bow" || declared === "knob" || declared === "round_knob" || declared === "long_pull"
      ? declared
      : seats.length >= 2 ? "bow" : "knob"; // no model (or a lip profile) → the old screw-count rule
    let along: [number, number, number] | undefined;
    if (kind === "bow" || kind === "long_pull") { // both are BARS — they need the seat-to-seat axis
      const [a, c] = [seats[0]!, seats[1]!];
      const d: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      along = [d[0] / len, d[1] / len, d[2] / len];
    }
    // 2.1d — if the door renders OPEN (a lift facade carries rotX_deg), the handle must FOLLOW the tilt or
    // it floats where the closed door was. Rotate the seats + out + along about the door's TOP-FRONT edge by
    // the SAME angle the renderer turns the board (mesh.rotation.x = −rotX; see structureRenderer rotX path).
    const pl = placeById.get(partId);
    if (pl?.rotX_deg) {
      const ang = -(pl.rotX_deg * Math.PI) / 180;
      const cy = (pl.y_mm10 + pl.h_mm10) / 10; // top edge (mm)
      const cz = pl.z_mm10 / 10; // front face (mm)
      const co = Math.cos(ang), si = Math.sin(ang);
      const rotPt = (p: [number, number, number]): [number, number, number] => {
        const dy = p[1] - cy, dz = p[2] - cz;
        return [p[0], cy + dy * co - dz * si, cz + dy * si + dz * co];
      };
      const rotVec = (v: [number, number, number]): [number, number, number] => [v[0], v[1] * co - v[2] * si, v[1] * si + v[2] * co];
      seats = seats.map(rotPt);
      outV = rotVec(outV);
      if (along) along = rotVec(along);
    }
    out.push({ id: partId, kind, seats, normal, out: outV, along });
  }
  return out;
}
