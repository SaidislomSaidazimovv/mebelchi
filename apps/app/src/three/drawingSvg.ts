// three/drawingSvg.ts — render a BlockDrawing (three orthographic views) as one printable A4 SVG
// sheet: Front + Plan + Section A-A, overall dimensions, and a title block. PURE (string in → string
// out), so it is unit-testable and reused verbatim in the print window. No DOM, no three.
//
// Layout (first-angle alignment): FRONT top-left, PLAN directly below it (shares the X axis), SIDE
// directly right of it (shares the Y/height axis). The paper is millimetre-based; a single `scale`
// maps drawing-mm → paper-mm so all three views + dimensions + title block fit the A4 area.

import type { BlockDrawing, DrawRect, DrawView } from "./blockDrawing.js";

export interface DrawingMeta {
  readonly firm: string;
  readonly name: string;
  readonly date: string;
  readonly materials?: string; // e.g. "ЛДСП Сонома 16мм · Кром 2мм" (title-block left cell)
  readonly legend?: readonly string[]; // material lines for the title-block legend cell (Korpus / Orqa / …)
}

// A4 landscape paper in mm, with a margin; the drawing area sits above the title block. Gaps/labels
// are FIXED paper-mm (never scaled with the drawing) so view titles never collide with the geometry.
const PAPER_W = 297, PAPER_H = 210, MARGIN = 10, TITLE_H = 22, GAP = 16, LABEL_H = 7;
const DIM_PAD = 18; // left strip: the per-shelf height chain + the overall-height dimension
const WDIM_BAND = 18; // strip under the plan: the column-width chain + the overall-width dimension

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// stroke weight / style per panel kind (mm line width on paper)
const STROKE: Record<DrawRect["kind"], { w: number; col: string; dash?: string }> = {
  carcass: { w: 0.6, col: "#111" },
  divider: { w: 0.5, col: "#222" },
  shelf: { w: 0.4, col: "#333" },
  lip: { w: 0.4, col: "#1f5f86" },
  facade: { w: 0.35, col: "#555", dash: "3 2" },
  drawer: { w: 0.35, col: "#555" },
  other: { w: 0.35, col: "#555" },
};

/** The 4 corners (paper space) of a possibly-tilted rect. Drawing space is Y-up; we flip to Y-down
 *  paper space here. A tilted shelf pivots about its FRONT-TOP edge and the BACK rises — matching 3D. */
function corners(r: DrawRect, scale: number, ox: number, oy: number, viewH: number): string {
  const P = (dx: number, dy: number): [number, number] => [ox + dx * scale, oy + (viewH - dy) * scale]; // flip Y
  if (!r.rotDeg) {
    const pts = [P(r.x, r.y), P(r.x, r.y + r.h), P(r.x + r.w, r.y + r.h), P(r.x + r.w, r.y)];
    return pts.map((p) => p.map((n) => +n.toFixed(2)).join(",")).join(" ");
  }
  // tilt about front-top (x, y+h), rotate CCW by θ in Y-up space so the back edge (x+w) rises
  const th = (r.rotDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
  const cx = r.x, cy = r.y + r.h;
  const rot = (px: number, py: number): [number, number] => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  };
  const raw: [number, number][] = [[r.x, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w, r.y]];
  return raw.map(([px, py]) => rot(px, py)).map(([dx, dy]) => P(dx, dy).map((n) => +n.toFixed(2)).join(",")).join(" ");
}

/** One view: its panels (as polygons) + a title. Placed at (ox,oy) on the paper, scaled. */
function viewSvg(v: DrawView, scale: number, ox: number, oy: number): string {
  const vh = v.h;
  const polys = v.rects.map((r) => {
    const st = STROKE[r.kind];
    return `<polygon points="${corners(r, scale, ox, oy, vh)}" fill="none" stroke="${st.col}" stroke-width="${st.w}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`;
  }).join("");
  // drill holes: a circle at each boring (Ø5 pins small, Ø35 cups large) + a centre cross-hair
  const holeEls = v.holes.map((h) => {
    const cx = ox + h.x * scale, cy = oy + (vh - h.y) * scale, r = Math.max(0.35, h.r * scale), t = Math.min(r, 0.9);
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="#1f6f86" stroke-width="0.22"/>` +
      `<line x1="${(cx - t).toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(cx + t).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="#1f6f86" stroke-width="0.18"/>` +
      `<line x1="${cx.toFixed(2)}" y1="${(cy - t).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${(cy + t).toFixed(2)}" stroke="#1f6f86" stroke-width="0.18"/>`;
  }).join("");
  const label = `<text x="${(ox + (v.w * scale) / 2).toFixed(1)}" y="${(oy + vh * scale + 6).toFixed(1)}" font-size="4" text-anchor="middle" fill="#333" font-family="sans-serif">${esc(v.title)}</text>`;
  return polys + holeEls + label;
}

/** A linear dimension: a line with ticks + a centred value (mm). `horiz` runs along X, else Y. */
function dim(x1: number, y1: number, x2: number, y2: number, value: number, horiz: boolean): string {
  const mid = horiz ? [(x1 + x2) / 2, y1 - 1.5] : [x1 - 1.5, (y1 + y2) / 2];
  const t = 1.4; // tick half-length
  const ticks = horiz
    ? `<line x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}" stroke="#c00" stroke-width="0.3"/><line x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}" stroke="#c00" stroke-width="0.3"/>`
    : `<line x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}" stroke="#c00" stroke-width="0.3"/><line x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}" stroke="#c00" stroke-width="0.3"/>`;
  const txt = `<text x="${mid[0]!.toFixed(1)}" y="${mid[1]!.toFixed(1)}" font-size="3.4" text-anchor="middle" fill="#c00" font-family="sans-serif"${horiz ? "" : ` transform="rotate(-90 ${mid[0]!.toFixed(1)} ${mid[1]!.toFixed(1)})"`}>${value}</text>`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c00" stroke-width="0.3"/>${ticks}${txt}`;
}

/** A vertical dimension CHAIN: one segment per gap between consecutive grid lines (mm, Y-up). Drawn
 *  at paper-x `xLine`, next to a view whose bottom is at (oy + viewH*scale). Gives per-shelf heights. */
function chainV(vals: readonly number[], xLine: number, oy: number, viewH: number, scale: number): string {
  let out = "";
  for (let i = 0; i < vals.length - 1; i++) {
    const y1 = oy + (viewH - vals[i]!) * scale, y2 = oy + (viewH - vals[i + 1]!) * scale;
    out += dim(xLine, y1, xLine, y2, Math.round(vals[i + 1]! - vals[i]!), false);
  }
  return out;
}

/** A horizontal dimension CHAIN: one segment per gap between consecutive grid lines. Gives column widths. */
function chainH(vals: readonly number[], yLine: number, ox: number, scale: number): string {
  let out = "";
  for (let i = 0; i < vals.length - 1; i++) {
    const x1 = ox + vals[i]! * scale, x2 = ox + vals[i + 1]! * scale;
    out += dim(x1, yLine, x2, yLine, Math.round(vals[i + 1]! - vals[i]!), true);
  }
  return out;
}

/** Full A4 sheet: three views + overall W/H/D dimensions + a title block. Returns an <svg> string. */
export function drawingSheetSvg(d: BlockDrawing, meta: DrawingMeta): string {
  const tbY = PAPER_H - MARGIN - TITLE_H; // top of the title block — the drawing must stay above it
  const ox = MARGIN + DIM_PAD, oy = MARGIN + 3; // left pad for the height chain; small top pad
  // Usable area after margins, title block, gaps, view-title bands and the width-dim strip. GAP /
  // LABEL_H / WDIM_BAND are FIXED paper-mm (never scaled), so view titles + dims never collide.
  const availW = PAPER_W - ox - MARGIN - DIM_PAD - GAP; // front.w + side.w fit here (scaled); right pad = depth dim
  const availH = (tbY - 4) - oy - 2 * LABEL_H - GAP - WDIM_BAND; // front.h + plan.h fit here (scaled)
  const scale = Math.min(availW / Math.max(d.front.w + d.side.w, 1), availH / Math.max(d.front.h + d.plan.h, 1));
  const frontX = ox, frontY = oy;
  const planX = ox, planY = frontY + d.front.h * scale + LABEL_H + GAP; // below front + fixed gap
  const sideX = frontX + d.front.w * scale + GAP, sideY = oy; // right of front + fixed gap

  const views = viewSvg(d.front, scale, frontX, frontY) + viewSvg(d.plan, scale, planX, planY) + viewSvg(d.side, scale, sideX, sideY);

  // Precise dimensions:
  //  • HEIGHT chain (each shelf gap) just left of the front, + overall height further left.
  //  • WIDTH chain (each column) under the plan, + overall width below it when there are dividers.
  //  • overall DEPTH right of the side.
  const hasCols = d.widths.length > 2;
  const wChainY = planY + d.plan.h * scale + LABEL_H + 4;
  const wOverallY = wChainY + (hasCols ? 8 : 0);
  const dims =
    chainV(d.heights, frontX - 5, frontY, d.front.h, scale) +
    dim(frontX - 14, frontY, frontX - 14, frontY + d.front.h * scale, d.overall.h, false) +
    (hasCols ? chainH(d.widths, wChainY, planX, scale) : "") +
    dim(planX, wOverallY, planX + d.plan.w * scale, wOverallY, d.overall.w, true) +
    dim(sideX + d.side.w * scale + 6, sideY, sideX + d.side.w * scale + 6, sideY + d.side.h * scale, d.overall.d, false);

  // title block along the bottom (tbY computed above): 3 cells — info | materials legend | date/scale
  const c1 = PAPER_W - MARGIN - 138, c2 = PAPER_W - MARGIN - 66; // vertical divider x's
  const legendLines = (meta.legend ?? []).slice(0, 4)
    .map((s, i) => `<text x="${c1 + 4}" y="${tbY + 6.5 + i * 4.2}" font-size="3.4" fill="#333" font-family="sans-serif">${esc(s)}</text>`).join("");
  const tb =
    `<rect x="${MARGIN}" y="${tbY}" width="${PAPER_W - 2 * MARGIN}" height="${TITLE_H}" fill="none" stroke="#111" stroke-width="0.5"/>` +
    `<line x1="${c1}" y1="${tbY}" x2="${c1}" y2="${tbY + TITLE_H}" stroke="#111" stroke-width="0.4"/>` +
    `<line x1="${c2}" y1="${tbY}" x2="${c2}" y2="${tbY + TITLE_H}" stroke="#111" stroke-width="0.4"/>` +
    `<text x="${MARGIN + 4}" y="${tbY + 9}" font-size="6" font-weight="700" fill="#111" font-family="sans-serif">${esc(meta.firm)}</text>` +
    `<text x="${MARGIN + 4}" y="${tbY + 17}" font-size="4.5" fill="#333" font-family="sans-serif">${esc(meta.name)}  ·  ${d.overall.w}×${d.overall.h}×${d.overall.d} mm${!meta.legend && meta.materials ? "  ·  " + esc(meta.materials) : ""}</text>` +
    `<text x="${c1 + 4}" y="${tbY + 3.5}" font-size="2.8" fill="#888" font-family="sans-serif">MATERIALLAR</text>` + legendLines +
    `<text x="${c2 + 4}" y="${tbY + 9}" font-size="4.5" fill="#333" font-family="sans-serif">Sana: ${esc(meta.date)}</text>` +
    `<text x="${c2 + 4}" y="${tbY + 17}" font-size="4.5" fill="#333" font-family="sans-serif">Masshtab ~1:${Math.max(1, Math.round(1 / scale))}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAPER_W} ${PAPER_H}" width="100%" style="background:#fff">` +
    `<rect x="${MARGIN / 2}" y="${MARGIN / 2}" width="${PAPER_W - MARGIN}" height="${PAPER_H - MARGIN}" fill="none" stroke="#111" stroke-width="0.4"/>` +
    views + dims + tb + `</svg>`;
}
