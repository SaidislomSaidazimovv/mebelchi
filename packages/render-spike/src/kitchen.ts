// Render-spike scene generator — PURE DATA, no Three.js.
//
// Generates a G-shape kitchen from the REAL engine data structures: every panel is
// an engine `Part`, and its drill operations come from the verified Layer-1
// primitives (hingeCupPattern / shelfPinPattern / rastex15Pattern) reading the real
// hardware spec. (Chosen path: real engine generator, not hardcoded — the ops are
// exactly what the verified hinge fixture produces.) Markers are derived from those
// ops; we render them as surface markers, NEVER as cuts (no CSG anywhere).
//
// Output is plain arrays (number[3] vectors, panel boxes, marker points) so the
// renderer can turn them into instanced geometry and so this module is testable
// headless. All lengths are millimetres (the engine convention); the renderer
// applies the locked 0.001 mm→metre scale.

import type { DrillOp, Part } from "../../../engine/index.js";
import { loadHardwareSpec } from "../../../engine/catalogs/hardwareSpec.js";
import { hingeCupPattern } from "../../../engine/primitives/hingeCupPattern.js";
import { shelfPinPattern } from "../../../engine/primitives/shelfPinPattern.js";
import { rastex15Pattern } from "../../../engine/primitives/rastex15Pattern.js";
import type { Panel } from "../../../engine/primitives/types.js";

export type Vec3 = [number, number, number];

/** Marker class -> render group. Each group becomes ONE InstancedMesh. */
export type MarkerType = "cup" | "cam" | "pin" | "dowel" | "confirmat" | "mark";

export interface Marker {
  type: MarkerType;
  pos: Vec3; // world mm, on the panel surface
  dir: Vec3; // unit normal the drill enters along
  diameter: number; // mm
  depth: number; // mm
  cabinetId: number;
}

/** A panel placed in the world as an axis-orientable box. */
export interface PlacedPanel {
  index: number; // stable global instance index
  cabinetId: number;
  /** Bottom-left corner of Face A, in world mm. */
  origin: Vec3;
  u: Vec3; // unit, +op-x (length) direction
  v: Vec3; // unit, +op-y (width) direction
  n: Vec3; // unit, Face-A outward normal
  length: number; // along u (mm)
  width: number; // along v (mm)
  thickness: number; // along n (mm)
  part: Part; // the engine Part (carries operations[])
}

export interface KitchenScene {
  panels: PlacedPanel[];
  markers: Marker[];
  cabinetCount: number;
  bounds: { min: Vec3; max: Vec3 };
}

// --------------------------------------------------------------------- vec math
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const muladd = (o: Vec3, d: Vec3, t: number): Vec3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
/** Rotate a vector about the world Y axis by `deg` (kitchen runs turn the corner). */
function rotY(v: Vec3, deg: number): Vec3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

const TH = 16; // board thickness (mm) — matches the factory files
const BACK_TH = 3;
let partSeq = 0;

function mkPart(id: string, length: number, width: number, ops: DrillOp[], thickness = TH): Part {
  return {
    id, name: id,
    length_mm10: Math.round(length * 10),
    width_mm10: Math.round(width * 10),
    thickness_mm10: Math.round(thickness * 10),
    grain: "L", edges: [0, 0, 0, 0], operations: ops,
  };
}
const asPanel = (length: number, width: number, thickness: number): Panel => ({
  id: "tmp", length_mm10: Math.round(length * 10), width_mm10: Math.round(width * 10),
  thickness_mm10: Math.round(thickness * 10),
});

const spec = loadHardwareSpec();
const HINGE = spec.hinges.DUMMY_CUP_110!;
const PIN = spec.shelfPins.DUMMY_PIN_5!;
const SYS32 = spec.system32;
const RASTEX = spec.connectors.DUMMY_RASTEX_15!;

/** Classify a drill op into a render marker group by diameter (mm10). */
function markerType(o: DrillOp): MarkerType {
  const d = o.diameter_mm10;
  if (d === 350) return "cup";
  if (d === 150) return "cam";
  if (d === 50) return "pin";
  if (d === 70) return "confirmat";
  if (d === 30) return "mark";
  return "dowel"; // Ø8 and the rest
}

// --------------------------------------------------------- one cabinet -> panels
interface CabinetSpec {
  pos: Vec3;       // world mm, the cabinet's local origin (left-bottom-back)
  yaw: number;     // rotation about Y (deg): 0 = faces +Z, 90 = faces +X
  w: number; h: number; d: number; // mm
  shelves: number;
  hasDoor: boolean;
}

function buildCabinet(c: CabinetSpec, cabinetId: number, panels: PlacedPanel[]): void {
  // Local frame: right=+X, up=+Y, front=+Z; rotated by yaw, translated by pos.
  const R = (v: Vec3): Vec3 => rotY(v, c.yaw);
  const right = R([1, 0, 0]), up = R([0, 1, 0]), front = R([0, 0, 1]);
  const at = (lx: number, ly: number, lz: number): Vec3 =>
    add(c.pos, add(scale(right, lx), add(scale(up, ly), scale(front, lz))));

  const push = (origin: Vec3, u: Vec3, v: Vec3, n: Vec3, length: number, width: number, part: Part, thickness = TH) =>
    panels.push({ index: panels.length, cabinetId, origin, u, v, n, length, width, thickness, part });

  const shelfYs = Array.from({ length: c.shelves }, (_, i) => Math.round((c.h * (i + 1)) / (c.shelves + 1)));

  // Left & right sides: vertical panels (op-x = height up, op-y = depth front).
  for (const lx of [0, c.w - TH]) {
    const inward: Vec3 = lx === 0 ? right : scale(right, -1); // Face A faces cabinet interior
    const part = mkPart(
      `c${cabinetId}_side${lx === 0 ? "L" : "R"}`, c.h, c.d,
      [
        ...shelfPinPattern(asPanel(c.h, c.d, TH), shelfYs, { pin: PIN, system32: SYS32 }),
        ...rastex15Pattern(asPanel(c.h, c.d, TH), asPanel(c.h, c.d, TH), [Math.round(c.d * 0.2), Math.round(c.d * 0.8)], RASTEX).camOps,
      ],
    );
    push(at(lx + (lx === 0 ? TH : 0), 0, 0), up, front, inward, c.h, c.d, part);
  }

  // Bottom & top: horizontal panels (op-x = width, op-y = depth).
  for (const ly of [0, c.h - TH]) {
    const n: Vec3 = ly === 0 ? up : scale(up, -1);
    const part = mkPart(`c${cabinetId}_${ly === 0 ? "bottom" : "top"}`, c.w, c.d,
      rastex15Pattern(asPanel(c.w, c.d, TH), asPanel(c.w, c.d, TH), [Math.round(c.d * 0.5)], RASTEX).camOps);
    push(at(0, ly + (ly === 0 ? TH : 0), 0), right, front, n, c.w, c.d, part);
  }

  // Shelves.
  for (const ly of shelfYs) {
    const part = mkPart(`c${cabinetId}_shelf${ly}`, c.w - 2 * TH, c.d - 20, []);
    push(at(TH, ly, 0), right, front, up, c.w - 2 * TH, c.d - 20, part);
  }

  // Back (thin).
  {
    const part = mkPart(`c${cabinetId}_back`, c.w, c.h, [], BACK_TH);
    push(at(0, 0, BACK_TH), right, up, front, c.w, c.h, part, BACK_TH);
  }

  // Door / front: hinge cups + marks (op-x = height, op-y = door width).
  if (c.hasDoor) {
    const hingeYs = c.h > 1600
      ? [100, Math.round(c.h / 3), Math.round((2 * c.h) / 3), c.h - 100]
      : [100, c.h - 100];
    const door = mkPart(`c${cabinetId}_door`, c.h, c.w, hingeCupPattern(asPanel(c.h, c.w, 18), "y0", hingeYs, HINGE), 18);
    push(at(0, 0, c.d), up, right, front, c.h, c.w, door, 18);
  }
}

/** Map a panel-local op (Face A/B or edge) to a world-space surface marker. */
function opToMarker(p: PlacedPanel, o: DrillOp): Marker {
  const x = o.x_mm10 / 10, y = o.y_mm10 / 10;
  const onB = o.face === "B";
  // Edge ops are placed on the Face-A plane for the load test (a minority of holes).
  const base = add(p.origin, add(scale(p.u, x), scale(p.v, y)));
  const pos = onB ? muladd(base, p.n, -p.thickness) : base;
  return {
    type: markerType(o),
    pos: muladd(pos, p.n, onB ? -0.2 : 0.2), // tiny lift so the marker sits on the surface
    dir: onB ? scale(p.n, -1) : p.n,
    diameter: o.diameter_mm10 / 10,
    depth: o.depth_mm10 / 10,
    cabinetId: p.cabinetId,
  };
}

function extractMarkers(panels: PlacedPanel[]): Marker[] {
  const markers: Marker[] = [];
  for (const p of panels) {
    for (const op of p.part.operations) {
      if (op.op === "drill") markers.push(opToMarker(p, op));
    }
  }
  return markers;
}

/**
 * The G-kitchen layout: a base run + a corner return (the G) + a wall run + a tall
 * unit. ≥12 cabinets, ≥40 panels, real ops per panel.
 */
export function kitchenLayout(): CabinetSpec[] {
  const cabs: CabinetSpec[] = [];
  const BW = 600, BH = 720, BD = 560; // base
  const WH = 700, WD = 320;           // wall
  // Base run along +X (5 cabinets), facing +Z.
  for (let i = 0; i < 5; i++) cabs.push({ pos: [i * BW, 0, 0], yaw: 0, w: BW, h: BH, d: BD, shelves: 1, hasDoor: true });
  // Corner return along +Z (2 cabinets), facing +X — turns the G.
  for (let i = 0; i < 2; i++) cabs.push({ pos: [5 * BW, 0, BD + i * BW], yaw: 90, w: BW, h: BH, d: BD, shelves: 1, hasDoor: true });
  // Wall run along +X (5 cabinets) at height, facing +Z.
  for (let i = 0; i < 5; i++) cabs.push({ pos: [i * BW, 1500, 0], yaw: 0, w: BW, h: WH, d: WD, shelves: 2, hasDoor: true });
  // One tall unit (door over 1600 → 4 hinges, exercises the hinge-count branch).
  cabs.push({ pos: [6 * BW, 0, 0], yaw: 0, w: BW, h: 2100, d: BD, shelves: 4, hasDoor: true });
  return cabs;
}

export function buildGKitchen(): KitchenScene {
  partSeq = 0;
  const layout = kitchenLayout();
  const panels: PlacedPanel[] = [];
  layout.forEach((c, id) => buildCabinet(c, id, panels));
  const markers = extractMarkers(panels);

  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (c: Vec3) => {
    min[0] = Math.min(min[0], c[0]); min[1] = Math.min(min[1], c[1]); min[2] = Math.min(min[2], c[2]);
    max[0] = Math.max(max[0], c[0]); max[1] = Math.max(max[1], c[1]); max[2] = Math.max(max[2], c[2]);
  };
  for (const p of panels) {
    grow(p.origin);
    grow(add(p.origin, add(scale(p.u, p.length), scale(p.v, p.width))));
  }
  return { panels, markers, cabinetCount: layout.length, bounds: { min, max } };
}

/**
 * Width-drag support: regenerate ONE cabinet at a new width and return its panels +
 * markers. Counts stay constant (op generators are width-independent), so the
 * renderer updates only those instances' MATRICES — never rebuilds geometry.
 */
export function rebuildCabinet(cabinetId: number, newWidth: number): { panels: PlacedPanel[]; markers: Marker[] } {
  const layout = kitchenLayout();
  const c = layout[cabinetId]!;
  c.w = newWidth;
  const panels: PlacedPanel[] = [];
  buildCabinet(c, cabinetId, panels);
  return { panels, markers: extractMarkers(panels) };
}
