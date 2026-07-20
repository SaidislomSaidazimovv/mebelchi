// three/structureScene.ts — engine geometry → render-ready boxes (ported from karkas-app's
// ui/src/canvas/cabinet.ts pure core). Turns a solveLayout() PanelPlacement[] into centred,
// metre-scaled boxes for three.js. PURE + framework-free: no three, no React. The plain-three.js
// renderer (structureRenderer.ts) consumes the `Scene` this produces.
//
// This is the Phase-2 bridge that lets the ported StructuralModel engine be shown in our stack,
// entirely parallel to the kitchen Cell 3D (kitchen3d.ts) — nothing here touches that path.

import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import type { PanelFeatures, StructuralModel } from "../../../../engine/contracts/structure.js";
import { leafSections } from "../../../../engine/contracts/structure.js";

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
  /** Step 4b — corner radii mm10 [tl,tr,br,bl] on this panel's largest face (rendered as a rounded rect). */
  corners?: readonly [number, number, number, number];
  /** Step 4b — rectangular apertures (mm10, part-local) punched through the panel's largest face. */
  cutouts?: PanelFeatures["cutouts"];
  /** Step 8.2 — per-edge kromka K-variable ids [front,back,side,side] for colouring edges in Frame view. */
  kromka?: PanelFeatures["kromka"];
}

export interface Scene {
  boards: Board[];
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
}

/**
 * Centre + metre-scale a set of min-corner mm10 boxes. three.js boxes are centred, so we add
 * half-size; the cabinet is recentred on X/Z and stood on the floor (minY → 0).
 */
export function boxesToScene(boxes: RawBox[], features?: Readonly<Record<string, PanelFeatures>>): Scene {
  if (boxes.length === 0) return { boards: [], center: [0, 0, 0], radius: 1 };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x + b.w);
    minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y + b.h);
    minZ = Math.min(minZ, b.z); maxZ = Math.max(maxZ, b.z + b.d);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const boards: Board[] = boxes.map((b) => {
    const f = features?.[b.id];
    return {
      id: b.id,
      name: b.name,
      pos: [M(b.x + b.w / 2 - cx), M(b.y + b.h / 2 - minY), M(b.z + b.d / 2 - cz)],
      size: [M(b.w), M(b.h), M(b.d)],
      ...(b.rot ? { rotX: (b.rot * Math.PI) / 180 } : {}),
      ...(b.rotYDeg ? { rotY: (b.rotYDeg * Math.PI) / 180 } : {}),
      ...(f?.corners && f.corners.some((r) => r > 0) ? { corners: f.corners } : {}),
      ...(f?.cutouts && f.cutouts.length > 0 ? { cutouts: f.cutouts } : {}),
      ...(f?.kromka && f.kromka.some((k) => k) ? { kromka: f.kromka } : {}),
    };
  });
  const w = M(maxX - minX), h = M(maxY - minY), d = M(maxZ - minZ);
  return { boards, center: [0, h / 2, 0], radius: Math.max(w, h, d) };
}

/** Live path: the assembled cabinet from solveLayout → positioned panels. `features` (Step 4b) attaches
 *  corner-rounding / cutout data to the matching boards so the renderer can draw them. */
export function layoutToScene(panels: readonly PanelPlacement[], features?: Readonly<Record<string, PanelFeatures>>): Scene {
  return boxesToScene(
    panels.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x_mm10, y: p.y_mm10, z: p.z_mm10,
      w: p.w_mm10, h: p.h_mm10, d: p.d_mm10,
      rot: p.rotX_deg,
      rotYDeg: p.rotY_deg,
    })),
    features,
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
