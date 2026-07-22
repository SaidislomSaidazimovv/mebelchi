// engine/structure/room.ts — Phase 5. Pure geometry for a room's axis-aligned 90° wall polyline.
// A kitchen's walls are I (1) / L (2) / П (3) segments meeting at right angles. Walls store only their run
// length; this derives each wall's WORLD segment (origin + direction) from the ordered list + the room's
// `turn`, so a length edit reflows the whole path. Render-only — walls are never machined or raycast.

import type { Room } from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";

/** A wall's world segment (mm10): its start corner on the floor + unit run direction + length. */
export interface WallSeg {
  readonly wallId: string;
  readonly origin: readonly [mm10, mm10]; // [x, z] start corner
  readonly dir: readonly [number, number]; // unit direction [dx, dz] ∈ { +X, -X, +Z, -Z }
  readonly length_mm10: mm10;
}

/** Standard render defaults (mm10) for the wall backdrop. */
export const WALL_HEIGHT_MM10: mm10 = 27000; // 2700 mm — a typical room height
export const WALL_THICKNESS_MM10: mm10 = 1000; // 100 mm

/**
 * Derive each wall's world segment from the ordered wall list + the room's turn. Wall 0 runs +X from the
 * origin [0, 0]; each subsequent wall turns 90° (counter-clockwise for "left" / the default, clockwise for
 * "right") and continues from the previous wall's end corner. Covers I / L / П — and any longer 90° polyline.
 */
export function roomWallSegments(room: Room): WallSeg[] {
  const cw = room.turn === "right";
  const nz = (n: number): number => (n === 0 ? 0 : n); // fold -0 → 0 so dirs compare cleanly
  let dir: [number, number] = [1, 0]; // wall 0 runs +X
  let x: mm10 = 0, z: mm10 = 0;
  const out: WallSeg[] = [];
  for (const w of room.walls) {
    out.push({ wallId: w.id, origin: [x, z], dir: [dir[0], dir[1]], length_mm10: w.length_mm10 });
    x += dir[0] * w.length_mm10;
    z += dir[1] * w.length_mm10;
    dir = cw ? [nz(dir[1]), nz(-dir[0])] : [nz(-dir[1]), nz(dir[0])]; // turn 90° for the next wall
  }
  return out;
}

/** Build a Room from a preset (I / L / U wall count) + per-wall lengths (mm10) + turn. A convenience the
 *  store's `setRoom` uses; extra lengths beyond the preset are ignored, missing ones default to 3000 mm. */
export function roomFromPreset(preset: "I" | "L" | "U", lengths_mm10: readonly mm10[], turn: "left" | "right" = "left"): Room {
  const n = preset === "I" ? 1 : preset === "L" ? 2 : 3;
  const walls = Array.from({ length: n }, (_, i) => ({ id: `wall_${i}`, length_mm10: lengths_mm10[i] ?? 30000 }));
  return { id: "room", walls, turn };
}
