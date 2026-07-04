// three/cellToKarkas.ts — convert a kitchen "Cell" Cabinet → a karkas "StructuralModel" (Phase W1),
// so an EXISTING kitchen module opens editable in the imos-like karkas editor instead of a blank box.
// Pure: composes the engine's immutable ops. Read the Cell interior through `cabinetLayout(cab)` so
// legacy fill/count/dividers arrive as one cell tree. Only the exact/simple cases are built here;
// combined-doors / corner fidelity is handled (with warnings) in later steps.

import { cabinetLayout, cellSizes, isLeaf, shelfPositions, type Cabinet, type Cell } from "../model/cabinet";
import type { StructuralModel, Section } from "../../../../engine/contracts/structure.js";
import { leafSections } from "../../../../engine/contracts/structure.js";
import { buildCarcassModel } from "../../../../engine/structure/demoModel.js";
import { divideSection, addInstance } from "../../../../engine/structure/operations.js";
import { BOARDS, DEFAULT_PLAN, hexToInt, type MaterialPlan } from "./materials";

/** A module's depth (mm): explicit override, else the per-kind default (upper 350, base/tall 560). */
export const cabDepthMm = (cab: Pick<Cabinet, "depth" | "kind">): number =>
  cab.depth ?? (cab.kind === "upper" ? 350 : 560);

/** Find a section by id anywhere in the model's zone trees. */
function findSection(model: StructuralModel, id: string): Section | null {
  const walk = (s: Section): Section | null => {
    if (s.id === id) return s;
    for (const c of s.children) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  };
  for (const b of model.blocks) for (const z of b.zones) {
    const r = walk(z.root);
    if (r) return r;
  }
  return null;
}

/** The direct child section ids of `parentId`, in order (post-divide). */
function childIds(model: StructuralModel, parentId: string): string[] {
  return findSection(model, parentId)?.children.map((c) => c.id) ?? [];
}

/**
 * C.3 — place the internal shelves of `secId` at exact height fractions (0..1 from the section
 * bottom). addInstance re-evens shelves every call, so custom `shelfYs` are written onto the shelf
 * instances' anchors as a post-pass (even fractions round-trip to the same positions, so this is safe
 * to apply unconditionally). mm10 rounded to keep the integer contract.
 */
function applyShelfYs(model: StructuralModel, secId: string, fractions: number[]): StructuralModel {
  const sec = findSection(model, secId);
  if (!sec) return model;
  const { y, h } = sec.box;
  return {
    ...model,
    blocks: model.blocks.map((b) => {
      const shelfIds = b.instances
        .filter((i) => i.sectionId === secId && b.components.find((c) => c.id === i.componentId)?.role === "internal_shelf")
        .map((i) => i.id);
      if (!shelfIds.length) return b;
      const order = new Map(shelfIds.map((id, k) => [id, k]));
      return {
        ...b,
        instances: b.instances.map((i) => {
          const k = order.get(i.id);
          if (k === undefined) return i;
          return { ...i, anchor: { ...i.anchor, y: Math.round(y + (fractions[k] ?? 0.5) * h) } };
        }),
      };
    }),
  };
}

/**
 * Recursively map one Cell node onto section `secId`:
 *   • split node → divideSection by the child fractions (cols → x, rows → y), then recurse
 *   • leaf "drawer" → a drawer box
 *   • leaf "door"   → a facade (glazed if the cabinet's door type is Стекло) + the cabinet's shelves
 *   • leaf open (no front) → left empty
 * Shelves come from shelfPositions(count, shelfYs); custom heights are applied in C.3.
 */
function convertNode(model: StructuralModel, secId: string, cell: Cell, cab: Cabinet): StructuralModel {
  if (!isLeaf(cell)) {
    const axis = cell.split === "cols" ? "x" : "y";
    let next = divideSection(model, secId, { kind: "ratio", axis, ratio: cellSizes(cell) });
    const kids = childIds(next, secId);
    (cell.children ?? []).forEach((child, i) => {
      if (kids[i]) next = convertNode(next, kids[i]!, child, cab);
    });
    return next;
  }
  if (cell.front === "drawer") return addInstance(model, secId, "drawer");
  if (cell.front === "door") {
    // hinge side: per-cell opening wins, else the cabinet default. "right" → right-hung; left/top/
    // bottom/undefined stay left (top/bottom are hydraulic lift, not a side hinge — default left).
    const hingeEdge = (cell.opening ?? cab.opening) === "right" ? "right" : "left";
    let next = addInstance(model, secId, "door", { glazed: cab.door === 2, hingeEdge });
    const fractions = shelfPositions(cab.count, cab.shelfYs);
    for (let i = 0; i < fractions.length; i += 1) next = addInstance(next, secId, "shelf");
    return applyShelfYs(next, secId, fractions); // C.3 — exact heights (custom or even)
  }
  return model; // open compartment
}

/**
 * Convert a Cell Cabinet to a karkas StructuralModel: a sized carcass (C.1) whose interior is the
 * cabinet's cell tree (cabinetLayout) recursively mapped to sections + shelves/drawers/doors.
 */
export function cellToStructural(cab: Cabinet): StructuralModel {
  const model = buildCarcassModel(cab.w, cab.h, cabDepthMm(cab));
  const rootId = leafSections(model.blocks[0]!.zones[0]!.root)[0]!.id;
  // Reads the interior via cabinetLayout, which does NOT include `combinedDoors` (C.7): a door
  // spanning cells across rows AND columns can't be one facade in the section model, so combined
  // doors are dropped — the interior dividers survive and the usta re-adds the spanning door. A
  // `corner` cabinet (C.9a) converts to its bounding box here (the diagonal body/door isn't
  // representable); both cases still yield a valid, editable model.
  return convertNode(model, rootId, cabinetLayout(cab), cab);
}

const rgb = (n: number): [number, number, number] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

/** The karkas board decor whose colour is nearest the given finish int (or `fallback` if absent). */
function nearestBoardId(colorInt: number | undefined, fallback: string): string {
  if (colorInt == null) return fallback;
  const [r, g, b] = rgb(colorInt);
  let best = fallback;
  let bestD = Infinity;
  for (const board of BOARDS) {
    const [br, bg, bb] = rgb(hexToInt(board.hex));
    const d = (r - br) ** 2 + (g - bg) ** 2 + (b - bb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = board.id;
    }
  }
  return best;
}

/**
 * C.8 — the material plan from a Cabinet's finish colours: facade & carcass finishes map to the
 * nearest board decor (by colour); shelf follows carcass; back + edge keep the defaults. The colour
 * is nearest-of-catalog (the karkas decor's own hex + thickness drive the render/price); the usta can
 * re-pick from a real catalog. worktop / handle finishes have no karkas board and are dropped.
 */
export function cellPlan(cab: Cabinet): MaterialPlan {
  const f = cab.finish ?? {};
  const carcass = nearestBoardId(f.carcass, DEFAULT_PLAN.carcass);
  return { ...DEFAULT_PLAN, facade: nearestBoardId(f.facade, DEFAULT_PLAN.facade), carcass, shelf: carcass };
}

/** The full converted block — model (structure) + material plan — for loading into the karkas editor. */
export function cellToKarkasBlock(cab: Cabinet): { model: StructuralModel; plan: MaterialPlan } {
  return { model: cellToStructural(cab), plan: cellPlan(cab) };
}
