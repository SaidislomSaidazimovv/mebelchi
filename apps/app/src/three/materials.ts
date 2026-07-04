// three/materials.ts — the material / decor catalog for the KARKAS editor (Phase 5.C). A small,
// pure data module kept SEPARATE from the kitchen's model/materials.ts (Eman.uz catalog) so the
// kitchen Стиль flow is never touched. Board decors (ЛДСП / МДФ / ХДФ with a ₽/m² rate and a swatch
// colour), edge-band materials (₽/m), and a MaterialPlan saying which decor each PANEL ROLE is cut
// from. estimate.ts prices a solved model against a plan; the «Спецификация» panel picks the decors.
// Rates are realistic-but-illustrative RU retail figures — swap for a live rate table later.

/** A sheet-good decor: priced per square metre, drawn with a swatch colour, cut at a thickness (mm). */
export interface BoardMaterial {
  id: string;
  name: string;
  hex: string;
  pricePerM2: number;
  thickness_mm: number;
}

/** An edge-banding material: priced per running metre. */
export interface EdgeMaterial {
  id: string;
  name: string;
  pricePerM: number;
}

export const BOARDS: readonly BoardMaterial[] = [
  { id: "ldsp_white", name: "ЛДСП Белый", hex: "#f4f2ec", pricePerM2: 520, thickness_mm: 16 },
  { id: "ldsp_sonoma", name: "ЛДСП Дуб Сонома", hex: "#c9a877", pricePerM2: 610, thickness_mm: 16 },
  { id: "ldsp_wenge", name: "ЛДСП Венге", hex: "#4b3a2f", pricePerM2: 620, thickness_mm: 16 },
  { id: "ldsp_graphite", name: "ЛДСП Графит", hex: "#4a4d52", pricePerM2: 640, thickness_mm: 16 },
  { id: "ldsp_anthracite", name: "ЛДСП Антрацит", hex: "#2f3237", pricePerM2: 680, thickness_mm: 16 },
  { id: "mdf_white_matt", name: "МДФ Белый мат", hex: "#eceae4", pricePerM2: 1350, thickness_mm: 18 },
  { id: "hdf_white", name: "ХДФ Белый (задняя)", hex: "#e8e4d8", pricePerM2: 190, thickness_mm: 3 },
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

/** Hardware unit prices (₽ each), realistic-but-illustrative (Phase 7.2). */
export const HARDWARE = {
  hinge: { name: "Петля Clip 110°", priceRub: 45 },
  slide: { name: "Направляющая (комплект)", priceRub: 320 },
  pin: { name: "Полкодержатель", priceRub: 4 },
  cam: { name: "Стяжка Minifix", priceRub: 12 },
  dowel: { name: "Шкант 8×30", priceRub: 2 },
} as const;

/** Cam-and-dowel joints per carcass box: top↔side ×2 + bottom↔side ×2 = 4, each 2 cams + 2 dowels. */
export const CAMS_PER_CARCASS = 8;
export const DOWELS_PER_CARCASS = 8;
/** An adjustable shelf rests on 4 pins. */
export const PINS_PER_SHELF = 4;

/** Hinges for one door leaf, by height (mm) — mirrors the pricing package's rule. */
export function hingesForDoorHeightMm(heightMm: number): number {
  if (heightMm <= 900) return 2;
  if (heightMm <= 1600) return 3;
  return 4;
}

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

/** "#rrggbb" → the integer colour three.js wants. */
export const hexToInt = (hex: string): number => parseInt(hex.replace("#", ""), 16);

/** Light-blue tint for glass panes (F1). */
export const GLASS_HEX = 0xbfe4f0;

/** The board decor a part is priced/coloured against: a per-part override (F2) wins over the role.
 *  Glass panes are NOT a board (returns undefined → not billed at a board rate). */
export function partBoard(plan: MaterialPlan, role: string | undefined, materialId?: string): BoardMaterial | undefined {
  if (role === "glass") return undefined;
  return (materialId ? boardById(materialId) : undefined) ?? boardForRole(plan, role);
}

/** The 3D colour (int) a part is drawn with — per-part override wins over role (F1 + F2). */
export function partColor(plan: MaterialPlan, role: string | undefined, materialId?: string): number {
  if (role === "glass") return GLASS_HEX;
  const b = partBoard(plan, role, materialId);
  return b ? hexToInt(b.hex) : 0xe7ddc9;
}

/** A decor's board thickness in mm10 (defaults to 16mm) — F2/7b: material carries thickness. */
export const boardThicknessMm10 = (id: string): number => (boardById(id)?.thickness_mm ?? 16) * 10;

/** Per-role board thickness (mm10) derived from the plan's decors, fed to solveStructure so a МДФ
 *  facade is 18mm while a ЛДСП carcass stays 16mm and a ХДФ back is 3mm (Phase 7b). */
export function planThickness(plan: MaterialPlan): { carcass: number; back: number; shelf: number; facade: number; divider: number } {
  const t = (id: string) => boardThicknessMm10(id);
  return { carcass: t(plan.carcass), back: t(plan.back), shelf: t(plan.shelf), facade: t(plan.facade), divider: t(plan.carcass) };
}
