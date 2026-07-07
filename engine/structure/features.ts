// engine/structure/features.ts — Step 4b (CONSTRUCTION_FRAME_v4 §12): turn a panel's PanelFeatures
// overlay (corner rounding + cutout apertures) into real machining. Both emit SWJ008 Type-3 contour
// mills — the engine already speaks arcs (ContourSegment.angle_deg10, e.g. -900 = a 90° corner arc), so
// a rounded corner is an arc segment and a sink/boiler hole is a rectangular pocket. Pure + additive:
// `applyFeatures` only ever APPENDS operations to the parts that carry a feature; untouched parts pass
// through by reference.
import type { Part, ContourOp, ContourSegment, Operation, mm10 } from "../contracts/types.js";
import type { StructuralModel, PanelCutout } from "../contracts/structure.js";

const QUARTER_ARC = Math.PI / 2; // a 90° arc of radius r has length (π/2)·r
const ARC_90 = -900; // SWJ008 sign for a convex 90° corner sweep (SHKOF golden files show -900)

type Corners = readonly [mm10, mm10, mm10, mm10]; // [top-left, top-right, bottom-right, bottom-left]

/**
 * Banded outline perimeter (mm10) once corners are rounded: each rounded corner trims `r` from EACH of
 * its two edges (−2r) and replaces the sharp vertex with a quarter-circle arc (+(π/2)·r). Square corners
 * (r = 0) contribute nothing. Drives the kromka length so edge-banding follows the real arc, not the
 * naive rectangle (Gate 4b: "kromka = arc perimeter").
 */
export function outlinePerimeter(length: mm10, width: mm10, corners: Corners): mm10 {
  const base = 2 * (length + width);
  const trim = corners.reduce((s, r) => (r > 0 ? s + 2 * r - Math.round(QUARTER_ARC * r) : s), 0);
  return base - trim;
}

/**
 * The rounded-rectangle OUTLINE as a Face-A contour mill. Traces the perimeter counter-clockwise from
 * just past the bottom-left corner; every non-zero corner becomes one 90° arc segment, square corners
 * stay sharp (two straight edges meeting). Corners are [TL, TR, BR, BL]; part-local coords have origin at
 * bottom-left, X = length, Y = width. Returns null when every corner is square (nothing to cut).
 */
export function roundedOutlineContour(id: string, length: mm10, width: mm10, corners: Corners): ContourOp | null {
  const [tl, tr, br, bl] = corners;
  if (tl <= 0 && tr <= 0 && br <= 0 && bl <= 0) return null;
  const segments: ContourSegment[] = [];
  const push = (endX_mm10: mm10, endY_mm10: mm10, angle_deg10 = 0) => segments.push({ endX_mm10, endY_mm10, angle_deg10 });
  push(length - br, 0); // bottom edge → BR entry
  if (br > 0) push(length, br, ARC_90); // BR arc
  push(length, width - tr); // right edge → TR entry
  if (tr > 0) push(length - tr, width, ARC_90); // TR arc
  push(tl, width); // top edge → TL entry
  if (tl > 0) push(0, width - tl, ARC_90); // TL arc
  push(0, bl); // left edge → BL entry
  if (bl > 0) push(bl, 0, ARC_90); // BL arc → closes at the start point (bl, 0)
  return { op: "contour", id: `${id}__outline`, face: "A", x_mm10: bl, y_mm10: 0, depth_mm10: 0, pocket: 0, toolOffset: "", segments, source: "user" };
}

/**
 * A rectangular aperture as a through-cut Face-A pocket contour. The aperture is positioned from its
 * LOCKED edge so a locked clearance survives a panel resize (Gate 4b): if the right offset is locked (and
 * the left isn't) the hole is measured from the right edge, else from the left; likewise top vs bottom.
 * `length`/`width` are the CURRENT panel dimensions the offsets resolve against.
 */
export function cutoutContour(partId: string, length: mm10, width: mm10, thickness: mm10, cut: PanelCutout): ContourOp {
  const [left, top, right, bottom] = cut.offset;
  const [lLeft, lTop, lRight, lBottom] = cut.locked;
  const x0 = lRight && !lLeft ? length - right - cut.w_mm10 : left;
  const y0 = lTop && !lBottom ? width - top - cut.h_mm10 : bottom;
  const segments: ContourSegment[] = [
    { endX_mm10: x0 + cut.w_mm10, endY_mm10: y0, angle_deg10: 0 },
    { endX_mm10: x0 + cut.w_mm10, endY_mm10: y0 + cut.h_mm10, angle_deg10: 0 },
    { endX_mm10: x0, endY_mm10: y0 + cut.h_mm10, angle_deg10: 0 },
    { endX_mm10: x0, endY_mm10: y0, angle_deg10: 0 }, // closes the rectangle
  ];
  return { op: "contour", id: `${partId}__cut_${cut.id}`, face: "A", x_mm10: x0, y_mm10: y0, depth_mm10: thickness, pocket: 1, toolOffset: "", segments, source: "user" };
}

/**
 * Append the corner-rounding outline + cutout pockets carried by `model.features` onto the matching
 * parts (by id). Parts without a feature — and the whole list when there is no overlay — pass through
 * unchanged (same reference), so this is a safe, additive pass in the solve → cnc pipeline.
 */
export function applyFeatures(parts: readonly Part[], model: StructuralModel): Part[] {
  const feats = model.features;
  if (!feats) return parts as Part[];
  return parts.map((p) => {
    const f = feats[p.id];
    if (!f || (!f.corners && !f.cutouts?.length)) return p;
    const extra: Operation[] = [];
    if (f.corners) {
      const outline = roundedOutlineContour(p.id, p.length_mm10, p.width_mm10, f.corners);
      if (outline) extra.push(outline);
    }
    for (const cut of f.cutouts ?? []) extra.push(cutoutContour(p.id, p.length_mm10, p.width_mm10, p.thickness_mm10, cut));
    return extra.length ? { ...p, operations: [...p.operations, ...extra] } : p;
  });
}
