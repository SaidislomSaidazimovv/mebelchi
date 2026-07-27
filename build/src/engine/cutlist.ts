import { mm } from "./units";
import type { Panel } from "./block";

export const KROMKA_VISIBLE = mm(1);

export interface CutPiece {
  id: string;
  length: number;
  width: number;
  thickness: number;
  bands: [number, number, number, number];
  sawLength: number;
  sawWidth: number;
  kromkaLength: number;
}

function assemble(
  id: string,
  length: number,
  width: number,
  thickness: number,
  bands: [number, number, number, number],
): CutPiece {
  const sawLength = length - bands[2] - bands[3];
  const sawWidth = width - bands[0] - bands[1];
  const kromkaLength =
    (bands[0] ? length : 0) +
    (bands[1] ? length : 0) +
    (bands[2] ? width : 0) +
    (bands[3] ? width : 0);
  return { id, length, width, thickness, bands, sawLength, sawWidth, kromkaLength };
}

export function solveCutList(panels: Panel[]): CutPiece[] {
  return panels.map((p) => {
    const bands = p.bands ?? [KROMKA_VISIBLE, 0, 0, 0];
    if (p.role === "back") {
      return assemble(p.id, p.width, p.height, p.depth, bands);
    }
    if (p.role === "top" || p.role === "bottom") {
      return assemble(p.id, p.width, p.depth, p.height, bands);
    }
    return assemble(p.id, p.height, p.depth, p.width, bands);
  });
}
