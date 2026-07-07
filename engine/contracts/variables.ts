// Layer 4 · Construction-mode VARIABLES (CONSTRUCTION_FRAME_v4 §3, §4).
//
// Everything the workshop repeats is a GLOBAL variable with a short label, a colour and per-project
// values — so a project's material/edge/joint list stays small and a change propagates everywhere.
// v4 §3: "Thickness travels with the material" — a Part references a variable slot, never a concrete
// number, so changing MaterialVar B's thickness 16→18 re-solves the geometry of every B-part.
//
// This module is ADDITIVE and type-only: it introduces the variable + division-rule shapes. Wiring
// them into the solver (thickness reflow) and the resize solver (rule resolution) are later Step-1/2
// pieces. Units are mm10 (tenths of a mm), the engine convention. Every field is `readonly`.

import type { mm10 } from "./types.js";
import type { ComponentId } from "./structure.js";

// ---------------------------------------------------------------------------
// Material variable (v4 §3.1) — a named global material slot
// ---------------------------------------------------------------------------

/** The construction role a material slot plays. `fasad|korpus|orqa` are the three defaults; any other
 *  string is a custom role (D, E…), bound on insert by the slot-binding rule (§3.2, a later step). */
export type MaterialRole = "fasad" | "korpus" | "orqa" | (string & {});

/**
 * A global material slot (Материал A/B/C). Every Part references a slot by `id`, never a concrete
 * decor or number — so `thickness` (and colour/price) live in ONE place and a change reflows the whole
 * model. `label` is the short UI name (A/B/C…); `role` maps the slot to a construction role.
 */
export interface MaterialVar {
  readonly id: string;
  /** Short UI label — "A" | "B" | "C" | … */
  readonly label: string;
  readonly role: MaterialRole;
  /** Decor / catalog SKU key (the app resolves it to a real decor). */
  readonly sku: string;
  /** Board thickness — TRAVELS with the material (§3.1); the solver reads it from here. */
  readonly thickness_mm10: mm10;
  /** Price per m² (minor currency units), optional until the real feed lands. */
  readonly pricePerM2?: number;
  /** View colour (hex / css) for the Materials view tint. */
  readonly color: string;
}

// ---------------------------------------------------------------------------
// Kromka (Jiyak) variable (v4 §3.3) — a named global edge-band slot
// ---------------------------------------------------------------------------

/**
 * A global edge-band (jiyak) slot — K1 (e.g. 2mm visible), K2 (0.4mm hidden), K3… Parts reference a
 * K-slot per edge (4 edges); no Component may carry a private kromka (§3.3 binding rule). `pattern`
 * drives the Frame view; `color` drives the Kromka view.
 */
export interface KromkaVar {
  readonly id: string;
  /** Short UI label — "K1" | "K2" | … */
  readonly label: string;
  readonly sku: string;
  readonly thickness_mm10: mm10;
  /** Frame-view pattern key (optional). */
  readonly pattern?: string;
  /** Kromka-view colour (hex / css). */
  readonly color: string;
}

// ---------------------------------------------------------------------------
// Joint profile (v4 §3.4, §8.2) — one hole/joint rule set per project
// ---------------------------------------------------------------------------

/**
 * The workshop's drilling law as a global variable (§3.4): cam + dowel specs, the System-32 hole
 * grid, and the minimum edge margin. The engine places holes per this profile (Step 7); a per-joint
 * override is allowed with a warning. Grounded values come from `FACTORY_CHECKLIST.md`.
 */
export interface JointProfile {
  readonly id: string;
  /** Ø15 cam / minifix. */
  readonly camSku: string;
  readonly camSeatDepth_mm10: mm10;
  /** Ø8 dowel (optional until specced). */
  readonly dowelSku?: string;
  /** The System-32 hole grid. Setbacks are front/back separately (FACTORY_CHECKLIST). */
  readonly system32: {
    readonly pitch_mm10: mm10;
    readonly frontSetback_mm10: mm10;
    readonly backSetback_mm10: mm10;
  };
  /** Minimum distance a hole must keep from a panel edge; a closer edit warns (§8.2.3). */
  readonly minEdgeMargin_mm10: mm10;
}

// ---------------------------------------------------------------------------
// Division rule (v4 §4) — carried by every Line
// ---------------------------------------------------------------------------

/**
 * How a Line's gap resolves when its parent is resized (the whole ratio system as one union, §4):
 *   • fixed  — an absolute distance in mm10 (e.g. a 100mm plinth) — never changes on resize.
 *   • ratio  — a proportional share by `weight` (shelves 1 : 1 : 0.6).
 *   • locked — the dimension is owned by the Component in the space (e.g. a sled height 180mm);
 *              Building-mode resize can NOT change it.
 *   • flex   — absorbs the leftover after fixed/locked/ratio are satisfied (the hanging zone).
 * Step 1 STORES the rule (+ round-trips it); the resize SOLVER that resolves the chain is Step 2.
 */
export type DivisionRule =
  | { readonly kind: "fixed"; readonly mm10: mm10 }
  | { readonly kind: "ratio"; readonly weight: number }
  | { readonly kind: "locked"; readonly componentId: ComponentId }
  | { readonly kind: "flex" };

/** The default rule for a freshly created line — absorbs leftover, so nothing over-constrains. */
export const DEFAULT_DIVISION_RULE: DivisionRule = { kind: "flex" };
