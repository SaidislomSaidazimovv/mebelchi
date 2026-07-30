import { allBoards, type BoardMaterial } from "./materials";
import type { GroupedSpec } from "./estimate";

const GLASS_KG = 2500;
const HDF_KG = 800;
const MDF_KG = 750;
const BOARD_KG = 700;
const MASSIV_FALLBACK = 600;

const MASSIV_DENSITY: Record<string, number> = {
  massiv_terak: 450,
  massiv_qaragay: 510,
  massiv_archa: 450,
  massiv_tut: 630,
  massiv_chinor: 640,
  massiv_zarang: 690,
  massiv_yasen: 680,
  massiv_buk: 710,
  massiv_emand: 720,
  massiv_yongoq: 660,
};

const boardByName = (name: string): BoardMaterial | undefined => allBoards().find((b) => b.name === name);

export function densityFor(materialName: string): number {
  const b = boardByName(materialName);
  if (!b) return BOARD_KG;
  if (b.finish === "glass" || b.finish === "frosted" || b.finish === "mirror") return GLASS_KG;
  const id = b.baseId ?? b.id;
  if (b.solid) return MASSIV_DENSITY[id] ?? MASSIV_FALLBACK;
  if (id.startsWith("hdf")) return HDF_KG;
  if (id.startsWith("mdf")) return MDF_KG;
  return BOARD_KG;
}

export function partWeightKg(l_mm: number, w_mm: number, t_mm: number, materialName: string): number {
  if (l_mm <= 0 || w_mm <= 0 || t_mm <= 0) return 0;
  return ((l_mm * w_mm * t_mm) / 1e9) * densityFor(materialName);
}

export function rowsWeightKg(rows: readonly GroupedSpec[]): number {
  let kg = 0;
  for (const r of rows) kg += partWeightKg(r.l_mm, r.w_mm, r.t_mm, r.materialName) * r.qty;
  return kg;
}
