// three/appliances.ts — Phase 3.b. Derive world-space FITTINGS (position + real size + kind) for every
// built-in appliance, so `buildApplianceGroup` can draw it. An appliance emits NO cut part, so — unlike the
// handle (derived off drill holes) — a fitting is derived from the INSTANCE's SECTION world box
// (`leafSectionBoxes`) + the appliance's real built-in size (`APPLIANCE`). Drawn at real size (not the
// cavity), so a too-big appliance visibly overhangs its cabinet — an honest fit cue.
//
// Render derivation (reuses app-side leafSectionBoxes + APPLIANCE) → lives app-side, like handles.ts.

import type { StructuralModel, ApplianceKind } from "../../../../engine/contracts/structure.js";
import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import { leafSectionBoxes } from "./structureScene.js";
import { APPLIANCE } from "./materials.js";

export interface ApplianceFitting {
  /** the appliance instance's part-base id (`<block>__inst_<id>`) */
  id: string;
  kind: ApplianceKind;
  /** box centre in metres, scene space (recentred like the boards) */
  center: [number, number, number];
  /** real appliance size in metres [w, h, d] */
  size: [number, number, number];
}

const M = (mm: number): number => mm / 1000; // mm → metres

/** Appliance fittings for a model. Empty when nothing carries an appliance → an empty render group, so a
 *  model without appliances renders byte-identically to today. */
export function applianceFittings(model: StructuralModel, places: readonly PanelPlacement[]): ApplianceFitting[] {
  const secBoxes = new Map(leafSectionBoxes(model, places).map((s) => [s.id, s]));
  const out: ApplianceFitting[] = [];
  for (const b of model.blocks) {
    for (const inst of b.instances) {
      const kind = b.components.find((c) => c.id === inst.componentId)?.appliance;
      if (!kind) continue;
      const sec = secBoxes.get(inst.sectionId);
      if (!sec) continue;
      const a = APPLIANCE[kind];
      const size: [number, number, number] = [M(a.w_mm), M(a.h_mm), M(a.d_mm)];
      // Centre along width (X) + depth (Z). Vertically: hob/sink sit at the section TOP (worktop plane);
      // the rest are centred in the opening (refined per-kind later, once 3.d picks the right cabinet).
      const topAligned = kind === "hob" || kind === "sink";
      const cy = topAligned ? sec.center[1] + sec.size[1] / 2 - size[1] / 2 : sec.center[1];
      out.push({ id: `${b.id}__inst_${inst.id}`, kind, center: [sec.center[0], cy, sec.center[2]], size });
    }
  }
  return out;
}
