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
//     factory sign-off (S3-E7). NOTE: this path IS wired to a shipped export — cnc.ts
//     (solveModelToParts → applyDrilling → exportModelToSWJ008) drives the karkas editor's
//     ⬇ CNC button, so these provisional cups/pins DO land in a downloaded SWJ008. Nothing
//     currently gates the export on verified:false — treat karkas SWJ008 as provisional until
//     the factory sign-off lands (tracked as an open manufacturing-readiness item).
//   • Plinth (carcass_plinth): intentionally UNDRILLED here — a toe-kick takes no System-32 pins or
//     hinge cups; a plinth part simply falls through this pass with operations: []. (Phase 1.1.)
//   • Worktop (carcass_worktop): likewise UNDRILLED — a stoleshnitsa carries no carcass drilling; it
//     falls through with operations: []. (Phase 1.2.)
//
// PURITY / SAFETY: imports ONLY primitives + types — never the hardware catalog JSON. The
// spec is passed IN by the caller (engine/cnc.ts), keeping the JSON import-attribute out of
// any UI-bundled module (Metro stays clean). Same input in → same parts out; no mutation.

import type { Part, mm10, DrillOp, PanelFace, SawGrooveOp } from "../contracts/types.js";
import type { HardwareSpec, ConnectorSpec } from "../primitives/types.js";
import type { StructuralModel, HandleType, FreePart, Box3D } from "../contracts/structure.js";
import { mmToMm10 } from "../core/units.js";
import { shelfPinPattern } from "../primitives/shelfPinPattern.js";
import { hingeCupPattern } from "../primitives/hingeCupPattern.js";
import { handleScrewPattern } from "../primitives/handleScrewPattern.js";
import { BOARD_MM10, sectionOfLine, shelfSpanY } from "./solve.js";

/** The shelf-pin SKU drilled for adjustable internal shelves (dummy until factory sign-off). */
const SHELF_PIN_SKU = "DUMMY_PIN_5";
/** The hinge SKU drilled into facade/door panels (verified vs SHKOF_ORTA_CHAP_ESHIK_7_1.XML). */
const HINGE_SKU = "DUMMY_CUP_110";
/** The handle SKU drilled into handled door/drawer fronts (Ø4.5×17 grounded; position provisional). */
const HANDLE_SKU = "DUMMY_HANDLE_STD";

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

/** A leaf/section's X-interval within its block (walks all sections). Null if not found. */
function sectionBoxOf(block: StructuralModel["blocks"][number], sectionId: string): { x: mm10; w: mm10 } | null {
  for (const zone of block.zones) {
    let hit: { x: mm10; w: mm10 } | null = null;
    const walk = (s: { id: string; box: { x: mm10; w: mm10 }; children: readonly unknown[] }): void => {
      if (hit === null && s.id === sectionId) hit = { x: s.box.x, w: s.box.w };
      (s.children as { id: string; box: { x: mm10; w: mm10 }; children: readonly unknown[] }[]).forEach(walk);
    };
    walk(zone.root as never);
    if (hit !== null) return hit;
  }
  return null;
}

/** A shelf to the LEFT of a divider drills that divider's face A; a shelf to the RIGHT drills face B.
 *  (The A/B ↔ physical-side convention is provisional like the rest of this pass — verified:false —
 *  but the two adjacent columns are consistently kept on DIFFERENT faces, which is the point.) */
const DIV_FACE_FOR_LEFT_SHELF: PanelFace = "A"; // shelf's RIGHT boundary is this divider
const DIV_FACE_FOR_RIGHT_SHELF: PanelFace = "B"; // shelf's LEFT boundary is this divider

/**
 * The correct shelf-pin plan for NON-footprint blocks: `partId → {face, x}[]`. Each shelf is mapped
 * to the panels that ACTUALLY bound its section along X — the outer carcass side at a block edge, or
 * the divider at an interior cut — and drilled on the face toward that shelf. This fixes: the divider
 * being skipped (C1), outer sides drilled for other columns' shelves + a middle-column shelf getting
 * no pins anywhere (C2), and a divider needing pins on both faces (C4). L-corner blocks are excluded
 * (the legacy per-side fallback still drives them).
 */
function shelfPinPlan(model: StructuralModel): Map<string, { face: PanelFace; x: mm10 }[]> {
  const plan = new Map<string, { face: PanelFace; x: mm10 }[]>();
  const add = (id: string, face: PanelFace, x: mm10): void => {
    const a = plan.get(id) ?? [];
    a.push({ face, x });
    plan.set(id, a);
  };
  for (const block of model.blocks) {
    if (block.footprint) continue; // L-corner → legacy fallback in applyDrilling
    const roleOf = new Map(block.components.map((c) => [c.id, c.role] as const));
    const interiorL = block.box.x;
    const interiorR = block.box.x + block.box.w;
    const xLines = block.lines.filter((l) => l.axis === "x");
    // A vertical divider part starts at its section's floor PLUS the boundary inset (a full carcass
    // board at the block's bottom, half a board at an interior horizontal divider) — its face-local
    // "height" axis begins there, NOT at the block floor. So a shelf-pin height must be measured from
    // that origin, or the pin lands one carcass board (16mm) too high and the shelf tilts (the pin on
    // the outer side, whose part DOES start at the floor, stays at the true height). Mirrors dividerPart
    // / dividerPlacement, which position the divider at `section.box.y + shelfSpanY(...).y0`.
    const dividerAt = (X: mm10): { id: string; yOrigin: mm10 } | null => {
      const ln = xLines.find((l) => l.position_mm10 === X);
      if (!ln) return null;
      const section = sectionOfLine(block, ln.id);
      const yOrigin = section ? section.box.y + shelfSpanY(block, section, BOARD_MM10).y0 : 0;
      return { id: `${block.id}__div_${ln.id}`, yOrigin };
    };
    for (const inst of block.instances) {
      if (roleOf.get(inst.componentId) !== "internal_shelf") continue;
      const box = sectionBoxOf(block, inst.sectionId);
      if (!box) continue;
      const leftX = box.x, rightX = box.x + box.w, x = inst.anchor.y;
      // left boundary → carcass side_l (inner face A) OR the divider at leftX (shelf is to its RIGHT)
      if (leftX === interiorL) add(`${block.id}__side_l`, "A", x);
      else { const d = dividerAt(leftX); if (d) add(d.id, DIV_FACE_FOR_RIGHT_SHELF, x - d.yOrigin); }
      // right boundary → carcass side_r (inner face A) OR the divider at rightX (shelf is to its LEFT)
      if (rightX === interiorR) add(`${block.id}__side_r`, "A", x);
      else { const d = dividerAt(rightX); if (d) add(d.id, DIV_FACE_FOR_LEFT_SHELF, x - d.yOrigin); }
    }
  }
  return plan;
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

/** Facade instance id → the hinge-cup edge: "yMax" for a right-hung door, "y0" (default) otherwise. */
function hingeEdgeByInstance(model: StructuralModel): Map<string, "y0" | "yMax"> {
  const out = new Map<string, "y0" | "yMax">();
  for (const block of model.blocks) {
    const edgeOf = new Map(block.components.map((c) => [c.id, c.hingeEdge === "right" ? "yMax" : "y0"] as const));
    for (const inst of block.instances) {
      const e = edgeOf.get(inst.componentId);
      if (e) out.set(inst.id, e);
    }
  }
  return out;
}

/** Instance id → its handle type, for the instances whose component declares one (else absent). */
function handleByInstance(model: StructuralModel): Map<string, HandleType> {
  const out = new Map<string, HandleType>();
  for (const block of model.blocks) {
    const handleOf = new Map(block.components.map((c) => [c.id, c.handle] as const));
    for (const inst of block.instances) {
      const h = handleOf.get(inst.componentId);
      if (h) out.set(inst.id, h);
    }
  }
  return out;
}

/** Instance ids whose component is a LIFT door (Phase 2.1): they open upward on a mechanism, so they get
 *  NO side hinge cups (the lift's own mounting holes come in 2.1b). */
function liftInstanceIds(model: StructuralModel): Set<string> {
  const out = new Set<string>();
  for (const block of model.blocks) {
    const liftOf = new Map(block.components.map((c) => [c.id, c.lift] as const));
    for (const inst of block.instances) {
      if (liftOf.get(inst.componentId)) out.add(inst.id);
    }
  }
  return out;
}

/** A drawer-front part id (`…__inst_<id>__front`) → its clean instance id, else null. */
function drawerFrontInstId(partId: string): string | null {
  const marker = "__inst_";
  const i = partId.indexOf(marker);
  if (i === -1 || !partId.endsWith("__front")) return null;
  return partId.slice(i + marker.length, partId.length - "__front".length);
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

// ── Carcass joinery (cam + dowel) ──────────────────────────────────────────────────────────────
// Mirrors solver/baseCabinet.ts camDowelJoint so the structural / karkas SWJ008 gets the SAME corner
// joinery the legacy base-cabinet solver already emits: per outer-carcass corner, a Ø15 cam seat on
// the SIDE's Face A (fromMatingEdge in from the mating end) + a Ø8 dowel into the top/bottom panel's
// mating END edge (edge4 for a left side / edge3 for a right side), at two depth columns.
const CONNECTOR_SKU = "DUMMY_RASTEX_15";
const JOINT_INSET_MM10: mm10 = 600; // 60mm connector column inset from each depth edge (baseCabinet)

/** One carcass corner: cams onto the SIDE (Face A), dowels into the HORIZONTAL panel's end edge. */
function camDowelJoint(side: Part, horiz: Part, end: "bottom" | "top", sideKind: "left" | "right", jointYs: mm10[], conn: ConnectorSpec): { camOps: DrillOp[]; dowelOps: DrillOp[] } {
  const camDia = mmToMm10(conn.camSeat.diameter);
  const camDepth = mmToMm10(conn.camSeat.depth);
  const fromEdge = mmToMm10(conn.camSeat.fromMatingEdge);
  const dowelDia = mmToMm10(conn.dowelHole.diameter);
  const dowelDepth = mmToMm10(conn.dowelHole.depth);
  const camX = end === "top" ? side.length_mm10 - fromEdge : fromEdge;
  const horizEnd = sideKind === "left" ? 0 : horiz.length_mm10;
  const dowelEdge: PanelFace = sideKind === "left" ? "edge4" : "edge3";
  const dowelZ = Math.round(horiz.thickness_mm10 / 2); // centred in board thickness
  const camOps: DrillOp[] = [];
  const dowelOps: DrillOp[] = [];
  jointYs.forEach((y, i) => {
    camOps.push({ op: "drill", id: `cam_${side.id}_${end}_${i}`, face: "A", x_mm10: camX, y_mm10: y, diameter_mm10: camDia, depth_mm10: camDepth, source: "auto" });
    dowelOps.push({ op: "drill", id: `dowel_${horiz.id}_${sideKind}_${i}`, face: dowelEdge, x_mm10: horizEnd, y_mm10: y, z_mm10: dowelZ, diameter_mm10: dowelDia, depth_mm10: dowelDepth, source: "auto" });
  });
  return { camOps, dowelOps };
}

/** Cam+dowel joinery for every block's OUTER carcass, keyed by part id → ops to append. Built from
 *  the exact `${block.id}__side_l/__side_r/__top/__bottom` ids, so dividers (`__div_`), drawer sides
 *  (`__inst_…`) and L-legs (`__legA__…`) never match. Skips L-corner (footprint) blocks and any block
 *  too shallow for the two depth columns (a later increment / a safety-gate guard). */
function carcassJoineryByPart(model: StructuralModel, parts: Part[], conn: ConnectorSpec | undefined): Map<string, DrillOp[]> {
  const out = new Map<string, DrillOp[]>();
  if (!conn) return out;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const add = (id: string, ops: DrillOp[]): void => { if (!ops.length) return; const a = out.get(id) ?? []; a.push(...ops); out.set(id, a); };
  // One rigid carcass box → cam/dowel on each side↔top/bottom corner. `prefix` selects the part ids
  // (`${prefix}__side_l/…`), `depth` drives the two dowel columns (part-local jointYs), `sides` is the
  // present sides (an L return leg omits side_r). Shared by a rectangular block and each L leg.
  const jointBox = (prefix: string, depth: mm10, sides: readonly ("left" | "right")[]): void => {
    if (depth < 2 * JOINT_INSET_MM10) return; // too shallow → a column would fall out of bounds
    const top = byId.get(`${prefix}__top`);
    const bottom = byId.get(`${prefix}__bottom`);
    if (!top || !bottom) return;
    const jointYs: mm10[] = [JOINT_INSET_MM10, depth - JOINT_INSET_MM10];
    for (const kind of sides) {
      const side = byId.get(`${prefix}__side_${kind === "left" ? "l" : "r"}`);
      if (!side) continue;
      for (const [horiz, end] of [[bottom, "bottom"], [top, "top"]] as const) {
        const { camOps, dowelOps } = camDowelJoint(side, horiz, end, kind, jointYs, conn);
        add(side.id, camOps);
        add(horiz.id, dowelOps);
      }
    }
  };
  for (const block of model.blocks) {
    if (block.footprint) {
      // Phase 4 polish — an L cabinet joins EACH leg into a rigid box (its own corners), using that leg's OWN
      // depth for the dowel columns (NOT block.box.d, the L envelope). leg-B omits side_r (it opens into leg-A).
      // The leg-A↔leg-B cross-corner join is a later increment. Same connector + camDowelJoint as a rectangle.
      jointBox(`${block.id}__legA`, block.footprint.legA.depth_mm10, ["left", "right"]);
      jointBox(`${block.id}__legB`, block.footprint.legB.depth_mm10, ["left"]);
      continue;
    }
    jointBox(block.id, block.box.d, ["left", "right"]);
  }
  return out;
}

/** Instance ids whose component is a drawer (its box gets back-corner joinery). */
function drawerInstanceIds(model: StructuralModel): Set<string> {
  const out = new Set<string>();
  for (const block of model.blocks) {
    const isDrawer = new Set(block.components.filter((c) => c.drawer).map((c) => c.id));
    for (const inst of block.instances) if (isDrawer.has(inst.componentId)) out.add(inst.id);
  }
  return out;
}

/** 30mm dowel-column inset from the box top/bottom, per back corner. */
const DRAWER_JOINT_INSET: mm10 = 300;

/**
 * Drawer BOX back-corner joinery: cam+dowel joining each side to the back, REUSING the exact same
 * verified connector as the carcass corners (no invented hardware). This makes the box's back rigid
 * so a drawer is no longer emitted with ZERO holes. FOLLOW-UPS (deferred, need factory specs): the
 * FACADE attachment (adjustable screws), the BOTTOM (groove), and the slide-RUNNER holes — all await
 * a factory drawer/slide reference, so they are intentionally not fabricated here.
 */
function drawerJoineryByPart(model: StructuralModel, parts: Part[], conn: ConnectorSpec | undefined): Map<string, DrillOp[]> {
  const out = new Map<string, DrillOp[]>();
  if (!conn) return out;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const add = (id: string, ops: DrillOp[]): void => { if (!ops.length) return; const a = out.get(id) ?? []; a.push(...ops); out.set(id, a); };
  const drawers = drawerInstanceIds(model);
  for (const block of model.blocks) {
    for (const inst of block.instances) {
      if (!drawers.has(inst.id)) continue;
      const base = `${block.id}__inst_${inst.id}`;
      const back = byId.get(`${base}__back`);
      if (!back) continue;
      for (const [sideId, kind] of [[`${base}__side_l`, "left"], [`${base}__side_r`, "right"]] as const) {
        const side = byId.get(sideId);
        if (!side) continue;
        const h = side.width_mm10; // box side height
        const jointYs: mm10[] = h > 2 * DRAWER_JOINT_INSET ? [DRAWER_JOINT_INSET, h - DRAWER_JOINT_INSET] : [Math.round(h / 2)];
        const { camOps, dowelOps } = camDowelJoint(side, back, "top", kind, jointYs, conn);
        add(side.id, camOps);
        add(back.id, dowelOps);
      }
    }
  }
  return out;
}

/**
 * Augment a solved part set with automatic machining: shelf-pins on side panels (for the block's
 * shelves), hinge cups on facade/door panels, and the glass rebate groove on glazed facades.
 * Returns a NEW array; parts that gain no operations are returned unchanged, machined parts are
 * copies with extended `operations`.
 */
// ── M5 — free-part joinery (leg ↔ apron): plain 2×Ø8 dowels ────────────────────────────────────
// The carcass has had cam+dowel joinery all along; a FREE assembly (a table's legs + aprons, a bench,
// a bed frame) had none — the parts simply stood next to each other and the usta was handed no holes to
// assemble them with. Two free parts that meet face-to-face now get the joint an Uzbek workshop actually
// uses: two Ø8 dowels and glue, no cam (founder's call). A round leg takes them too — see applyDrilling.
const FREE_JOINT_TOL: mm10 = 20; // ±2 mm — closer than this counts as touching
const FREE_JOINT_MIN_OVERLAP: mm10 = 150; // 15 mm — under this it is a corner graze, not a joint
const FREE_DOWEL_INSET = 0.25; // the two dowels sit at ¼ and ¾ across the joint

type Ax = "x" | "y" | "z";
const AXES: readonly Ax[] = ["x", "y", "z"];
const boxLo = (b: Box3D, a: Ax): mm10 => (a === "x" ? b.x : a === "y" ? b.y : b.z);
const boxExt = (b: Box3D, a: Ax): mm10 => (a === "x" ? b.w : a === "y" ? b.h : b.d);
const boxHi = (b: Box3D, a: Ax): mm10 => boxLo(b, a) + boxExt(b, a);

/** Which box axis carries a free part's LENGTH / WIDTH / THICKNESS — mirrors freePartToPart exactly, so
 *  a hole computed here lands on the same face the cut list describes. */
function freeAxes(fp: FreePart): { len: Ax; wid: Ax; thk: Ax } {
  const { w, h, d } = fp.box;
  const smallest = Math.min(w, h, d);
  const thk: Ax = fp.thicknessAxis === "x" && w === smallest ? "x"
    : fp.thicknessAxis === "y" && h === smallest ? "y"
      : fp.thicknessAxis === "z" && d === smallest ? "z"
        : w === smallest ? "x" : h === smallest ? "y" : "z";
  return thk === "x" ? { len: "y", wid: "z", thk: "x" }
    : thk === "y" ? { len: "x", wid: "z", thk: "y" }
      : { len: "x", wid: "y", thk: "z" };
}

/** Do two free-part boxes meet face-to-face? Returns the contact axis and whether A is the low side. */
function freeContact(a: Box3D, b: Box3D): { axis: Ax; aIsLow: boolean } | null {
  for (const axis of AXES) {
    const aLow = Math.abs(boxHi(a, axis) - boxLo(b, axis)) <= FREE_JOINT_TOL; // A ends where B starts
    const bLow = Math.abs(boxHi(b, axis) - boxLo(a, axis)) <= FREE_JOINT_TOL;
    if (!aLow && !bLow) continue;
    // …and they must genuinely overlap on the other two axes, or it is a corner graze, not a joint
    const enough = AXES.filter((x) => x !== axis).every(
      (x) => Math.min(boxHi(a, x), boxHi(b, x)) - Math.max(boxLo(a, x), boxLo(b, x)) >= FREE_JOINT_MIN_OVERLAP,
    );
    if (enough) return { axis, aIsLow: aLow };
  }
  return null;
}

/**
 * Plain dowel joinery between touching free parts, keyed by part id → ops to append (M5).
 * The part whose LENGTH runs into the joint butts with its END (an apron, a rail); the other receives it
 * on a face (a leg, a post). Two ends meeting, or two faces stacked, are ambiguous and get no joint.
 * Coordinates follow the engine's convention (06_CONVENTIONS §1): a face drill is (x along length,
 * y along width) on Face A; an edge drill carries the same (x, y) plus z INTO the thickness, and the low
 * end of a part is edge4 while its high end is edge3 (see camDowelJoint).
 */
function freePartJoineryByPart(model: StructuralModel, parts: Part[], conn: ConnectorSpec | undefined): Map<string, DrillOp[]> {
  const out = new Map<string, DrillOp[]>();
  if (!conn) return out;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const add = (id: string, ops: DrillOp[]): void => { if (!ops.length) return; const a = out.get(id) ?? []; a.push(...ops); out.set(id, a); };
  const dia = mmToMm10(conn.dowelHole.diameter);
  const depth = mmToMm10(conn.dowelHole.depth);
  for (const block of model.blocks) {
    const fps = block.freeParts ?? [];
    for (let i = 0; i < fps.length; i++) {
      for (let j = i + 1; j < fps.length; j++) {
        const A = fps[i]!, B = fps[j]!;
        // M8.1 — a TILTED part takes no automatic dowels. Two reasons, either alone decisive: the
        // contact below is computed from axis-aligned boxes, which stop describing a leaning board; and
        // a 3-axis router can only bore perpendicular to a face, so an angled joint cannot be drilled
        // by the machine at all. The workshop marks and bores those by hand.
        if (A.rotX_deg || A.rotZ_deg || B.rotX_deg || B.rotZ_deg) continue;
        const c = freeContact(A.box, B.box);
        if (!c) continue;
        const axA = freeAxes(A), axB = freeAxes(B);
        const aButts = axA.len === c.axis, bButts = axB.len === c.axis;
        if (aButts === bButts) continue; // both ends, or both faces — no simple two-dowel joint
        const butt = aButts ? A : B, recv = aButts ? B : A;
        const axButt = aButts ? axA : axB, axRecv = aButts ? axB : axA;
        const buttPart = byId.get(`${block.id}__free_${butt.id}`);
        const recvPart = byId.get(`${block.id}__free_${recv.id}`);
        if (!buttPart || !recvPart) continue;
        // the butting part's HIGH end touches when it sits on the LOW side of the contact
        const buttIsLow = butt === A ? c.aIsLow : !c.aIsLow;
        // spread the two dowels across the shared overlap on the BUTT's width, centred in its thickness
        const sLo = Math.max(boxLo(butt.box, axButt.wid), boxLo(recv.box, axButt.wid));
        const sHi = Math.min(boxHi(butt.box, axButt.wid), boxHi(recv.box, axButt.wid));
        const span = sHi - sLo;
        if (span < FREE_JOINT_MIN_OVERLAP) continue;
        const at: mm10[] = [sLo + Math.round(span * FREE_DOWEL_INSET), sLo + Math.round(span * (1 - FREE_DOWEL_INSET))];
        const buttMid = boxLo(butt.box, axButt.thk) + Math.round(boxExt(butt.box, axButt.thk) / 2);
        const buttOps: DrillOp[] = [];
        const recvOps: DrillOp[] = [];
        at.forEach((p, k) => {
          // BUTT — into its end edge (high end = edge3 at x=length, low end = edge4 at x=0)
          buttOps.push({
            op: "drill", id: `fdowel_${buttPart.id}_${k}`,
            face: (buttIsLow ? "edge3" : "edge4") as PanelFace,
            x_mm10: buttIsLow ? buttPart.length_mm10 : 0,
            y_mm10: p - boxLo(butt.box, axButt.wid),
            z_mm10: Math.round(buttPart.thickness_mm10 / 2),
            diameter_mm10: dia, depth_mm10: depth, source: "auto",
          });
          // RECEIVER — on the surface the contact actually lands on: its FACE when the contact runs along
          // its thickness, otherwise its long EDGE. (A round leg is drilled on the matching face of its
          // bounding box — the usta clamps it and bores from that reference, see M4.)
          const world: Record<Ax, mm10> = { x: 0, y: 0, z: 0 };
          world[axButt.wid] = p;
          world[axButt.thk] = buttMid;
          if (c.axis === axRecv.thk) {
            recvOps.push({
              op: "drill", id: `fdowel_${recvPart.id}_${buttPart.id}_${k}`, face: "A",
              x_mm10: world[axRecv.len] - boxLo(recv.box, axRecv.len),
              y_mm10: world[axRecv.wid] - boxLo(recv.box, axRecv.wid),
              diameter_mm10: dia, depth_mm10: depth, source: "auto",
            });
          } else if (c.axis === axRecv.wid) {
            const recvIsLow = recv === A ? c.aIsLow : !c.aIsLow;
            recvOps.push({
              op: "drill", id: `fdowel_${recvPart.id}_${buttPart.id}_${k}`,
              face: (recvIsLow ? "edge2" : "edge1") as PanelFace, // high width edge = edge2, low = edge1
              x_mm10: world[axRecv.len] - boxLo(recv.box, axRecv.len),
              y_mm10: recvIsLow ? recvPart.width_mm10 : 0,
              z_mm10: world[axRecv.thk] - boxLo(recv.box, axRecv.thk),
              diameter_mm10: dia, depth_mm10: depth, source: "auto",
            });
          }
        });
        add(buttPart.id, buttOps);
        add(recvPart.id, recvOps);
      }
    }
  }
  return out;
}

export function applyDrilling(
  parts: Part[],
  model: StructuralModel,
  spec: HardwareSpec,
): Part[] {
  const shelves = shelvesByBlock(model); // legacy per-side fallback (L-corner only)
  const facades = facadeInstanceIds(model);
  const glazed = glazedInstanceIds(model);
  const glazedGrids = glazedGridInstanceIds(model);
  const hingeEdges = hingeEdgeByInstance(model);
  const lifts = liftInstanceIds(model); // Phase 2.1 — lift doors carry no side hinge cups
  const handles = handleByInstance(model);
  const handleHw = spec.handles?.[HANDLE_SKU]; // undefined on old specs without a handles catalog → no holes
  const pin = spec.shelfPins[SHELF_PIN_SKU];
  const system32 = spec.system32;
  const hinge = spec.hinges[HINGE_SKU];
  const pinPlan = pin ? shelfPinPlan(model) : new Map<string, { face: PanelFace; x: mm10 }[]>();
  const footprintBlockIds = new Set(model.blocks.filter((b) => b.footprint).map((b) => b.id));
  // Carcass cam+dowel joinery is computed up front (it writes to MULTIPLE parts per joint — cams on
  // a side, dowels on a top/bottom — so it can't ride the per-part branches below); it's merged in a
  // final additive pass that leaves the shelf-pin / hinge / glazed logic byte-for-byte untouched.
  const joinery = carcassJoineryByPart(model, parts, spec.connectors[CONNECTOR_SKU]);
  const drawerJoinery = drawerJoineryByPart(model, parts, spec.connectors[CONNECTOR_SKU]);
  // M5 — dowels between touching FREE parts (leg ↔ apron). Merged in the same final pass, which is what
  // lets a ROUND leg carry them: the M4 gate below hands non-box parts straight through untouched (so
  // they still take no shelf pins / hinges / System-32), and the merge then adds just this joinery.
  const freeJoinery = freePartJoineryByPart(model, parts, spec.connectors[CONNECTOR_SKU]);

  const drilled = parts.map((part) => {
    // M4 — a non-box primitive (round leg, hanging rail, knob) takes NO cabinet drilling: shelf pins,
    // hinge cups and cam/dowel joinery are all flat-panel operations. Gate it before any plan lookup.
    if (part.shape && part.shape !== "box") return part;
    // Shelf pins — a side OR a divider, only for the shelves that ACTUALLY bound it, on the correct
    // face(s). The plan already resolved which shelves and which face (a divider gets both faces).
    if (pin) {
      const planned = pinPlan.get(part.id);
      if (planned && planned.length > 0) {
        const ops: DrillOp[] = [];
        for (const f of ["A", "B"] as PanelFace[]) {
          const xs = planned.filter((h) => h.face === f).map((h) => h.x);
          if (xs.length) ops.push(...shelfPinPattern(part, xs, { pin, system32 }, f));
        }
        return { ...part, operations: [...part.operations, ...ops] };
      }
      // L-corner (footprint) blocks keep the legacy all-shelves-by-depth on Face A (leg sections are
      // not modelled in the plan). A non-footprint side with no shelves just falls through.
      if (footprintBlockIds.has(blockIdOf(part.id)) && isSidePanel(part.id)) {
        const inBlock = shelves.get(blockIdOf(part.id));
        const xs = inBlock ? inBlock.filter((s) => s.depth === part.width_mm10).map((s) => s.x) : [];
        if (xs.length) return { ...part, operations: [...part.operations, ...shelfPinPattern(part, xs, { pin, system32 })] };
      }
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
      // E13(c): the grid door hinges on its hinge-side stile (outer __a board) — previously it got no
      // hinge at all because instIdOf strips the member suffix. A right-hung door hinges on stile_r
      // (yMax edge) instead of stile_l (y0).
      const gEdge = hingeEdges.get(gm.instId) ?? "y0";
      const hingeStile = gEdge === "yMax" ? "stile_r" : "stile_l";
      if (hinge && gm.member === hingeStile && part.id.endsWith("__a") && !lifts.has(gm.instId)) {
        ops = [...ops, ...hingeCupPattern(part, gEdge, hingePositions(part.length_mm10), hinge)];
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
      // Phase 2.1 — a lift door opens upward on a mechanism, so it gets NO side hinge cups.
      if (hinge && !lifts.has(instId)) ops = [...ops, ...hingeCupPattern(part, hingeEdges.get(instId) ?? "y0", hingePositions(part.length_mm10), hinge)];
      if (glazed.has(instId)) ops = [...ops, ...glassRebate(part)];
      // Handle screws (Ø4.5×17) on the OPENING edge — opposite the hinge (1.3b, position provisional).
      const doorHandle = handles.get(instId);
      if (handleHw && doorHandle) {
        const openingEdge = (hingeEdges.get(instId) ?? "y0") === "y0" ? "yMax" : "y0";
        ops = [...ops, ...handleScrewPattern(part, { type: doorHandle, layout: "door", openingEdge }, handleHw)];
      }
      return ops === part.operations ? part : { ...part, operations: ops };
    }

    // Drawer front (`…__inst_<id>__front`, role "facade" in the part but its component is a drawer, so it
    // never enters the door branch above) → a centred horizontal handle (1.3b). The drawer box's carcass
    // sides/back/bottom are machined by the joinery pass; only the front carries a handle.
    const drawerInst = drawerFrontInstId(part.id);
    if (handleHw && drawerInst) {
      const drawerHandle = handles.get(drawerInst);
      if (drawerHandle) {
        return { ...part, operations: [...part.operations, ...handleScrewPattern(part, { type: drawerHandle, layout: "drawer" }, handleHw)] };
      }
    }
    return part;
  });

  // Final pass: append carcass joinery (cams onto sides, dowels onto top/bottom) + drawer-box back
  // joinery (cams onto drawer sides, dowels into the drawer back). Non-joinery parts pass through.
  if (joinery.size === 0 && drawerJoinery.size === 0 && freeJoinery.size === 0) return drilled;
  return drilled.map((part) => {
    const c = joinery.get(part.id) ?? [];
    const d = drawerJoinery.get(part.id) ?? [];
    const f = freeJoinery.get(part.id) ?? []; // M5 — free-part dowels (also the only ops a round leg gets)
    return c.length || d.length || f.length ? { ...part, operations: [...part.operations, ...c, ...d, ...f] } : part;
  });
}
