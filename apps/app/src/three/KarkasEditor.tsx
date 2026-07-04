// three/KarkasEditor.tsx — the store-backed StructuralModel editor (Phase 3). Reads the model /
// scene / selection from karkasStore and renders it in plain three.js (structureRenderer). Rebuilds
// the 3D group when the model changes and re-tints on selection change; taps write back to the
// store. Opened as a focused overlay from the Biblioteka (Phase 3.3) or the /#karkas dev route —
// entirely parallel to the kitchen constructor, which it never touches.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useKarkas } from "./karkasStore";
import { buildDemoModel, buildLCornerModel } from "../../../../engine/structure/demoModel.js";
import { exportModelToSWJ008 } from "../../../../engine/cnc.js";
import { buildStructureGroup, highlightBoard, disposeStructureGroup } from "./structureRenderer";
import { sceneDimsMm } from "./structureScene";
import { estimate } from "./estimate";
import { BOARDS, EDGES, boardForRole, type MaterialPlan } from "./materials";

/** All PanelRole values the solver stamps → the decor names SWJ008 should carry, from the plan. */
function materialMap(plan: MaterialPlan): Record<string, string> {
  const roles = ["carcass_side", "carcass_top", "carcass_bottom", "carcass_back", "internal_shelf", "facade"];
  return Object.fromEntries(roles.map((r) => [r, boardForRole(plan, r)?.name ?? ""]));
}

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
  const model = useKarkas((s) => s.model);
  const plan = useKarkas((s) => s.plan);
  const warnings = useKarkas((s) => s.warnings);
  const selComp = useKarkas((s) => s.selectedComponent());
  const toggleLoadBearing = useKarkas((s) => s.toggleLoadBearing);
  const [showSpec, setShowSpec] = useState(false);

  // Emit byte-exact SWJ008 for the current model and hand it to the browser as a download. The
  // material map carries the chosen decors into the cut file. exportModelToSWJ008 runs the safety
  // gate and throws if the model can't be manufactured.
  const exportCnc = () => {
    try {
      const text = exportModelToSWJ008(model, {}, materialMap(plan));
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "karkas-swj008.txt";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("SWJ008 eksport xatosi: " + (err instanceof Error ? err.message : String(err)));
    }
  };

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
        <button style={adv} onClick={() => add("shelf", { doubled: true })} type="button">＋ Polka 32мм</button>
        <button style={act} onClick={() => add("door")} type="button">＋ Eshik</button>
        <button style={adv} onClick={() => add("door", { glazedGrid: { lights: 3 } })} type="button">＋ Витрина</button>
        <button style={act} onClick={() => add("divider")} type="button">＋ Razdelitel</button>
        <button style={act} onClick={() => divide()} type="button">⊟ Bo'lish</button>
        <button style={{ ...act, opacity: canUndo ? 1 : 0.4 }} onClick={() => undo()} disabled={!canUndo} type="button">↺ Ortga</button>
        <button style={{ ...act, marginLeft: "auto", borderColor: "#c9a24b", background: "#f7efd8", color: "#8a6d1f" }} onClick={() => setShowSpec((v) => !v)} type="button">📋 Spetsifikatsiya</button>
        <button style={{ ...act, borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a" }} onClick={exportCnc} type="button">⬇ CNC · SWJ008</button>
      </div>
      {/* Phase 6 — selected-component actions: doubling / glazing status + load-bearing declaration */}
      {selComp && (
        <div style={selBar}>
          <span style={mono}>{selComp.name}</span>
          {selComp.doubled && <span style={badge}>32мм</span>}
          {(selComp.glazed || selComp.glazedGrid) && <span style={badge}>Витрина{selComp.glazedGrid ? ` ×${selComp.glazedGrid.lights}` : ""}</span>}
          {selComp.loadBearing && <span style={{ ...badge, background: "#e7d6f5", color: "#5b2a86" }}>⚖ Yuk</span>}
          <button style={{ ...act, marginLeft: "auto", ...(selComp.loadBearing ? { borderColor: "#8a52c9", background: "#efe3fa", color: "#5b2a86" } : {}) }} onClick={toggleLoadBearing} type="button">
            ⚖ {selComp.loadBearing ? "Yuk ✓" : "Yuk-ko'taruvchi"}
          </button>
        </div>
      )}
      {/* Phase 6 — non-blocking engineering warnings (stability / motion / hinge) */}
      {warnings.length > 0 && (
        <div style={warnBar}>
          <b style={{ flex: "0 0 auto" }}>⚠ {warnings.length}</b>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{warnings[0]}</span>
          {warnings.length > 1 && <span style={{ ...mono, flex: "0 0 auto" }}>+{warnings.length - 1}</span>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
        {showSpec && <SpecPanel onClose={() => setShowSpec(false)} />}
      </div>
    </div>
  );
}

/** Board-decor <select> for one plan slot, with a colour swatch of the current pick. */
function MatSelect({ label, slot }: { label: string; slot: keyof Omit<MaterialPlan, "edge"> }) {
  const value = useKarkas((s) => s.plan[slot]);
  const setPlanMaterial = useKarkas((s) => s.setPlanMaterial);
  const hex = BOARDS.find((b) => b.id === value)?.hex ?? "#ccc";
  return (
    <label style={matRow}>
      <span style={{ ...mono, width: 62 }}>{label}</span>
      <span style={{ ...swatch, background: hex }} />
      <select style={matSel} value={value} onChange={(ev) => setPlanMaterial(slot, ev.target.value)}>
        {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.pricePerM2}₽/м²</option>)}
      </select>
    </label>
  );
}

/** Right-hand «Спецификация» drawer — material picker + cut list + material-plan price totals. */
function SpecPanel({ onClose }: { onClose: () => void }) {
  const parts = useKarkas((s) => s.parts);
  const plan = useKarkas((s) => s.plan);
  const setPlanMaterial = useKarkas((s) => s.setPlanMaterial);
  const e = estimate(parts, plan);
  return (
    <div style={specPanel}>
      <div style={specHead}>
        <b style={{ fontSize: 15 }}>Спецификация</b>
        <button onClick={onClose} style={{ ...pill, marginLeft: "auto" }} type="button">✕</button>
      </div>

      {/* material picker — role → decor */}
      <div style={picker}>
        <MatSelect label="Корпус" slot="carcass" />
        <MatSelect label="Фасад" slot="facade" />
        <MatSelect label="Полки" slot="shelf" />
        <MatSelect label="Задняя" slot="back" />
        <label style={matRow}>
          <span style={{ ...mono, width: 62 }}>Кромка</span>
          <span style={{ ...swatch, background: "#8a6d1f" }} />
          <select style={matSel} value={plan.edge} onChange={(ev) => setPlanMaterial("edge", ev.target.value)}>
            {EDGES.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.pricePerM}₽/м</option>)}
          </select>
        </label>
      </div>

      <div style={specTotals}>
        <div style={cell}><span style={mono}>Detallar</span><b>{e.count}</b></div>
        <div style={cell}><span style={mono}>List</span><b>{e.areaM2.toFixed(2)} m²</b></div>
        <div style={cell}><span style={mono}>Kromka</span><b>{e.edgeM.toFixed(2)} m</b></div>
        <div style={cell}><span style={mono}>Narx</span><b>{e.priceRub.toLocaleString("ru-RU")} ₽</b></div>
      </div>
      <div style={{ ...mono, padding: "2px 14px 8px" }}>
        {e.byMaterial.map((g) => `${g.name}: ${g.count} · ${g.priceRub.toLocaleString("ru-RU")}₽`).join("     ")}
      </div>
      <div style={specList}>
        {e.parts.map((p) => (
          <div key={p.id} style={specRow}>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}<span style={{ ...mono, color: "#9a8a5f", marginLeft: 6 }}>{p.materialName}</span></span>
            <span style={mono}>{p.w_mm}×{p.l_mm}×{p.t_mm}</span>
            <span style={{ ...mono, color: "#8a6d1f", letterSpacing: 1 }} title="banded edges (1·2·3·4)">{p.bands.map((b) => (b ? "▪" : "·")).join("")}</span>
          </div>
        ))}
      </div>
      <div style={{ ...mono, padding: "8px 14px", fontSize: 11, borderTop: "1px solid #e6e1d4" }}>Narx tarifi katalogdan (materials.ts) — real feed keyin ulanadi</div>
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
const adv: CSSProperties = { padding: "8px 13px", borderRadius: 10, border: "1px solid #8a52c9", background: "#efe3fa", color: "#5b2a86", font: "650 13px system-ui", cursor: "pointer" };
const selBar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const badge: CSSProperties = { padding: "3px 8px", borderRadius: 999, background: "#e3f3ea", color: "#006b3f", font: "600 11px system-ui" };
const warnBar: CSSProperties = { margin: "0 14px 10px", padding: "8px 12px", borderRadius: 8, background: "#fdf3e0", border: "1px solid #f0d9a8", color: "#8a5a1f", display: "flex", gap: 10, alignItems: "center", font: "13px system-ui", minWidth: 0 };
const specPanel: CSSProperties = { position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 92vw)", background: "#fbfaf6", borderLeft: "1px solid #e0dccf", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 5 };
const specHead: CSSProperties = { padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e6e1d4", fontFamily: "system-ui" };
const specTotals: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e6e1d4", padding: 1, margin: "10px 14px 6px", borderRadius: 8, overflow: "hidden" };
const cell: CSSProperties = { background: "#fff", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2, fontFamily: "system-ui", fontSize: 15 };
const specList: CSSProperties = { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 14px" };
const specRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0ece1", fontFamily: "system-ui", fontSize: 13 };
const picker: CSSProperties = { padding: "10px 14px 2px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid #eee7d8" };
const matRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const swatch: CSSProperties = { width: 16, height: 16, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", flex: "0 0 auto" };
const matSel: CSSProperties = { flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 7, border: "1px solid #d8d2c4", background: "#fff", font: "13px system-ui", cursor: "pointer" };
