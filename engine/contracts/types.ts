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

/** One segment of a contour-mill path (SWJ008 Type 3 <Line> child). */
export interface ContourSegment {
  endX_mm10: mm10;
  endY_mm10: mm10;
  /**
   * Arc sweep in tenths of a degree (fixed-point, like mm10). 0 = straight segment;
   * non-zero = arc with that sweep (SHKOF shows -900 = -90° corner-radius arcs).
   */
  angle_deg10: number;
}

/**
 * Contour mill (SWJ008 Type 3). Path starts at (x,y) and follows segments[] in order.
 * `toolOffset` carries the machine's token verbatim ("右" = right, "左" = left, "" = none)
 * and must survive parse → canonical → export byte-exactly.
 */
export interface ContourOp {
  op: "contour";
  id: string;
  face: PanelFace;
  x_mm10: mm10;
  y_mm10: mm10;
  depth_mm10: mm10;
  pocket: number;
  toolOffset: string;
  segments: ContourSegment[];
  source: OperationSource;
}

/** Saw groove (SWJ008 Type 4): straight dado from (x,y) to (endX,endY). */
export interface SawGrooveOp {
  op: "saw_groove";
  id: string;
  face: PanelFace;
  x_mm10: mm10;
  y_mm10: mm10;
  endX_mm10: mm10;
  endY_mm10: mm10;
  width_mm10: mm10;
  depth_mm10: mm10;
  source: OperationSource;
}

export type Operation = DrillOp | ContourOp | SawGrooveOp;

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
  /**
   * Panel role this part plays — a PanelRole value ("carcass_side" | "carcass_top" |
   * "carcass_bottom" | "carcass_back" | "facade" | "internal_shelf", see contracts/structure.ts).
   * Optional/additive (Phase 5.C): the structure solver stamps it so a material plan + cut list can
   * price/label each part by role. Absent = untagged (callers fall back to the carcass decor). Typed
   * as `string` to keep this foundational contract free of an upward dependency on structure.ts.
   */
  role?: string;
  /**
   * Per-part material override (Phase F2): an OPAQUE app-catalog decor key, copied from the emitting
   * Component's `material`. Absent = priced/coloured by the part's role. The engine never interprets
   * it — the app resolves the key to a colour / price / name.
   */
  materialId?: string;
  /**
   * Material / decor name written to the SWJ008 `Material` attribute (Phase 5.C). Optional/additive:
   * the exporter stamps it from a caller-supplied role→name map so the cut file carries the real
   * board decor. Absent = `Material=""` (unchanged golden output). The engine stays catalog-agnostic
   * — it writes whatever name it is handed, it does not own the material list.
   */
  material?: string;
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

/**
 * Tolerate-and-flag (addition for the factory dump): the SWJ008 reader NEVER silently
 * drops or crashes on content outside current coverage. Known content parses; the rest
 * becomes explicit machine-readable flags surfaced with the result.
 */
export interface ParseFlag {
  code:
    | "SWJ008_UNKNOWN_MACHINING_TYPE"
    | "SWJ008_UNKNOWN_ATTRIBUTE"
    | "SWJ008_NONEMPTY_OUTLINE"
    | "SWJ008_NONEMPTY_FACE_ID"
    | "SWJ008_UNKNOWN_FACE"
    | "SWJ008_MALFORMED"
    /**
     * A coordinate finer than 0.1mm was rounded to mm10 (e.g. the factory's
     * "907.250" marking holes). The engine convention is mm10; if the dump shows
     * this is common, promoting the core to mm100 is a constitution decision.
     */
    | "SWJ008_PRECISION_LOSS";
  /** Panel ID the content belongs to, or "" for document-level content. */
  where: string;
  /** The raw content / attribute carried verbatim, so nothing is lost. */
  detail: string;
}

export interface ParsedDocument {
  parts: Part[];
  flags: ParseFlag[];
}

export const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Structural linkage (Construction-mode) — see engine/contracts/structure.ts.
// Additive only: the manufacturing model above is untouched. The structural
// overlay treats each `Part` as the leaf "Деталь" and refers to it by id.
// ---------------------------------------------------------------------------

/** Stable identifier of a `Part` (the Деталь leaf). */
export type PartId = string;

/** Деталь — domain alias for the manufacturing `Part`. The Construction-mode
 *  hierarchy bottoms out at exactly this type; there is no separate leaf model. */
export type Detail = Part;
