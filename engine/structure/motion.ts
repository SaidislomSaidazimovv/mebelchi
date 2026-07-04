// engine/structure/motion.ts — sliding-accessory motion envelope + clearance (E9).
//
// CONSTRUCTION_FRAME_v3 Piece 1 step 6: "Place sliding pants accessory (component with motion
// envelope)" — the one moving part in v3 (:148, :161). A component with `motion` sweeps a clearance
// volume as it slides; nothing may obstruct that travel. This models the ENVELOPE + a non-blocking
// clearance ⚠ (like stability). It is NOT drawer/rail hardware (slide drilling is out of scope).
// Pure + Metro-safe (layout placements + box math only).

import type { Axis, BlockId, InstanceId, StructuralModel } from "../contracts/structure.js";
import type { mm10 } from "../contracts/types.js";
import { solveLayout, type PanelPlacement } from "./layout.js";

export interface MotionEnvelope {
  readonly axis: Axis;
  readonly travel_mm10: mm10;
}

interface Box6 {
  readonly x: mm10;
  readonly y: mm10;
  readonly z: mm10;
  readonly w: mm10;
  readonly h: mm10;
  readonly d: mm10;
}

/**
 * The swept clearance volume of a placement that slides `travel` along `axis`: the home box grown by
 * the travel on BOTH sides of the axis (the accessory may slide either way, so the check stays
 * conservative). Everything inside must be clear for the accessory to move.
 */
export function sweptEnvelope(p: PanelPlacement, motion: MotionEnvelope): Box6 {
  const t = Math.max(0, motion.travel_mm10);
  if (motion.axis === "x") return { x: p.x_mm10 - t, y: p.y_mm10, z: p.z_mm10, w: p.w_mm10 + 2 * t, h: p.h_mm10, d: p.d_mm10 };
  if (motion.axis === "y") return { x: p.x_mm10, y: p.y_mm10 - t, z: p.z_mm10, w: p.w_mm10, h: p.h_mm10 + 2 * t, d: p.d_mm10 };
  return { x: p.x_mm10, y: p.y_mm10, z: p.z_mm10 - t, w: p.w_mm10, h: p.h_mm10, d: p.d_mm10 + 2 * t };
}

const asBox = (p: PanelPlacement): Box6 => ({ x: p.x_mm10, y: p.y_mm10, z: p.z_mm10, w: p.w_mm10, h: p.h_mm10, d: p.d_mm10 });

/** Do two axis-aligned boxes overlap with positive volume on all three axes? */
function overlaps(a: Box6, b: Box6): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h &&
    a.z < b.z + b.d && b.z < a.z + a.d
  );
}

export interface MotionFinding {
  readonly blockId: BlockId;
  readonly instanceId: InstanceId;
  readonly blockerId: string;
  readonly message_ru: string;
}

/**
 * Motion clearance (non-blocking ⚠, E9): for every sliding accessory, its swept envelope must clear
 * the other content placements. Where it overlaps another instance's panel, the accessory can't
 * travel — flag it (pick a shorter travel or move the obstruction). Carcass panels are not content,
 * so only instance-vs-instance obstructions are reported.
 */
export function checkMotionClearance(model: StructuralModel): MotionFinding[] {
  const findings: MotionFinding[] = [];
  const placements = solveLayout(model);
  const instPlacements = placements.filter((p) => p.id.includes("__inst_"));

  for (const block of model.blocks) {
    const compById = new Map(block.components.map((c) => [c.id, c] as const));
    for (const inst of block.instances) {
      const motion = compById.get(inst.componentId)?.motion;
      if (!motion) continue;
      const homeId = `${block.id}__inst_${inst.id}`;
      const home = instPlacements.find((p) => p.id === homeId);
      if (!home) continue;

      const env = sweptEnvelope(home, motion);
      const homeBox = asBox(home);
      for (const other of instPlacements) {
        if (other.id === homeId) continue;
        const b = asBox(other);
        if (overlaps(env, b) && !overlaps(homeBox, b)) {
          findings.push({
            blockId: block.id,
            instanceId: inst.id,
            blockerId: other.id,
            message_ru: `Выдвижной элемент «${inst.id}»: ход перекрыт деталью «${other.id}». Уменьшите ход или уберите препятствие.`,
          });
        }
      }
    }
  }
  return findings;
}
