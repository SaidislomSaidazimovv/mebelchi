import { Part } from "./types";
import { mm10 } from "./units";

export interface CutPiece {
  id: string;
  name: string;
  role: string;
  length: number;
  width: number;
  thickness: number;
  bands: [number, number, number, number]; // top, right, bottom, left
  sawLength: number;
  sawWidth: number;
  kromkaLength: number;
  operationsCount: number;
}

export function adaptPartsToCutPieces(parts: Part[]): CutPiece[] {
  return parts.map(p => {
    // panelDecomposition.ts -> resolveEdges() quyidagi formatda qaytaradi: [front, back, left, right]
    const bands = p.edges;
    
    // Arra o'lchamlari (Saw sizes)
    // front (0) va back (1) kromkalar detalning ENI (width) ga ta'sir qiladi
    // left (2) va right (3) kromkalar detalning UZUNLIGI (length) ga ta'sir qiladi
    const sawWidth = p.width_mm10 - bands[0] - bands[1];
    const sawLength = p.length_mm10 - bands[2] - bands[3];
    
    // Jami kerak bo'ladigan kromka uzunligi (mm10 da)
    // front (0) va back (1) qirralarining fizik uzunligi p.length_mm10 ga teng!
    // left (2) va right (3) qirralarining fizik uzunligi p.width_mm10 ga teng!
    const kromkaLength = 
      (bands[0] > 0 ? p.length_mm10 : 0) +
      (bands[1] > 0 ? p.length_mm10 : 0) +
      (bands[2] > 0 ? p.width_mm10 : 0) +
      (bands[3] > 0 ? p.width_mm10 : 0);

    return {
      id: p.id,
      name: p.name,
      role: p.role,
      length: p.length_mm10,
      width: p.width_mm10,
      thickness: p.thickness_mm10,
      bands,
      sawLength,
      sawWidth,
      kromkaLength,
      operationsCount: p.operations?.length ?? 0
    };
  });
}
