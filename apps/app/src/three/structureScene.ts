// three/structureScene.ts — engine geometry → render-ready boxes (ported from karkas-app's
// ui/src/canvas/cabinet.ts pure core). Turns a solveLayout() PanelPlacement[] into centred,
// metre-scaled boxes for three.js. PURE + framework-free: no three, no React. The plain-three.js
// renderer (structureRenderer.ts) consumes the `Scene` this produces.
//
// This is the Phase-2 bridge that lets the ported StructuralModel engine be shown in our stack,
// entirely parallel to the kitchen Cell 3D (kitchen3d.ts) — nothing here touches that path.

import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import type { PanelFeatures, StructuralModel, Room, PrimitiveShape } from "../../../../engine/contracts/structure.js";
import { leafSections } from "../../../../engine/contracts/structure.js";
import { roomWallSegments, WALL_HEIGHT_MM10, WALL_THICKNESS_MM10 } from "../../../../engine/structure/room.js";
import { wallInteriorNormal } from "../../../../engine/structure/operations.js";

/** A render-ready box: centre + full size, in metres (three.js units). */
export interface Board {
  id: string;
  name?: string;
  /** centre position [x, y, z] in metres */
  pos: [number, number, number];
  /** full size [w, h, d] in metres */
  size: [number, number, number];
  /** tilt about the X (width) axis in RADIANS — an inclined shelf. Absent = axis-aligned. */
  rotX?: number;
  /** turn about the vertical (Y) axis in RADIANS — a free board facing another way. Absent = square-on. */
  rotY?: number;
  /** M8.1 — tilt about Z in RADIANS (from rotZ_deg). A free part spins about its own centre. */
  rotZ?: number;
  /** Step 4b — corner radii mm10 [tl,tr,br,bl] on this panel's largest face (rendered as a rounded rect). */
  corners?: readonly [number, number, number, number];
  /** Step 4b — rectangular apertures (mm10, part-local) punched through the panel's largest face. */
  cutouts?: PanelFeatures["cutouts"];
  /** Step 8.2 — per-edge kromka K-variable ids [front,back,side,side] for colouring edges in Frame view. */
  kromka?: PanelFeatures["kromka"];
  /** M4 — draw this board as a primitive (cylinder / sphere / tube / wedge) inside `size`. Absent = a box. */
  shape?: PrimitiveShape;
  /** M7.4 — hidden in the viewport only: still cut, still drilled, still priced. */
  hidden?: boolean;
  /** M9E.1 — per-part soft edge radius (mm); absent = the renderer's global bevel. */
  bevel_mm?: number;
}

export interface Scene {
  boards: Board[];
  /** Phase 5 — the room's wall backdrop (metres), recentred with the boards. Absent = no room. Rendered
   *  matte + non-interactive (never machined, never raycast). */
  walls?: Board[];
  /** M12.1 — the room's floor slab (metres), same rules as the walls. Absent = no room. */
  floor?: Board;
  /** M12.3 — the rug lying on that floor. Absent = none. */
  rug?: Board;
  /** centre of the whole cabinet (metres) — camera target */
  center: [number, number, number];
  /** largest extent (metres) — camera distance basis */
  radius: number;
}

/** mm10 (tenths of a millimetre) → metres. 16mm board = 160 mm10 = 0.016 m. */
const M = (mm10: number): number => mm10 / 10_000;

/** A min-corner box in mm10 — the common shape of a PanelPlacement. */
interface RawBox {
  id: string;
  name?: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** tilt about X in DEGREES (from a PanelPlacement's rotX_deg); converted to radians on the Board. */
  rot?: number;
  /** turn about the vertical Y axis in DEGREES (from rotY_deg); converted to radians on the Board. */
  rotYDeg?: number;
  /** M8.1 — tilt about Z in DEGREES (from a PanelPlacement's rotZ_deg); converted to radians here. */
  rotZDeg?: number;
  /** M4 — primitive shape carried straight through from the placement to the Board. */
  shape?: PrimitiveShape;
  hidden?: boolean; // M7.4
  bevel_mm?: number; // M9E.1
}

/**
 * Centre + metre-scale a set of min-corner mm10 boxes. three.js boxes are centred, so we add
 * half-size; the cabinet is recentred on X/Z and stood on the floor (minY → 0).
 */
export function boxesToScene(
  boxes: RawBox[],
  features?: Readonly<Record<string, PanelFeatures>>,
  /**
   * Where to recentre. Normally the boxes' own bounds, but a caller that has APPLIED a placement-only
   * transform (turning a cabinet) must pass the bounds from BEFORE it: a rotated box has a different
   * AABB, so recentring on it slid the whole model sideways every time a cabinet was turned — the
   * cabinet appeared to wander off under the finger that was only rotating it.
   */
  origin?: { cx: number; cz: number; minY: number },
): Scene {
  if (boxes.length === 0) return { boards: [], center: [0, 0, 0], radius: 1 };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
    minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
    minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z + b.d);
  }
  let cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  if (origin) { cx = origin.cx; cz = origin.cz; minY = origin.minY; }
  const boards: Board[] = boxes.map((b) => {
    const f = features?.[b.id];
    return {
      id: b.id,
      name: b.name,
      pos: [M(b.x + b.w / 2 - cx), M(b.y + b.h / 2 - minY), M(b.z + b.d / 2 - cz)],
      size: [M(b.w), M(b.h), M(b.d)],
      ...(b.rot ? { rotX: (b.rot * Math.PI) / 180 } : {}),
      ...(b.rotYDeg ? { rotY: (b.rotYDeg * Math.PI) / 180 } : {}),
      ...(b.rotZDeg ? { rotZ: (b.rotZDeg * Math.PI) / 180 } : {}), // M8.1
      ...(f?.corners && f.corners.some((r) => r > 0) ? { corners: f.corners } : {}),
      ...(f?.cutouts && f.cutouts.length > 0 ? { cutouts: f.cutouts } : {}),
      ...(f?.kromka && f.kromka.some((k) => k) ? { kromka: f.kromka } : {}),
      ...(b.shape && b.shape !== "box" ? { shape: b.shape } : {}), // M4 — non-box primitive
      ...(b.hidden ? { hidden: true } : {}), // M7.4
      ...(b.bevel_mm !== undefined ? { bevel_mm: b.bevel_mm } : {}), // M9E.1
    };
  });
  const w = M(maxX - minX), h = M(maxY - minY), d = M(maxZ - minZ);
  return { boards, center: [0, h / 2, 0], radius: Math.max(w, h, d) };
}

/** Live path: the assembled cabinet from solveLayout → positioned panels. `features` (Step 4b) attaches
 *  corner-rounding / cutout data to the matching boards so the renderer can draw them. */
/**
 * Apply each block's own `rotY_deg` to its panels — a RIGID rotation about the block's centre in the XZ
 * (floor) plane: every panel's centre orbits the block centre, and the panel itself turns by the same
 * angle, so the cabinet moves as one body.
 *
 * Deliberately applied HERE, between `solveLayout` and the scene, NOT inside the engine: the 3D viewport
 * shows the cabinet as PLACED in the room, while the drawing sheet and the CNC path keep reading
 * solveLayout's unrotated output — a cabinet is manufactured square-on however it is turned in the room.
 *
 * The maths mirrors three.js's Y-rotation exactly ((x,z) → (x·cos+z·sin, −x·sin+z·cos)); if the orbit and
 * the per-panel spin disagreed by a sign the cabinet would shear apart instead of turning.
 */
export function rotateBlockPlacements(
  panels: readonly PanelPlacement[],
  blocks: readonly { id: string; box: { x: number; z: number; w: number; d: number }; rotY_deg?: number }[],
): PanelPlacement[] {
  const turned = blocks.filter((b) => b.rotY_deg);
  if (!turned.length) return panels as PanelPlacement[];
  return panels.map((p) => {
    const b = turned.find((q) => p.id === q.id || p.id.startsWith(`${q.id}__`));
    if (!b) return p;
    const th = ((b.rotY_deg ?? 0) * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const cx = b.box.x + b.box.w / 2, cz = b.box.z + b.box.d / 2; // block centre on the floor plane
    const dx = p.x_mm10 + p.w_mm10 / 2 - cx, dz = p.z_mm10 + p.d_mm10 / 2 - cz; // panel centre, block-relative
    // keep min-corner semantics: boxesToScene re-derives the centre, then the renderer spins the panel
    // about it by rotY_deg — so writing back centre−half/2 lands the panel exactly where the body went.
    return {
      ...p,
      x_mm10: Math.round(cx + dx * c + dz * s - p.w_mm10 / 2),
      z_mm10: Math.round(cz - dx * s + dz * c - p.d_mm10 / 2),
      rotY_deg: (p.rotY_deg ?? 0) + (b.rotY_deg ?? 0),
    };
  });
}

export function layoutToScene(
  panels: readonly PanelPlacement[],
  features?: Readonly<Record<string, PanelFeatures>>,
  /** Pass the UNROTATED bounds when `panels` have already been turned — see `boxesToScene`. */
  origin?: { cx: number; cz: number; minY: number },
): Scene {
  return boxesToScene(
    panels.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x_mm10, y: p.y_mm10, z: p.z_mm10,
      w: p.w_mm10, h: p.h_mm10, d: p.d_mm10,
      rot: p.rotX_deg,
      rotYDeg: p.rotY_deg,
      rotZDeg: p.rotZ_deg, // M8.1
      shape: p.shape, // M4
      hidden: p.hidden, // M7.4 — the usta hid it in the viewport
      bevel_mm: p.bevel_mm, // M9E.1 — per-part soft edge
    })),
    features,
    origin,
  );
}

/** The recentering the scene applies (mm10): views are centred on X/Z and stood on the floor (minY).
 *  Plus the block centre — used to place drill-hole markers on the correct (inner) panel face so they
 *  land exactly where buildStructureGroup drew the boards. */
export function layoutBounds(panels: readonly PanelPlacement[]): { cx: number; cz: number; minY: number; ctrX: number; ctrY: number; ctrZ: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of panels) {
    minX = Math.min(minX, p.x_mm10); maxX = Math.max(maxX, p.x_mm10 + p.w_mm10);
    minY = Math.min(minY, p.y_mm10); maxY = Math.max(maxY, p.y_mm10 + p.h_mm10);
    minZ = Math.min(minZ, p.z_mm10); maxZ = Math.max(maxZ, p.z_mm10 + p.d_mm10);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, minY, ctrX: (minX + maxX) / 2, ctrY: (minY + maxY) / 2, ctrZ: (minZ + maxZ) / 2 };
}

/** Phase 5 — the render boxes (mm10, min-corner) for a room's walls. Each wall's INNER face lies on its
 *  segment line and it extends OUTWARD (opposite the room interior) by its thickness, so cabinets snapped to
 *  the wall (backs on the line, 5.r2) sit flush against it with no clip. Floor-standing, full room height.
 *  Interior normal = dir rotated 90° toward the inside (`[-dz,dx]` for "left" / `[dz,-dx]` for "right"). */
export function roomWallBoxes(room: Room | undefined): RawBox[] {
  if (!room || room.walls.length === 0) return [];
  const T = WALL_THICKNESS_MM10;
  const turn = room.turn ?? "left";
  // M12.5 — `Wall.height_mm10` has been in the contract since Phase 5 but nothing read it; the constant
  // was used for every wall. A wall that states its own height now gets it (the UI sets all of them at
  // once, because a room has ONE height); absent still means the standard 2700.
  const byId = new Map(room.walls.map((w) => [w.id, w.height_mm10]));
  return roomWallSegments(room).map((seg, i) => {
    const H = byId.get(seg.wallId) ?? WALL_HEIGHT_MM10;
    const [ox, oz] = seg.origin, [dx, dz] = seg.dir, L = seg.length_mm10;
    const n = wallInteriorNormal(seg.dir, turn); // Audit E3 — the room-handedness normal, single source in operations.ts
    void dz;
    const xRun = Math.abs(dx) > 0; // an X-running wall (dz = 0) vs a Z-running one
    return {
      id: `__wall_${seg.wallId}`,
      name: `Devor ${i + 1}`,
      x: xRun ? Math.min(ox, ox + dx * L) : Math.min(ox, ox - n[0] * T),
      y: 0,
      z: xRun ? Math.min(oz, oz - n[1] * T) : Math.min(oz, oz + dz * L),
      w: xRun ? L : T,
      h: H,
      d: xRun ? T : L,
    };
  });
}

/** Phase 5 — the full scene: cabinets (placed / rotated) + the room's wall backdrop, both recentred on the
 *  cabinet bounds so they align. No room → byte-identical to `layoutToScene` (walls absent).
 *
 *  M12.0 — the camera radius comes from the FURNITURE ALONE. It used to be taken from the combined bounds
 *  of cabinets AND walls, so a 3 m room shrank a 600 mm cabinet to a speck the moment the room was turned
 *  on, and the floor arriving in M12.1 would have shrunk it further. A room is the backdrop, not the
 *  subject: the master is looking at the furniture, and the walls simply happen to be behind it. */
export function sceneWithRoom(
  rotatedPanels: readonly PanelPlacement[],
  unrotatedFlat: readonly PanelPlacement[],
  room: Room | undefined,
  features?: Readonly<Record<string, PanelFeatures>>,
): Scene {
  const origin = layoutBounds(unrotatedFlat);
  const cab = layoutToScene(rotatedPanels, features, origin);
  const wallBoxes = roomWallBoxes(room);
  if (wallBoxes.length === 0 || !room) return cab;
  // M12.1/M12.3 — the floor and the rug ride the SAME recentring as the walls, so they cannot drift apart
  // from the furniture. Building them as boxes here keeps the renderer dumb and the geometry testable.
  const extra = roomFloorBoxes(room, wallBoxes, unrotatedFlat);
  const built = boxesToScene([...wallBoxes, ...extra.boxes], undefined, origin).boards;
  const walls = built.slice(0, wallBoxes.length);
  const rest = built.slice(wallBoxes.length);
  const floor = extra.hasFloor ? rest[0] : undefined;
  const rug = extra.hasRug ? rest[extra.hasFloor ? 1 : 0] : undefined;
  return { boards: cab.boards, walls, ...(floor ? { floor } : {}), ...(rug ? { rug } : {}), center: cab.center, radius: cab.radius };
}

/**
 * M12.1 — the floor slab (and M12.3's rug) for a room, in the same mm10 min-corner form as the walls.
 *
 * A room's walls are an OPEN polyline — one wall for an I room, two for an L — so there is no closed
 * polygon to fill. The floor is therefore the rectangle that covers the walls AND the furniture, plus a
 * generous margin, so it always reaches out past both and reads as «the room continues». It is a thin
 * slab sitting just below y=0 (the furniture's base plane), never above it.
 */
function roomFloorBoxes(
  room: Room,
  wallBoxes: readonly RawBox[],
  furniture: readonly PanelPlacement[],
): { boxes: RawBox[]; hasFloor: boolean; hasRug: boolean } {
  // A floor is a BACKDROP: its edge must never appear in shot, or the room reads as a raft floating in
  // white. Measured in presentation mode with 800 mm of margin, the edge was plainly visible past the
  // rug. 4 m costs one box and puts the seam well outside any framing we use.
  const MARGIN = 40000;
  const THICK = 200; // 20 mm slab — thin enough never to lift the furniture visually
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const acc = (x: number, z: number, w: number, d: number): void => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z + d);
  };
  for (const b of wallBoxes) acc(b.x, b.z, b.w, b.d);
  for (const p of furniture) acc(p.x_mm10, p.z_mm10, p.w_mm10, p.d_mm10);
  if (!Number.isFinite(minX)) return { boxes: [], hasFloor: false, hasRug: false };

  const boxes: RawBox[] = [{
    id: "__room_floor", name: "Pol",
    x: minX - MARGIN, y: -THICK, z: minZ - MARGIN,
    w: (maxX - minX) + MARGIN * 2, h: THICK, d: (maxZ - minZ) + MARGIN * 2,
  }];
  const rug = room.rug;
  if (rug && rug.w_mm10 > 0 && rug.d_mm10 > 0) {
    // Centred on the FURNITURE, not on the room: a rug is laid where the piece stands.
    let fMinX = Infinity, fMinZ = Infinity, fMaxX = -Infinity, fMaxZ = -Infinity;
    for (const p of furniture) {
      fMinX = Math.min(fMinX, p.x_mm10); fMaxX = Math.max(fMaxX, p.x_mm10 + p.w_mm10);
      fMinZ = Math.min(fMinZ, p.z_mm10); fMaxZ = Math.max(fMaxZ, p.z_mm10 + p.d_mm10);
    }
    const cx = Number.isFinite(fMinX) ? (fMinX + fMaxX) / 2 : (minX + maxX) / 2;
    const cz = Number.isFinite(fMinZ) ? (fMinZ + fMaxZ) / 2 : (minZ + maxZ) / 2;
    boxes.push({
      id: "__room_rug", name: "Gilam",
      x: cx - rug.w_mm10 / 2, y: -20, z: cz - rug.d_mm10 / 2, // 2 mm proud of the floor, so it never z-fights
      w: rug.w_mm10, h: 40, d: rug.d_mm10,
    });
  }
  return { boxes, hasFloor: true, hasRug: !!rug && rug.w_mm10 > 0 && rug.d_mm10 > 0 };
}

/** U3.1 — the world-space box (metres, scene coords) of every leaf section (compartment), recentred
 *  exactly like the boards. The editor drops an invisible hit-box on each so the master can TAP the
 *  compartment he wants to add into, instead of picking a numbered «1-bo'lim / 2-bo'lim». Section boxes
 *  are block-local (0-based); the block origin carries its run position, so world = block.box + section.box. */
export function leafSectionBoxes(
  model: StructuralModel,
  panels: readonly PanelPlacement[],
): { id: string; center: [number, number, number]; size: [number, number, number] }[] {
  const { cx, cz, minY } = layoutBounds(panels);
  const out: { id: string; center: [number, number, number]; size: [number, number, number] }[] = [];
  for (const b of model.blocks) {
    for (const z of b.zones) {
      for (const s of leafSections(z.root)) {
        const wx = b.box.x + s.box.x, wy = b.box.y + s.box.y, wz = b.box.z + s.box.z;
        out.push({
          id: s.id,
          center: [M(wx + s.box.w / 2 - cx), M(wy + s.box.h / 2 - minY), M(wz + s.box.d / 2 - cz)],
          size: [M(s.box.w), M(s.box.h), M(s.box.d)],
        });
      }
    }
  }
  return out;
}

/** Overall cabinet size in millimetres — for a dimension readout. */
export function sceneDimsMm(scene: Scene): { w: number; h: number; d: number } {
  if (scene.boards.length === 0) return { w: 0, h: 0, d: 0 };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of scene.boards) {
    minX = Math.min(minX, b.pos[0] - b.size[0] / 2); maxX = Math.max(maxX, b.pos[0] + b.size[0] / 2);
    minY = Math.min(minY, b.pos[1] - b.size[1] / 2); maxY = Math.max(maxY, b.pos[1] + b.size[1] / 2);
    minZ = Math.min(minZ, b.pos[2] - b.size[2] / 2); maxZ = Math.max(maxZ, b.pos[2] + b.size[2] / 2);
  }
  const mm = (m: number): number => Math.round(m * 1000);
  return { w: mm(maxX - minX), h: mm(maxY - minY), d: mm(maxZ - minZ) };
}
