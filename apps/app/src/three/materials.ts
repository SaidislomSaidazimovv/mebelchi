// three/materials.ts — the material / decor catalog for the KARKAS editor (Phase 5.C). A small,
// pure data module kept SEPARATE from the kitchen's model/materials.ts (Eman.uz catalog) so the
// kitchen Стиль flow is never touched. Board decors (ЛДСП / МДФ / ХДФ with a сум/m² rate and a swatch
// colour), edge-band materials (сум/m), and a MaterialPlan saying which decor each PANEL ROLE is cut
// — all prices are PROVISIONAL placeholders in UZS (the app's base currency), pending a real feed.
// from. estimate.ts prices a solved model against a plan; the «Спецификация» panel picks the decors.
// Rates are realistic-but-illustrative UZS figures — swap for a live rate table later.

/** A sheet-good decor: priced per square metre, drawn with a swatch colour, cut at a thickness (mm). */
export interface BoardMaterial {
  id: string;
  name: string;
  hex: string;
  pricePerM2: number;
  thickness_mm: number;
}

/** An edge-banding material (kromka / jiyak K-variable): priced per running metre, with a view colour
 *  for the Kromka-mode pills + edge balls (Step 6). */
export interface EdgeMaterial {
  id: string;
  name: string;
  pricePerM: number;
  hex: string;
}

export const BOARDS: readonly BoardMaterial[] = [
  { id: "ldsp_white", name: "ЛДСП Белый", hex: "#f4f2ec", pricePerM2: 150000, thickness_mm: 16 },
  { id: "ldsp_sonoma", name: "ЛДСП Дуб Сонома", hex: "#c9a877", pricePerM2: 175000, thickness_mm: 16 },
  { id: "ldsp_wenge", name: "ЛДСП Венге", hex: "#4b3a2f", pricePerM2: 178000, thickness_mm: 16 },
  { id: "ldsp_graphite", name: "ЛДСП Графит", hex: "#4a4d52", pricePerM2: 185000, thickness_mm: 16 },
  { id: "ldsp_anthracite", name: "ЛДСП Антрацит", hex: "#2f3237", pricePerM2: 195000, thickness_mm: 16 },
  { id: "mdf_white_matt", name: "МДФ Белый мат", hex: "#eceae4", pricePerM2: 380000, thickness_mm: 18 },
  { id: "hdf_white", name: "ХДФ Белый (задняя)", hex: "#e8e4d8", pricePerM2: 55000, thickness_mm: 3 },
  // Sokol-usti / worktop (Phase 1.2). The real material is priced PER METRE in the kitchen world
  // (packages/pricing/seed/rate-table.seed.json: «Столешница постформинг 38мм» @ 185000/m). Karkas
  // prices by m², so we carry an m²-equivalent: 185000/m ÷ 0.6 m standard worktop depth ≈ 308333/m²
  // (founder decision (a) — exact at ~600mm depth, an approximation for unusual depths; exact per-metre
  // is a later refinement). thickness_mm = 38 is the real product; the kitchen's 40 was visual only.
  { id: "worktop_postform_38", name: "Столешница постформинг 38мм", hex: "#b9ac93", pricePerM2: 308333, thickness_mm: 38 },
];

export const EDGES: readonly EdgeMaterial[] = [
  { id: "pvc_white_2", name: "ПВХ 2мм Белый", pricePerM: 8000, hex: "#f4f2ec" },
  { id: "pvc_sonoma_2", name: "ПВХ 2мм Сонома", pricePerM: 10000, hex: "#c9a877" },
  { id: "pvc_graphite_2", name: "ПВХ 2мм Графит", pricePerM: 10000, hex: "#4a4d52" },
  { id: "abs_05", name: "ABS 0.5мм в цвет", pricePerM: 4500, hex: "#d8cdb6" },
];

/** A kromka (jiyak) K-variable for the Step-6 paint UI: an edge material + its swatch colour. */
export const edgeVarById = (id: string | null | undefined): EdgeMaterial | undefined => (id ? EDGES.find((e) => e.id === id) : undefined);

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
  worktop: string; // carcass_worktop (Phase 1.2 — the worktop's own decor)
  edge: string; // edge-band material id
}

export const DEFAULT_PLAN: MaterialPlan = {
  carcass: "ldsp_white",
  back: "hdf_white",
  shelf: "ldsp_white",
  facade: "ldsp_white",
  worktop: "worktop_postform_38",
  edge: "pvc_white_2",
};

/**
 * Fill any missing slots of a loaded plan from DEFAULT_PLAN. Saved projects predate later slots (a v1
 * plan has no `worktop`), so every place that parses a plan from JSON must merge the defaults, or the
 * new slot loads `undefined` and its parts price at 0 / render as bare wood. One helper so a FUTURE
 * slot addition is safe everywhere at once, instead of re-hunting parse sites. Absent → DEFAULT_PLAN.
 */
export const withPlanDefaults = (p?: Partial<MaterialPlan> | null): MaterialPlan => ({ ...DEFAULT_PLAN, ...(p ?? {}) });

export const boardById = (id: string): BoardMaterial | undefined => BOARDS.find((b) => b.id === id);
export const edgeById = (id: string): EdgeMaterial | undefined => EDGES.find((e) => e.id === id);

/** Hardware unit prices (сум each) — provisional UZS placeholders (Phase 7.2). */
export const HARDWARE = {
  hinge: { name: "Петля Clip 110°", priceUzs: 13000 },
  slide: { name: "Направляющая (комплект)", priceUzs: 90000 },
  pin: { name: "Полкодержатель", priceUzs: 1200 },
  cam: { name: "Стяжка Minifix", priceUzs: 3500 },
  dowel: { name: "Шкант 8×30", priceUzs: 600 },
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
    case "carcass_plinth":
      return "carcass"; // the sokol is carcass stock (the `default` would already do this — explicit per the role rule)
    case "carcass_worktop":
      return "worktop"; // the stoleshnitsa has its OWN slot (postforming, its own decor + thickness)
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

/** Glass tint as a hex string (for the info-card colour bar). */
const GLASS_HEX_STR = "#bfe4f0";

/**
 * The distinct material colours (hex) of a set of parts, in first-seen order — the info card's
 * multi-segment material bar (CONSTRUCTION_FRAME_v4 §5: one segment per material in the selection).
 * A single-material selection yields one colour; a drawer/glazed component yields several.
 */
export function selectionColors(parts: readonly { role?: string; materialId?: string }[], plan: MaterialPlan): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const hex = p.role === "glass" ? GLASS_HEX_STR : (partBoard(plan, p.role, p.materialId)?.hex ?? "#e7ddc9");
    if (!seen.has(hex)) { seen.add(hex); out.push(hex); }
  }
  return out.length > 0 ? out : ["#e7ddc9"];
}

/** Strip a doubled / partial-double LAYER suffix so a split manufacturing part maps back to the
 *  SINGLE render board `solveLayout` draws for it. `solveStructure` emits two boards for a 32mm build
 *  (`X__a` outer + `X__b` inner) and a front strip for a partial double (`X__front`), while the
 *  viewport draws one box `X` — without this the render board finds no colour and falls back to bare
 *  WOOD (F1 regression for 32mm shelves/doors and glazed-grid stiles/rails). */
const layoutBaseId = (id: string): string => id.replace(/__(a|b|front)$/, "");

/**
 * Build the `id → colour` lookup the renderer (structureRenderer.buildStructureGroup) needs, from a
 * solved part list + material plan. Registers each part's exact id AND its layout base id, so a
 * doubled/partial-double part still colours its single render board. The OUTER layer (`__a`, listed
 * first by `doublePanel`) wins the base id; an un-split part's own id is authoritative. Used by BOTH
 * the karkas editor and the room layer so their colours are guaranteed identical.
 */
export function partColorLookup(
  parts: readonly { id: string; role?: string; materialId?: string }[],
  plan: MaterialPlan,
): (id: string) => number | undefined {
  const m = new Map<string, number>();
  for (const p of parts) {
    const c = partColor(plan, p.role, p.materialId);
    m.set(p.id, c); // exact match (single boards, glass panes, muntins)
    const base = layoutBaseId(p.id);
    if (base !== p.id && !m.has(base)) m.set(base, c); // doubled/partial → colour the single render board
  }
  return (id) => m.get(id);
}

/**
 * Step 5 — the distinct board materials actually used in a solved part list, with a panel count each
 * (glass panes excluded — they aren't a board decor). Drives the materials-view legend: "see everything
 * by material" without inventing anything the project doesn't already contain.
 */
export function projectMaterials(
  parts: readonly { id: string; role?: string; materialId?: string }[],
  plan: MaterialPlan,
): { id: string; name: string; hex: string; count: number }[] {
  const map = new Map<string, { id: string; name: string; hex: string; count: number }>();
  for (const p of parts) {
    const b = partBoard(plan, p.role, p.materialId);
    if (!b) continue;
    const e = map.get(b.id);
    if (e) e.count++;
    else map.set(b.id, { id: b.id, name: b.name, hex: b.hex, count: 1 });
  }
  return [...map.values()];
}

/**
 * Step 5 — a `renderBoardId → materialId` lookup for the materials-view isolate filter. Mirrors
 * `partColorLookup`: registers each part's exact id AND its layout base id, so a doubled/partial-double
 * board still resolves to its decor. Returns undefined for glass / untagged parts.
 */
export function materialIdLookup(
  parts: readonly { id: string; role?: string; materialId?: string }[],
  plan: MaterialPlan,
): (id: string) => string | undefined {
  const m = new Map<string, string>();
  for (const p of parts) {
    const b = partBoard(plan, p.role, p.materialId);
    if (!b) continue;
    m.set(p.id, b.id);
    const base = layoutBaseId(p.id);
    if (base !== p.id && !m.has(base)) m.set(base, b.id);
  }
  return (id) => m.get(id);
}

/** A decor's board thickness in mm10 (defaults to 16mm) — F2/7b: material carries thickness. */
export const boardThicknessMm10 = (id: string): number => (boardById(id)?.thickness_mm ?? 16) * 10;

/** Per-role board thickness (mm10) derived from the plan's decors, fed to solveStructure so a МДФ
 *  facade is 18mm while a ЛДСП carcass stays 16mm and a ХДФ back is 3mm (Phase 7b). */
export function planThickness(plan: MaterialPlan): { carcass: number; back: number; shelf: number; facade: number; divider: number; worktop: number } {
  const t = (id: string) => boardThicknessMm10(id);
  return { carcass: t(plan.carcass), back: t(plan.back), shelf: t(plan.shelf), facade: t(plan.facade), divider: t(plan.carcass), worktop: t(plan.worktop) };
}
