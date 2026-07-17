// Variant C — line/seam dragging. Every vertical seam in the cabinet is a draggable
// line: grab a DIVIDER (an inner seam) and slide it to re-flow the compartments, or
// grab a SIDE (an outer seam) to resize the whole cabinet. This is the variant's whole
// identity — "edit by dragging the lines between things", the seam-precise counterpart
// to Variant A's grab-the-body and Variant B's type-a-number.
//
// LAW (27 / TASK): the drag never touches a panel. A divider seam mutates that
// divider node's Division (`{rule:"fixed", mm}`); a side seam mutates the cabinet's
// size. The engine re-decomposes and the app re-lays-out — moving a divider is a
// layout (visualisation) concern the app owns, so no engine change is needed to SEE
// the seam move (per CONTRACT_NOTES #1; the manufactured neighbour widths still await
// the engine). During the drag we PREVIEW (rerender without history); one snapshot is
// committed on release. Orbit is frozen while dragging.
//
// Mapping the finger to millimetres: rather than intersect a 3D plane (a camera-facing
// plane is oblique to X and inverts; a ground plane blows up at grazing angles), we
// measure the cabinet's X axis WHERE IT IS ON SCREEN — project world x=0 and x=W to
// screen, and one screen pixel is `W / (that span)` mm10. Direction and scale both
// fall out of the projection, so the seam tracks the finger correctly from any orbit.
// Assumes the single-cabinet variant scene (cabinet anchored at x=0, xOffset 0).

import * as THREE from "three";
import type { AppController } from "../../core/app.ts";
import { findCabinetOf, resize, setDivision } from "../../core/designModel.ts";
import type { DesignProject } from "@mebelchi/construction/design";

const MIN_W = 1500;    // mm10 — floor on cabinet width (matches Variant A)
const MAX_W = 30000;   // mm10 — sane ceiling so a wild drag can't explode the box
const EDGE = 300;      // mm10 — keep a dragged divider this far inside each wall
const DEADZONE = 4;    // px — no preview until the pointer has really moved

type Drag = {
  base: DesignProject;
  downX: number;       // screen X at grab
  start: number;       // mm10 at grab (divider position, or cabinet width)
  mmPerPx: number;     // signed mm10 per screen pixel along the cabinet's X axis
} & ({ mode: "divider"; nodeId: string; cabW: number } | { mode: "side"; cabId: string });

export function wireSeamC(app: AppController): () => void {
  const el = app.scene.renderer.domElement;
  const camera = app.scene.camera;
  const mm = app.scene.mmScale;
  const _v = new THREE.Vector3();

  let drag: Drag | null = null;
  let moved = false;
  let downY = 0;

  // World point → canvas-relative screen X (px). Only differences are used, so the
  // missing rect.left cancels out.
  const screenX = (wx: number, wy: number, wz: number): number => {
    _v.set(wx, wy, wz).project(camera);
    return (_v.x * 0.5 + 0.5) * el.getBoundingClientRect().width;
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    // Only vertical seams are draggable: a divider (inner) or a side (outer).
    const panel = app.scene.pick(e.clientX, e.clientY);
    if (!panel || (panel.role !== "divider" && panel.role !== "side")) return;
    const base = app.history.project;
    const cabinet = findCabinetOf(base, panel.nodeId);
    if (!cabinet) return;
    const cabW = cabinet.size?.w_mm10 ?? 6000;

    // Measure the cabinet's X axis on screen through its CENTRE (closest to the camera,
    // least foreshortened), so a pixel of drag converts to a natural number of
    // millimetres (signed — carries direction). Measuring at the back/floor corner
    // instead makes the mapping twitchy because perspective compresses it there.
    const wy = (cabinet.size?.h_mm10 ?? 7200) / 2 * mm;
    const wz = (cabinet.size?.d_mm10 ?? 5600) / 2 * mm;
    const span = screenX(cabW * mm, wy, wz) - screenX(0, wy, wz);
    if (Math.abs(span) < 1) return; // cabinet edge-on — no usable X axis this frame
    const mmPerPx = cabW / span;

    drag = panel.role === "divider"
      ? { mode: "divider", nodeId: panel.nodeId, cabW, base, downX: e.clientX, start: panel.origin[0], mmPerPx }
      : { mode: "side", cabId: cabinet.nodeId, base, downX: e.clientX, start: cabW, mmPerPx };
    app.select(panel.nodeId); // highlight the seam being edited
    moved = false;
    downY = e.clientY;
    app.scene.setControlsEnabled(false); // freeze orbit
    el.setPointerCapture(e.pointerId);
  };

  // The design edit implied by the finger at screen X `clientX` (preview mutation).
  const project = (d: Drag, clientX: number): DesignProject => {
    const value = d.start + (clientX - d.downX) * d.mmPerPx;
    if (d.mode === "divider") {
      const x = Math.round(Math.min(Math.max(value, EDGE), d.cabW - EDGE));
      return setDivision(d.base, d.nodeId, { rule: "fixed", mm: x });
    }
    const newW = Math.round(Math.min(Math.max(value, MIN_W), MAX_W));
    return resize(d.base, d.cabId, "w", newW);
  };

  const onMove = (e: PointerEvent) => {
    if (!drag || !e.isPrimary) return;
    if (!moved) {
      if (Math.hypot(e.clientX - drag.downX, e.clientY - downY) < DEADZONE) return;
      moved = true;
      app.pointerConsumed = true; // claim the pointer so tap-select skips the release
      app.scene.resetMetrics();   // fps now reflects the drag that just started
    }
    app.rerender(project(drag, e.clientX)); // PREVIEW — no history push
  };

  const finish = (e: PointerEvent) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    app.scene.setControlsEnabled(true);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!moved) return; // a tap that never moved changed nothing
    app.commit(project(d, e.clientX)); // COMMIT one snapshot for the whole drag
  };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", finish);
    el.removeEventListener("pointercancel", finish);
  };
}
