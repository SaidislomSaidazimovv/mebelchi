// engine/structure/drilling.ts — S3-E2 primitive integration (shelf pins).
//
// `solveStructure` produces blank panels (operations: []). THIS pass walks that part set
// plus the structural model and calls the Layer-1 drilling primitives to fill in `operations`.
//
// GROUNDING (real factory file tests/golden/xml/ORTA_BAK_6_1.XML — a side panel):
// a side panel carries Ø5 shelf-pin holes ONLY where a shelf actually sits — a front+back
// pair per shelf, NOT a continuous System-32 column. So we drill at the REAL shelf positions
// (each internal_shelf instance's anchor height), at the factory setback (System-32 spec,
// 91.5 mm from each Y edge per ORTA_BAK), depth 11 mm, Ø5.
//
// HONEST GAPS (provisional until S3-E2-proper + S3-E7 verified specs):
//   • Section adjacency: every side panel is drilled for ALL of its block's shelves; the
//     precise "which panel bounds which section" mapping (outer side vs divider, left vs right)
//     is not yet resolved — can over-drill on multi-section blocks.
//   • Both faces: the factory drills Face A AND Face B on a middle panel (a shelf each side);
//     shelfPinPattern emits Face A only here.
//   • Spec verified:false (dummy catalog) — values now match the ORTA_BAK file but await full
//     factory sign-off (S3-E7). This path is NOT wired to any shipped CNC export yet.
//
// PURITY / SAFETY: imports ONLY primitives + types — never the hardware catalog JSON. The
// spec is passed IN by the caller (engine/cnc.ts), keeping the JSON import-attribute out of
// any UI-bundled module (Metro stays clean). Same input in → same parts out; no mutation.

import type { Part, mm10, SawGrooveOp } from "../contracts/types.js";
import type { HardwareSpec } from "../primitives/types.js";
import type { StructuralModel } from "../contracts/structure.js";
import { shelfPinPattern } from "../primitives/shelfPinPattern.js";
import { hingeCupPattern } from "../primitives/hingeCupPattern.js";

/** The shelf-pin SKU drilled for adjustable internal shelves (dummy until factory sign-off). */
const SHELF_PIN_SKU = "DUMMY_PIN_5";
/** The hinge SKU drilled into facade/door panels (verified vs SHKOF_ORTA_CHAP_ESHIK_7_1.XML). */
const HINGE_SKU = "DUMMY_CUP_110";

// Hinge placement is a Layer-2 (solver) rule; the primitive takes the positions as input.
// GROUNDED against the golden door (Length 2170mm → 4 cups at 100 / 756 / 1414 / 2070): first &
// last hinge 100mm from each end, the rest evenly spaced with a gap ≤ ~700mm. Even spacing lands
// within ~1mm of the factory's exact positions — confirm the precise rule with more door exports.
const HINGE_END_INSET: mm10 = 1000; // 100 mm
const HINGE_MAX_GAP: mm10 = 7000; // ~700 mm

// Glass rebate groove (L8 #38 — CONSTRUCTION_FRAME_v3 requires it emitted, not implied). The
// factory SWJ008 export does NOT carry the groove (it is cut off-SWJ008 or embedded in the stile
// profile — confirmed by a deep read of the OYNA glass-door fixtures), so these DIMENSIONS are
// reasonable glass-rebate defaults, NOT fixture-grounded — confirm at the factory (S3-E7). The
// rebate is a rectangle inset from the door edges on the back face (B), seating a 3mm pane.
const GLASS_REBATE_INSET: mm10 = 400; // 40 mm frame width from each edge
const GLASS_REBATE_WIDTH: mm10 = 40; // 4 mm — 3mm pane + clearance
const GLASS_REBATE_DEPTH: mm10 = 80; // 8 mm deep

/** Part ids are `${block.id}__<role>...`; recover the owning block id. */
function blockIdOf(partId: string): string {
  const i = partId.indexOf("__");
  return i === -1 ? partId : partId.slice(0, i);
}

function isSidePanel(partId: string): boolean {
  return partId.endsWith("__side_l") || partId.endsWith("__side_r");
}

/** A shelf's own depth — its section's box depth (walks all sections, not just leaves). */
function shelfDepthOf(block: StructuralModel["blocks"][number], sectionId: string): mm10 {
  for (const zone of block.zones) {
    let hit: mm10 | null = null;
    const walk = (s: { id: string; box: { d: mm10 }; children: readonly unknown[] }): void => {
      if (hit === null && s.id === sectionId) hit = s.box.d;
      (s.children as { id: string; box: { d: mm10 }; children: readonly unknown[] }[]).forEach(walk);
    };
    walk(zone.root as never);
    if (hit !== null) return hit;
  }
  return block.box.d;
}

/**
 * Per block, each internal_shelf's { x = anchor height, depth = its section's depth }. Read from
 * the model, NOT a synthesised column. The depth lets the drilling pass match a shelf to the side
 * panels that actually bound it (a side is drilled only for shelves of its own depth) — so an
 * L-block's leg-A shelf no longer over-drills the shallower leg-B sides.
 */
function shelvesByBlock(model: StructuralModel): Map<string, { x: mm10; depth: mm10 }[]> {
  const out = new Map<string, { x: mm10; depth: mm10 }[]>();
  for (const block of model.blocks) {
    const roleOf = new Map(block.components.map((c) => [c.id, c.role] as const));
    const list: { x: mm10; depth: mm10 }[] = [];
    for (const inst of block.instances) {
      if (roleOf.get(inst.componentId) === "internal_shelf") {
        list.push({ x: inst.anchor.y, depth: shelfDepthOf(block, inst.sectionId) });
      }
    }
    if (list.length > 0) out.set(block.id, list);
  }
  return out;
}

/** Instance id encoded in a part id `${block}__inst_${instId}` (optionally a doubling layer). */
function instIdOf(partId: string): string | null {
  const marker = "__inst_";
  const i = partId.indexOf(marker);
  if (i === -1) return null;
  return partId.slice(i + marker.length).replace(/__[ab]$/, "");
}

/** Instance ids whose component is a facade/door (they carry hinge drilling). */
function facadeInstanceIds(model: StructuralModel): Set<string> {
  const out = new Set<string>();
  for (const block of model.blocks) {
    const roleOf = new Map(block.components.map((c) => [c.id, c.role] as const));
    for (const inst of block.instances) {
      if (roleOf.get(inst.componentId) === "facade") out.add(inst.id);
    }
  }
  return out;
}

/** Hinge X-positions up a door of the given Length (see the constants above for the grounding). */
function hingePositions(length: mm10): mm10[] {
  const usable = length - 2 * HINGE_END_INSET;
  if (usable <= 0) return [Math.round(length / 2)]; // tiny door → one central hinge
  const gaps = Math.max(1, Math.ceil(usable / HINGE_MAX_GAP));
  const xs: mm10[] = [];
  for (let i = 0; i <= gaps; i += 1) xs.push(HINGE_END_INSET + Math.round((usable * i) / gaps));
  return xs;
}

/** Instance ids whose facade component is glazed (they get the L8 #38 glass rebate groove). */
function glazedInstanceIds(model: StructuralModel): Set<string> {
  const out = new Set<string>();
  for (const block of model.blocks) {
    const glazedComp = new Set(block.components.filter((c) => c.glazed && c.role === "facade").map((c) => c.id));
    for (const inst of block.instances) {
      if (glazedComp.has(inst.componentId)) out.add(inst.id);
    }
  }
  return out;
}

/** Instance ids whose facade is a glazed-GRID (each frame member gets a pane rebate — E3, L8 #38). */
function glazedGridInstanceIds(model: StructuralModel): Set<string> {
  const out = new Set<string>();
  for (const block of model.blocks) {
    const gridComp = new Set(block.components.filter((c) => c.glazedGrid && c.role === "facade").map((c) => c.id));
    for (const inst of block.instances) {
      if (gridComp.has(inst.componentId)) out.add(inst.id);
    }
  }
  return out;
}

/** For a glazed-grid sub-part `${block}__inst_${instId}__<member>[__a|__b]`, the root instance id +
 *  the member tag ("stile_l" / "rail_b" / "muntin_0" / "glass_0"). Null for a plain (non-grid) part
 *  — a bare `…__inst_${instId}` or a doubled plain-door layer `…__a`, which carry no member tag. */
function gridMemberOf(partId: string): { instId: string; member: string } | null {
  const marker = "__inst_";
  const i = partId.indexOf(marker);
  if (i === -1) return null;
  const segs = partId.slice(i + marker.length).split("__"); // ["i1","stile_l","a"] | ["i1"] | ["i1","a"]
  if (segs.length < 2) return null;
  const instId = segs[0]!;
  const member = segs.slice(1).filter((s) => s !== "a" && s !== "b").join("__");
  return member ? { instId, member } : null;
}

/** 20 mm inset from each END of a frame bar, so the pane-seat groove clears the corner joints. */
const MEMBER_REBATE_END_INSET: mm10 = 200;

/**
 * A pane-seat rebate groove running along a glazed-grid frame BAR (stile / rail / muntin), centred
 * on the bar's width on the back face (B). L8 #38 requires the groove emitted, not implied; the
 * factory cuts it off-SWJ008, so — like the single-pane rebate — these dimensions are flagged
 * defaults, NOT fixture-grounded. A central slot serves both a frame member (pane on the inner side)
 * and a muntin (a pane each side), which avoids guessing per-member edge handedness.
 */
function memberRebate(part: Part): SawGrooveOp[] {
  const L = part.length_mm10;
  const W = part.width_mm10;
  const e = MEMBER_REBATE_END_INSET;
  if (W <= 0 || L - e <= e) return []; // bar too short for a groove
  const y = Math.round(W / 2);
  return [
    {
      op: "saw_groove",
      id: `glass_${part.id}_0`,
      face: "B",
      x_mm10: e,
      y_mm10: y,
      endX_mm10: L - e,
      endY_mm10: y,
      width_mm10: GLASS_REBATE_WIDTH,
      depth_mm10: GLASS_REBATE_DEPTH,
      source: "auto",
    },
  ];
}

/**
 * L8 #38 glass rebate: a rectangular groove inset from the door edges on the back face (B),
 * seating the glass pane. Four straight saw-grooves form the rectangle. Dimensions are the
 * flagged defaults above (not fixture-grounded — the factory cuts this off-SWJ008).
 */
function glassRebate(part: Part): SawGrooveOp[] {
  const L = part.length_mm10;
  const W = part.width_mm10;
  const i = GLASS_REBATE_INSET;
  if (L - i <= i || W - i <= i) return []; // door too small for a rebate
  const seg = (n: number, x: mm10, y: mm10, ex: mm10, ey: mm10): SawGrooveOp => ({
    op: "saw_groove",
    id: `glass_${part.id}_${n}`,
    face: "B",
    x_mm10: x,
    y_mm10: y,
    endX_mm10: ex,
    endY_mm10: ey,
    width_mm10: GLASS_REBATE_WIDTH,
    depth_mm10: GLASS_REBATE_DEPTH,
    source: "auto",
  });
  return [
    seg(0, i, i, L - i, i), // bottom rail
    seg(1, i, W - i, L - i, W - i), // top rail
    seg(2, i, i, i, W - i), // left stile
    seg(3, L - i, i, L - i, W - i), // right stile
  ];
}

/**
 * Augment a solved part set with automatic machining: shelf-pins on side panels (for the block's
 * shelves), hinge cups on facade/door panels, and the glass rebate groove on glazed facades.
 * Returns a NEW array; parts that gain no operations are returned unchanged, machined parts are
 * copies with extended `operations`.
 */
export function applyDrilling(
  parts: Part[],
  model: StructuralModel,
  spec: HardwareSpec,
): Part[] {
  const shelves = shelvesByBlock(model);
  const facades = facadeInstanceIds(model);
  const glazed = glazedInstanceIds(model);
  const glazedGrids = glazedGridInstanceIds(model);
  const pin = spec.shelfPins[SHELF_PIN_SKU];
  const system32 = spec.system32;
  const hinge = spec.hinges[HINGE_SKU];

  return parts.map((part) => {
    // Side panel → shelf-pin line for the shelves it bounds (matched by depth, so an L-block's
    // deep leg-A shelf does not drill the shallow leg-B sides).
    if (pin && isSidePanel(part.id)) {
      const inBlock = shelves.get(blockIdOf(part.id));
      const xs = inBlock ? inBlock.filter((s) => s.depth === part.width_mm10).map((s) => s.x) : [];
      if (xs.length === 0) return part;
      return { ...part, operations: [...part.operations, ...shelfPinPattern(part, xs, { pin, system32 })] };
    }
    // Glazed-grid frame member → a pane-seat rebate on each stile/rail (outer __a board) and each
    // muntin (E3, L8 #38). Glass panes and the inner __b board carry none.
    const gm = gridMemberOf(part.id);
    if (gm && glazedGrids.has(gm.instId)) {
      const isFrame = ["stile_l", "stile_r", "rail_b", "rail_t"].includes(gm.member);
      let ops = part.operations;
      // Pane-seat rebate on each frame member (outer __a) + each muntin (E3).
      if ((isFrame && part.id.endsWith("__a")) || gm.member.startsWith("muntin")) {
        ops = [...ops, ...memberRebate(part)];
      }
      // E13(c): the grid door hinges on its hinge-side stile (left, outer __a board) — previously it
      // got no hinge at all because instIdOf strips the member suffix.
      if (hinge && gm.member === "stile_l" && part.id.endsWith("__a")) {
        ops = [...ops, ...hingeCupPattern(part, "y0", hingePositions(part.length_mm10), hinge)];
      }
      return ops === part.operations ? part : { ...part, operations: ops };
    }

    // Facade/door → hinge cups (y0 edge, GROUNDED: SHKOF door cups at Y=21.5) + the glass rebate
    // groove when the facade is glazed (L8 #38). E13(b): on a DOUBLED door only the outer layer (__a)
    // carries the cups + rebate — the hidden inner board (__b) is not machined.
    const instId = instIdOf(part.id);
    if (instId && facades.has(instId)) {
      if (part.id.endsWith("__b")) return part; // inner glued layer — no face machining
      let ops = part.operations;
      if (hinge) ops = [...ops, ...hingeCupPattern(part, "y0", hingePositions(part.length_mm10), hinge)];
      if (glazed.has(instId)) ops = [...ops, ...glassRebate(part)];
      return ops === part.operations ? part : { ...part, operations: ops };
    }
    return part;
  });
}
