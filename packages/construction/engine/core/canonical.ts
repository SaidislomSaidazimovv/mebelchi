// Canonical form for SEMANTIC golden comparison (14_RUNTIME_AND_BUILD.md Part 3).
// Two SWJ008 documents that mean the same machining reduce to the same canonical
// object: operations sorted, units as mm10 integers, formatting/order/ID-sequence
// noise removed. Tests diff canonical-vs-canonical, never byte-vs-byte
// (byte-for-byte is a one-time spike, see the exporter + Fixture 0 test).

import type { Grain, Part, mm10 } from "../contracts/types.js";
import { FACE_TO_SWJ, swjMachiningType } from "./face.js";

export interface CanonicalOp {
  swjFace: number;
  swjType: number;
  x: mm10;
  y: mm10;
  z: mm10; // 0 when the operation carries no Z (face drills)
  depth: mm10;
  diameter: mm10;
}

/** Canonical contour mill (Type 3). Segment order is the toolpath — never sorted. */
export interface CanonicalContour {
  swjFace: number;
  x: mm10;
  y: mm10;
  depth: mm10;
  pocket: number;
  toolOffset: string;
  segments: Array<{ endX: mm10; endY: mm10; angle_deg10: number }>;
}

/** Canonical saw groove (Type 4). */
export interface CanonicalGroove {
  swjFace: number;
  x: mm10;
  y: mm10;
  endX: mm10;
  endY: mm10;
  width: mm10;
  depth: mm10;
}

export interface CanonicalPanel {
  id: string;
  width: mm10;
  length: mm10;
  thickness: mm10;
  grain: Grain;
  edges: [mm10, mm10, mm10, mm10];
  ops: CanonicalOp[];
  contours: CanonicalContour[];
  grooves: CanonicalGroove[];
}

export interface CanonicalDoc {
  panels: CanonicalPanel[];
}

function compareOps(a: CanonicalOp, b: CanonicalOp): number {
  return (
    a.swjFace - b.swjFace ||
    a.swjType - b.swjType ||
    a.x - b.x ||
    a.y - b.y ||
    a.z - b.z ||
    a.diameter - b.diameter ||
    a.depth - b.depth
  );
}

function compareContours(a: CanonicalContour, b: CanonicalContour): number {
  return a.swjFace - b.swjFace || a.x - b.x || a.y - b.y || a.depth - b.depth;
}

function compareGrooves(a: CanonicalGroove, b: CanonicalGroove): number {
  return (
    a.swjFace - b.swjFace ||
    a.x - b.x ||
    a.y - b.y ||
    a.endX - b.endX ||
    a.endY - b.endY ||
    a.width - b.width ||
    a.depth - b.depth
  );
}

/** Reduce one Part to its canonical panel. */
export function canonicalizePart(part: Part): CanonicalPanel {
  const ops: CanonicalOp[] = [];
  const contours: CanonicalContour[] = [];
  const grooves: CanonicalGroove[] = [];

  for (const o of part.operations) {
    if (o.op === "drill") {
      ops.push({
        swjFace: FACE_TO_SWJ[o.face],
        swjType: swjMachiningType(o.face),
        x: o.x_mm10,
        y: o.y_mm10,
        z: o.z_mm10 ?? 0,
        depth: o.depth_mm10,
        diameter: o.diameter_mm10,
      });
    } else if (o.op === "contour") {
      contours.push({
        swjFace: FACE_TO_SWJ[o.face],
        x: o.x_mm10,
        y: o.y_mm10,
        depth: o.depth_mm10,
        pocket: o.pocket,
        toolOffset: o.toolOffset,
        segments: o.segments.map((s) => ({
          endX: s.endX_mm10,
          endY: s.endY_mm10,
          angle_deg10: s.angle_deg10,
        })),
      });
    } else {
      grooves.push({
        swjFace: FACE_TO_SWJ[o.face],
        x: o.x_mm10,
        y: o.y_mm10,
        endX: o.endX_mm10,
        endY: o.endY_mm10,
        width: o.width_mm10,
        depth: o.depth_mm10,
      });
    }
  }
  ops.sort(compareOps);
  contours.sort(compareContours);
  grooves.sort(compareGrooves);

  return {
    id: part.id,
    width: part.width_mm10,
    length: part.length_mm10,
    thickness: part.thickness_mm10,
    grain: part.grain,
    edges: [...part.edges],
    ops,
    contours,
    grooves,
  };
}

/** Reduce a list of parts to a canonical document (panels sorted by id). */
export function canonicalizeParts(parts: Part[]): CanonicalDoc {
  const panels = parts.map(canonicalizePart);
  panels.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { panels };
}
