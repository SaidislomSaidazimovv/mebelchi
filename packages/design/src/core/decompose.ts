// Phase 0.3 — the bridge. THE only way parts reach the app:
//
//   design (intent) + profile (construction) → panelDecomposition → Parts
//
// The app reads this result and renders it. It NEVER edits a Part, never stores
// one as state, never keys UI on part.id. When the design changes, we call this
// again; parts re-derive identically (idempotent), which is what protects undo.
//
// This file adds nothing to the engine — it calls it. Construction lives entirely
// in the profile (packages/construction), read-only here.

import { panelDecomposition } from "@mebelchi/construction/decompose";
import { QORASU_PROFILE } from "@mebelchi/construction/profiles";
import type {
  ConstructionProfile, DecomposeResult, DesignProject,
} from "@mebelchi/construction/design";

export type { DecomposeResult } from "@mebelchi/construction/design";

/** The workshop the app builds for. One profile, one source of construction truth. */
export const ACTIVE_PROFILE: ConstructionProfile = QORASU_PROFILE;

// ── memo: skip re-decomposing when neither the design snapshot nor the profile
//    changed. The design model is immutable (0.2), so a snapshot's identity is a
//    correct cache key: a new tree object means a real edit happened.
let lastDesign: DesignProject | null = null;
let lastProfile: ConstructionProfile | null = null;
let lastResult: DecomposeResult | null = null;

/**
 * Decompose a project into Parts. Memoized on (design, profile) object identity.
 * The result is READ-ONLY to the app: parts, flags (unbound slots / bad geometry),
 * and provenance (part.id → the nodeId to edit when that panel is tapped).
 *
 * The result is shallow-frozen so a caller cannot sort/splice the shared arrays in
 * place and poison the memo for the next identity-hit call. Parts/flags stay
 * read-only by law anyway; this makes an accidental in-place edit fail loudly.
 */
export function decompose(
  design: DesignProject, profile: ConstructionProfile = ACTIVE_PROFILE,
): DecomposeResult {
  if (design === lastDesign && profile === lastProfile && lastResult) return lastResult;
  const result = panelDecomposition(design, profile);
  Object.freeze(result.parts);
  Object.freeze(result.flags);
  Object.freeze(result);
  lastDesign = design;
  lastProfile = profile;
  lastResult = result;
  return result;
}
