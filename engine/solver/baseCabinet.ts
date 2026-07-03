// Layer-2 drilling solver — the missing piece between geometry and the machine.
// Turns a base-cabinet description into engine Parts WITH operations, by composing the
// Layer-1 primitives over the cabinet's construction. The output feeds the existing
// pipeline unchanged: solveFull → validateParts (safety gate) → exportSWJ008.
//
// THE ONE RULE (inherited from the primitives): every hole DIMENSION — diameter, depth,
// offset-from-edge — comes from the verified hardware spec, never a literal here. Only
// PLACEMENT (which joints exist, how many connectors per joint, where shelves/hinges
// sit) is decided in this layer; those are layout constants, marked as such.
//
// Coordinate model (engine convention, mm10 integers): each Part has X along Length,
// Y along Width, origin bottom-left of Face A.
//   SIDE panel   → Length = cabinet height, Width = depth
//   TOP / BOTTOM → Length = inner width,    Width = depth
//   DOOR         → Length = height,         Width = width
//
// Cam-seat / dowel coordinates reproduce the golden fixtures (YON BAK-1, POL): the Ø15
// cam centre sits spec.fromMatingEdge (34mm) in from the mating end on Face A, and the
// Ø8 dowel goes into the mating panel's end edge at board mid-thickness.

import type { DrillOp, PanelFace, Part } from "../contracts/types.js";
import { mmToMm10 } from "../core/units.js";
import { shelfPinPattern } from "../primitives/shelfPinPattern.js";
import { hingeCupPattern, type HingeEdge } from "../primitives/hingeCupPattern.js";
import type { ConnectorSpec, HardwareSpec, Panel } from "../primitives/types.js";

// Board thicknesses (geometry, not hole dimensions).
const CARCASS_THICKNESS_MM = 16;
const FACADE_THICKNESS_MM = 18;

// PLACEMENT layout (not hole geometry): how far the connector columns sit in from the
// front/back depth edges, and how far the end hinges sit in from the door's top/bottom.
const JOINT_INSET_MM = 60;
const HINGE_END_INSET_MM = 100;

export interface BaseCabinetInput {
  id: string;
  height_mm: number;
  width_mm: number;
  depth_mm: number;
  /** adjustable shelves — they rest on pins drilled into the side panels */
  shelves?: number;
  hasDoor?: boolean;
  /** which vertical edge of the door carries the hinges */
  hingeEdge?: "left" | "right";
  hingeCount?: number;
  carcassThickness_mm?: number;
  facadeThickness_mm?: number;
}

/** Standard hinge count by door height (layout rule, refine with overlay later). */
function hingeCountFor(height_mm: number): number {
  if (height_mm <= 900) return 2;
  if (height_mm <= 1600) return 3;
  if (height_mm <= 2000) return 4;
  return 5;
}

function firstValue<T>(rec: Record<string, T>): T {
  const v = Object.values(rec)[0];
  if (!v) throw new Error("MACHINING_SPEC_MISSING_CATEGORY");
  return v;
}

/**
 * One carcass corner joint: a Ø15 cam seat on the SIDE's Face A (fromMatingEdge in from
 * the mating end) + a Ø8 dowel into the HORIZONTAL panel's mating end edge, one pair per
 * front/back connector position. Reproduces the YON BAK-1 / POL fixture geometry.
 */
function camDowelJoint(
  side: Part,
  horiz: Part,
  end: "bottom" | "top",
  sideKind: "left" | "right",
  jointYs_mm10: number[],
  conn: ConnectorSpec,
): { camOps: DrillOp[]; dowelOps: DrillOp[] } {
  const camDia = mmToMm10(conn.camSeat.diameter);
  const camDepth = mmToMm10(conn.camSeat.depth);
  const fromEdge = mmToMm10(conn.camSeat.fromMatingEdge);
  const dowelDia = mmToMm10(conn.dowelHole.diameter);
  const dowelDepth = mmToMm10(conn.dowelHole.depth);

  // Cam on the SIDE face, fromEdge in from whichever end mates this horizontal panel.
  const camX = end === "top" ? side.length_mm10 - fromEdge : fromEdge;
  // Dowel into the HORIZONTAL panel's mating end edge: left side → X=0 (edge4),
  // right side → X=Length (edge3). Matches POL's edge4/edge3 Ø8×34 dowels.
  const horizEnd = sideKind === "left" ? 0 : horiz.length_mm10;
  const dowelEdge: PanelFace = sideKind === "left" ? "edge4" : "edge3";
  const dowelZ = Math.round(horiz.thickness_mm10 / 2); // centred in board thickness

  const camOps: DrillOp[] = [];
  const dowelOps: DrillOp[] = [];
  jointYs_mm10.forEach((y, i) => {
    camOps.push({
      op: "drill", id: `cam_${side.name}_${end}_${i}`, face: "A",
      x_mm10: camX, y_mm10: y, diameter_mm10: camDia, depth_mm10: camDepth, source: "auto",
    });
    dowelOps.push({
      op: "drill", id: `dowel_${horiz.name}_${sideKind}_${i}`, face: dowelEdge,
      x_mm10: horizEnd, y_mm10: y, z_mm10: dowelZ,
      diameter_mm10: dowelDia, depth_mm10: dowelDepth, source: "auto",
    });
  });
  return { camOps, dowelOps };
}

const toPanel = (p: Part): Panel => ({
  id: p.id, length_mm10: p.length_mm10, width_mm10: p.width_mm10, thickness_mm10: p.thickness_mm10,
});

/**
 * Solve the full drilling plan for one base cabinet (frameless LDSP carcass: 2 sides,
 * top, bottom, back, N shelves, optional door). Returns engine Parts with operations.
 */
export function solveBaseCabinet(input: BaseCabinetInput, spec: HardwareSpec): Part[] {
  const t = input.carcassThickness_mm ?? CARCASS_THICKNESS_MM;
  const ft = input.facadeThickness_mm ?? FACADE_THICKNESS_MM;
  const { height_mm: H, width_mm: W, depth_mm: D } = input;
  const innerW = W - 2 * t;
  const shelves = Math.max(0, input.shelves ?? 0);

  const conn = firstValue(spec.connectors);
  const pin = firstValue(spec.shelfPins);
  const hinge = firstValue(spec.hinges);

  const mk = (name: string, lenMm: number, widMm: number, thickMm: number): Part => ({
    id: `${input.id}:${name}`,
    name,
    length_mm10: mmToMm10(lenMm),
    width_mm10: mmToMm10(widMm),
    thickness_mm10: mmToMm10(thickMm),
    grain: "NONE",
    edges: [0, 0, 0, 0],
    operations: [],
  });

  const sideL = mk("side-left", H, D, t);
  const sideR = mk("side-right", H, D, t);
  const bottom = mk("bottom", innerW, D, t);
  const top = mk("top", innerW, D, t);
  const back = mk("back", W, H, t);
  const shelfParts: Part[] = [];
  for (let i = 0; i < shelves; i++) shelfParts.push(mk(`shelf-${i + 1}`, innerW, D, t));

  // Connector column positions across the depth (front + back), inset from each edge.
  const inset = mmToMm10(JOINT_INSET_MM);
  const jointYs = [inset, mmToMm10(D) - inset];

  // Carcass cam+dowel joints — bottom & top to each side panel.
  const sides: Array<[Part, "left" | "right"]> = [[sideL, "left"], [sideR, "right"]];
  const horiz: Array<[Part, "bottom" | "top"]> = [[bottom, "bottom"], [top, "top"]];
  for (const [side, kind] of sides) {
    for (const [hz, end] of horiz) {
      const { camOps, dowelOps } = camDowelJoint(side, hz, end, kind, jointYs, conn);
      side.operations.push(...camOps);
      hz.operations.push(...dowelOps);
    }
  }

  // Shelf-pin rows on both sides (one front+back pair per shelf height).
  if (shelves > 0) {
    const shelfXs: number[] = [];
    for (let i = 0; i < shelves; i++) {
      shelfXs.push(Math.round((mmToMm10(H) * (i + 1)) / (shelves + 1)));
    }
    for (const side of [sideL, sideR]) {
      side.operations.push(...shelfPinPattern(toPanel(side), shelfXs, { pin, system32: spec.system32 }));
    }
  }

  const parts: Part[] = [sideL, sideR, bottom, top, back, ...shelfParts];

  // Door + hinge cups (Ø35 cup + Ø3 marking pricks per the verified hinge fixture).
  if (input.hasDoor) {
    const door = mk("door", H, W, ft);
    const hingeEdge: HingeEdge = (input.hingeEdge ?? "left") === "left" ? "y0" : "yMax";
    const n = input.hingeCount ?? hingeCountFor(H);
    const endInset = mmToMm10(HINGE_END_INSET_MM);
    const xs: number[] = [];
    if (n <= 1) {
      xs.push(Math.round(mmToMm10(H) / 2));
    } else {
      const span = mmToMm10(H) - 2 * endInset;
      for (let i = 0; i < n; i++) xs.push(endInset + Math.round((span * i) / (n - 1)));
    }
    door.operations.push(...hingeCupPattern(toPanel(door), hingeEdge, xs, hinge));
    parts.push(door);
  }

  return parts;
}
