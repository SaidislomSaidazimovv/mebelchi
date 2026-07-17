// Derived identity for computed Parts (DB/27 §3, doc 06 §8).
//
// THE PROBLEM: doc 06 §8 says "once assigned, an ID never changes". But Parts are
// COMPUTED — re-decompose and a naive counter hands out different ids, which breaks
// Undo, joint rows keyed by part_id, GibLab <part id> refs and labels.
//
// THE RESOLUTION: split assignment from derivation.
//   - DESIGN nodes carry ASSIGNED ids (created once, stored, never mutated) → §8 holds.
//   - PART ids are DERIVED, pure functions of (nodeId, role, sub).
//
// Consequences that fall out for free:
//   - idempotent: decompose twice → identical ids.
//   - profile-swap safe: geometry changes, identity does not (profile is not an input).
//   - sibling-safe: ids never use array indices, so deleting shelf[0] cannot renumber
//     shelf[1] (the trap that would silently violate §8).
//   - deletion ≠ mutation: full top → 2 stretchers retires `top`'s id and mints two
//     stable `stretcher` ids. No id ever changes meaning.

import type { PartRole } from "../contracts/design.js";

/** FNV-1a 32-bit. Deterministic across runs/machines — no Math.random, no Date,
 *  no object-iteration order. Determinism is a correctness requirement here, not
 *  a nicety: a non-deterministic id would silently break Undo. */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * A Part's identity = its place in the DESIGN, not its place in an array.
 * `sub` distinguishes siblings the same node legitimately emits (left/right side,
 * stretcher 0/1) and is positional-by-meaning, not by array order.
 */
export function derivePartId(nodeId: string, role: PartRole, sub = 0): string {
  return `part_${hash32(`${nodeId}|${role}|${sub}`)}`;
}

/** Operation ids: the same law one level down, so joints survive re-decomposition. */
export function deriveOpId(partId: string, kind: string, seq: number): string {
  return `op_${hash32(`${partId}|${kind}|${seq}`)}`;
}
