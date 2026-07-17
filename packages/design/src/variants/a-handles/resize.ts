// Variant A — direct-manipulation resize. Grab the selected cabinet and drag: the
// right edge follows your finger to change width. This is the variant's whole
// identity — "resize by grabbing the thing itself."
//
// LAW: the drag never touches a panel. It mutates the cabinet's DesignNode.size,
// asks the engine to re-decompose, and the scene re-stamps matrices. During the
// drag we PREVIEW (rerender without history); one snapshot is committed on release
// (Watcher 1.1). Orbit is frozen while dragging so the gesture resizes, not orbits.
//
// Watcher 1.2 #3: width is mapped to world +X and the "w" dimension, which is
// correct only while the cabinet is unrotated (layout puts width on +X, root is
// unrotated). When rotation or per-edge h/d resize arrives, derive the axis from
// the grabbed panel's orientation instead of assuming +X.
// Watcher 1.2 #4 (UX, founder call): grabbing anywhere on the selected cabinet
// resizes the width edge — the grabbed edge is not distinguished. Variant A is
// width-only for now; the founder judges the feel against the 3-variant compare.

import * as THREE from "three";
import type { AppController } from "../../core/app.ts";
import { findNode, resize } from "../../core/designModel.ts";
import type { DesignProject } from "@mebelchi/construction/design";

const MIN_W = 1500;   // mm10 — don't let a cabinet collapse below 150mm
const DEADZONE = 4;   // px — no preview until the pointer has actually moved

export function wireResizeA(app: AppController): () => void {
  const el = app.scene.renderer.domElement;
  const camera = app.scene.camera;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();

  let dragging: null | {
    nodeId: string;
    startW: number;      // mm10 at grab
    startX: number;      // world X (metres) at grab
    downX: number;       // screen X at grab (for the dead-zone)
    downY: number;       // screen Y at grab
    moved: boolean;      // has the pointer left the dead-zone yet?
    base: DesignProject; // the committed project the preview is derived from
  } = null;

  const toWorldOnPlane = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = el.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  };

  const onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const sel = app.selectedNodeId;
    if (!sel) return;
    // Only start a resize if the grab lands on the SELECTED cabinet.
    const panel = app.scene.pick(e.clientX, e.clientY);
    if (!panel || panel.nodeId !== sel) return;
    const node = findNode(app.history.project.nodes, sel);
    if (!node || node.kind !== "cabinet") return;

    // A drag plane facing the camera, through the grab point, so the world delta
    // reads directly off the pointer. Normal = camera forward. panel.origin is mm;
    // ×mmScale puts the plane in the scene's metre space.
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    const through = new THREE.Vector3(panel.origin[0], panel.origin[1], panel.origin[2])
      .multiplyScalar(app.scene.mmScale);
    plane.setFromNormalAndCoplanarPoint(normal, through);
    const world = toWorldOnPlane(e.clientX, e.clientY);
    if (!world) return;

    dragging = {
      nodeId: sel,
      startW: node.size?.w_mm10 ?? 6000,
      startX: world.x,
      downX: e.clientX,
      downY: e.clientY,
      moved: false,
      base: app.history.project,
    };
    app.scene.setControlsEnabled(false); // freeze orbit
    el.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent) => {
    if (!dragging || !e.isPrimary) return;
    // Dead-zone: a tap or a jittery press does no work until the pointer really
    // moves, so a zero-move tap never runs a redundant decompose (Watcher 1.2 #2).
    if (!dragging.moved) {
      if (Math.hypot(e.clientX - dragging.downX, e.clientY - dragging.downY) < DEADZONE) return;
      dragging.moved = true;
      app.pointerConsumed = true; // claim the pointer so tap-select skips this release
      app.scene.resetMetrics(); // fps now reflects the drag that just started
    }
    const world = toWorldOnPlane(e.clientX, e.clientY);
    if (!world) return;
    // world delta (metres) → mm10: ÷ mmScale gives mm, ×10 gives mm10.
    const deltaMm10 = ((world.x - dragging.startX) / app.scene.mmScale) * 10;
    const newW = Math.max(MIN_W, Math.round(dragging.startW + deltaMm10));
    // PREVIEW: rerender the resized project WITHOUT recording history.
    app.rerender(resize(dragging.base, dragging.nodeId, "w", newW));
  };

  const finish = (e: PointerEvent) => {
    if (!dragging) return;
    const d = dragging;
    dragging = null;
    app.scene.setControlsEnabled(true);
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    // A press that never left the dead-zone changed nothing — no commit, no
    // rerender. tap-to-select handles a real tap on its own.
    if (!d.moved) return;
    const world = toWorldOnPlane(e.clientX, e.clientY);
    if (!world) { app.rerender(); return; } // lost the plane — snap back to committed
    const deltaMm10 = ((world.x - d.startX) / app.scene.mmScale) * 10;
    const newW = Math.max(MIN_W, Math.round(d.startW + deltaMm10));
    // COMMIT one snapshot for the whole drag.
    if (newW !== d.startW) app.commit(resize(d.base, d.nodeId, "w", newW));
    else app.rerender();
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
