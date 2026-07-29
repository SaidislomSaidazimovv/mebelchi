import type { PanelPlacement } from "../../../../engine/structure/layout.js";

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

export interface ExplodedFace {
  pts: string;
  tone: number;
}

export interface ExplodedLabel {
  n: number;
  bx: number;
  by: number;
  ax: number;
  ay: number;
}

export interface Exploded {
  faces: ExplodedFace[];
  labels: ExplodedLabel[];
  scale: number;
}

function dir(s: number): number {
  return Math.abs(s) < 1 ? 1 : Math.sign(s);
}

export function buildExploded(
  placements: readonly PanelPlacement[],
  posOf: Map<string, number>,
  viewW: number,
  viewH: number,
  ox: number,
  oy: number,
  pad = 56,
): Exploded {
  if (!placements.length) return { faces: [], labels: [], scale: 1 };

  const boxes = placements.map((p) => ({
    id: p.id,
    x: p.x_mm10,
    y: p.y_mm10,
    z: p.z_mm10,
    w: p.w_mm10,
    h: p.h_mm10,
    d: p.d_mm10,
  }));

  const minX = Math.min(...boxes.map((b) => b.x));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  const minZ = Math.min(...boxes.map((b) => b.z));
  const maxZ = Math.max(...boxes.map((b) => b.z + b.d));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const gap = Math.max(maxX - minX, maxY - minY, maxZ - minZ) * 0.24;

  const exploded = boxes.map((b) => {
    const px = b.x + b.w / 2;
    const py = b.y + b.h / 2;
    const pz = b.z + b.d / 2;
    const thin = Math.min(b.w, b.h, b.d);
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (thin === b.w) dx = dir(px - cx) * gap;
    else if (thin === b.h) dy = dir(py - cy) * gap;
    else dz = dir(pz - cz) * gap;
    return {
      id: b.id,
      x0: b.x + dx,
      y0: b.y + dy,
      z0: b.z + dz,
      x1: b.x + b.w + dx,
      y1: b.y + b.h + dy,
      z1: b.z + b.d + dz,
    };
  });

  const proj = (x: number, y: number, z: number): [number, number] => {
    const zf = maxZ - z;
    return [(x - zf) * COS30, (x + zf) * SIN30 - y];
  };

  let pMinX = Infinity;
  let pMaxX = -Infinity;
  let pMinY = Infinity;
  let pMaxY = -Infinity;
  for (const e of exploded) {
    for (const x of [e.x0, e.x1]) for (const y of [e.y0, e.y1]) for (const z of [e.z0, e.z1]) {
      const [px, py] = proj(x, y, z);
      if (px < pMinX) pMinX = px;
      if (px > pMaxX) pMaxX = px;
      if (py < pMinY) pMinY = py;
      if (py > pMaxY) pMaxY = py;
    }
  }

  const scale = Math.min((viewW - pad * 2) / Math.max(pMaxX - pMinX, 1), (viewH - pad * 2) / Math.max(pMaxY - pMinY, 1));
  const tx = ox + pad + (viewW - pad * 2 - (pMaxX - pMinX) * scale) / 2 - pMinX * scale;
  const ty = oy + pad + (viewH - pad * 2 - (pMaxY - pMinY) * scale) / 2 - pMinY * scale;
  const view = (x: number, y: number, z: number): [number, number] => {
    const [px, py] = proj(x, y, z);
    return [px * scale + tx, py * scale + ty];
  };
  const poly = (corners: [number, number, number][]): string =>
    corners.map(([x, y, z]) => view(x, y, z).map((n) => +n.toFixed(1)).join(",")).join(" ");

  const order = exploded
    .map((e, i) => ({ i, k: (e.x0 + e.x1) / 2 + (e.y0 + e.y1) / 2 + (maxZ - (e.z0 + e.z1) / 2) }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.i);

  const faces: ExplodedFace[] = [];
  for (const i of order) {
    const e = exploded[i];
    if (!e) continue;
    faces.push({ pts: poly([[e.x0, e.y1, e.z0], [e.x1, e.y1, e.z0], [e.x1, e.y1, e.z1], [e.x0, e.y1, e.z1]]), tone: 0.1 });
    faces.push({ pts: poly([[e.x0, e.y0, e.z0], [e.x1, e.y0, e.z0], [e.x1, e.y1, e.z0], [e.x0, e.y1, e.z0]]), tone: 0.16 });
    faces.push({ pts: poly([[e.x1, e.y0, e.z0], [e.x1, e.y1, e.z0], [e.x1, e.y1, e.z1], [e.x1, e.y0, e.z1]]), tone: 0.24 });
  }

  const midX = ox + viewW / 2;
  const seen = new Set<number>();
  const marks: { n: number; ax: number; ay: number }[] = [];
  for (const e of exploded) {
    const n = posOf.get(e.id);
    if (n == null || seen.has(n)) continue;
    seen.add(n);
    const [ax, ay] = view((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, (e.z0 + e.z1) / 2);
    marks.push({ n, ax, ay });
  }

  const top = oy + 30;
  const bot = oy + viewH - 30;
  const place = (arr: { n: number; ax: number; ay: number }[], railX: number): ExplodedLabel[] =>
    arr
      .sort((a, b) => a.ay - b.ay)
      .map((m, i) => ({ n: m.n, ax: m.ax, ay: m.ay, bx: railX, by: arr.length > 1 ? top + ((bot - top) * i) / (arr.length - 1) : (top + bot) / 2 }));
  const labels = [
    ...place(marks.filter((m) => m.ax < midX), ox + 30),
    ...place(marks.filter((m) => m.ax >= midX), ox + viewW - 30),
  ];

  return { faces, labels, scale };
}
