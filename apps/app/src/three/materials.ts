// three/materials.ts — the material / decor catalog for the KARKAS editor (Phase 5.C). A small,
// pure data module kept SEPARATE from the kitchen's model/materials.ts (Eman.uz catalog) so the
// kitchen Стиль flow is never touched. Board decors (ЛДСП / МДФ / ХДФ with a ₽/m² rate and a swatch
// colour), edge-band materials (₽/m), and a MaterialPlan saying which decor each PANEL ROLE is cut
// from. estimate.ts prices a solved model against a plan; the «Спецификация» panel picks the decors.
// Rates are realistic-but-illustrative RU retail figures — swap for a live rate table later.

/** A sheet-good decor: priced per square metre, drawn with a swatch colour. */
export interface BoardMaterial {
  id: string;
  name: string;
  hex: string;
  pricePerM2: number;
}

/** An edge-banding material: priced per running metre. */
export interface EdgeMaterial {
  id: string;
  name: string;
  pricePerM: number;
}

export const BOARDS: readonly BoardMaterial[] = [
  { id: "ldsp_white", name: "ЛДСП Белый", hex: "#f4f2ec", pricePerM2: 520 },
  { id: "ldsp_sonoma", name: "ЛДСП Дуб Сонома", hex: "#c9a877", pricePerM2: 610 },
  { id: "ldsp_wenge", name: "ЛДСП Венге", hex: "#4b3a2f", pricePerM2: 620 },
  { id: "ldsp_graphite", name: "ЛДСП Графит", hex: "#4a4d52", pricePerM2: 640 },
  { id: "ldsp_anthracite", name: "ЛДСП Антрацит", hex: "#2f3237", pricePerM2: 680 },
  { id: "mdf_white_matt", name: "МДФ Белый мат", hex: "#eceae4", pricePerM2: 1350 },
  { id: "hdf_white", name: "ХДФ Белый (задняя)", hex: "#e8e4d8", pricePerM2: 190 },
];

export const EDGES: readonly EdgeMaterial[] = [
  { id: "pvc_white_2", name: "ПВХ 2мм Белый", pricePerM: 28 },
  { id: "pvc_sonoma_2", name: "ПВХ 2мм Сонома", pricePerM: 34 },
  { id: "pvc_graphite_2", name: "ПВХ 2мм Графит", pricePerM: 34 },
  { id: "abs_05", name: "ABS 0.5мм в цвет", pricePerM: 16 },
];

/**
 * Which board decor each panel ROLE is cut from, plus the single edge band. This is how real
 * furniture is quoted — one carcass decor, one facade decor, a thin back, a shelf decor — rather
 * than a per-panel material (that per-Component override can come later).
 */
export interface MaterialPlan {
  carcass: string; // carcass_side / carcass_top / carcass_bottom / dividers / untagged
  back: string; // carcass_back
  shelf: string; // internal_shelf
  facade: string; // facade
  edge: string; // edge-band material id
}

export const DEFAULT_PLAN: MaterialPlan = {
  carcass: "ldsp_white",
  back: "hdf_white",
  shelf: "ldsp_white",
  facade: "ldsp_white",
  edge: "pvc_white_2",
};

export const boardById = (id: string): BoardMaterial | undefined => BOARDS.find((b) => b.id === id);
export const edgeById = (id: string): EdgeMaterial | undefined => EDGES.find((e) => e.id === id);

/** The plan slot (hence board decor) that governs a given panel role. */
export function planSlotForRole(role: string | undefined): keyof Omit<MaterialPlan, "edge"> {
  switch (role) {
    case "facade":
      return "facade";
    case "carcass_back":
      return "back";
    case "internal_shelf":
      return "shelf";
    default:
      return "carcass"; // sides / top / bottom / dividers / mounts / untagged
  }
}

/** Resolve the board decor a part of this role is priced/drawn against under a plan. */
export function boardForRole(plan: MaterialPlan, role: string | undefined): BoardMaterial | undefined {
  return boardById(plan[planSlotForRole(role)]);
}
