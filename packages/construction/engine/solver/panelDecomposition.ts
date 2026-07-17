// Layer 2 — panelDecomposition: the ONE function that turns design intent into Parts.
//
//   panelDecomposition(design, profile) → Part[]
//
// DB/27's law in code: every construction number below comes from `profile`. The
// design contributes topology and sizes only — it has no field to contribute
// construction from. That is why N blocks by N authors yield ONE consistent build.
//
// GEOMETRY MODEL (v2 — derived from the DB/28 replay; every line reproduces a real
// panel the factory cut):
//
//     H is the cabinet's TOTAL height, worktop included.
//     worktopT = hasWorktop ? carcass : 0
//     sideH    = H − worktopT − (накладное ? t : 0)
//     bottomW  = вкладное ? W − 2t : W          bottomD = D − backZone
//     dividerH = sideH − plinthH − t            (stands on the bottom, under the top)
//     shelfW   = (W − 2t − dividers·t) / (dividers + 1)   ← compartment-aware
//     shelfD   = D − backZone − shelfSetback
//     plinthW  = between ? W − 2t : W
//     worktop  = (W + 2·sideOverhang) × (D + frontOverhang)
//
// Pure: no I/O, no clock, no randomness. Same inputs → byte-identical output.

import type { Operation, Part, SawGrooveOp, mm10 } from "../contracts/types.js";
import type {
  ConstructionOverride, ConstructionProfile, DecomposeFlag, DecomposeResult,
  DesignNode, DesignProject, EdgeKromka, PartOrientation, PartRole, TypeConstruction,
} from "../contracts/design.js";
import { derivePartId, deriveOpId } from "../core/ids.js";

// ───────────────────────────────────────────────── construction resolution
/**
 * The cascade — the ONLY way construction reaches a part:
 *   1. project override (user, per node)   2. profile.byType[type]   3. profile.defaults
 * There is no 4th source. A block cannot appear in this list; that is the law.
 */
function construction(profile: ConstructionProfile, node: DesignNode): TypeConstruction {
  const scoped = node.cabinetType ? profile.byType[node.cabinetType] : undefined;
  if (!scoped) return profile.defaults;
  return {
    ...profile.defaults,
    ...scoped,
    // nested objects must merge, not clobber
    back: { ...profile.defaults.back, ...(scoped.back ?? {}) },
    plinth: { ...profile.defaults.plinth, ...(scoped.plinth ?? {}) },
    worktop: { ...profile.defaults.worktop, ...(scoped.worktop ?? {}) },
    kromkaByRole: { ...profile.defaults.kromkaByRole, ...(scoped.kromkaByRole ?? {}) },
  };
}

function override<T>(
  field: ConstructionOverride["field"], nodeId: string, overrides: ConstructionOverride[], fallback: T,
): T {
  const o = overrides.find((x) => x.nodeId === nodeId && x.field === field);
  return o ? (o.value as unknown as T) : fallback;
}

// ───────────────────────────────────────────────── orientation-aware kromka
/**
 * DB/28 C1. A part's edges live on SWJ008 faces 1..4, which is a MACHINE frame:
 *   face1 = Y max · face2 = Y 0 · face3 = X max · face4 = X 0
 * Which physical edge that is depends on what the part's X/Y axes MEAN. So the
 * profile stores kromka semantically (front/back/left/right) and this function is
 * the single place the mapping happens — declared, testable, not implicit.
 */
function edgesFor(
  k: EdgeKromka, o: PartOrientation, profile: ConstructionProfile,
): [mm10, mm10, mm10, mm10] {
  const t = (s: EdgeKromka[keyof EdgeKromka]) => (s ? profile.kromka.slots[s].thickness_mm10 : 0);
  /** Each axis owns a NAMED PAIR of edges. Getting this wrong double-bands a panel. */
  const semanticAt = (axis: PartOrientation["xAxis"], atMax: boolean): keyof EdgeKromka => {
    if (axis === "depth") return atMax ? "back" : "front";
    if (axis === "width") return atMax ? "right" : "left";
    return atMax ? "top" : "bottom"; // height axis owns top/bottom — NOT front/back
  };
  return [
    t(k[semanticAt(o.yAxis, true)]),  // face1 = Y max
    t(k[semanticAt(o.yAxis, false)]), // face2 = Y 0
    t(k[semanticAt(o.xAxis, true)]),  // face3 = X max
    t(k[semanticAt(o.xAxis, false)]), // face4 = X 0
  ];
}

interface Ctx {
  profile: ConstructionProfile;
  overrides: ConstructionOverride[];
  parts: Part[];
  flags: DecomposeFlag[];
  provenance: DecomposeResult["provenance"];
  usedNodeIds: Set<string>;
}

function emit(
  ctx: Ctx, nodeId: string, role: PartRole, sub: number, name: string,
  length: mm10, width: mm10, thickness: mm10, C: TypeConstruction,
  orientation: PartOrientation, ops: Operation[] = [],
): Part {
  const id = derivePartId(nodeId, role, sub);
  const part: Part = {
    id, name,
    length_mm10: length, width_mm10: width, thickness_mm10: thickness,
    grain: ctx.profile.grain,
    edges: edgesFor(C.kromkaByRole[role], orientation, ctx.profile),
    operations: ops,
  };
  ctx.parts.push(part);
  ctx.provenance[id] = { nodeId, role, orientation };
  return part;
}

/** The back groove — census-proven geometry, entirely from the profile. */
function backGroove(ctx: Ctx, C: TypeConstruction, partId: string, length: mm10, width: mm10): SawGrooveOp[] {
  if (C.back.treatment !== "groove") return [];
  const y = width - C.back.grooveSetback_mm10;
  return [{
    op: "saw_groove", id: deriveOpId(partId, "backgroove", 0), face: "A",
    x_mm10: 0, y_mm10: y, endX_mm10: length, endY_mm10: y,
    width_mm10: C.back.grooveWidth_mm10, depth_mm10: C.back.grooveDepth_mm10,
    source: "auto",
  }];
}

function decomposeCabinet(ctx: Ctx, node: DesignNode): void {
  const P = ctx.profile;
  const C0 = construction(P, node);
  // user overrides sit on top of the type scope
  const C: TypeConstruction = {
    ...C0,
    bottomPlacement: override("bottomPlacement", node.nodeId, ctx.overrides, C0.bottomPlacement),
    topStyle: override("topStyle", node.nodeId, ctx.overrides, C0.topStyle),
    shelfSetback_mm10: override("shelfSetback_mm10", node.nodeId, ctx.overrides, C0.shelfSetback_mm10),
    plinth: { ...C0.plinth, height_mm10: override("plinthHeight_mm10", node.nodeId, ctx.overrides, C0.plinth.height_mm10) },
  };

  const t = P.material.carcass_mm10;
  const W = node.size?.w_mm10 ?? 6000;
  const H = node.size?.h_mm10 ?? 7200;
  const D = node.size?.d_mm10 ?? 5600;

  if (W <= 2 * t || H <= 2 * t || D <= C.backZone_mm10) {
    ctx.flags.push({
      code: "DEGENERATE_GEOMETRY", where: node.nodeId,
      detail: `cabinet ${W / 10}×${H / 10}×${D / 10}mm cannot host ${t / 10}mm board + ${C.backZone_mm10 / 10}mm back zone`,
    });
    return;
  }

  const worktopT = node.hasWorktop ? t : 0;
  const plinthH = C.plinth.style === "none" ? 0 : C.plinth.height_mm10;
  const sideH = H - worktopT - (C.bottomPlacement === "nakladnoe" ? t : 0);
  const innerW = W - 2 * t;

  // ── sides ── X = height, Y = depth
  const sideO: PartOrientation = { xAxis: "height", yAxis: "depth" };
  for (const [sub, nm] of [[0, "бок левый"], [1, "бок правый"]] as const) {
    const side = emit(ctx, node.nodeId, "side", sub, nm, sideH, D, t, C, sideO);
    side.operations = backGroove(ctx, C, side.id, sideH, D);
  }

  // ── bottom ── X = width, Y = depth
  const flatO: PartOrientation = { xAxis: "width", yAxis: "depth" };
  const bottomW = C.bottomPlacement === "vkladnoe" ? innerW : W;
  const bottomD = D - C.backZone_mm10;
  const bottom = emit(ctx, node.nodeId, "bottom", 0, "дно", bottomW, bottomD, t, C, flatO);
  bottom.operations = backGroove(ctx, C, bottom.id, bottomW, bottomD);

  // ── top: full крышка · 2 царги · none (a worktop sits instead)
  if (C.topStyle === "full") {
    const top = emit(ctx, node.nodeId, "top", 0, "крышка", innerW, bottomD, t, C, flatO);
    top.operations = backGroove(ctx, C, top.id, innerW, bottomD);
  } else if (C.topStyle === "stretchers") {
    for (const sub of [0, 1]) {
      emit(ctx, node.nodeId, "stretcher", sub, sub === 0 ? "царга передняя" : "царга задняя",
        innerW, C.stretcherWidth_mm10, t, C, flatO);
    }
  }

  // ── worktop (overhangs — construction) ──
  if (node.hasWorktop) {
    emit(ctx, node.nodeId, "worktop", 0, "столешница",
      W + 2 * C.worktop.sideOverhang_mm10, D + C.worktop.frontOverhang_mm10, t, C, flatO);
  }

  // ── back ──
  if (C.back.treatment === "groove") {
    const inset = C.back.grooveSetback_mm10;
    emit(ctx, node.nodeId, "back", 0, "задняя стенка",
      innerW + 2 * inset, H - 2 * t + 2 * inset, P.material.back_mm10, C, { xAxis: "width", yAxis: "height" });
  } else if (C.back.treatment === "overlay") {
    emit(ctx, node.nodeId, "back", 0, "задняя стенка", W, H, P.material.back_mm10, C,
      { xAxis: "width", yAxis: "height" });
  } // "none" → genuinely backless

  // ── dividers (design children) → compartments ──
  const dividers = (node.children ?? []).filter((c) => c.kind === "divider");
  const dividerO: PartOrientation = { xAxis: "height", yAxis: "depth" };
  const dividerH = sideH - plinthH - t;
  for (const d of dividers) {
    ctx.usedNodeIds.add(d.nodeId);
    const p = emit(ctx, d.nodeId, "divider", 0, "стойка", dividerH, D - C.backZone_mm10, t, C, dividerO);
    p.operations = backGroove(ctx, C, p.id, dividerH, D - C.backZone_mm10);
  }

  // ── shelves — compartment-aware (DB/28 B1) ── X = depth, Y = width (machine frame
  //    the factory uses for shelves: POLKA is 503×486 = depth×width)
  const shelves = (node.children ?? []).filter((c) => c.kind === "shelf");
  const compartments = dividers.length + 1;
  const shelfW = Math.round((innerW - dividers.length * t) / compartments);
  const shelfD = D - C.backZone_mm10 - C.shelfSetback_mm10;
  const shelfO: PartOrientation = { xAxis: "depth", yAxis: "width" };
  shelves.forEach((sh, i) => {
    ctx.usedNodeIds.add(sh.nodeId);
    emit(ctx, sh.nodeId, "shelf", 0, `полка ${i + 1}`, shelfD, shelfW, t, C, shelfO);
  });

  // ── door ──
  if (node.hasDoor) {
    emit(ctx, node.nodeId, "door", 0, "фасад", H, W, P.material.front_mm10, C,
      { xAxis: "height", yAxis: "width" });
  }

  // ── plinth ── X = width, Y = HEIGHT (its 80mm dimension is height, not depth)
  if (C.plinth.style !== "none") {
    const plinthW = C.plinth.placement === "between" ? innerW : W;
    const plinthO: PartOrientation = { xAxis: "width", yAxis: "height" };
    const p = emit(ctx, node.nodeId, "plinth", 0, "цоколь", plinthW, plinthH, t, C, plinthO);
    if (C.plinth.style === "box") p.operations = backGroove(ctx, C, p.id, plinthW, plinthH);
  }
}

function walk(ctx: Ctx, node: DesignNode): void {
  ctx.usedNodeIds.add(node.nodeId);
  if (node.kind === "cabinet") decomposeCabinet(ctx, node);
  else if (node.kind === "filler") {
    const C = construction(ctx.profile, node);
    emit(ctx, node.nodeId, "filler", 0, "фальшпанель",
      node.size?.h_mm10 ?? 7200, node.size?.w_mm10 ?? 600, ctx.profile.material.carcass_mm10, C,
      { xAxis: "height", yAxis: "width" });
  }
  for (const c of node.children ?? []) {
    if (c.kind !== "shelf" && c.kind !== "divider") walk(ctx, c);
    else ctx.usedNodeIds.add(c.nodeId);
  }
}

export function panelDecomposition(
  design: DesignProject, profile: ConstructionProfile,
): DecomposeResult {
  const ctx: Ctx = {
    profile, overrides: design.overrides,
    parts: [], flags: [], provenance: {}, usedNodeIds: new Set(),
  };

  for (const node of design.nodes) walk(ctx, node);

  // §3.2 — a block may not silently import a slot the project hasn't bound.
  const need = new Set<string>();
  const collect = (n: DesignNode) => { if (n.roleSlot) need.add(n.roleSlot); (n.children ?? []).forEach(collect); };
  design.nodes.forEach(collect);
  for (const slot of need) {
    if (!design.slotBindings[slot as keyof typeof design.slotBindings]) {
      ctx.flags.push({ code: "UNBOUND_SLOT", where: slot, detail: `role "${slot}" is not bound to a project material` });
    }
  }

  // Overrides pointing at design nodes that no longer exist are FLAGGED, not dropped.
  for (const o of design.overrides) {
    if (!ctx.usedNodeIds.has(o.nodeId)) {
      ctx.flags.push({
        code: "ORPHANED_OVERRIDE", where: o.nodeId,
        detail: `override ${o.field}=${o.value} targets a node that is not in the design`,
      });
    }
  }

  return { parts: ctx.parts, flags: ctx.flags, provenance: ctx.provenance };
}
