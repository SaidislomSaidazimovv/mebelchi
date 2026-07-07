// three/blockHoles.ts — drilling holes as 3D markers (imos "shows the borings"). PURE: turns the
// DRILLED parts (solveModelToParts → Part.operations) + the render placements (solveLayout) into
// world-positioned circles, so both the 3D block and the 2D drawing can show where the machine
// drills. Only FACE holes (A/B: Ø5 shelf pins, Ø35 hinge cups) are surfaced — edge borings live
// inside the joints and never show on a face.
//
// Mapping (derived from real solveModelToParts data, role-agnostic): a placement box has one THIN
// axis = the panel thickness = the hole's NORMAL; of the other two, the axis whose extent matches
// part.length carries the hole's face-local x, the other carries y. So a side panel (thin = X) drills
// into the depth/height plane; a door (thin = Z) into the width/height plane — no per-role code.

import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import type { Part } from "../../../../engine/contracts/types.js";

export interface HoleMarker {
  /** centre in block millimetres */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** hole radius (mm) */
  readonly r: number;
  /** the panel-thickness axis the hole drills along → which 2D view it shows in */
  readonly normal: "x" | "y" | "z";
  /** Step 7c — the part + operation this marker came from, and its face-local mm10 position, so a tap can
   *  select the individual hole and a move re-keys the model override. */
  readonly partId: string;
  readonly opId: string;
  readonly fx: number;
  readonly fy: number;
}

const MM = (mm10: number): number => mm10 / 10;
type Axis = "x" | "y" | "z";

/** Face-A/B drilling holes → world markers. `parts` must be the DRILLED parts (solveModelToParts). */
export function blockHoles(parts: readonly Part[], placements: readonly PanelPlacement[]): HoleMarker[] {
  const byId = new Map(placements.map((p) => [p.id, p]));
  const out: HoleMarker[] = [];
  for (const part of parts) {
    const drills = (part.operations ?? []).filter((o) => o.op === "drill" && /^[AB]/.test(o.face));
    if (drills.length === 0) continue;
    const pl = byId.get(part.id);
    if (!pl) continue;
    const ext: Record<Axis, number> = { x: pl.w_mm10, y: pl.h_mm10, z: pl.d_mm10 };
    const org: Record<Axis, number> = { x: pl.x_mm10, y: pl.y_mm10, z: pl.z_mm10 };
    // normal = the thinnest axis (the board thickness)
    const axes: Axis[] = ["x", "y", "z"];
    const normal = axes.reduce((a, b) => (ext[a] <= ext[b] ? a : b));
    const rest = axes.filter((a) => a !== normal);
    // of the two in-plane axes, the one closest to part.length carries the face-local x, the other y
    const lengthAxis = Math.abs(ext[rest[0]!] - part.length_mm10) <= Math.abs(ext[rest[1]!] - part.length_mm10) ? rest[0]! : rest[1]!;
    const widthAxis = lengthAxis === rest[0]! ? rest[1]! : rest[0]!;
    for (const d of drills) {
      if (d.op !== "drill") continue;
      const pos: Record<Axis, number> = { x: 0, y: 0, z: 0 };
      pos[lengthAxis] = org[lengthAxis] + d.x_mm10;
      pos[widthAxis] = org[widthAxis] + d.y_mm10;
      pos[normal] = org[normal] + ext[normal] / 2; // mid-thickness (collapses in the 2D view; fine in 3D)
      out.push({ x: MM(pos.x), y: MM(pos.y), z: MM(pos.z), r: MM(d.diameter_mm10) / 2, normal, partId: part.id, opId: d.id, fx: d.x_mm10, fy: d.y_mm10 });
    }
  }
  return out;
}
