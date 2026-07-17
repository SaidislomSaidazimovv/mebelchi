// Phase 0.6 — undo / redo. THE LAW (27 / TASK): undo restores a DESIGN snapshot,
// never a Part snapshot. Parts re-derive from the design via panelDecomposition, so
// geometry AND identity come back for free — we only ever keep design trees here.
//
// This works because the design model (0.2) is immutable: every edit is a new
// DesignProject object that shares no mutable state with the previous one. So a
// snapshot is just the object reference — no cloning needed to freeze history.

import type { DesignProject } from "@mebelchi/construction/design";

export class History {
  private past: DesignProject[] = [];
  private future: DesignProject[] = [];

  /** Cap the undo depth so a long session can't grow history without bound.
   *  Each snapshot is a small design tree (no Parts), so this is generous. */
  private readonly maxDepth = 200;

  constructor(private current: DesignProject) {}

  /** The project the app is showing right now. */
  get project(): DesignProject {
    return this.current;
  }

  /**
   * Record a NEW state (the result of an edit). Pushes the old state onto the
   * undo stack and clears redo — a fresh edit invalidates the forward branch.
   * A no-op edit (same object) is ignored so it doesn't pollute history.
   */
  push(next: DesignProject): void {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.maxDepth) this.past.shift(); // drop the oldest
    this.current = next;
    this.future.length = 0;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }
  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Step back to the previous design snapshot. Returns the restored project, or
   *  null if there is nothing to undo. */
  undo(): DesignProject | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return this.current;
  }

  /** Step forward again after an undo. Null if the forward branch is empty. */
  redo(): DesignProject | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}
