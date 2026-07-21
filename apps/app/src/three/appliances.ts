// three/appliances.ts — Phase 3.b. Derive world-space FITTINGS (position + real size + kind) for every
// built-in appliance, so `buildApplianceGroup` can draw it. An appliance emits NO cut part, so — unlike the
// handle (derived off drill holes) — a fitting is derived from the INSTANCE's SECTION world box
// (`leafSectionBoxes`) + the appliance's real built-in size (`APPLIANCE`). Drawn at real size (not the
// cavity), so a too-big appliance visibly overhangs its cabinet — an honest fit cue.
//
// Render derivation (reuses app-side leafSectionBoxes + APPLIANCE) → lives app-side, like handles.ts.

import type { StructuralModel, ApplianceKind, PanelCutout, PanelFeatures, Section } from "../../../../engine/contracts/structure.js";
import type { PanelPlacement } from "../../../../engine/structure/layout.js";
import { WORKTOP_OVERHANG_MM10 } from "../../../../engine/structure/solve.js";
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

// ── Phase 3.c — auto worktop cutout for a hob / sink ──────────────────────────────────────────────────
const LIP_MM = 20; // the appliance rests on a 20mm lip; its body drops through a hole 2×20mm smaller
const CUTOUT_KINDS = new Set<ApplianceKind>(["hob", "sink"]); // only these punch the worktop
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Find a section (leaf OR parent) by id anywhere in a block's zone trees. */
function sectionOfId(block: StructuralModel["blocks"][number], id: string): Section | null {
  for (const z of block.zones) {
    const stack: Section[] = [z.root];
    while (stack.length) {
      const s = stack.pop()!;
      if (s.id === id) return s;
      for (const c of s.children) stack.push(c);
    }
  }
  return null;
}

/**
 * Phase 3.c — DERIVED: return the model with a real `PanelCutout` merged into each `__worktop` part's
 * features for every hob/sink appliance on a worktop block (size = appliance − 2×20mm lip, centred on the
 * appliance's section, clamped in-bounds). Keyed `appliance_<instId>` so it coexists with — and never
 * disturbs — a user's own worktop cutout, and is recomputed fresh each call. Returns the SAME model ref
 * when nothing applies (no hob/sink on a worktop) → byte-identical. Both the render (via model.features) and
 * the CNC (via applyFeatures) then punch the hole from this one overlay.
 */
export function withApplianceCutouts(model: StructuralModel): StructuralModel {
  const add = new Map<string, PanelCutout[]>();
  for (const b of model.blocks) {
    if (!b.worktop) continue; // no worktop → nowhere to cut
    const wtLen = b.box.w; // worktop part length = block width (mm10)
    const wtWid = b.box.d + WORKTOP_OVERHANG_MM10; // worktop part width = depth + front overhang
    for (const inst of b.instances) {
      const kind = b.components.find((c) => c.id === inst.componentId)?.appliance;
      if (!kind || !CUTOUT_KINDS.has(kind)) continue;
      const sec = sectionOfId(b, inst.sectionId);
      if (!sec) continue;
      const a = APPLIANCE[kind];
      const cw = Math.max(1000, (a.w_mm - 2 * LIP_MM) * 10); // mm10, appliance width − 2×lip
      const ch = Math.max(1000, (a.d_mm - 2 * LIP_MM) * 10); // mm10, appliance depth − 2×lip
      const left = clamp(sec.box.x + Math.round(sec.box.w / 2 - cw / 2), 0, Math.max(0, wtLen - cw));
      const bottom = clamp(Math.round((wtWid - ch) / 2), 0, Math.max(0, wtWid - ch));
      const cut: PanelCutout = { id: `appliance_${inst.id}`, w_mm10: cw, h_mm10: ch, offset: [left, 0, 0, bottom], locked: [false, false, false, false] };
      const wtId = `${b.id}__worktop`;
      const list = add.get(wtId);
      if (list) list.push(cut); else add.set(wtId, [cut]);
    }
  }
  if (add.size === 0) return model; // same ref — byte-identical
  const features: Record<string, PanelFeatures> = { ...(model.features ?? {}) };
  for (const [wtId, cuts] of add) {
    const kept = (features[wtId]?.cutouts ?? []).filter((c) => !c.id.startsWith("appliance_")); // preserve user cutouts
    features[wtId] = { ...features[wtId], cutouts: [...kept, ...cuts] };
  }
  return { ...model, features };
}
