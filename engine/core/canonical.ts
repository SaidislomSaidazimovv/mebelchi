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

export interface CanonicalPanel {
  id: string;
  width: mm10;
  length: mm10;
  thickness: mm10;
  grain: Grain;
  edges: [mm10, mm10, mm10, mm10];
  ops: CanonicalOp[];
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

/** Reduce one Part to its canonical panel. */
export function canonicalizePart(part: Part): CanonicalPanel {
  const ops: CanonicalOp[] = part.operations.map((o) => ({
    swjFace: FACE_TO_SWJ[o.face],
    swjType: swjMachiningType(o.face),
    x: o.x_mm10,
    y: o.y_mm10,
    z: o.z_mm10 ?? 0,
    depth: o.depth_mm10,
    diameter: o.diameter_mm10,
  }));
  ops.sort(compareOps);
  return {
    id: part.id,
    width: part.width_mm10,
    length: part.length_mm10,
    thickness: part.thickness_mm10,
    grain: part.grain,
    edges: [...part.edges],
    ops,
  };
}

/** Reduce a list of parts to a canonical document (panels sorted by id). */
export function canonicalizeParts(parts: Part[]): CanonicalDoc {
  const panels = parts.map(canonicalizePart);
  panels.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { panels };
}
