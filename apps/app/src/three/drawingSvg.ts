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

/** Relative ink per panel kind for the small ortho thumbnails — the print sheet's colours are tuned for
 *  white paper, so a thumbnail uses `currentColor` at these opacities instead and reads in both themes. */
const THUMB_INK: Record<DrawRect["kind"], number> = {
  carcass: 0.95, divider: 0.8, shelf: 0.62, lip: 0.62, drawer: 0.5, facade: 0.4, other: 0.5,
};

/**
 * A compact, standalone SVG of ONE view, scaled to fit a `px`-square and centred — the Top / Front /
 * Left thumbnails above the parts list. Deliberately just the panel outlines: dimension chains and
 * drill holes are noise at this size (the full sheet in «Chizma» keeps them). Theme-aware via
 * `currentColor`, so it inherits the panel's text colour in light and dark.
 */
export function viewThumbSvg(v: DrawView, px = 96): string {
  const pad = px * 0.07, inner = px - pad * 2;
  const scale = inner / Math.max(v.w, v.h, 1); // fit the LARGER extent, keeping all three to one scale feel
  const ox = pad + (inner - v.w * scale) / 2, oy = pad + (inner - v.h * scale) / 2;
  const lw = Math.max(0.5, px / 110);
  const polys = v.rects.map((r) => {
    const st = STROKE[r.kind];
    const dash = st.dash ? ` stroke-dasharray="${(lw * 3).toFixed(1)} ${(lw * 2).toFixed(1)}"` : "";
    return `<polygon points="${corners(r, scale, ox, oy, v.h)}" fill="currentColor" fill-opacity="0.05"`
      + ` stroke="currentColor" stroke-opacity="${THUMB_INK[r.kind]}" stroke-width="${(lw * (st.w / 0.5)).toFixed(2)}"${dash}/>`;
  }).join("");
  return `<svg viewBox="0 0 ${px} ${px}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(v.title)}">${polys}</svg>`;
}

/**
 * A tiny silhouette of ONE cut panel for a parts-list row: the board drawn at its true L×W proportions
 * with each BANDED edge inked heavy — so a long thin side reads differently from a square shelf, and the
 * usta sees WHICH sides get kromka without decoding the ▪·▪· string.
 *
 * Edge order follows solve.ts's factory-GROUNDED SWJ008 face map (Face1 drills at Y=Width, per
 * POL_3_1.XML): [0]=top (Y-max) · [1]=bottom (Y=0) · [2]=right (X-max) · [3]=left (X=0). Length runs
 * along X, width along Y — the same convention the solver emits.
 */
export function panelThumbSvg(lMm: number, wMm: number, bands: readonly boolean[], px = 40): string {
  const pad = px * 0.13, inner = px - pad * 2;
  const L = Math.max(1, lMm), W = Math.max(1, wMm);
  const scale = inner / Math.max(L, W);
  const w = L * scale, h = W * scale;
  const x = (px - w) / 2, y = (px - h) / 2;
  const edge = (x1: number, y1: number, x2: number, y2: number, on: boolean): string =>
    `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"`
    + ` stroke="${on ? "#8a6d1f" : "currentColor"}" stroke-opacity="${on ? 1 : 0.4}"`
    + ` stroke-width="${on ? (px * 0.07).toFixed(2) : (px * 0.025).toFixed(2)}" stroke-linecap="square"/>`;
  return `<svg viewBox="0 0 ${px} ${px}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img">`
    + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="currentColor" fill-opacity="0.07"/>`
    + edge(x, y, x + w, y, !!bands[0]) // Face 1 — top
    + edge(x, y + h, x + w, y + h, !!bands[1]) // Face 2 — bottom
    + edge(x + w, y, x + w, y + h, !!bands[2]) // Face 3 — right
    + edge(x, y, x, y + h, !!bands[3]) // Face 4 — left
    + `</svg>`;
}

/** A linear dimension: a line with ticks + a value (mm). `horiz` runs along X, else Y. `off` is the
 *  SIGNED perpendicular offset of the value from the line (−1.5 = the usual left/above side; flipping
 *  the sign puts it on the other side, so a dense chain can alternate lanes). `fs` = font size. */
function dim(x1: number, y1: number, x2: number, y2: number, value: number, horiz: boolean, off = -1.5, fs = 3.4): string {
  const mid = horiz ? [(x1 + x2) / 2, y1 + off] : [x1 + off, (y1 + y2) / 2];
  const t = 1.4; // tick half-length
  const ticks = horiz
    ? `<line x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}" stroke="#c00" stroke-width="0.3"/><line x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}" stroke="#c00" stroke-width="0.3"/>`
    : `<line x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}" stroke="#c00" stroke-width="0.3"/><line x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}" stroke="#c00" stroke-width="0.3"/>`;
  const anchor = horiz ? "middle" : off < 0 ? "end" : "start"; // vertical label hugs the correct side
  const txt = `<text x="${mid[0]!.toFixed(1)}" y="${mid[1]!.toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="${anchor}" fill="#c00" font-family="sans-serif"${horiz ? "" : ` transform="rotate(-90 ${mid[0]!.toFixed(1)} ${mid[1]!.toFixed(1)})"`}>${value}</text>`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c00" stroke-width="0.3"/>${ticks}${txt}`;
}

/** How dense a chain is → the font size that fits its tightest gap, and whether to STAGGER (put
 *  alternating labels on opposite sides of the line so tight numbers can't collide). `minPx` = the
 *  smallest scaled segment (paper-mm). */
function chainStyle(minPx: number): { fs: number; stagger: boolean } {
  const fs = Math.max(2.2, Math.min(3.4, minPx * 0.6)); // shrink to fit the tightest gap, floor legible
  return { fs, stagger: minPx < 8 }; // gaps tighter than ~8mm paper → two-sided stagger
}

/** A vertical dimension CHAIN: one segment per gap between consecutive grid lines (mm, Y-up). Drawn
 *  at paper-x `xLine`, next to a view whose bottom is at (oy + viewH*scale). Gives per-shelf heights.
 *  Dense chains shrink the font + alternate labels left/right of the line so many shelves stay legible. */
function chainV(vals: readonly number[], xLine: number, oy: number, viewH: number, scale: number): string {
  let out = "";
  let minPx = Infinity;
  for (let i = 0; i < vals.length - 1; i++) minPx = Math.min(minPx, (vals[i + 1]! - vals[i]!) * scale);
  const { fs, stagger } = chainStyle(minPx);
  for (let i = 0; i < vals.length - 1; i++) {
    const y1 = oy + (viewH - vals[i]!) * scale, y2 = oy + (viewH - vals[i + 1]!) * scale;
    const off = stagger && i % 2 === 1 ? 1.5 : -1.5; // odd gaps hop to the RIGHT of the line
    out += dim(xLine, y1, xLine, y2, Math.round(vals[i + 1]! - vals[i]!), false, off, fs);
  }
  return out;
}

/** A horizontal dimension CHAIN: one segment per gap between consecutive grid lines. Gives column widths. */
function chainH(vals: readonly number[], yLine: number, ox: number, scale: number): string {
  let out = "";
  let minPx = Infinity;
  for (let i = 0; i < vals.length - 1; i++) minPx = Math.min(minPx, (vals[i + 1]! - vals[i]!) * scale);
  const { fs, stagger } = chainStyle(minPx);
  for (let i = 0; i < vals.length - 1; i++) {
    const x1 = ox + vals[i]! * scale, x2 = ox + vals[i + 1]! * scale;
    const off = stagger && i % 2 === 1 ? 1.5 : -1.5; // odd gaps hop BELOW the line
    out += dim(x1, yLine, x2, yLine, Math.round(vals[i + 1]! - vals[i]!), true, off, fs);
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
