export interface NestPart {
  id: string;
  label: string;
  l_mm: number;
  w_mm: number;
  material: string;
  grainLock: boolean;
}

export interface PlacedPart {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NestSheet {
  parts: PlacedPart[];
  offcuts: Rect[];
  wastePct: number;
  sheetL: number;
  sheetW: number;
  fromStock: boolean;
}

export interface StockPiece {
  material: string;
  l_mm: number;
  w_mm: number;
}

export interface MaterialNest {
  material: string;
  sheets: NestSheet[];
}

export interface NestTotals {
  sheets: number;
  parts: number;
  partAreaM2: number;
  offcutM2: number;
  wastePct: number;
  cutLenM: number;
}

export interface NestResult {
  perMaterial: MaterialNest[];
  totals: NestTotals;
}

export interface NestConfig {
  sheetL: number;
  sheetW: number;
  kerf: number;
  trim: number;
  offcutMin: number;
}

export const DEFAULT_NEST: NestConfig = { sheetL: 2750, sheetW: 1830, kerf: 4, trim: 15, offcutMin: 150 };

interface Oriented {
  id: string;
  label: string;
  w: number;
  h: number;
  rot: boolean;
}

interface Shelf {
  y: number;
  height: number;
  cursorX: number;
}

interface WorkSheet {
  shelves: Shelf[];
  parts: PlacedPart[];
  usedH: number;
  uL: number;
  uW: number;
  sheetL: number;
  sheetW: number;
  fromStock: boolean;
}

function orient(p: NestPart): Oriented {
  if (p.grainLock || p.l_mm >= p.w_mm) return { id: p.id, label: p.label, w: p.l_mm, h: p.w_mm, rot: false };
  return { id: p.id, label: p.label, w: p.w_mm, h: p.l_mm, rot: true };
}

function finishSheet(s: WorkSheet, cfg: NestConfig): NestSheet {
  const offcuts: Rect[] = [];
  for (const sh of s.shelves) {
    const usedW = sh.cursorX - cfg.kerf;
    const leftW = s.uL - usedW - cfg.kerf;
    if (leftW >= cfg.offcutMin && sh.height >= cfg.offcutMin) {
      offcuts.push({ x: cfg.trim + usedW + cfg.kerf, y: cfg.trim + sh.y, w: leftW, h: sh.height });
    }
  }
  const bottomH = s.uW - s.usedH - cfg.kerf;
  if (bottomH >= cfg.offcutMin) {
    offcuts.push({ x: cfg.trim, y: cfg.trim + s.usedH + cfg.kerf, w: s.uL, h: bottomH });
  }
  const sheetArea = s.sheetL * s.sheetW;
  const partArea = s.parts.reduce((a, p) => a + p.w * p.h, 0);
  const offcutArea = offcuts.reduce((a, o) => a + o.w * o.h, 0);
  const wastePct = ((sheetArea - partArea - offcutArea) / sheetArea) * 100;
  return { parts: s.parts, offcuts, wastePct, sheetL: s.sheetL, sheetW: s.sheetW, fromStock: s.fromStock };
}

export function nest(parts: readonly NestPart[], cfg: NestConfig = DEFAULT_NEST, stock: readonly StockPiece[] = []): NestResult {
  const usableL = cfg.sheetL - cfg.trim * 2;
  const usableW = cfg.sheetW - cfg.trim * 2;

  const byMat = new Map<string, NestPart[]>();
  for (const p of parts) {
    const g = byMat.get(p.material) ?? [];
    g.push(p);
    byMat.set(p.material, g);
  }

  const perMaterial: MaterialNest[] = [];
  for (const [material, group] of byMat) {
    const oriented = group.map(orient).sort((a, b) => b.h - a.h || b.w - a.w);
    const sheets: WorkSheet[] = stock
      .filter((st) => st.material === material)
      .sort((a, b) => b.l_mm * b.w_mm - a.l_mm * a.w_mm)
      .map((st): WorkSheet => ({ shelves: [], parts: [], usedH: 0, uL: Math.max(0, st.l_mm - cfg.trim * 2), uW: Math.max(0, st.w_mm - cfg.trim * 2), sheetL: st.l_mm, sheetW: st.w_mm, fromStock: true }));

    for (const o of oriented) {
      if (o.w > usableL || o.h > usableW) continue;
      let placed = false;

      for (const s of sheets) {
        for (const sh of s.shelves) {
          if (o.h <= sh.height && o.w <= s.uL && sh.cursorX + o.w <= s.uL) {
            s.parts.push({ id: o.id, label: o.label, x: cfg.trim + sh.cursorX, y: cfg.trim + sh.y, w: o.w, h: o.h, rot: o.rot });
            sh.cursorX += o.w + cfg.kerf;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) continue;

      for (const s of sheets) {
        if (o.w > s.uL) continue;
        const y = s.usedH === 0 ? 0 : s.usedH + cfg.kerf;
        if (y + o.h <= s.uW) {
          s.shelves.push({ y, height: o.h, cursorX: o.w + cfg.kerf });
          s.parts.push({ id: o.id, label: o.label, x: cfg.trim, y: cfg.trim + y, w: o.w, h: o.h, rot: o.rot });
          s.usedH = y + o.h;
          placed = true;
          break;
        }
      }
      if (placed) continue;

      const s: WorkSheet = { shelves: [{ y: 0, height: o.h, cursorX: o.w + cfg.kerf }], parts: [{ id: o.id, label: o.label, x: cfg.trim, y: cfg.trim, w: o.w, h: o.h, rot: o.rot }], usedH: o.h, uL: usableL, uW: usableW, sheetL: cfg.sheetL, sheetW: cfg.sheetW, fromStock: false };
      sheets.push(s);
    }

    perMaterial.push({ material, sheets: sheets.filter((s) => s.parts.length > 0).map((s) => finishSheet(s, cfg)) });
  }

  let sheetCount = 0;
  let partCount = 0;
  let partArea = 0;
  let offcutArea = 0;
  let cutLen = 0;
  let fullArea = 0;
  let fullParts = 0;
  let fullOffcut = 0;
  for (const m of perMaterial) {
    for (const s of m.sheets) {
      partCount += s.parts.length;
      const pa = s.parts.reduce((a, p) => a + p.w * p.h, 0);
      const oa = s.offcuts.reduce((a, o) => a + o.w * o.h, 0);
      partArea += pa;
      offcutArea += oa;
      for (const p of s.parts) cutLen += p.w + p.h;
      if (!s.fromStock) {
        sheetCount += 1;
        fullArea += s.sheetL * s.sheetW;
        fullParts += pa;
        fullOffcut += oa;
      }
    }
  }
  const wastePct = fullArea > 0 ? ((fullArea - fullParts - fullOffcut) / fullArea) * 100 : 0;

  return {
    perMaterial,
    totals: {
      sheets: sheetCount,
      parts: partCount,
      partAreaM2: partArea / 1_000_000,
      offcutM2: offcutArea / 1_000_000,
      wastePct,
      cutLenM: cutLen / 1000,
    },
  };
}
