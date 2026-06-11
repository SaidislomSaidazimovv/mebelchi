// Layer 4 — Universal model (the locked contract).
// Everything above produces this; everything below consumes it. Machine-independent.
//
// UNITS: every coordinate / dimension is an `mm10` integer (tenths of a millimetre).
// 16mm board = 160. Floats appear ONLY at the render/export edges, never here.
// See 13_FOUNDATIONAL_ARCHITECTURE.md and 14_RUNTIME_AND_BUILD.md (Part 2 units amendment).

/** Fixed-point integer: tenths of a millimetre. 16mm => 160. */
export type mm10 = number;

/**
 * Panel face, in the engine's own vocabulary (06_CONVENTIONS.md §1).
 *   "A"     = visible/exterior face (лицевая)        -> SWJ008 Face 5
 *   "B"     = hidden/interior face (внутренняя)      -> SWJ008 Face 6
 *   "edge1".."edge4" = the four edges                -> SWJ008 Face 1..4
 *
 * Drills on "A"/"B" go straight into a face (SWJ008 Type 2).
 * Drills on an edge go horizontally into the board thickness (SWJ008 Type 1, carries Z).
 */
export type PanelFace = "A" | "B" | "edge1" | "edge2" | "edge3" | "edge4";

/** Grain orientation as carried by SWJ008 ("L" = length, "W" = width, "NONE" = no grain). */
export type Grain = "L" | "W" | "NONE";

export type OperationSource = "auto" | "user";

/**
 * A single drilling action on a part, in part-local mm10 coordinates.
 * Origin (0,0) = bottom-left of Face A; X right, Y up (06_CONVENTIONS.md §1).
 * `z_mm10` is present only for edge drills (depth into the board thickness).
 */
export interface DrillOp {
  op: "drill";
  id: string;
  face: PanelFace;
  x_mm10: mm10;
  y_mm10: mm10;
  z_mm10?: mm10;
  diameter_mm10: mm10;
  depth_mm10: mm10;
  /** "user" values are authored/overridden and never recomputed by the solver. */
  source: OperationSource;
}

export type Operation = DrillOp;

/**
 * A single panel as it will be manufactured (05_CONTRACTS.md — the most important schema).
 * If a feature is not in `operations[]`, the machine never sees it.
 *
 * SWJ008 machining coordinates run X along Length and Y along Width
 * (verified against the factory files), so:
 * `width_mm10`  = SWJ008 Panel @Width  = the Y extent of machining space
 * `length_mm10` = SWJ008 Panel @Length = the X extent of machining space
 * `edges`       = banding thickness for SWJ008 edge faces [1,2,3,4]
 */
export interface Part {
  id: string;
  name: string;
  width_mm10: mm10;
  length_mm10: mm10;
  thickness_mm10: mm10;
  grain: Grain;
  edges: [mm10, mm10, mm10, mm10];
  operations: Operation[];
}

/** User/runtime-level container. A Project is the unit handed to the entry point. */
export interface Project {
  id: string;
  name: string;
  parts: Part[];
}

// ---------------------------------------------------------------------------
// Runtime result types (additions to the Base — 14_RUNTIME_AND_BUILD.md Part 1)
// ---------------------------------------------------------------------------

export interface BBox2D {
  x: mm10;
  y: mm10;
  w: mm10;
  h: mm10;
}

export interface PreviewPart {
  id: string;
  bbox: { x: mm10; y: mm10; z: mm10; w: mm10; h: mm10; d: mm10 };
  /** LOD only: zones + counts per face, never individual operation coordinates. */
  drillZones: Array<{ face: PanelFace; count: number; region: BBox2D }>;
}

export interface PreviewResult {
  parts: PreviewPart[];
}

export interface MachiningPlan {
  parts: Part[];
  schemaVersion: number;
}

export interface ValidationFinding {
  code: string;
  message_ru: string;
  part_id: string;
  op_id?: string;
}

export interface ValidationReport {
  ok: boolean;
  findings: ValidationFinding[];
}

export interface FullResult {
  plan: MachiningPlan;
  validation: ValidationReport;
}

export const SCHEMA_VERSION = 1;
