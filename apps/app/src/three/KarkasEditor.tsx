// three/KarkasEditor.tsx — the store-backed StructuralModel editor (Phase 3). Reads the model /
// scene / selection from karkasStore and renders it in plain three.js (structureRenderer). Rebuilds
// the 3D group when the model changes and re-tints on selection change; taps write back to the
// store. Opened as a focused overlay from the Biblioteka (Phase 3.3) or the /#karkas dev route —
// entirely parallel to the kitchen constructor, which it never touches.
import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useKarkas } from "./karkasStore";
import { buildDemoModel, buildLCornerModel } from "../../../../engine/structure/demoModel.js";
import { buildStructureGroup, highlightBoard, disposeStructureGroup } from "./structureRenderer";
import { sceneDimsMm } from "./structureScene";

interface RT {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group | null;
  raf: number;
}

export function KarkasEditor({ onClose }: { onClose?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rt = useRef<RT | null>(null);
  const scene = useKarkas((s) => s.scene);
  const selectedId = useKarkas((s) => s.selectedId);
  const tapPart = useKarkas((s) => s.tapPart);
  const setModel = useKarkas((s) => s.setModel);
  const add = useKarkas((s) => s.add);
  const divide = useKarkas((s) => s.divide);
  const undo = useKarkas((s) => s.undo);
  const canUndo = useKarkas((s) => s.past.length > 0);

  // ── mount the three.js canvas once ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 480);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, (mount.clientWidth || 320) / (mount.clientHeight || 480), 0.02, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 0.4; controls.maxDistance = 12;
    scene3.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2, 4, 3); scene3.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25); fill.position.set(-3, 2, -2); scene3.add(fill);
    rt.current = { renderer, scene: scene3, camera, controls, group: null, raf: 0 };

    const raycaster = new THREE.Raycaster();
    const down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const g = rt.current?.group;
      if (!g) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      const hit = raycaster.intersectObjects(g.children, false)[0]; // faces only (not edge lines)
      tapPart((hit?.object.userData.partId as string) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const loop = () => { controls.update(); renderer.render(scene3, camera); if (rt.current) rt.current.raf = requestAnimationFrame(loop); };
    rt.current.raf = requestAnimationFrame(loop);
    const onResize = () => { const w = mount.clientWidth || 320, h = mount.clientHeight || 480; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rt.current?.raf ?? 0);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      if (rt.current?.group) disposeStructureGroup(rt.current.group);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rt.current = null;
    };
  }, [tapPart]);

  // ── rebuild the group + reframe when the model (scene) changes ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    if (r.group) { r.scene.remove(r.group); disposeStructureGroup(r.group); }
    const group = buildStructureGroup(scene);
    r.scene.add(group);
    r.group = group;
    highlightBoard(group, selectedId);
    const ctr = new THREE.Vector3(scene.center[0], scene.center[1], scene.center[2]);
    const dist = (Math.max(scene.radius, 0.3) / (2 * Math.tan((r.camera.fov * Math.PI) / 360))) * 2.2;
    r.controls.target.copy(ctr);
    r.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.4, ctr.z + dist * 0.95);
    r.camera.lookAt(ctr);
    r.controls.update();
    // selectedId intentionally omitted — the next effect owns highlight changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // ── re-tint on selection change (no rebuild) ──
  useEffect(() => {
    if (rt.current?.group) highlightBoard(rt.current.group, selectedId);
  }, [selectedId]);

  const dims = sceneDimsMm(scene);
  return (
    <div style={overlay}>
      <div style={bar}>
        <b style={{ fontSize: 15 }}>Karkas blok</b>
        <span style={mono}>{dims.w}×{dims.h}×{dims.d} mm</span>
        <button onClick={() => setModel(buildDemoModel())} style={pill} type="button">Тумба</button>
        <button onClick={() => setModel(buildLCornerModel())} style={pill} type="button">L-угол</button>
        <span style={{ ...mono, color: "#006b3f" }}>{selectedId ? `▸ ${selectedId}` : "panelni bosing"}</span>
        {onClose && <button onClick={onClose} style={{ ...pill, marginLeft: "auto" }} type="button">✕ Yopish</button>}
      </div>
      {/* Phase 4 — edit toolbar: engine operations on the target section (selected panel's, else first leaf) */}
      <div style={editbar}>
        <button style={act} onClick={() => add("shelf")} type="button">＋ Polka</button>
        <button style={act} onClick={() => add("door")} type="button">＋ Eshik</button>
        <button style={act} onClick={() => add("divider")} type="button">＋ Razdelitel</button>
        <button style={act} onClick={() => divide()} type="button">⊟ Bo'lish</button>
        <button style={{ ...act, opacity: canUndo ? 1 : 0.4 }} onClick={() => undo()} disabled={!canUndo} type="button">↺ Ortga</button>
      </div>
      <div ref={mountRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

/** Renders the editor as a focused overlay when the store is open — mount once in the constructor. */
export function KarkasOverlay() {
  const open = useKarkas((s) => s.open);
  const close = useKarkas((s) => s.close);
  if (!open) return null;
  return <KarkasEditor onClose={close} />;
}

const overlay: CSSProperties = { position: "fixed", inset: 0, background: "#f0efe9", display: "flex", flexDirection: "column", zIndex: 50 };
const bar: CSSProperties = { padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontFamily: "system-ui", flexWrap: "wrap" };
const mono: CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#5c6a61" };
const pill: CSSProperties = { padding: "6px 12px", borderRadius: 999, border: "1px solid #d8d2c4", background: "none", color: "#18241d", font: "600 13px system-ui", cursor: "pointer" };
const editbar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, flexWrap: "wrap" };
const act: CSSProperties = { padding: "8px 13px", borderRadius: 10, border: "1px solid #00a961", background: "#e3f3ea", color: "#006b3f", font: "650 13px system-ui", cursor: "pointer" };
