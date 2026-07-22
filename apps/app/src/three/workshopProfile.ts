// apps/app/src/three/workshopProfile.ts — Phase 6. A GLOBAL, persisted "workshop profile": the factory
// defaults the usta configures ONCE and applies to every project — materials + kromka (via the MaterialPlan),
// hole/connector standards (JointProfile), and per-role board thickness overrides. App-side only: it BUNDLES
// the existing MaterialPlan + JointProfile (no new engine type) and never touches the paused
// packages/construction ConstructionProfile.

import { DEFAULT_PLAN, type MaterialPlan } from "./materials";
import { defaultJointProfile } from "../../../../engine/cnc.js";
import type { JointProfile } from "../../../../engine/contracts/variables.js";
import type { ThicknessSpec } from "../../../../engine/structure/solve.js";

export interface WorkshopProfile {
  /** Per-role decor (korpus / orqa / polka / fasad / stoleshnitsa) + the kromka tape (`plan.edge`). Thickness
   *  travels with the decor unless a `thickness` override below wins. */
  readonly plan: MaterialPlan;
  /** System-32 pitch/setbacks, cam SKU + seat depth, min-edge margin — drives drilling. */
  readonly jointProfile: JointProfile;
  /** Per-role mm10 board-thickness OVERRIDES that win over the decor-derived default; absent roles keep it. */
  readonly thickness?: Partial<ThicknessSpec>;
}

const KEY = "mebelchi.karkas.workshopProfile.v1";

export function defaultWorkshopProfile(): WorkshopProfile {
  return { plan: DEFAULT_PLAN, jointProfile: defaultJointProfile() };
}

/** Load the saved workshop profile from localStorage; fall back to the built-in default on ANY problem
 *  (no storage / SSR / corrupt JSON / missing fields). Never throws. */
export function loadWorkshopProfile(): WorkshopProfile {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return defaultWorkshopProfile();
    const p = JSON.parse(raw) as Partial<WorkshopProfile> | null;
    if (!p || typeof p !== "object" || !p.plan || !p.jointProfile) return defaultWorkshopProfile();
    return { plan: p.plan, jointProfile: p.jointProfile, ...(p.thickness ? { thickness: p.thickness } : {}) };
  } catch {
    return defaultWorkshopProfile();
  }
}

/** Persist the workshop profile globally. Best-effort — never throws (storage may be unavailable / full). */
export function saveWorkshopProfile(profile: WorkshopProfile): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable — a save is best-effort */
  }
}

/** Clear the saved profile (test / reset). Never throws. */
export function clearWorkshopProfile(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
