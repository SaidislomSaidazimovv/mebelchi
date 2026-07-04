// Module → panels decomposition. This is the "turn a Project into a list of
// parts using the engine" step: `modulesToParts` emits engine `Part` objects
// (mm10 geometry, the engine's own contract) that could be fed straight to
// solveFull for the manufacturing path. `modulePanels` is the same decomposition
// carrying the material ref each panel is priced against — buildBom reads it.
//
// Pure: no I/O, no engine solve, deterministic from the model alone.

import type { Module, MaterialSelection } from "../../schema/src/index.js";
import type { Part } from "../../../engine/contracts/types.js";
import { mmToMm10 } from "../../../engine/core/units.js";
import { CARCASS_THICKNESS_MM, FACADE_THICKNESS_MM } from "./constants.js";

export type PanelRole = "carcass" | "facade";

/** A priced panel: engine-style geometry (mm) plus the material it's cut from. */
export interface DerivedPanel {
  role: PanelRole;
  name: string;
  /** X extent (mm) — maps to the engine Part's length. */
  lengthMm: number;
  /** Y extent (mm) — maps to the engine Part's width. */
  widthMm: number;
  /** RateTable material UUID this panel is priced against. */
  materialRef: string;
}

/** Number of shelf panels in a module (only `shelves` fill carries shelves). */
export function shelfCount(m: Module): number {
  return m.fill === "shelves" ? Math.max(0, m.count) : 0;
}

/** Number of drawer fronts (only `drawers` fill carries fronts). */
export function drawerCount(m: Module): number {
  return m.fill === "drawers" ? Math.max(0, m.count) : 0;
}

/** Does this module carry a facade (door or drawer fronts)? An "open" module has none. */
export function hasFacade(m: Module): boolean {
  if (m.fill === "open") return false;
  return drawerCount(m) > 0 || m.door.style !== "none";
}

/**
 * Decompose one module into its priced panels (frameless LDSP carcass + facade).
 * Carcass: 2 sides, top, bottom, back, N shelves, N dividers. Facade: one door,
 * or `count` drawer fronts. The back is priced as carcass material (the schema's
 * MaterialSelection carries no separate back material — a known simplification).
 */
export function modulePanels(m: Module, mats: MaterialSelection): DerivedPanel[] {
  // A hybrid module carries its real panels (decomposed from the Cell tree by the app); they already
  // carry rate refs, so use them verbatim instead of the fill/count approximation below.
  if (m.panels && m.panels.length) return m.panels;
  const t = CARCASS_THICKNESS_MM;
  const carcass = mats.carcassId;
  const facade = m.facadeMaterialId ?? mats.facadeId;
  const innerW = m.w - 2 * t;
  const panels: DerivedPanel[] = [
    { role: "carcass", name: "side-left", lengthMm: m.h, widthMm: m.d, materialRef: carcass },
    { role: "carcass", name: "side-right", lengthMm: m.h, widthMm: m.d, materialRef: carcass },
    { role: "carcass", name: "bottom", lengthMm: innerW, widthMm: m.d, materialRef: carcass },
    { role: "carcass", name: "top", lengthMm: innerW, widthMm: m.d, materialRef: carcass },
    { role: "carcass", name: "back", lengthMm: m.w, widthMm: m.h, materialRef: carcass },
  ];

  const shelves = shelfCount(m);
  for (let i = 0; i < shelves; i++) {
    panels.push({ role: "carcass", name: `shelf-${i + 1}`, lengthMm: innerW, widthMm: m.d, materialRef: carcass });
  }
  for (let i = 0; i < m.dividers; i++) {
    panels.push({ role: "carcass", name: `divider-${i + 1}`, lengthMm: m.h, widthMm: m.d, materialRef: carcass });
  }

  const drawers = drawerCount(m);
  if (drawers > 0) {
    const frontH = m.h / drawers;
    for (let i = 0; i < drawers; i++) {
      panels.push({ role: "facade", name: `drawer-front-${i + 1}`, lengthMm: frontH, widthMm: m.w, materialRef: facade });
    }
  } else if (m.fill !== "drawers" && m.door.style !== "none") {
    panels.push({ role: "facade", name: "door", lengthMm: m.h, widthMm: m.w, materialRef: facade });
  }

  return panels;
}

/** Face area of a panel, in m² (the unit `panel` BOM lines are priced in). */
export function panelAreaM2(p: DerivedPanel): number {
  return (p.lengthMm * p.widthMm) / 1_000_000;
}

/**
 * Turn a project's run into engine `Part` objects — the engine's locked contract
 * (mm10 integers, X along length / Y along width). Operations are left empty:
 * pricing needs counts (derived in buildBom), not placed drill coordinates; the
 * Layer-2 solver fills operations in when the manufacturing path runs.
 */
export function modulesToParts(project: { run: Module[]; materials: MaterialSelection }): Part[] {
  const parts: Part[] = [];
  for (const m of project.run) {
    for (const p of modulePanels(m, project.materials)) {
      const band = p.role === "facade" ? mmToMm10(2) : 0; // 2mm visible kromka on facades
      parts.push({
        id: `${m.id}:${p.name}`,
        name: p.name,
        length_mm10: mmToMm10(p.lengthMm),
        width_mm10: mmToMm10(p.widthMm),
        thickness_mm10: mmToMm10(p.role === "facade" ? FACADE_THICKNESS_MM : CARCASS_THICKNESS_MM),
        grain: "NONE",
        edges: [band, band, band, band],
        operations: [],
      });
    }
  }
  return parts;
}
