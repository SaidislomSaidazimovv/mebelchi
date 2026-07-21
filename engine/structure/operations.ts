// engine/structure/operations.ts — S1-B structural operations.
//
// The Construction-mode editing primitives the UI drives (DB/19_FUNCTION_MAP.md
// §3-4, CONSTRUCTION_FRAME_v2.md §3 T0, :166, :247), expressed as PURE functions
// over the S1-A contract in ../contracts/structure.ts:
//
//   divideSection   — split a leaf section (direct / ratio / equal-N / fixed-mm)
//   moveLine        — move a divider with a Scope (local | line | row | global),
//                     reflowing the adjacent sections
//   selectByTap     — group-first selection: a tapped part → its whole Component
//                     (Тип) + the blast radius of sibling instances (L0)
//   detachInstance  — make one instance an exception (✂); reattachInstance undoes it
//
// LAWS (enforced throughout):
//   • PURE + IMMUTABLE — every function returns a NEW model; no input is ever
//     mutated. Untouched sub-trees are returned by reference ("transform, not
//     rebuild"); only the changed spine is re-allocated.
//   • mm10 INTEGERS — every coordinate stays an integer tenth-of-mm. All splits
//     round to mm10 and CONSERVE the parent extent (no drift, no off-by-one).
//
// ERROR POLICY (a decision S1-B makes; flagged for Planner in S1-B_TEST_PLAN §7):
//   • structural faults (unknown id, non-leaf divide, invalid params, a reflow
//     that would collapse a section to ≤ 0) THROW — a pure engine API should not
//     silently swallow a malformed edit.
//   • semantic no-ops (delta 0, divide-into-1, fixed step ≥ extent) return the
//     input model/section UNCHANGED (same reference).

import type {
  Axis,
  BandTransition,
  Block,
  BlockId,
  Box3D,
  Component,
  ComponentId,
  DrawerInterior,
  DrawerOrganizer,
  HandleType,
  LiftType,
  FreeEdge,
  FreePart,
  FreePartAnchor,
  Instance,
  InstanceId,
  Junction3D,
  Line,
  LineId,
  Run,
  RunId,
  RunMember,
  Scope,
  Section,
  SectionId,
  SectionPurpose,
  StructuralModel,
  Zone,
} from "../contracts/structure.js";
import type { mm10, PartId } from "../contracts/types.js";
import type { DivisionRule } from "../contracts/variables.js";
import { resolveChain, type ChainZone } from "./constraintSolver.js";
import { shelfSpanY } from "./solve.js";

// ---------------------------------------------------------------------------
// Geometry helpers (axis-addressed Box3D math, all mm10)
// ---------------------------------------------------------------------------

/** Extent of a box along an axis: x→w, y→h, z→d. */
function extentOf(box: Box3D, axis: Axis): mm10 {
  return axis === "x" ? box.w : axis === "y" ? box.h : box.d;
}

/** Origin of a box along an axis: x→x, y→y, z→z. */
function originOf(box: Box3D, axis: Axis): mm10 {
  return axis === "x" ? box.x : axis === "y" ? box.y : box.z;
}

/** New box with one axis's origin + extent replaced; the other two axes survive. */
function withAxis(box: Box3D, axis: Axis, origin: mm10, extent: mm10): Box3D {
  if (axis === "x") return { ...box, x: origin, w: extent };
  if (axis === "y") return { ...box, y: origin, h: extent };
  return { ...box, z: origin, d: extent };
}

// ===========================================================================
// 1 · divideSection — CONSTRUCTION_FRAME_v2.md:247
// ===========================================================================

/**
 * How a section is split. Every variant carries the `axis` it cuts along.
 *   direct  — one cut at an absolute block-local coordinate (tap-to-place)
 *   ratio   — proportional cuts, e.g. 1:1:0.6 (founder's example)
 *   equal   — N equal sub-sections
 *   fixed   — a cut every `step_mm10`, remainder kept as the last section
 */
export type DivideMode =
  | { readonly kind: "direct"; readonly axis: Axis; readonly at_mm10: mm10 }
  | { readonly kind: "ratio"; readonly axis: Axis; readonly ratio: readonly number[] }
  | { readonly kind: "equal"; readonly axis: Axis; readonly count: number }
  | { readonly kind: "fixed"; readonly axis: Axis; readonly step_mm10: mm10 };

/**
 * Divide the leaf section `sectionId` inside `model` and return the NEW model
 * (Planner contract sign-off 2026-06-27: every mutator returns a `StructuralModel`
 * so the UI always holds the whole model). The freshly-created first-class
 * `Line`s are spliced into the owning `Block.lines`, and the section subtree is
 * replaced in its zone tree.
 *
 * No-op (returns the same model reference) for a 1-way split / a fixed step that
 * doesn't fit. Throws if `sectionId` is unknown, the section is not a leaf, or
 * the mode parameters are invalid.
 */
export function divideSection(
  model: StructuralModel,
  sectionId: SectionId,
  mode: DivideMode,
): StructuralModel {
  const located = findSection(model, sectionId);
  if (!located) throw new Error("DIVIDE_SECTION_NOT_FOUND");

  const { section: divided, lines } = splitLeaf(located.section, mode);
  if (lines.length === 0) return model; // semantic no-op

  const blocks = model.blocks.map((block) => {
    if (block.id !== located.block.id) return block;
    const zones = block.zones.map((z) => {
      const root = replaceSection(z.root, sectionId, divided);
      return root === z.root ? z : ({ ...z, root } as Zone);
    });
    return { ...block, zones, lines: [...block.lines, ...lines] };
  });

  return { ...model, blocks };
}

/** The division rule (CONSTRUCTION_FRAME_v4 §4) zone `i` of an `n`-zone split carries, derived from the
 *  split mode — PER ZONE, so every child of an N-way split has its own share (the constraint solver
 *  reads it, Step 2):
 *    • `equal`  → every zone Ratio(1)              (all equal)
 *    • `ratio`  → zone i is Ratio(weight[i])        (each of the N weights captured)
 *    • `fixed`  → zones 0..n-2 Fixed(step), last Flex (the last zone absorbs the remainder)
 *    • `direct` → both zones Flex                   (a manual cut stays proportional on resize)
 */
function ruleForZone(mode: DivideMode, i: number, n: number): DivisionRule {
  switch (mode.kind) {
    case "equal": return { kind: "ratio", weight: 1 };
    case "ratio": return { kind: "ratio", weight: mode.ratio[i] ?? 1 };
    case "fixed": return i < n - 1 ? { kind: "fixed", mm10: mode.step_mm10 } : { kind: "flex" };
    case "direct": return { kind: "flex" };
  }
}

/** Section-level split (private): a leaf → parent-with-children + the new lines.
 *  Section stores only line *ids*, so the `Line` objects travel back separately
 *  for `divideSection` to splice into `Block.lines`. */
function splitLeaf(
  section: Section,
  mode: DivideMode,
): { readonly section: Section; readonly lines: readonly Line[] } {
  if (section.children.length > 0) {
    throw new Error("DIVIDE_SECTION_NOT_LEAF");
  }

  const { axis } = mode;
  const origin = originOf(section.box, axis);
  const extent = extentOf(section.box, axis);
  const end = origin + extent;

  // Interior cut positions, strictly between origin and end, ascending.
  const cuts = cutPositions(mode, origin, extent);
  if (cuts.length === 0) {
    // No-op split (count 1, single ratio, step ≥ extent): nothing changes.
    return { section, lines: [] };
  }

  // Boundaries tile the extent: [origin, ...cuts, end] → N+1 children.
  const boundaries = [origin, ...cuts, end];

  const lines: Line[] = cuts.map((position, i) => ({
    id: `${section.id}::d${i}`,
    axis,
    position_mm10: position,
    boundsPartIds: [],
    groupId: null,
  }));

  const zoneCount = boundaries.length - 1;
  const children: Section[] = boundaries.slice(0, -1).map((lo, i) => {
    const hi = boundaries[i + 1]!;
    return {
      id: `${section.id}::s${i}`,
      box: withAxis(section.box, axis, lo, hi - lo),
      dividers: [],
      children: [],
      // Existing content stays in the model: it lands in the first child so a
      // non-leaf parent keeps `instanceIds` empty (the S1-A contract invariant).
      instanceIds: i === 0 ? section.instanceIds : [],
      purpose: null,
      // v4 §4: each child zone carries its own division rule (the constraint solver reads it, Step 2).
      rule: ruleForZone(mode, i, zoneCount),
    };
  });

  const dividedSection: Section = {
    ...section,
    dividers: lines.map((l) => l.id),
    children,
    instanceIds: [],
  };

  return { section: dividedSection, lines };
}

/** Compute the interior cut coordinates (block-local, ascending) for a mode. */
function cutPositions(mode: DivideMode, origin: mm10, extent: mm10): mm10[] {
  const end = origin + extent;

  switch (mode.kind) {
    case "direct": {
      const at = mode.at_mm10;
      if (!Number.isInteger(at)) throw new Error("DIVIDE_NON_INTEGER_POSITION");
      if (at <= origin || at >= end) throw new Error("DIVIDE_OUT_OF_BOUNDS");
      return [at];
    }

    case "equal": {
      const n = mode.count;
      if (!Number.isInteger(n) || n < 1) throw new Error("DIVIDE_INVALID_COUNT");
      if (n === 1) return [];
      // Cumulative rounding off the running total keeps the sum exact (no drift).
      const cuts: mm10[] = [];
      for (let i = 1; i < n; i += 1) cuts.push(origin + Math.round((extent * i) / n));
      return dedupeInterior(cuts, origin, end);
    }

    case "ratio": {
      const r = mode.ratio;
      if (r.length === 0 || r.some((v) => !(v > 0))) throw new Error("DIVIDE_INVALID_RATIO");
      if (r.length === 1) return [];
      const total = r.reduce((s, v) => s + v, 0);
      const cuts: mm10[] = [];
      let run = 0;
      for (let i = 0; i < r.length - 1; i += 1) {
        run += r[i]!;
        cuts.push(origin + Math.round((extent * run) / total));
      }
      return dedupeInterior(cuts, origin, end);
    }

    case "fixed": {
      const step = mode.step_mm10;
      if (!Number.isInteger(step) || step <= 0) throw new Error("DIVIDE_INVALID_STEP");
      if (step >= extent) return []; // remainder == whole section: no cut
      const cuts: mm10[] = [];
      for (let pos = origin + step; pos < end; pos += step) cuts.push(pos);
      return cuts;
    }
  }
}

/** Drop cuts that landed on (or past) a boundary or duplicated a neighbour, so
 *  every resulting child has width > 0. Keeps the split well-formed. */
function dedupeInterior(cuts: readonly mm10[], origin: mm10, end: mm10): mm10[] {
  const out: mm10[] = [];
  for (const c of cuts) {
    if (c <= origin || c >= end) continue;
    if (out.length > 0 && c === out[out.length - 1]) continue;
    out.push(c);
  }
  return out;
}

/** Locate a section (anywhere in any zone tree) and the block that owns it. */
function findSection(
  model: StructuralModel,
  sectionId: SectionId,
): { block: Block; section: Section } | null {
  for (const block of model.blocks) {
    let hit: Section | null = null;
    forEachSection(block, (s) => {
      if (!hit && s.id === sectionId) hit = s;
    });
    if (hit) return { block, section: hit };
  }
  return null;
}

/** Return a section tree with `targetId` replaced by `replacement`. Untouched
 *  branches are returned by reference; the input tree is never mutated. */
function replaceSection(section: Section, targetId: SectionId, replacement: Section): Section {
  if (section.id === targetId) return replacement;
  if (section.children.length === 0) return section;
  const children = section.children.map((c) => replaceSection(c, targetId, replacement));
  return children.some((c, i) => c !== section.children[i]) ? { ...section, children } : section;
}

// ===========================================================================
// 1b · mergeSections — the inverse of divideSection (blocker #2, v3 §9)
// ===========================================================================

/**
 * Merge 2+ ADJACENT sibling leaf sections back into one — the inverse of
 * `divideSection`. Removes the divider `Line`s between them (from the parent's
 * `dividers` and `Block.lines`), unions their boxes along the divide axis, and
 * concatenates their content; every `Instance` that sat in a merged child is
 * re-pointed to the surviving section. If EVERY child of the parent is merged,
 * the parent reverts to a leaf — the exact inverse of a divide.
 *
 * No-op (same reference) for fewer than 2 distinct ids. Throws if the ids are not
 * direct siblings of one parent (`MERGE_NOT_SIBLINGS`), not contiguous in the
 * tiling (`MERGE_NOT_CONTIGUOUS`), or any merged child is itself non-leaf
 * (`MERGE_NON_LEAF_CHILD`).
 */
export function mergeSections(
  model: StructuralModel,
  sectionIds: readonly SectionId[],
): StructuralModel {
  const ids = new Set(sectionIds);
  if (ids.size < 2) return model; // nothing to merge

  const found = findMergeParent(model, ids);
  if (!found) throw new Error("MERGE_NOT_SIBLINGS");
  const { block, parent } = found;

  // Positions of the merged children in the parent's tiling; must be contiguous.
  const idxs = parent.children.map((c, i) => (ids.has(c.id) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length !== ids.size) throw new Error("MERGE_NOT_SIBLINGS");
  const lo = idxs[0]!;
  const hi = idxs[idxs.length - 1]!;
  if (hi - lo + 1 !== idxs.length) throw new Error("MERGE_NOT_CONTIGUOUS");

  const merged = parent.children.slice(lo, hi + 1);
  if (merged.some((c) => c.children.length > 0)) throw new Error("MERGE_NON_LEAF_CHILD");

  // Union the boxes along the divide axis (the axis on which adjacent children differ).
  const axis = divideAxisOf(merged[0]!.box, merged[1]!.box);
  const start = originOf(merged[0]!.box, axis);
  const lastBox = merged[merged.length - 1]!.box;
  const span = originOf(lastBox, axis) + extentOf(lastBox, axis) - start;
  const unionBox = withAxis(merged[0]!.box, axis, start, span);

  const mergedInstanceIds = merged.flatMap((c) => c.instanceIds);
  const mergedPurpose = merged.find((c) => c.purpose !== null)?.purpose ?? null;
  const mergedChildIds = new Set(merged.map((c) => c.id));

  // Divider lines strictly between the merged children (parent.dividers[lo..hi-1]).
  const removedLineIds = new Set(parent.dividers.slice(lo, hi));

  let newParent: Section;
  let targetSectionId: SectionId;
  if (merged.length === parent.children.length) {
    // All children merged → parent reverts to a leaf (exact inverse of divide).
    targetSectionId = parent.id;
    newParent = { ...parent, dividers: [], children: [], instanceIds: mergedInstanceIds, purpose: mergedPurpose };
  } else {
    // Subset merge → one new leaf child replaces the merged range.
    targetSectionId = merged[0]!.id;
    const mergedChild: Section = {
      id: targetSectionId,
      box: unionBox,
      dividers: [],
      children: [],
      instanceIds: mergedInstanceIds,
      purpose: mergedPurpose,
    };
    newParent = {
      ...parent,
      children: [...parent.children.slice(0, lo), mergedChild, ...parent.children.slice(hi + 1)],
      dividers: parent.dividers.filter((id) => !removedLineIds.has(id)),
    };
  }

  const blocks = model.blocks.map((b) => {
    if (b.id !== block.id) return b;
    const zones = b.zones.map((z) => {
      const root = replaceSection(z.root, parent.id, newParent);
      return root === z.root ? z : ({ ...z, root } as Zone);
    });
    const lines = b.lines.filter((l) => !removedLineIds.has(l.id));
    const instances = b.instances.map((inst) =>
      mergedChildIds.has(inst.sectionId) && inst.sectionId !== targetSectionId
        ? { ...inst, sectionId: targetSectionId }
        : inst,
    );
    return { ...b, zones, lines, instances };
  });

  return { ...model, blocks };
}

/** Find the section whose DIRECT children include every id in `ids`. */
function findMergeParent(
  model: StructuralModel,
  ids: Set<SectionId>,
): { block: Block; parent: Section } | null {
  const wanted = [...ids];
  for (const block of model.blocks) {
    let hit: Section | null = null;
    forEachSection(block, (s) => {
      if (!hit && s.children.length > 0 && wanted.every((id) => s.children.some((c) => c.id === id))) {
        hit = s;
      }
    });
    if (hit) return { block, parent: hit };
  }
  return null;
}

/** The axis on which two adjacent sibling boxes differ (their divide axis). */
function divideAxisOf(a: Box3D, b: Box3D): Axis {
  if (a.x !== b.x) return "x";
  if (a.y !== b.y) return "y";
  return "z";
}

// ===========================================================================
// 2 · moveLine — DB/19_FUNCTION_MAP.md §3.4 + §4 (scope)
// ===========================================================================

/**
 * Move the divider `lineId` by `delta` mm10, reflowing the sections it bounds.
 * `scope` widens the reach (UI: Локально · Линия · Ряд · Все):
 *   local  — only this line
 *   line   — every line sharing this line's `groupId` (aligned group; UI default)
 *   row    — every same-axis divider of a section in a Row that contains this
 *            line's parent section ("every carcass in the row")
 *   global — every same-axis line in the whole model
 *
 * NOTE (S1-B_TEST_PLAN §7, for Planner): `row` keys off the divider's PARENT
 * section being listed in a Row. `global` is "same axis across the model". Both
 * are deliberate, documented readings of the under-specified scope semantics.
 *
 * Returns the input model unchanged when `delta === 0`. Throws if `lineId` is
 * unknown, `delta` is non-integer, or the reflow would collapse a section ≤ 0.
 */
export function moveLine(
  model: StructuralModel,
  lineId: LineId,
  delta: mm10,
  scope: Scope,
): StructuralModel {
  if (!Number.isInteger(delta)) throw new Error("MOVELINE_NON_INTEGER_DELTA");

  const found = findLine(model, lineId);
  if (!found) throw new Error("MOVELINE_LINE_NOT_FOUND");
  if (delta === 0) return model;

  const targets = resolveScope(model, found.block, found.line, scope);
  const axisOf = new Map<LineId, Axis>();
  for (const block of model.blocks) {
    for (const l of block.lines) if (targets.has(l.id)) axisOf.set(l.id, l.axis);
  }

  const blocks = model.blocks.map((block) => {
    const blockTargets = new Set<LineId>();
    for (const l of block.lines) if (targets.has(l.id)) blockTargets.add(l.id);
    if (blockTargets.size === 0) return block; // untouched block, same reference

    const lines = block.lines.map((l) =>
      blockTargets.has(l.id) ? { ...l, position_mm10: l.position_mm10 + delta } : l,
    );
    const zones = block.zones.map((z) => {
      const root = reflowSection(z.root, blockTargets, axisOf, delta);
      return root === z.root ? z : ({ ...z, root } as Zone);
    });
    return { ...block, lines, zones };
  });

  return { ...model, blocks };
}

/** Reflow a section's children around any moved divider it owns (depth-first). */
function reflowSection(
  section: Section,
  targets: ReadonlySet<LineId>,
  axisOf: ReadonlyMap<LineId, Axis>,
  delta: mm10,
): Section {
  // Recurse first so a moved divider deep in the tree is handled before us.
  let children = section.children.map((c) => reflowSection(c, targets, axisOf, delta));
  let changed = children.some((c, i) => c !== section.children[i]);

  for (let d = 0; d < section.dividers.length; d += 1) {
    const lineId = section.dividers[d]!;
    if (!targets.has(lineId)) continue;
    const axis = axisOf.get(lineId)!;
    const left = children[d]!;
    const right = children[d + 1]!;

    const newLeftExtent = extentOf(left.box, axis) + delta;
    const newRightExtent = extentOf(right.box, axis) - delta;
    if (newLeftExtent <= 0 || newRightExtent <= 0) {
      throw new Error("MOVELINE_SECTION_COLLAPSE");
    }

    const newLeft: Section = {
      ...left,
      box: withAxis(left.box, axis, originOf(left.box, axis), newLeftExtent),
    };
    const newRight: Section = {
      ...right,
      box: withAxis(right.box, axis, originOf(right.box, axis) + delta, newRightExtent),
    };
    children = children.map((c, i) => (i === d ? newLeft : i === d + 1 ? newRight : c));
    changed = true;
  }

  return changed ? { ...section, children } : section;
}

/** Locate a line and the block that owns it. */
function findLine(model: StructuralModel, lineId: LineId): { block: Block; line: Line } | null {
  for (const block of model.blocks) {
    const line = block.lines.find((l) => l.id === lineId);
    if (line) return { block, line };
  }
  return null;
}

/** Resolve the set of line ids a scoped move touches (always includes the line).
 *  `line` (by groupId) and `global` (by axis) reach across the whole model —
 *  aligned lines can span carcasses/blocks. `local` and `row` stay block-local
 *  (a Row is a block-level composition). */
function resolveScope(
  model: StructuralModel,
  block: Block,
  line: Line,
  scope: Scope,
): ReadonlySet<LineId> {
  const out = new Set<LineId>([line.id]);
  if (scope === "local") return out;

  if (scope === "line") {
    if (line.groupId !== null) {
      for (const b of model.blocks) {
        for (const l of b.lines) if (l.groupId === line.groupId) out.add(l.id);
      }
    }
    return out;
  }

  if (scope === "global") {
    for (const b of model.blocks) {
      for (const l of b.lines) if (l.axis === line.axis) out.add(l.id);
    }
    return out;
  }

  // scope === "row": same-axis dividers of sections sharing a Row with our parent.
  const parent = dividerParent(block, line.id);
  if (!parent) return out;
  const rowSectionIds = new Set<string>();
  for (const row of block.rows) {
    if (row.sectionIds.includes(parent.id)) {
      for (const sid of row.sectionIds) rowSectionIds.add(sid);
    }
  }
  if (rowSectionIds.size === 0) return out;
  forEachSection(block, (sec) => {
    if (!rowSectionIds.has(sec.id)) return;
    for (const did of sec.dividers) {
      const dl = block.lines.find((l) => l.id === did);
      if (dl && dl.axis === line.axis) out.add(dl.id);
    }
  });
  return out;
}

/** The section whose `dividers` contains `lineId`, or null. */
function dividerParent(block: Block, lineId: LineId): Section | null {
  let hit: Section | null = null;
  forEachSection(block, (sec) => {
    if (!hit && sec.dividers.includes(lineId)) hit = sec;
  });
  return hit;
}

/** Visit every section in a block's zone trees, depth-first. */
function forEachSection(block: Block, visit: (s: Section) => void): void {
  const walk = (s: Section): void => {
    visit(s);
    for (const c of s.children) walk(c);
  };
  for (const z of block.zones) walk(z.root);
}

// ===========================================================================
// 3 · selectByTap — group-first selection (L0, CONSTRUCTION_FRAME_v2.md:166)
// ===========================================================================

/**
 * The result of tapping a part: the Component (Тип) it belongs to and the blast
 * radius — the instances an edit would change. A linked tap selects the whole
 * type (all LINKED siblings). A tap that lands on a detached instance's private
 * parts selects only that one exception.
 */
export interface Selection {
  readonly componentId: ComponentId;
  readonly instanceIds: readonly InstanceId[];
  readonly detached: boolean;
}

/**
 * Resolve a tapped `partId` to a group-first selection, or `null` if no
 * component owns it. Detached instances (which carry their own `partIds`
 * override) resolve to themselves alone; the shared type resolves to all of its
 * linked instances — the blast radius shown before any edit.
 */
export function selectByTap(model: StructuralModel, partId: PartId): Selection | null {
  for (const block of model.blocks) {
    // A detached instance that owns a part DIVERGED from its type (a part not in
    // the shared definition) is a one-off exception: tapping it selects just it.
    // A detached-but-unchanged instance still shares the type's parts, so tapping
    // a shared part falls through to the group below (the exception is excluded).
    for (const inst of block.instances) {
      if (inst.link !== "detached" || !inst.partIds) continue;
      const comp = block.components.find((c) => c.id === inst.componentId);
      const ownsDiverged = inst.partIds.includes(partId) && !comp?.partIds.includes(partId);
      if (ownsDiverged) {
        return { componentId: inst.componentId, instanceIds: [inst.id], detached: true };
      }
    }
    // Otherwise the part belongs to a shared type → select every linked sibling.
    const component = block.components.find((c) => c.partIds.includes(partId));
    if (component) {
      const instanceIds = block.instances
        .filter((i) => i.componentId === component.id && i.link !== "detached")
        .map((i) => i.id);
      return { componentId: component.id, instanceIds, detached: false };
    }
  }
  return null;
}

// ===========================================================================
// 4 · detachInstance / reattachInstance — exceptions (T0, FRAME :147, :150)
// ===========================================================================

/**
 * Make `instanceId` a detached exception (✂): flip its link and snapshot its
 * Component's parts into a private `partIds` override so it can diverge without
 * dragging its siblings. The "✂ N" readout (`countExceptions`) rises by one.
 * Idempotent — re-detaching returns the model unchanged. Throws if unknown.
 */
export function detachInstance(model: StructuralModel, instanceId: InstanceId): StructuralModel {
  return mapInstance(model, instanceId, (inst, component) => {
    if (inst.link === "detached") return inst; // already an exception → no-op
    const partIds: readonly PartId[] = [...component.partIds];
    return { ...inst, link: "detached", partIds };
  });
}

/**
 * Re-link `instanceId` to its Component (clears the ✂ override), dropping the
 * exception so it follows the shared definition again. `countExceptions` falls
 * by one. Idempotent — re-attaching a linked instance is a no-op. Throws if
 * unknown.
 */
export function reattachInstance(model: StructuralModel, instanceId: InstanceId): StructuralModel {
  return mapInstance(model, instanceId, (inst) => {
    if (inst.link === "linked") return inst; // already linked → no-op
    return { ...inst, link: "linked", partIds: null };
  });
}

/**
 * "Each differs" — dissolve a fresh multi-member group into independent group-of-1s (L0, v3:67
 * "first edit of a fresh multi-member group offers 'keep linked / each differs'"; ledger #14 /
 * surface #36). Every instance of `componentId` gets its OWN private Component clone, so an edit to
 * one no longer travels to its siblings; the shared type is removed. A detached instance's private
 * snapshot is preserved into its clone. No-op (same model) for a component with < 2 instances (a
 * unique part is already a group-of-1). Throws if the component is unknown.
 */
export function dissolveGroup(model: StructuralModel, componentId: ComponentId): StructuralModel {
  const block = model.blocks.find((b) => b.components.some((c) => c.id === componentId));
  if (!block) throw new Error("DISSOLVE_COMPONENT_NOT_FOUND");
  const comp = block.components.find((c) => c.id === componentId)!;

  const members = block.instances.filter((i) => i.componentId === componentId);
  if (members.length < 2) return model; // already unique / not a real group

  const cloneIdByInstance = new Map<InstanceId, ComponentId>();
  const clones: Component[] = members.map((inst, k) => {
    const cloneId = `${componentId}__each_${k}`;
    cloneIdByInstance.set(inst.id, cloneId);
    const partIds = inst.partIds && inst.partIds.length ? [...inst.partIds] : [...comp.partIds];
    return { ...comp, id: cloneId, name: `${comp.name} ${k + 1}`, partIds };
  });

  const components = [...block.components.filter((c) => c.id !== componentId), ...clones];
  const instances = block.instances.map((inst) => {
    const cloneId = cloneIdByInstance.get(inst.id);
    return cloneId ? { ...inst, componentId: cloneId, link: "linked" as const, partIds: null } : inst;
  });

  const newBlock: Block = { ...block, components, instances };
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? newBlock : b)) };
}

/** Kinds the UI's "Add" verb can place. First slice supports `"shelf"`. */
export type AddKind = "shelf" | "rail" | "divider" | "drawer" | "door";

/** Options for `addInstance` — the 32mm doubled build (L1) and a glazed-grid door (Piece 2). */
export interface AddOpts {
  readonly doubled?: boolean;
  /** door only: create a glazed-GRID facade of `lights` panes instead of a plain door (Piece 2). */
  readonly glazedGrid?: { readonly lights: number };
  /** door only (F3): a plain glazed door — a single glass pane (the solver cuts the rebate groove). */
  readonly glazed?: boolean;
  /** door only: hinge side — "right" drills cups on the yMax edge. Absent/"left" = the y0 edge. */
  readonly hingeEdge?: "left" | "right";
}

/**
 * Add content to a leaf section and return the NEW model (E11):
 *   • `"shelf"`  — an `internal_shelf` (redistributes the section's shelves to even heights)
 *   • `"door"`   — a `facade` covering the section's front opening (Piece 2)
 *   • `"divider"`— a structural split → delegates to `divideSection` (even 2-way on X)
 * `opts.doubled` makes the shelf/door a 32mm build (two glued 16mm boards, L1). `"rail"`/`"drawer"`
 * remain no-ops (drawer/rail hardware is out of scope). Throws on unknown / non-leaf section.
 */
export function addInstance(
  model: StructuralModel,
  sectionId: SectionId,
  kind: AddKind = "shelf",
  opts: AddOpts = {},
): StructuralModel {
  if (kind === "divider") {
    return divideSection(model, sectionId, { kind: "equal", axis: "x", count: 2 });
  }
  if (kind !== "shelf" && kind !== "door" && kind !== "drawer") return model; // rail = out-of-scope

  const located = findSection(model, sectionId);
  if (!located) throw new Error("ADD_INSTANCE_SECTION_NOT_FOUND");
  const { block, section } = located;
  // Phase 2.2 — a combined door may be added to a NON-leaf (parent) section: it covers the whole span, over
  // the children behind it. Shelves/drawers still require a leaf (they live in one compartment).
  if (section.children.length > 0 && kind !== "door") throw new Error("ADD_INSTANCE_SECTION_NOT_LEAF");

  if (kind === "drawer") return addDrawerInstance(model, block, section);
  const doubled = opts.doubled === true;
  return kind === "door"
    ? addDoorInstance(model, block, section, doubled, opts.glazedGrid, opts.glazed === true, opts.hingeEdge)
    : addShelfInstance(model, block, section, doubled);
}

/** Remove a placed instance (shelf / door / drawer) — drops it from its block's instances and from
 *  its section's `instanceIds`. Same reference when the id is not found. The (now-unused) component is
 *  left in place (harmless; the solver only emits parts for live instances). */
export function removeInstance(model: StructuralModel, instanceId: InstanceId): StructuralModel {
  return {
    ...model,
    blocks: model.blocks.map((block) => {
      if (!block.instances.some((i) => i.id === instanceId)) return block;
      const strip = (s: Section): Section => ({
        ...s,
        instanceIds: s.instanceIds.filter((id) => id !== instanceId),
        children: s.children.map(strip),
      });
      return {
        ...block,
        instances: block.instances.filter((i) => i.id !== instanceId),
        zones: block.zones.map((z) => ({ ...z, root: strip(z.root) })),
      };
    }),
  };
}

/** Add a drawer to a leaf section — a box component (role null, drawer:true) + its instance. The
 *  solver expands it into the 5-panel box; hardware counts it as a slide set (not hinges). */
function addDrawerInstance(model: StructuralModel, block: Block, section: Section): StructuralModel {
  const id = `${block.id}__cmp_drawer`;
  let drawer = block.components.find((c) => c.id === id) ?? null;
  let components = block.components;
  if (!drawer) {
    drawer = { id, name: "Ящик", partIds: [], role: null, drawer: true };
    components = [...block.components, drawer];
  }
  const newId = nextInstanceId(block, "drawer");
  const instances: Instance[] = [
    ...block.instances,
    { id: newId, componentId: drawer.id, sectionId: section.id, anchor: { x: section.box.x, y: section.box.y, z: section.box.z }, link: "linked" },
  ];
  const zones = withSectionInstances(block, section, [...section.instanceIds, newId]);
  const newBlock: Block = { ...block, components, instances, zones };
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? newBlock : b)) };
}

/** Find (or create) a role component keyed by role + doubled flag, so plain and 32mm builds don't
 *  collide on one shared type. Returns the component and the (possibly extended) component list. */
function ensureComponent(
  block: Block,
  id: ComponentId,
  name: string,
  role: NonNullable<Component["role"]>,
  doubled: boolean,
): { component: Component; components: readonly Component[] } {
  const existing = block.components.find((c) => c.id === id);
  if (existing) return { component: existing, components: block.components };
  const component: Component = { id, name, partIds: [], role, ...(doubled ? { doubled: true } : {}) };
  return { component, components: [...block.components, component] };
}

/** Mint the next instance id for a family (`shelf` / `door` / `drawer`). Uses `max(existing suffix)+1`
 *  PER PREFIX rather than `block.instances.length+1`: the old length-based counter reused ids after a
 *  remove (delete shelf_2 of {1,2,3} → next add minted shelf_3 again, colliding) and even let a door
 *  removal shift the shelf numbering, since length counts every family at once. Scanning the live ids
 *  of just this family guarantees the new id is strictly greater than every live one — no collision. */
function nextInstanceId(block: Block, prefix: string): InstanceId {
  const re = new RegExp(`^${prefix}_(\\d+)$`);
  let max = 0;
  for (const inst of block.instances) {
    const m = re.exec(inst.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}_${max + 1}`;
}

/** Splice a section's updated instanceIds back into its zone tree. */
function withSectionInstances(block: Block, section: Section, instanceIds: readonly InstanceId[]): Zone[] {
  const next: Section = { ...section, instanceIds };
  return block.zones.map((z) => {
    const root = replaceSection(z.root, section.id, next);
    return root === z.root ? z : { ...z, root };
  });
}

function addShelfInstance(model: StructuralModel, block: Block, section: Section, doubled: boolean): StructuralModel {
  const roleOf = (inst: Instance) => block.components.find((c) => c.id === inst.componentId)?.role ?? null;
  const { component: shelf, components } = ensureComponent(
    block,
    `${block.id}__cmp_shelf${doubled ? "_x2" : ""}`,
    doubled ? "Полка 32мм" : "Полка",
    "internal_shelf",
    doubled,
  );

  const newId = nextInstanceId(block, "shelf");
  // every shelf now living in this section, in order, gets an evenly-spaced height
  const order = [
    ...block.instances.filter((i) => i.sectionId === section.id && roleOf(i) === "internal_shelf").map((i) => i.id),
    newId,
  ];
  const n = order.length;
  // Precise distribution: EQUAL clear openings. The old formula spread shelf CENTRES evenly over the
  // FULL section height, ignoring the 16mm carcass/divider at each end AND each shelf's own 16mm — so
  // the top gap came out smaller than the rest. Here we inset by the bounding panel (T) at both ends,
  // subtract every shelf's thickness, and split the remaining CLEAR height into n+1 equal openings.
  // `anchor.y` is the shelf's BOTTOM, so shelf i bottom = floor + (i+1)·opening + i·T.
  // Boundary-aware clear span: a carcass board (full T) at a block edge, a horizontal divider (T/2)
  // at an interior cut — so the openings stay EQUAL even when this section is a row bounded by a
  // divider (the earlier fix insetting a full T at both ends was only right for a carcass-bounded
  // section). shelfSpanY returns the inset from the section's bottom + the clear height between panels.
  const T = 160; // 16mm — BOARD_MM10 (each shelf's own thickness)
  const spanY = shelfSpanY(block, section, T);
  const opening = Math.max(0, spanY.height - n * T) / (n + 1); // one equal clear gap
  const yAt = (idx: number) => Math.round(section.box.y + spanY.y0 + (idx + 1) * opening + idx * T);

  const instances: Instance[] = block.instances.map((i) => {
    const idx = order.indexOf(i.id);
    return idx === -1 ? i : { ...i, anchor: { ...i.anchor, y: yAt(idx) } };
  });
  instances.push({ id: newId, componentId: shelf.id, sectionId: section.id, anchor: { x: section.box.x, y: yAt(n - 1), z: section.box.z }, link: "linked" });

  const zones = withSectionInstances(block, section, [...section.instanceIds, newId]);
  const newBlock: Block = { ...block, components, instances, zones };
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? newBlock : b)) };
}

function addDoorInstance(
  model: StructuralModel,
  block: Block,
  section: Section,
  doubled: boolean,
  glazedGrid?: { readonly lights: number },
  glazed = false,
  hingeEdge?: "left" | "right",
): StructuralModel {
  // Each door variant (plain / 32mm / glazed / glazed-grid × hinge side) is its own keyed component.
  // Left is the default, so a left-hung door keeps the exact old id + shape (no regression); only a
  // right-hung door gets the "_hr" suffix + the hingeEdge field.
  const right = hingeEdge === "right";
  const id = `${block.id}__cmp_door${doubled ? "_x2" : ""}${glazedGrid ? `_grid${glazedGrid.lights}` : glazed ? "_gl" : ""}${right ? "_hr" : ""}`;
  let door = block.components.find((c) => c.id === id) ?? null;
  let components = block.components;
  if (!door) {
    door = {
      id,
      name: glazedGrid ? "Витрина" : glazed ? "Дверь стекло" : doubled ? "Дверь 32мм" : "Дверь",
      partIds: [],
      role: "facade",
      ...(doubled ? { doubled: true } : {}),
      ...(glazedGrid ? { glazedGrid } : {}),
      ...(glazed ? { glazed: true } : {}),
      ...(right ? { hingeEdge: "right" as const } : {}),
    };
    components = [...block.components, door];
  }

  const newId = nextInstanceId(block, "door");
  const instances: Instance[] = [
    ...block.instances,
    { id: newId, componentId: door.id, sectionId: section.id, anchor: { x: section.box.x, y: section.box.y, z: section.box.z }, link: "linked" },
  ];
  const zones = withSectionInstances(block, section, [...section.instanceIds, newId]);
  const newBlock: Block = { ...block, components, instances, zones };
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? newBlock : b)) };
}

/** Apply `transform` to one instance (by id), rebuilding only the spine to it.
 *  Returns the same model reference when the transform is a no-op. Throws if the
 *  instance — or its component — cannot be found. */
function mapInstance(
  model: StructuralModel,
  instanceId: InstanceId,
  transform: (inst: Instance, component: Component) => Instance,
): StructuralModel {
  let seen = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.instances.findIndex((i) => i.id === instanceId);
    if (idx === -1) return block;
    seen = true;
    const inst = block.instances[idx]!;
    const component = block.components.find((c) => c.id === inst.componentId);
    if (!component) throw new Error("INSTANCE_COMPONENT_NOT_FOUND");
    const next = transform(inst, component);
    if (next === inst) return block; // no-op → preserve reference
    const instances = block.instances.map((i, k) => (k === idx ? next : i));
    return { ...block, instances };
  });
  if (!seen) throw new Error("INSTANCE_NOT_FOUND");
  return blocks.every((b, i) => b === model.blocks[i]) ? model : { ...model, blocks };
}

// ===========================================================================
// 4 · resizeBlock{Depth,Width} — structure-level dimension edit (blocker #3)
// ===========================================================================
//
// CONSTRUCTION_FRAME_v3 Piece 1 step 1: depth is edited "at block/leg level, not panel". These
// ops scale a whole block along one block-local axis and let solveStructure/solveLayout reflow the
// panels — the fix for the stubbed store `resize`. Depth (z) is the grounded headline case: a
// carcass section spans the full block depth, so scaling is exact. Width (x) additionally scales
// the x-axis dividers proportionally (relative divider positions preserved).

/**
 * Scale one block-local axis of a whole block by `factor`: the block box, every section box
 * (recursively), every instance anchor, and every divider `Line` that runs on that axis. mm10
 * stays integer (round). For an L-block, a depth (z) scale also scales both legs' footprint depth
 * (so `lCornerParts`, which reads the footprint, reflows). Pure; the input block is never mutated.
 */
function scaleBlockAxis(block: Block, axis: Axis, factor: number): Block {
  const scale = (v: mm10): mm10 => Math.round(v * factor);
  // Round EDGES (absolute coordinates), never the extent (a width) on its own (B4). Independently
  // rounding origin + extent let a child box's far edge (round(o) + round(w)) drift up to 1 mm10 from
  // its sibling's origin (round(o+w)) — a 0.1mm gap/overlap that breaks the tile-the-parent invariant.
  // Rounding both edges as round(coord·factor) makes every SHARED coordinate round identically, so
  // adjacent boxes (and dividers/anchors, which use the same `scale`) stay flush.
  const scaleBox = (b: Box3D): Box3D => {
    const o = originOf(b, axis);
    const near = scale(o);
    const far = scale(o + extentOf(b, axis));
    return withAxis(b, axis, near, far - near);
  };
  const scaleSection = (s: Section): Section => ({
    ...s,
    box: scaleBox(s.box),
    children: s.children.map(scaleSection),
  });

  const zones = block.zones.map((z) => ({ ...z, root: scaleSection(z.root) }));
  const instances = block.instances.map((i) => ({
    ...i,
    anchor:
      axis === "x"
        ? { ...i.anchor, x: scale(i.anchor.x) }
        : axis === "y"
          ? { ...i.anchor, y: scale(i.anchor.y) }
          : { ...i.anchor, z: scale(i.anchor.z) },
  }));
  const lines = block.lines.map((l) =>
    l.axis === axis ? { ...l, position_mm10: scale(l.position_mm10) } : l,
  );

  const base: Block = { ...block, box: scaleBox(block.box), zones, instances, lines };
  if (block.footprint && axis === "z") {
    return {
      ...base,
      footprint: {
        legA: { ...block.footprint.legA, depth_mm10: scale(block.footprint.legA.depth_mm10) },
        legB: { ...block.footprint.legB, depth_mm10: scale(block.footprint.legB.depth_mm10) },
      },
    };
  }
  return base;
}

/**
 * Rule-aware resize (Step 2.3, CONSTRUCTION_FRAME_v4 §4): set a plain block's extent along `axis` and
 * RE-SOLVE each division level with the constraint solver instead of scaling everything by one factor.
 * A section split ALONG `axis` runs `resolveChain` over its child zones (Fixed keeps its mm, Locked
 * keeps its size, Ratio shares by weight, Flex absorbs); a section split along ANOTHER axis has every
 * child span the new extent. Dividing lines re-anchor to the new boundaries; instance anchors
 * reposition proportionally within their (resized) leaf. Block-local (0-based) coords, matching the
 * model builders. An equal split (all Ratio-1) reproduces the old proportional result exactly.
 */
type RelayoutCtx = {
  readonly axis: Axis;
  readonly lineAxisOf: ReadonlyMap<LineId, Axis>;
  readonly linePos: Map<LineId, mm10>;
  readonly leafSpan: Map<SectionId, { o0: mm10; e0: mm10; o1: mm10; e1: mm10 }>;
};

/** Recursively place `section` into the span `[o1, o1+e1]` along `ctx.axis`, re-solving each division
 *  level that tiles along that axis via `resolveChain` (per-zone rules). Records new divider positions in
 *  `ctx.linePos` and each leaf's old/new span in `ctx.leafSpan` (for proportional instance re-anchoring).
 *  Shared by the whole-block resize (`resolveBlockAxis`) and the single-section rule edit (`setZoneRule`). */
function relayoutAlong(section: Section, o1: mm10, e1: mm10, ctx: RelayoutCtx): Section {
  const o0 = originOf(section.box, ctx.axis);
  const e0 = extentOf(section.box, ctx.axis);
  const box = withAxis(section.box, ctx.axis, o1, e1);
  if (section.children.length === 0) {
    ctx.leafSpan.set(section.id, { o0, e0, o1, e1 });
    return { ...section, box };
  }
  const divAxis = section.dividers.length > 0 ? ctx.lineAxisOf.get(section.dividers[0]!) : undefined;
  if (divAxis === ctx.axis) {
    // children tile ALONG the axis → re-solve the chain by their per-zone rules
    const zones: ChainZone[] = section.children.map((c) => ({
      rule: c.rule ?? { kind: "flex" },
      currentSize: extentOf(c.box, ctx.axis),
    }));
    const { sizes } = resolveChain(e1, zones);
    let cursor = o1;
    const children = section.children.map((c, i) => {
      const child = relayoutAlong(c, cursor, sizes[i]!, ctx);
      cursor += sizes[i]!;
      if (i < section.dividers.length) ctx.linePos.set(section.dividers[i]!, cursor); // boundary after child i
      return child;
    });
    return { ...section, box, children };
  }
  // children split along ANOTHER axis → each spans the full new extent along the axis
  return { ...section, box, children: section.children.map((c) => relayoutAlong(c, o1, e1, ctx)) };
}

/** Re-anchor an instance proportionally within its (resized) leaf, using the leaf's old/new span. */
function reanchorInstance<T extends { sectionId: SectionId; anchor: { x: mm10; y: mm10; z: mm10 } }>(
  inst: T,
  axis: Axis,
  leafSpan: RelayoutCtx["leafSpan"],
): T {
  const s = leafSpan.get(inst.sectionId);
  if (!s || s.e0 <= 0) return inst;
  const a = inst.anchor;
  const cur = axis === "x" ? a.x : axis === "y" ? a.y : a.z;
  const v = Math.round(s.o1 + ((cur - s.o0) / s.e0) * s.e1); // same fraction within the resized leaf
  const anchor = axis === "x" ? { ...a, x: v } : axis === "y" ? { ...a, y: v } : { ...a, z: v };
  return { ...inst, anchor };
}

function resolveBlockAxis(block: Block, axis: Axis, newExtent: mm10): Block {
  const ctx: RelayoutCtx = {
    axis,
    lineAxisOf: new Map(block.lines.map((l) => [l.id, l.axis] as const)),
    linePos: new Map<LineId, mm10>(),
    leafSpan: new Map(),
  };
  const o = originOf(block.box, axis);
  const zones = block.zones.map((z) => ({ ...z, root: relayoutAlong(z.root, o, newExtent, ctx) }));
  const instances = block.instances.map((inst) => reanchorInstance(inst, axis, ctx.leafSpan));
  const lines = block.lines.map((l) => (ctx.linePos.has(l.id) ? { ...l, position_mm10: ctx.linePos.get(l.id)! } : l));
  return { ...block, box: withAxis(block.box, axis, o, newExtent), zones, instances, lines };
}

/**
 * Step 4 (CONSTRUCTION_FRAME_v4 §4, ratio pill-row editor): set the division rule of zone `zoneIndex`
 * within the divided section `parentSectionId`, then re-solve THAT section's chain so its zones and their
 * dividing lines reflow to the new rule mix. The section's own origin+extent are unchanged — only its
 * internal split changes (e.g. retype a weight 1→0.6 and all three shelves move together). Recurses into
 * each zone's subtree so a divided zone's contents follow. No-op (same ref) if the section isn't divided
 * or `zoneIndex` is out of range.
 */
/** Step 9 — tag a leaf space with its purpose (storage / hanging / boiler / …) so Application view shows
 *  the right ghost contents. No-op (same ref) if the section is missing or already tagged that way. */
export function setSectionPurpose(model: StructuralModel, sectionId: SectionId, purpose: SectionPurpose | null): StructuralModel {
  const located = findSection(model, sectionId);
  if (!located) return model;
  const { block, section } = located;
  if (section.purpose === purpose) return model;
  const updated: Section = { ...section, purpose };
  const zones = block.zones.map((z) => ({ ...z, root: replaceSection(z.root, sectionId, updated) }));
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? { ...b, zones } : b)) };
}

/** A boiler space that fails its minimum clearance (Step 9, Gate 9). */
export interface BoilerClearance {
  readonly sectionId: SectionId;
  readonly need: { readonly w: mm10; readonly h: mm10; readonly d: mm10 };
  readonly have: { readonly w: mm10; readonly h: mm10; readonly d: mm10 };
}
/** A typical wall boiler + service clearance (mm10): 500 × 800 × 300 mm. */
export const BOILER_MIN = { w: 5000, h: 8000, d: 3000 } as const;
/** Step 9 — every "boiler"-tagged space that is smaller than the boiler needs (drives the amber warning). */
export function checkBoilerClearance(model: StructuralModel): BoilerClearance[] {
  const out: BoilerClearance[] = [];
  for (const b of model.blocks)
    forEachSection(b, (s) => {
      if (s.purpose !== "boiler") return;
      if (s.box.w < BOILER_MIN.w || s.box.h < BOILER_MIN.h || s.box.d < BOILER_MIN.d) {
        out.push({ sectionId: s.id, need: BOILER_MIN, have: { w: s.box.w, h: s.box.h, d: s.box.d } });
      }
    });
  return out;
}

export function setZoneRule(
  model: StructuralModel,
  parentSectionId: SectionId,
  zoneIndex: number,
  rule: DivisionRule,
): StructuralModel {
  const located = findSection(model, parentSectionId);
  if (!located) return model;
  const { block, section } = located;
  if (section.children.length === 0 || zoneIndex < 0 || zoneIndex >= section.children.length) return model;
  const divAxis = section.dividers.length > 0 ? block.lines.find((l) => l.id === section.dividers[0])?.axis : undefined;
  if (!divAxis) return model;

  const withRule: Section = {
    ...section,
    children: section.children.map((c, i) => (i === zoneIndex ? { ...c, rule } : c)),
  };
  const ctx: RelayoutCtx = {
    axis: divAxis,
    lineAxisOf: new Map(block.lines.map((l) => [l.id, l.axis] as const)),
    linePos: new Map<LineId, mm10>(),
    leafSpan: new Map(),
  };
  const relaid = relayoutAlong(withRule, originOf(section.box, divAxis), extentOf(section.box, divAxis), ctx);

  const zones = block.zones.map((z) => ({ ...z, root: replaceSection(z.root, section.id, relaid) }));
  const instances = block.instances.map((inst) => reanchorInstance(inst, divAxis, ctx.leafSpan));
  const lines = block.lines.map((l) => (ctx.linePos.has(l.id) ? { ...l, position_mm10: ctx.linePos.get(l.id)! } : l));
  const newBlock: Block = { ...block, zones, instances, lines };
  return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? newBlock : b)) };
}

/** Set `blockId`'s extent along `axis` to `newExtent_mm10`, re-solving its subtree to match. Plain
 *  blocks use the rule-aware constraint solver (§4); L-corner (footprint) blocks stay on the
 *  proportional `scaleBlockAxis` path. No-op (same ref) when unchanged. Throws on unknown/invalid. */
function resizeBlockAxis(
  model: StructuralModel,
  blockId: BlockId,
  axis: Axis,
  newExtent_mm10: mm10,
): StructuralModel {
  if (!Number.isInteger(newExtent_mm10) || newExtent_mm10 <= 0) {
    throw new Error("RESIZE_INVALID_EXTENT");
  }
  const block = model.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error("RESIZE_BLOCK_NOT_FOUND");
  const old = extentOf(block.box, axis);
  if (old <= 0) throw new Error("RESIZE_DEGENERATE_BLOCK");
  if (old === newExtent_mm10) return model; // semantic no-op

  const resized = block.footprint
    ? scaleBlockAxis(block, axis, newExtent_mm10 / old) // L-corner → proportional (rules are box-only)
    : resolveBlockAxis(block, axis, newExtent_mm10); // plain block → rule-aware constraint solve
  // v5 — reflow anchored free parts to the resized block (the "table law": a top spans, legs hold corners).
  const reflowed = resized.freeParts?.some((fp) => fp.anchor)
    ? { ...resized, freeParts: resized.freeParts.map((fp) => (fp.anchor ? { ...fp, box: resolveFreePartBox(fp.anchor, resized.box) } : fp)) }
    : resized;
  return { ...model, blocks: model.blocks.map((b) => (b.id === blockId ? reflowed : b)) };
}

/** Structure-level DEPTH edit (blocker #3, v3 Piece 1): set a block's depth; panels reflow. */
export function resizeBlockDepth(
  model: StructuralModel,
  blockId: BlockId,
  newDepth_mm10: mm10,
): StructuralModel {
  return resizeBlockAxis(model, blockId, "z", newDepth_mm10);
}

/** Structure-level WIDTH edit (the ⤢ handle's second axis, L6): set a block's width; panels and
 *  x-axis dividers reflow proportionally. */
export function resizeBlockWidth(
  model: StructuralModel,
  blockId: BlockId,
  newWidth_mm10: mm10,
): StructuralModel {
  return resizeBlockAxis(model, blockId, "x", newWidth_mm10);
}

/** Structure-level HEIGHT edit (Phase C2): set a block's height; sections, y-dividers and shelves
 *  reflow proportionally (the subtree is scaled, so content is preserved — no orphaning). */
export function resizeBlockHeight(
  model: StructuralModel,
  blockId: BlockId,
  newHeight_mm10: mm10,
): StructuralModel {
  return resizeBlockAxis(model, blockId, "y", newHeight_mm10);
}

// ===========================================================================
// Run (v5) — resize a wall-run of blocks so its members tile the wall exactly
// ===========================================================================

/** Members of `run` whose block still exists, paired with the live block, in run order. */
function runMembers(model: StructuralModel, run: Run): { rule: DivisionRule; block: Block }[] {
  const byId = new Map(model.blocks.map((b) => [b.id, b] as const));
  return run.members
    .map((m) => ({ rule: m.rule, block: byId.get(m.blockId) }))
    .filter((x): x is { rule: DivisionRule; block: Block } => x.block !== undefined);
}

/** Reflow a block to width `w` along `axis` (its sections re-based BLOCK-LOCAL from 0) and place its left
 *  edge at `cursor`. The per-member primitive shared by `resolveRun` (rule-solved widths) and `layRun`
 *  (current widths). L-corner blocks scale proportionally; plain blocks solve rule-aware. */
function placeMemberBlock(block: Block, axis: Axis, w: mm10, cursor: mm10): Block {
  const old = extentOf(block.box, axis);
  const local = { ...block, box: withAxis(block.box, axis, 0, old) }; // normalise origin → block-local
  const reflowed = block.footprint ? scaleBlockAxis(local, axis, w / old) : resolveBlockAxis(local, axis, w);
  return { ...reflowed, box: withAxis(reflowed.box, axis, cursor, w) };
}

/** Lay a run's members end-to-end from its current left edge, each at the width `widthOf` gives it. */
function layRun(model: StructuralModel, run: Run, widthOf: (block: Block, i: number) => mm10): StructuralModel {
  const members = runMembers(model, run);
  if (members.length === 0) return model;
  let cursor = originOf(members[0]!.block.box, run.axis); // keep the run's left edge where it was
  const placed = new Map<BlockId, Block>();
  members.forEach(({ block }, i) => {
    const w = widthOf(block, i);
    placed.set(block.id, placeMemberBlock(block, run.axis, w, cursor));
    cursor += w;
  });
  return { ...model, blocks: model.blocks.map((b) => placed.get(b.id) ?? b) };
}

/**
 * Re-solve a `Run` to a new wall length: distribute `newLength_mm10` across the member blocks via the
 * constraint solver (`resolveChain` — Fixed keeps its width, Ratio shares the pool, Flex absorbs the
 * leftover), resize each member's carcass, and lay them end-to-end so they tile the wall with no gap.
 * Works for ANY wall length — the length is a PARAMETER, not a constant. Pure/immutable; no-op (same ref)
 * when the run is unknown or has no surviving members.
 */
export function resolveRun(model: StructuralModel, runId: RunId, newLength_mm10: mm10): StructuralModel {
  if (!Number.isInteger(newLength_mm10) || newLength_mm10 <= 0) throw new Error("RUN_INVALID_LENGTH");
  const run = model.runs?.find((r) => r.id === runId);
  if (!run) return model; // unknown run → no-op
  const members = runMembers(model, run);
  if (members.length === 0) return model;
  const zones: ChainZone[] = members.map(({ rule, block }) => ({ rule, currentSize: extentOf(block.box, run.axis) }));
  const { sizes } = resolveChain(newLength_mm10, zones);
  const laid = layRun(model, run, (_b, i) => sizes[i]!);
  const runs = model.runs!.map((r) => (r.id === runId ? { ...r, length_mm10: newLength_mm10 } : r));
  return { ...laid, runs };
}

/**
 * The fit status of a run at a given wall length (drives the amber warning, like `checkConstraints`):
 * "ok" tiles exactly, "over-constrained" = Fixed/Locked members exceed the wall, "no-absorb" = leftover
 * space with no flexible member to take it, "unknown" = no such run.
 */
export function runFitStatus(
  model: StructuralModel,
  runId: RunId,
  length_mm10: mm10,
): "ok" | "over-constrained" | "no-absorb" | "unknown" {
  const run = model.runs?.find((r) => r.id === runId);
  if (!run) return "unknown";
  const zones: ChainZone[] = runMembers(model, run).map(({ rule, block }) => ({
    rule,
    currentSize: extentOf(block.box, run.axis),
  }));
  return resolveChain(length_mm10, zones).status;
}

/** Options for `groupBlocks`. */
export interface GroupBlocksOpts {
  readonly id?: RunId;
  readonly name?: string;
  /** The wall axis the blocks line up along. Default `"x"`. */
  readonly axis?: Axis;
  /** Per-block width rule, by blockId; any block not listed defaults to Flex. */
  readonly rules?: Readonly<Record<BlockId, DivisionRule>>;
}

/** Every blockId already claimed by some run (a block belongs to at most one run). */
function blocksInRuns(model: StructuralModel): Set<BlockId> {
  return new Set((model.runs ?? []).flatMap((r) => r.members.map((m) => m.blockId)));
}

/**
 * Combine ≥2 existing blocks into a new `Run` (the master's "make these cabinets one unit"). The members
 * are laid end-to-end at their CURRENT widths in `blockIds` order — grouping removes gaps, it does NOT
 * resize; `resolveRun` resizes them to a wall later. Each member takes its rule from `opts.rules` (else
 * Flex). Throws on <2 blocks, an unknown block, or a block already in a run.
 */
export function groupBlocks(model: StructuralModel, blockIds: readonly BlockId[], opts: GroupBlocksOpts = {}): StructuralModel {
  const ids = [...new Set(blockIds)];
  if (ids.length < 2) throw new Error("GROUP_NEEDS_2_BLOCKS");
  const byId = new Map(model.blocks.map((b) => [b.id, b] as const));
  const claimed = blocksInRuns(model);
  for (const id of ids) {
    if (!byId.has(id)) throw new Error("GROUP_BLOCK_NOT_FOUND");
    if (claimed.has(id)) throw new Error("GROUP_BLOCK_ALREADY_IN_RUN");
  }
  const axis = opts.axis ?? "x";
  const members: RunMember[] = ids.map((id) => ({ blockId: id, rule: opts.rules?.[id] ?? { kind: "flex" } }));
  const length = ids.reduce((sum, id) => sum + extentOf(byId.get(id)!.box, axis), 0);
  const run: Run = { id: opts.id ?? `run__${ids.join("-")}`, name: opts.name ?? "Ряд", axis, members, length_mm10: length };
  const withRun: StructuralModel = { ...model, runs: [...(model.runs ?? []), run] };
  return layRun(withRun, run, (b) => extentOf(b.box, axis)); // tile at current widths (no resize)
}

/** Dissolve a run: its member blocks become independent again, keeping their current positions/sizes.
 *  No-op (same ref) when the run is unknown. */
export function ungroupBlocks(model: StructuralModel, runId: RunId): StructuralModel {
  if (!model.runs?.some((r) => r.id === runId)) return model;
  const runs = model.runs.filter((r) => r.id !== runId);
  return { ...model, runs: runs.length > 0 ? runs : undefined };
}

/** Append a block to a run: it joins at the right end, tiled (not resized); the run grows by its width.
 *  Throws on an unknown run/block or a block already in a run. */
export function addBlockToRun(model: StructuralModel, runId: RunId, blockId: BlockId, rule?: DivisionRule): StructuralModel {
  const run = model.runs?.find((r) => r.id === runId);
  if (!run) throw new Error("ADD_RUN_NOT_FOUND");
  const block = model.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error("ADD_BLOCK_NOT_FOUND");
  if (blocksInRuns(model).has(blockId)) throw new Error("ADD_BLOCK_ALREADY_IN_RUN");
  const members: RunMember[] = [...run.members, { blockId, rule: rule ?? { kind: "flex" } }];
  const newRun: Run = { ...run, members, length_mm10: run.length_mm10 + extentOf(block.box, run.axis) };
  const withRun: StructuralModel = { ...model, runs: model.runs!.map((r) => (r.id === runId ? newRun : r)) };
  return layRun(withRun, newRun, (b) => extentOf(b.box, run.axis));
}

/** Remove a block from a run: it becomes independent, the run shrinks by its width. Removing the last
 *  member dissolves the run. No-op (same ref) when the run is unknown or the block isn't a member. */
export function removeBlockFromRun(model: StructuralModel, runId: RunId, blockId: BlockId): StructuralModel {
  const run = model.runs?.find((r) => r.id === runId);
  if (!run || !run.members.some((m) => m.blockId === blockId)) return model;
  const members = run.members.filter((m) => m.blockId !== blockId);
  if (members.length === 0) return ungroupBlocks(model, runId);
  const removed = model.blocks.find((b) => b.id === blockId);
  const length = Math.max(1, run.length_mm10 - (removed ? extentOf(removed.box, run.axis) : 0));
  const newRun: Run = { ...run, members, length_mm10: length };
  const withRun: StructuralModel = { ...model, runs: model.runs!.map((r) => (r.id === runId ? newRun : r)) };
  return layRun(withRun, newRun, (b) => extentOf(b.box, run.axis));
}

/**
 * Put a drawer INSIDE a top-level drawer's clear inner volume — the master's "drawer in a drawer" (v5,
 * CONSTRUCTION_FRAME_v4 §4). Appends a fresh drawer component + instance to the outer drawer's `interior`
 * (creating it if absent). The clear inner box is computed by the solver (never stored), so nothing here
 * needs a thickness. Pure/immutable. Throws if the outer instance is missing or is not a drawer.
 * (Nesting into an ALREADY-nested drawer is a follow-up — this reaches the block's own instances.)
 */
/** Add a fresh nested drawer into `outerId`'s interior, searching this instance list AND every nested
 *  interior (drawer-in-drawer). Returns the rebuilt list, or null if `outerId` isn't in this subtree.
 *  Nested instances are always drawers, so no drawer check is needed below the top level. */
function nestInto(instances: readonly Instance[], outerId: InstanceId, name: string): Instance[] | null {
  const withDrawer = (outer: Instance): Instance => {
    const innerId = `${outer.id}__nd${(outer.interior?.instances.length ?? 0) + 1}`;
    const innerComp: Component = { id: `cmp_${innerId}`, name, partIds: [], role: null, drawer: true };
    const innerInst: Instance = { id: innerId, componentId: innerComp.id, sectionId: outer.sectionId, anchor: { x: 0, y: 0, z: 0 }, link: "linked" };
    const interior: DrawerInterior = outer.interior
      ? { components: [...outer.interior.components, innerComp], instances: [...outer.interior.instances, innerInst] }
      : { components: [innerComp], instances: [innerInst] };
    return { ...outer, interior };
  };
  let changed = false;
  const next = instances.map((inst) => {
    if (inst.id === outerId) { changed = true; return withDrawer(inst); }
    if (inst.interior) {
      const nested = nestInto(inst.interior.instances, outerId, name);
      if (nested) { changed = true; return { ...inst, interior: { ...inst.interior, instances: nested } }; }
    }
    return inst;
  });
  return changed ? next : null;
}

export function nestDrawer(model: StructuralModel, outerInstanceId: InstanceId, name = "Ящик внутр"): StructuralModel {
  for (const block of model.blocks) {
    // top-level target: keep the explicit drawer check (contract — the store catches NEST_NOT_A_DRAWER)
    const top = block.instances.find((i) => i.id === outerInstanceId);
    if (top && !block.components.find((c) => c.id === top.componentId)?.drawer) throw new Error("NEST_NOT_A_DRAWER");
    const instances = nestInto(block.instances, outerInstanceId, name); // finds top-level OR any nested drawer
    if (instances) return { ...model, blocks: model.blocks.map((b) => (b.id === block.id ? { ...b, instances } : b)) };
  }
  throw new Error("NEST_OUTER_NOT_FOUND");
}

/** Resolve one anchored edge against a block extent: `lo` → the offset, `hi` → extent − offset. */
function resolveFreeEdge(e: FreeEdge, extent: mm10): mm10 {
  return e.ref === "lo" ? e.offset_mm10 : extent - e.offset_mm10;
}

/**
 * Re-derive a free part's block-local `Box3D` from its `anchor` and the block's box (v5, the free-part
 * "table law"). Each axis' start/end edges resolve against that axis' extent, giving the board's origin +
 * size — so a top spans and legs hold the corners as the block resizes. Pure.
 */
export function resolveFreePartBox(anchor: FreePartAnchor, box: Box3D): Box3D {
  const axis = (a: { start: FreeEdge; end: FreeEdge }, extent: mm10) => {
    const o = resolveFreeEdge(a.start, extent);
    return { o, size: resolveFreeEdge(a.end, extent) - o };
  };
  const x = axis(anchor.x, box.w), y = axis(anchor.y, box.h), z = axis(anchor.z, box.d);
  return { x: x.o, y: y.o, z: z.o, w: x.size, h: y.size, d: z.size };
}

/**
 * Add a freely-placed board to a block (v5, free assembly) — the master drops a top / a leg / a panel at
 * an explicit box. Pure/immutable. Throws on an unknown block or a duplicate free-part id within it.
 */
export function addFreePart(model: StructuralModel, blockId: BlockId, fp: FreePart): StructuralModel {
  const block = model.blocks.find((b) => b.id === blockId);
  if (!block) throw new Error("ADD_FREEPART_BLOCK_NOT_FOUND");
  if ((block.freeParts ?? []).some((f) => f.id === fp.id)) throw new Error("ADD_FREEPART_DUPLICATE_ID");
  const freeParts = [...(block.freeParts ?? []), fp];
  return { ...model, blocks: model.blocks.map((b) => (b.id === blockId ? { ...b, freeParts } : b)) };
}

/** Remove a free board from a block by id. No-op (same ref) when the block or the free part is missing. */
export function removeFreePart(model: StructuralModel, blockId: BlockId, freePartId: string): StructuralModel {
  const block = model.blocks.find((b) => b.id === blockId);
  if (!block || !(block.freeParts ?? []).some((f) => f.id === freePartId)) return model;
  const freeParts = (block.freeParts ?? []).filter((f) => f.id !== freePartId);
  return { ...model, blocks: model.blocks.map((b) => (b.id === blockId ? { ...b, freeParts } : b)) };
}

/**
 * Duplicate a free board inside its block (gizmo «duplicate» mode). The copy lands just beside the
 * original along X so it reads as a second board immediately. `newId` is caller-supplied so the engine
 * stays pure/deterministic. Pure/immutable; throws when the block or board is unknown.
 */
export function duplicateFreePart(model: StructuralModel, blockId: BlockId, freePartId: string, newId: string): StructuralModel {
  const block = model.blocks.find((b) => b.id === blockId);
  const fp = block?.freeParts?.find((f) => f.id === freePartId);
  if (!block || !fp) throw new Error("DUP_FREEPART_NOT_FOUND");
  if ((block.freeParts ?? []).some((f) => f.id === newId)) throw new Error("DUP_FREEPART_DUPLICATE_ID");
  const copy: FreePart = { ...fp, id: newId, box: { ...fp.box, x: fp.box.x + fp.box.w + 200 } }; // 20 mm gap
  return { ...model, blocks: model.blocks.map((b) => (b.id === blockId ? { ...b, freeParts: [...(b.freeParts ?? []), copy] } : b)) };
}

/**
 * Duplicate a whole cabinet. EVERY id inside is re-suffixed — zones, sections (recursively, plus their
 * divider/instance references), components, instances (including nested drawer interiors), lines, rows and
 * free parts. Without that the two blocks would share section/instance ids and an edit aimed at the copy
 * would land in the original (findSection / nestDrawer resolve by id across all blocks). The copy is
 * placed to the right of the rightmost block with a 30 mm gap. `uid` is caller-supplied so the engine
 * stays pure/deterministic.
 */
export function duplicateBlock(model: StructuralModel, blockId: BlockId, uid: string): StructuralModel {
  const src = model.blocks.find((b) => b.id === blockId);
  if (!src) throw new Error("DUP_BLOCK_NOT_FOUND");
  const R = (id: string): string => `${id}_c${uid}`;
  // function declarations (hoisted) so the section/instance/interior remaps can recurse into each other
  function remapSection(s: Section): Section {
    return { ...s, id: R(s.id), dividers: s.dividers.map(R), instanceIds: s.instanceIds.map(R), children: s.children.map(remapSection) };
  }
  function remapInstance(i: Instance): Instance {
    return {
      ...i,
      id: R(i.id),
      componentId: R(i.componentId),
      sectionId: R(i.sectionId),
      ...(i.interior ? { interior: remapInterior(i.interior) } : {}),
    };
  }
  function remapInterior(di: DrawerInterior): DrawerInterior {
    return { components: di.components.map((c) => ({ ...c, id: R(c.id) })), instances: di.instances.map(remapInstance) };
  }
  const rightEdge = model.blocks.reduce((mx, b) => Math.max(mx, b.box.x + b.box.w), 0);
  const copy: Block = {
    ...src,
    id: `blk_${uid}`,
    name: `${src.name} (nusxa)`,
    box: { ...src.box, x: rightEdge + 300 },
    zones: src.zones.map((z) => ({ ...z, id: R(z.id), root: remapSection(z.root) })),
    components: src.components.map((c) => ({ ...c, id: R(c.id) })),
    instances: src.instances.map(remapInstance),
    lines: src.lines.map((l) => ({ ...l, id: R(l.id) })),
    rows: src.rows.map((r) => ({ ...r, id: R(r.id), sectionIds: r.sectionIds.map(R) })),
    ...(src.freeParts ? { freeParts: src.freeParts.map((f) => ({ ...f, id: R(f.id) })) } : {}),
  };
  return { ...model, blocks: [...model.blocks, copy] };
}

// ===========================================================================
// 5 · setBandTransition / setJunction — the edit seams for #39 / #40
// ===========================================================================

/**
 * Set a component's corner band-transition (#39, E4). The #39 control writes butt / mitre / overlap
 * here; `bandCorners` reads it. No-op (same model ref) when the value is unchanged or the component
 * is unknown (the UI guards selection, so this stays silent rather than throwing).
 */
export function setBandTransition(
  model: StructuralModel,
  componentId: ComponentId,
  transition: BandTransition,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if (block.components[idx]!.bandTransition === transition) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) =>
      i === idx ? { ...c, bandTransition: transition } : c,
    );
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Set (or clear, with `null`) an instance's off-plane junction offset (#40, E5). The junction value
 * editor writes the three values here; solveLayout pushes the placement proud by the shadow-gap.
 * No-op when unchanged. Throws only if the instance is unknown (same policy as detach).
 */
export function setJunction(
  model: StructuralModel,
  instanceId: InstanceId,
  junction: Junction3D | null,
): StructuralModel {
  return mapInstance(model, instanceId, (inst) => {
    if (junction === null) {
      if (!inst.junction) return inst; // already flush → no-op
      const { junction: _drop, ...rest } = inst;
      return rest;
    }
    const j = inst.junction;
    if (
      j &&
      j.oversail_x_mm10 === junction.oversail_x_mm10 &&
      j.stepBack_y_mm10 === junction.stepBack_y_mm10 &&
      j.shadowGap_z_mm10 === junction.shadowGap_z_mm10
    ) {
      return inst; // unchanged → no-op
    }
    return { ...inst, junction };
  });
}

/**
 * setLoadBearing (L5) — declare (or clear) a component/type as load-bearing. Mirrors
 * setBandTransition: pure, returns the same reference when nothing changes so the store can no-op.
 * The declaration is honoured by `checkStability` (a declared panel over the 16mm span limit raises
 * a non-blocking ⚠ even when its role is not an internal shelf).
 */
/**
 * Set the hinge side of a door INSTANCE (not the shared component): re-point it to the left/right
 * variant of its facade component — creating that variant if absent — and drop the old component if
 * nothing else references it. Left is the default (no hingeEdge field, no "_hr" id suffix), so a
 * left door round-trips to the exact original component. No-op for a non-facade instance or when the
 * side is already set.
 */
export function setHingeEdge(
  model: StructuralModel,
  instanceId: InstanceId,
  edge: "left" | "right",
): StructuralModel {
  const wantRight = edge === "right";
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst) return block;
    const cur = block.components.find((c) => c.id === inst.componentId);
    if (!cur || cur.role !== "facade") return block; // only doors carry a hinge
    if ((cur.hingeEdge === "right") === wantRight) return block; // already that side
    changed = true;
    const targetId = wantRight ? `${cur.id}_hr` : cur.id.replace(/_hr$/, "");
    let components = block.components;
    if (!components.some((c) => c.id === targetId)) {
      const { hingeEdge: prevEdge, ...rest } = cur;
      void prevEdge;
      const variant: Component = wantRight ? { ...rest, id: targetId, hingeEdge: "right" } : { ...rest, id: targetId };
      components = [...components, variant];
    }
    const instances = block.instances.map((i) => (i.id === instanceId ? { ...i, componentId: targetId } : i));
    const stillUsed = instances.some((i) => i.componentId === cur.id);
    const cleaned = stillUsed ? components : components.filter((c) => c.id !== cur.id);
    return { ...block, components: cleaned, instances };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Give a placed instance its OWN component if it currently shares one with other instances (imos
 * treats every placed part individually). Copies the shared component to a per-instance id and
 * re-points just this instance; a component used by only one instance is already private → no-op
 * (same reference). Callers fork before a per-part material/thickness/load-bearing edit so editing
 * one shelf/door no longer changes its siblings.
 */
export function forkComponentForInstance(model: StructuralModel, instanceId: InstanceId): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst) return block;
    const shared = block.instances.filter((i) => i.componentId === inst.componentId).length > 1;
    if (!shared) return block; // already this instance's own component
    const cur = block.components.find((c) => c.id === inst.componentId);
    if (!cur) return block;
    changed = true;
    const privateId = `${cur.id}__i_${instanceId}`;
    const components = block.components.some((c) => c.id === privateId) ? block.components : [...block.components, { ...cur, id: privateId }];
    const instances = block.instances.map((i) => (i.id === instanceId ? { ...i, componentId: privateId } : i));
    return { ...block, components, instances };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * The GROUP FAMILY a component belongs to — the id it was forked from.
 *
 * Every per-part edit calls `forkComponentForInstance` first, which suffixes `__i_<instanceId>`;
 * `dissolveGroup` suffixes `__each_<k>`. So the moment a master edits one of three identical shelves,
 * that shelf silently gets its own component and the "group" stops existing as a shared id — but the
 * ORIGIN survives in the id. Stripping the suffixes recovers which instances were the same part to
 * begin with, which is the only thing «apply to all identical» can mean after the fork has happened.
 * Stripping loops because a dissolved clone can later be forked again (`…__each_0__i_inst_x`).
 */
export function componentFamily(id: ComponentId): string {
  let out = id;
  for (;;) {
    const next = out.replace(/__(?:i_.+|each_\d+)$/, "");
    if (next === out) return out;
    out = next;
  }
}

/** Family size and whether its members currently still share ONE component (i.e. nothing forked off). */
export function familyStatus(
  model: StructuralModel,
  instanceId: InstanceId,
): { size: number; united: boolean } | null {
  for (const block of model.blocks) {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst) continue;
    const fam = componentFamily(inst.componentId);
    const members = block.instances.filter((i) => componentFamily(i.componentId) === fam);
    return { size: members.length, united: new Set(members.map((i) => i.componentId)).size === 1 };
  }
  return null;
}

/**
 * «Apply to all identical» — re-point every instance in `instanceId`'s family at THIS instance's
 * component, so all of them carry its thickness/material/angle/lip/... at once. Re-pointing rather
 * than copying fields means the whole Component travels, including any property added later.
 *
 * This is the counterpart the editor was missing: `forkComponentForInstance` splits one part off on
 * every edit (so a master must re-do the same change N times), and nothing put them back together.
 * Clones left orphaned inside the family are dropped; components outside it are never touched.
 * No-op (same reference) when the family has fewer than 2 members.
 */
export function applyToFamily(model: StructuralModel, instanceId: InstanceId): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst) return block;
    const target = block.components.find((c) => c.id === inst.componentId);
    if (!target) return block;
    const fam = componentFamily(inst.componentId);
    const inFamily = (cid: ComponentId): boolean => componentFamily(cid) === fam;
    const members = block.instances.filter((i) => inFamily(i.componentId));
    if (members.length < 2) return block;
    // Already on one component with nothing overriding it → genuinely nothing to do. Returning a fresh
    // model here would push a no-op onto the undo stack, so the master's ↩ would appear to do nothing.
    if (members.every((i) => i.componentId === target.id && i.link !== "detached")) return block;
    changed = true;
    // link/partIds reset: a member carrying a detached override would otherwise keep overriding the
    // component it was just re-pointed at, and the master would see "applied" but nothing change.
    const instances = block.instances.map((i) =>
      inFamily(i.componentId) ? { ...i, componentId: target.id, link: "linked" as const, partIds: null } : i);
    const used = new Set(instances.map((i) => i.componentId));
    const components = block.components.filter((c) => used.has(c.id) || !inFamily(c.id));
    return { ...block, components, instances };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Slide a placed instance inside its own section by moving its anchor.
 *
 * A shelf's X and Z come from the section it lives in (it spans the bay), so `anchor.y` is the only
 * coordinate that is really its own — which is exactly the one a master wants to nudge when a shelf
 * sits too low. The move is clamped to the section so a shelf can never be dragged out through the
 * carcass. No-op (same model reference) when the instance is unknown or the clamp eats the whole delta.
 */
export function moveInstanceAnchor(
  model: StructuralModel,
  instanceId: InstanceId,
  axis: Axis,
  to_mm10: mm10,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst) return block;
    const section = findSectionIn(block, inst.sectionId);
    if (!section) return block;
    const s = section.box;
    const lo = axis === "x" ? s.x : axis === "y" ? s.y : s.z;
    const span = axis === "x" ? s.w : axis === "y" ? s.h : s.d;
    const next = Math.max(lo, Math.min(Math.round(to_mm10), lo + span));
    if (next === inst.anchor[axis]) return block;
    changed = true;
    const instances = block.instances.map((i) => (i.id === instanceId ? { ...i, anchor: { ...i.anchor, [axis]: next } } : i));
    return { ...block, instances };
  });
  return changed ? { ...model, blocks } : model;
}

/** Depth-first lookup of a section by id inside one block's zone trees. */
function findSectionIn(block: Block, sectionId: SectionId): Section | null {
  const walk = (sec: Section): Section | null => {
    if (sec.id === sectionId) return sec;
    for (const c of sec.children) { const hit = walk(c); if (hit) return hit; }
    return null;
  };
  for (const z of block.zones) { const hit = walk(z.root); if (hit) return hit; }
  return null;
}

/** Phase 2.2b — the parent section whose `children` include `sectionId` (null for the root / not found).
 *  Used to find where a combined door moves TO (leaf → its parent). */
export function parentSectionOf(block: Block, sectionId: SectionId): Section | null {
  const walk = (sec: Section): Section | null => {
    if (sec.children.some((c) => c.id === sectionId)) return sec;
    for (const c of sec.children) { const hit = walk(c); if (hit) return hit; }
    return null;
  };
  for (const z of block.zones) { const hit = walk(z.root); if (hit) return hit; }
  return null;
}

/**
 * Phase 2.2b — move an instance from its current section to `targetSectionId`: drop its id from the old
 * section's `instanceIds`, add it to the target's, and re-point `inst.sectionId` (+ its anchor to the new
 * box origin). ONE tree pass handles both edits even when the two sections are nested (a leaf inside its
 * parent — the combined-door case), where two sequential replaceSection calls would clobber each other. Pure;
 * no-op if the instance is missing, already there, or the target section doesn't exist.
 */
export function moveInstanceToSection(model: StructuralModel, instanceId: InstanceId, targetSectionId: SectionId): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const inst = block.instances.find((i) => i.id === instanceId);
    if (!inst || inst.sectionId === targetSectionId) return block;
    const target = findSectionIn(block, targetSectionId);
    if (!target) return block;
    changed = true;
    const oldId = inst.sectionId;
    // one pass: recurse children first, then remove from the old section + add to the new one
    const move = (sec: Section): Section => {
      const children = sec.children.map(move);
      let s = children.some((c, i) => c !== sec.children[i]) ? { ...sec, children } : sec;
      if (s.id === oldId) s = { ...s, instanceIds: s.instanceIds.filter((id) => id !== instanceId) };
      if (s.id === targetSectionId) s = { ...s, instanceIds: [...s.instanceIds, instanceId] };
      return s;
    };
    const zones = block.zones.map((z) => { const root = move(z.root); return root === z.root ? z : { ...z, root }; });
    const instances = block.instances.map((i) => (i.id === instanceId
      ? { ...i, sectionId: targetSectionId, anchor: { x: target.box.x, y: target.box.y, z: target.box.z } }
      : i));
    return { ...block, instances, zones };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * The two child sections a divider sits BETWEEN, with their extents along the divider's own axis.
 *
 * Dragging a divider is the one edit where the number that matters is not the thing being dragged but
 * the two compartments either side of it — a master sizing a bay wants "480 | 620", not the line's
 * absolute coordinate. A section lists its `dividers` in the same order as the `children` they split,
 * so divider i separates child i from child i+1.
 *
 * Returns null when the line is unknown, or when the tree does not yet have both neighbours solved.
 */
export function lineNeighbours(
  model: StructuralModel,
  lineId: LineId,
): { axis: Axis; before: Section; after: Section } | null {
  const walk = (sec: Section): { axis: Axis; before: Section; after: Section } | null => {
    const i = sec.dividers.indexOf(lineId);
    if (i !== -1) {
      const before = sec.children[i], after = sec.children[i + 1];
      if (!before || !after) return null;
      for (const block of model.blocks) {
        const line = block.lines.find((l) => l.id === lineId);
        if (line) return { axis: line.axis, before, after };
      }
      return null;
    }
    for (const child of sec.children) {
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  for (const block of model.blocks) {
    for (const zone of block.zones) {
      const hit = walk(zone.root);
      if (hit) return hit;
    }
  }
  return null;
}

/** The extent of a box along one axis — the side a divider on that axis actually changes. */
export function extentAlong(box: Box3D, axis: Axis): mm10 {
  return axis === "x" ? box.w : axis === "y" ? box.h : box.d;
}

export function setLoadBearing(
  model: StructuralModel,
  componentId: ComponentId,
  value: boolean,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.loadBearing === true) === value) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) =>
      i === idx ? { ...c, loadBearing: value } : c,
    );
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * setEdgeBands (#39 · Material→Кром.) — set (or clear with null) a component's per-edge kromka
 * override `[front, back, left, right]` band thickness (mm10). The solver applies it in place of the
 * role default. Pure; returns the same reference when unchanged so the store can no-op.
 */
export function setEdgeBands(
  model: StructuralModel,
  componentId: ComponentId,
  edges: readonly [number, number, number, number] | null,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    const cur = block.components[idx]!.edgeBands;
    const same = edges === null ? !cur : !!cur && cur.every((v, i) => v === edges[i]);
    if (same) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (edges === null) {
        const { edgeBands: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, edgeBands: [edges[0], edges[1], edges[2], edges[3]] as const };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * setComponentThickness (Phase C4) — set (or clear with null) a component's per-part board thickness
 * (mm10). The solver uses it in place of the role default (`component.thickness_mm10 ?? role`), so a
 * facade can be 18mm while the carcass stays 16mm. Pure; same reference when unchanged.
 */
export function setComponentThickness(
  model: StructuralModel,
  componentId: ComponentId,
  thickness_mm10: mm10 | null,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.thickness_mm10 ?? null) === (thickness_mm10 ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (thickness_mm10 === null) {
        const { thickness_mm10: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, thickness_mm10 };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * setComponentMaterial (Phase F2) — set (or clear with null) a component's per-part material override
 * (an opaque app decor key). The solver stamps it onto the parts (`Part.materialId`). Pure; same
 * reference when unchanged.
 */
/**
 * Set (or clear with `null`) an internal shelf's incline angle in degrees (imos AS_O_Angle · "qiya
 * polka"). Additive: `null`/`0` drops the field so the shelf is flat again. Mirrors the per-part
 * thickness/material setters — pure, no-op when unchanged, and never touches sibling components.
 */
export function setComponentAngle(
  model: StructuralModel,
  componentId: ComponentId,
  angle_deg: number | null,
): StructuralModel {
  // clamp to a sane display range; 0 (or null) means "flat" and drops the field entirely
  const next = angle_deg == null ? null : Math.max(0, Math.min(45, Math.round(angle_deg)));
  const cleared = next === null || next === 0 ? null : next;
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.angle_deg ?? null) === (cleared ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (cleared === null) {
        const { angle_deg: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, angle_deg: cleared };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Largest incline (degrees) an internal shelf can take and still stay INSIDE its bay — i.e. the
 * raised BACK edge (which lifts by `depth·sin θ`) must not rise past the shelf above it (or, for the
 * topmost, the carcass top). imos itself doesn't clamp, but our app keeps the shelf contained so it
 * never poke-throughs the carcass. Returns 45 for a non-shelf (unconstrained), 0 when there is no
 * headroom. Pure geometry: `block` + `inst` carry everything (section box, sibling shelf heights).
 */
export function shelfMaxAngleDeg(block: Block, inst: Instance): number {
  const B = 160; // 16mm board (matches solve's BOARD_MM10)
  const comp = block.components.find((c) => c.id === inst.componentId);
  if (!comp || comp.role !== "internal_shelf") return 45;
  let sb: Box3D | null = null;
  forEachSection(block, (s) => { if (s.id === inst.sectionId) sb = s.box; });
  if (!sb) return 45;
  const box: Box3D = sb;
  if (box.d <= 0) return 0;
  const isShelf = (i: Instance) =>
    block.components.find((c) => c.id === i.componentId)?.role === "internal_shelf";
  // the bay ceiling: the next shelf up in this section, else the section top (leave the top clear)
  const above = block.instances
    .filter((i) => i.sectionId === inst.sectionId && isShelf(i) && i.anchor.y > inst.anchor.y)
    .map((i) => i.anchor.y);
  const ceiling = above.length ? Math.min(...above) : box.y + box.h - B;
  const headroom = ceiling - inst.anchor.y - B; // vertical room the raised back edge may use
  if (headroom <= 0) return 0;
  // depth·sin θ ≤ headroom → θ ≤ asin(headroom/depth). floor so we never round UP past the fit.
  return Math.max(0, Math.min(45, Math.floor((Math.asin(Math.min(1, headroom / box.d)) * 180) / Math.PI)));
}

/**
 * Set (or clear with `null`/`0`) an internal shelf's front lip height in mm10 (imos display shelf ·
 * `CP_O_1_Angle_Shelf`). Turns a plain shelf into a display shelf with an upstand at the front.
 * Clamped to a sane 0..80mm; drops the field at 0. Mirrors the other per-part setters — pure, no-op
 * when unchanged, never touches sibling components.
 */
export function setComponentLip(
  model: StructuralModel,
  componentId: ComponentId,
  lip_mm10: mm10 | null,
): StructuralModel {
  const next = lip_mm10 == null ? null : Math.max(0, Math.min(800, Math.round(lip_mm10)));
  const cleared = next === null || next === 0 ? null : next;
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.lip_mm10 ?? null) === (cleared ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (cleared === null) {
        const { lip_mm10: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, lip_mm10: cleared };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Set (or clear with null) a component's handle (dastak) type. A mirror of setComponentLip: an optional
 * field on the component, DROPPED when null so a handle-less door round-trips byte-identically. No role
 * guard — a handle rides both a facade door AND a drawer front (role null, drawer:true); the UI gates
 * eligibility. The count/price (estimate) and Ø4.5 drilling (drilling) already read `comp.handle`.
 */
export function setComponentHandle(
  model: StructuralModel,
  componentId: ComponentId,
  handle: HandleType | null,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.handle ?? null) === (handle ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (handle === null) {
        const { handle: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, handle };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Set (or clear with null) a door component's lift hinge (Phase 2.1). A mirror of setComponentHandle: an
 * optional field on the component, DROPPED when null so a side-hinged door round-trips byte-identically. No
 * role guard — the UI gates it to facade doors. When set, the count/price (estimate) and drilling (side-cup
 * suppression) already read `comp.lift`. `hingeEdge` is left untouched (harmless while a lift is set).
 */
export function setComponentLift(
  model: StructuralModel,
  componentId: ComponentId,
  lift: LiftType | null,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.lift ?? null) === (lift ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (lift === null) {
        const { lift: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, lift };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

/**
 * Set (or clear with null) a drawer component's organizer (Phase 2.3). A mirror of setComponentLift, but the
 * value is an object, so the no-op check compares BY VALUE (dividers + axis). Cleared → the field is dropped
 * so a plain drawer round-trips byte-identically. No role guard — the UI gates it to drawers.
 */
export function setComponentOrganizer(
  model: StructuralModel,
  componentId: ComponentId,
  organizer: DrawerOrganizer | null,
): StructuralModel {
  const same = (a?: DrawerOrganizer | null, b?: DrawerOrganizer | null): boolean =>
    (a ?? null) === null && (b ?? null) === null
      ? true
      : !!a && !!b && a.dividers === b.dividers && (a.axis ?? "x") === (b.axis ?? "x");
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if (same(block.components[idx]!.organizer, organizer)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (organizer === null) {
        const { organizer: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, organizer };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}

export function setComponentMaterial(
  model: StructuralModel,
  componentId: ComponentId,
  material: string | null,
): StructuralModel {
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const idx = block.components.findIndex((c) => c.id === componentId);
    if (idx === -1) return block;
    if ((block.components[idx]!.material ?? null) === (material ?? null)) return block; // no-op
    changed = true;
    const components = block.components.map((c, i) => {
      if (i !== idx) return c;
      if (material === null) {
        const { material: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, material };
    });
    return { ...block, components };
  });
  return changed ? { ...model, blocks } : model;
}
