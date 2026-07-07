// three/slotBinding.ts — Step 5.2 (CONSTRUCTION_FRAME_v4 §3.2, the "5th material mess" fix). A project
// keeps a small POOL of material variables (its plan's distinct board decors). A library block declares
// roles + may carry per-component decor overrides; opening it into the project must never SILENTLY grow
// that pool. These pure helpers detect the foreign decors an incoming block introduces and bind them —
// map each to an existing pool decor, or explicitly keep it (create a new variable). No UI, no store.
import type { MaterialPlan } from "./materials";
import type { StructuralModel } from "../../../../engine/contracts/structure";

/** A project's material pool = the distinct board decors its plan slots reference (its "material
 *  variables", §3.1). The edge band is a kromka variable (§3.3), so it is intentionally excluded. */
export function planDecors(plan: MaterialPlan): string[] {
  return [...new Set([plan.carcass, plan.back, plan.shelf, plan.facade])];
}

/** Every board decor a block actually uses: its plan slots + any per-component material override. */
export function modelDecors(model: StructuralModel, plan: MaterialPlan): string[] {
  const s = new Set(planDecors(plan));
  for (const b of model.blocks) for (const c of b.components) if (c.material) s.add(c.material);
  return [...s];
}

/** The decors an incoming block would introduce that the project `pool` doesn't already have — the
 *  §3.2 "5th material" candidates that must be mapped-or-created before the block joins the project. */
export function foreignDecors(pool: readonly string[], model: StructuralModel, plan: MaterialPlan): string[] {
  const have = new Set(pool);
  return modelDecors(model, plan).filter((d) => !have.has(d));
}

/**
 * Bind an incoming block to the project pool per `mapping` (foreign decor id → target pool decor id, or
 * null = KEEP it as a new variable). Rewrites every per-component override AND every plan slot that names
 * a mapped-away decor, so once applied no foreign decor that was mapped survives — the project's material
 * count only grows for the decors the user explicitly chose to keep (null).
 */
export function bindBlockMaterials(
  model: StructuralModel,
  plan: MaterialPlan,
  mapping: Record<string, string | null>,
): { model: StructuralModel; plan: MaterialPlan } {
  const remap = (decor: string | undefined): string | undefined => {
    if (!decor || !(decor in mapping)) return decor;
    return mapping[decor] ?? decor; // null → keep (create); a target id → rebind
  };
  const nextPlan: MaterialPlan = {
    ...plan,
    carcass: remap(plan.carcass) ?? plan.carcass,
    back: remap(plan.back) ?? plan.back,
    shelf: remap(plan.shelf) ?? plan.shelf,
    facade: remap(plan.facade) ?? plan.facade,
  };
  const nextModel: StructuralModel = {
    ...model,
    blocks: model.blocks.map((b) => ({
      ...b,
      components: b.components.map((c) => (c.material && c.material in mapping ? { ...c, material: mapping[c.material] ?? c.material } : c)),
    })),
  };
  return { model: nextModel, plan: nextPlan };
}
