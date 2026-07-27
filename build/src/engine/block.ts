import { mm } from "./units";

export const LDSP = "ldsp";

export type PanelRole = "side" | "top" | "bottom" | "back" | "shelf" | "other";

export interface Panel {
  id: string;
  name: string;
  role: PanelRole;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  material: string;
  bands?: [number, number, number, number];
  rx?: number;
  ry?: number;
  rz?: number;
}

export interface Hole {
  id: string;
  x: number;
  y: number;
  z: number;
  diameter: number;
  depth: number;
  direction: "x" | "y" | "z";
}

export function readyCabinetPanels(): Panel[] {
  const w = mm(600);
  const h = mm(720);
  const d = mm(560);
  const t = mm(16);
  const innerWidth = w - t * 2;
  const innerHeight = h - t * 2;
  return [
    { id: "side_left", name: "Chap yon", role: "side", x: 0, y: 0, z: 0, width: t, height: h, depth: d, material: LDSP, bands: [10, 0, 0, 0] },
    { id: "side_right", name: "O'ng yon", role: "side", x: w - t, y: 0, z: 0, width: t, height: h, depth: d, material: LDSP, bands: [10, 0, 0, 0] },
    { id: "bottom", name: "Tag panel", role: "bottom", x: t, y: 0, z: 0, width: innerWidth, height: t, depth: d, material: LDSP, bands: [10, 0, 0, 0] },
    { id: "top", name: "Tepa panel", role: "top", x: t, y: h - t, z: 0, width: innerWidth, height: t, depth: d, material: LDSP, bands: [10, 0, 0, 0] },
    { id: "back", name: "Orqa panel", role: "back", x: t, y: t, z: 0, width: innerWidth, height: innerHeight, depth: t, material: LDSP, bands: [0, 0, 0, 0] },
  ];
}

export function solveBlockHoles(panels: Panel[]): Hole[] {
  const holes: Hole[] = [];
  const zOffset = mm(50);

  for (let i = 0; i < panels.length; i++) {
    for (let j = 0; j < panels.length; j++) {
      if (i === j) continue;
      const a = panels[i];
      const b = panels[j];

      const isAVerticalX = a.width < a.height && a.width < a.depth;
      const isBHorizontalY = b.height < b.width && b.height < b.depth;

      if (isAVerticalX && isBHorizontalY) {
        const touchesLeft = Math.abs(b.x - (a.x + a.width)) < 5;
        const touchesRight = Math.abs((b.x + b.width) - a.x) < 5;

        if (touchesLeft || touchesRight) {
          const insideY = b.y >= a.y && b.y + b.height <= a.y + a.height;
          const zStart = Math.max(a.z, b.z);
          const zEnd = Math.min(a.z + a.depth, b.z + b.depth);
          const overlapL = zEnd - zStart;

          if (insideY && overlapL > mm(100)) {
            const hx = a.x + Math.round(a.width / 2);
            const hy = b.y + Math.round(b.height / 2);
            const cz1 = zStart + zOffset;
            const cz2 = Math.round(zStart + overlapL / 2);
            const cz3 = zEnd - zOffset;

            if (overlapL >= mm(300)) {
              holes.push(
                { id: `h_${a.id}_${b.id}_c1`, x: hx, y: hy, z: cz1, diameter: 80, depth: a.width, direction: "x" },
                { id: `h_${a.id}_${b.id}_d`, x: hx, y: hy, z: cz2, diameter: 80, depth: a.width, direction: "x" },
                { id: `h_${a.id}_${b.id}_c2`, x: hx, y: hy, z: cz3, diameter: 80, depth: a.width, direction: "x" },
              );
            } else {
              holes.push(
                { id: `h_${a.id}_${b.id}_c1`, x: hx, y: hy, z: cz1, diameter: 80, depth: a.width, direction: "x" },
                { id: `h_${a.id}_${b.id}_c2`, x: hx, y: hy, z: cz3, diameter: 80, depth: a.width, direction: "x" },
              );
            }
          }
        }
      }
    }
  }

  const seen = new Set<string>();
  return holes.filter((h) => {
    const key = `${h.x}_${h.y}_${h.z}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
