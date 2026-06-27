// buildBom: Project → normalised BOM (PRICING_AND_SCHEMA.md §3).
//
// Returns RawBomLine[] = Omit<BomLine,'rate'|'amount'|'group'> — quantities and
// refs only. priceProject applies rates, amounts and groups. Pure and
// deterministic: same model → same BOM, no I/O.

import type { Project, Module, RawBomLine } from "../../schema/src/index.js";
import {
  modulePanels,
  panelAreaM2,
  shelfCount,
  drawerCount,
  hasFacade,
} from "./parts.js";
import {
  DEFAULT_HARDWARE_SKUS,
  CAMS_PER_MODULE,
  DOWELS_PER_MODULE,
  HOLES_PER_HINGE,
  HOLES_PER_SHELF,
  HOLES_PER_SLIDE_SET,
  hingesForDoorHeight,
} from "./constants.js";

/** Hinges on a module's door (0 for drawer or open modules). */
function hingeCount(m: Module): number {
  const doored = m.fill !== "drawers" && m.door.style !== "none";
  return doored ? hingesForDoorHeight(m.h) : 0;
}

/** Visible (2mm) edge-banding length for a module, in mm — front facade edges. */
function visibleEdgeMm(m: Module): number {
  if (!hasFacade(m)) return 0;
  const drawers = drawerCount(m);
  if (drawers > 0) {
    // `drawers` fronts, each (w × h/drawers): Σ perimeter = 2·drawers·w + 2·h.
    return 2 * drawers * m.w + 2 * m.h;
  }
  return 2 * (m.w + m.h); // single door perimeter
}

/** Hidden (0.4mm) edge-banding length for a module, in mm — carcass front frame. */
function hiddenEdgeMm(m: Module): number {
  return 2 * (m.w + m.h);
}

export function buildBom(project: Project): RawBomLine[] {
  const lines: RawBomLine[] = [];
  const mats = project.materials;

  for (const m of project.run) {
    // --- panels (carcass + facade) → m² lines, one per panel ---
    const panels = modulePanels(m, mats);
    for (const p of panels) {
      lines.push({ kind: "panel", ref: p.materialRef, qty: panelAreaM2(p), unit: "m2" });
    }

    // --- edge banding (material) ---
    const visM = visibleEdgeMm(m) / 1000;
    const hidM = hiddenEdgeMm(m) / 1000;
    if (visM > 0) lines.push({ kind: "edge", ref: mats.edgeVisibleId, qty: visM, unit: "m" });
    if (hidM > 0) lines.push({ kind: "edge", ref: mats.edgeHiddenId, qty: hidM, unit: "m" });

    // --- hardware ---
    const hinges = hingeCount(m);
    const slides = drawerCount(m); // one slide set per drawer
    if (hinges > 0) lines.push({ kind: "hardware", ref: DEFAULT_HARDWARE_SKUS.hinge, qty: hinges, unit: "unit" });
    if (slides > 0) lines.push({ kind: "hardware", ref: DEFAULT_HARDWARE_SKUS.slide, qty: slides, unit: "unit" });
    lines.push({ kind: "hardware", ref: DEFAULT_HARDWARE_SKUS.dowel, qty: DOWELS_PER_MODULE, unit: "unit" });
    lines.push({ kind: "hardware", ref: DEFAULT_HARDWARE_SKUS.cam, qty: CAMS_PER_MODULE, unit: "unit" });

    // --- operations (CNC) ---
    const holes =
      hinges * HOLES_PER_HINGE +
      (CAMS_PER_MODULE + DOWELS_PER_MODULE) +
      shelfCount(m) * HOLES_PER_SHELF +
      slides * HOLES_PER_SLIDE_SET;
    if (holes > 0) lines.push({ kind: "operation", ref: "drillPerHole", qty: holes, unit: "hole" });
    lines.push({ kind: "operation", ref: "cutPerPanel", qty: panels.length, unit: "panel" });
    const bandM = visM + hidM;
    if (bandM > 0) lines.push({ kind: "operation", ref: "edgebandPerM", qty: bandM, unit: "m" });

    // --- worktop (base modules only, when one is selected) ---
    if (m.kind === "base" && mats.worktopId) {
      lines.push({ kind: "worktop", ref: mats.worktopId, qty: m.w / 1000, unit: "m" });
    }
  }

  // --- labor (project level) ---
  const moduleCount = project.run.length;
  if (moduleCount > 0) {
    lines.push({ kind: "labor", ref: "assemblyPerModule", qty: moduleCount, unit: "module" });
  }
  const hardeningCount = project.run.reduce((n, m) => n + (m.hardening?.length ?? 0), 0);
  if (hardeningCount > 0) {
    lines.push({ kind: "labor", ref: "hardeningPerPreset", qty: hardeningCount, unit: "unit" });
  }

  // --- delivery (project level) ---
  lines.push({ kind: "delivery", ref: "base", qty: 1, unit: "unit" });
  lines.push({ kind: "delivery", ref: "perModule", qty: moduleCount, unit: "module" });

  return lines;
}
