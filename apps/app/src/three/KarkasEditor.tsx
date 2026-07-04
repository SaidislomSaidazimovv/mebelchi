// three/KarkasEditor.tsx — the store-backed StructuralModel editor (Phase 3). Reads the model /
// scene / selection from karkasStore and renders it in plain three.js (structureRenderer). Rebuilds
// the 3D group when the model changes and re-tints on selection change; taps write back to the
// store. Opened as a focused overlay from the Biblioteka (Phase 3.3) or the /#karkas dev route —
// entirely parallel to the kitchen constructor, which it never touches.
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useKarkas } from "./karkasStore";
import { useStore } from "../store";
import { buildDemoModel, buildLCornerModel } from "../../../../engine/structure/demoModel.js";
import { exportModelToSWJ008 } from "../../../../engine/cnc.js";
import { buildStructureGroup, highlightBoard, recolorBoards, disposeStructureGroup } from "./structureRenderer";
import { sceneDimsMm } from "./structureScene";
import { estimate, hardwareEstimate } from "./estimate";
import { BOARDS, EDGES, boardForRole, partColor, type MaterialPlan } from "./materials";

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
  labels: { w: HTMLDivElement; h: HTMLDivElement; d: HTMLDivElement } | null; // C5 dimension overlays
  aabb: THREE.Box3 | null;
}

export function KarkasEditor({ onClose }: { onClose?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rt = useRef<RT | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const parts = useKarkas((s) => s.parts);
  const warnings = useKarkas((s) => s.warnings);
  // F1 — part id → decor colour (int). Recomputed when parts or the material plan change.
  const colorFn = useMemo(() => {
    const m = new Map(parts.map((p) => [p.id, partColor(plan, p.role, p.materialId)]));
    return (id: string) => m.get(id);
  }, [parts, plan]);
  const colorRef = useRef(colorFn);
  colorRef.current = colorFn;
  const selComp = useKarkas((s) => s.selectedComponent());
  const toggleLoadBearing = useKarkas((s) => s.toggleLoadBearing);
  const setThickness = useKarkas((s) => s.setThickness);
  const setMaterial = useKarkas((s) => s.setMaterial);
  const exportProject = useKarkas((s) => s.exportProject);
  const importProject = useKarkas((s) => s.importProject);
  const resize = useKarkas((s) => s.resize);
  const divideBy = useKarkas((s) => s.divideBy);
  const addShelves = useKarkas((s) => s.addShelves);
  const [showDivide, setShowDivide] = useState(false);
  const [divAxis, setDivAxis] = useState<"x" | "y">("y");
  const [divN, setDivN] = useState("3");
  const [shelfN, setShelfN] = useState("2");
  const saveKarkasToLibrary = useStore((s) => s.saveKarkasToLibrary);
  const addProjectBlock = useStore((s) => s.addProjectBlock);
  const updateProjectBlock = useStore((s) => s.updateProjectBlock);
  const editingBlockId = useKarkas((s) => s.editingBlockId);
  const [showSpec, setShowSpec] = useState(false);
  const [showTree, setShowTree] = useState(false);

  // Save the current from-scratch block into «Mening bloklarim» so the usta can reuse it (Phase K).
  const saveToBiblioteka = () => {
    const name = window.prompt("Blok nomi (Bibliotekaga):", "Yangi blok");
    if (name == null) return;
    saveKarkasToLibrary(name, exportProject());
    window.alert(`«${name.trim() || "Karkas blok"}» Bibliotekaga qo'shildi ✓`);
  };

  // Phase D1/E — place the current block INTO the project. If it was re-opened FROM a placed block
  // (editingBlockId), UPDATE that block in place instead of adding a duplicate (Phase E bug fix).
  const addToProject = () => {
    if (editingBlockId) {
      updateProjectBlock(editingBlockId, exportProject());
      window.alert("Loyihada yangilandi ✓");
    } else {
      const d = sceneDimsMm(scene);
      addProjectBlock(`Blok ${d.w}×${d.h}`, exportProject());
      window.alert("Loyihaga qo'shildi ✓");
    }
  };

  // Emit byte-exact SWJ008 for the current model and hand it to the browser as a download. The
  // material map carries the chosen decors into the cut file. exportModelToSWJ008 runs the safety
  // gate and throws if the model can't be manufactured.
  const exportCnc = () => {
    try {
      const text = exportModelToSWJ008(model, {}, materialMap(plan), Object.fromEntries(BOARDS.map((b) => [b.id, b.name])));
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

  // Save the whole project (model + material plan) as a .json download.
  const saveProject = () => {
    const url = URL.createObjectURL(new Blob([exportProject()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "karkas-project.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  // Load a project from a picked .json file (resets the model + plan + history).
  const onFileChange = (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importProject(String(reader.result));
      } catch (err) {
        alert("Loyihani yuklashda xato: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
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
    // C5 — three HTML dimension labels overlaid on the canvas (width / height / depth)
    const mkLabel = (): HTMLDivElement => {
      const d = document.createElement("div");
      Object.assign(d.style, {
        position: "absolute", transform: "translate(-50%, -50%)", padding: "1px 6px", borderRadius: "6px",
        background: "rgba(24,36,29,0.82)", color: "#fff", font: "600 11px ui-monospace, monospace",
        pointerEvents: "none", whiteSpace: "nowrap", zIndex: "4",
      } as CSSStyleDeclaration);
      mount.appendChild(d);
      return d;
    };
    const labels = { w: mkLabel(), h: mkLabel(), d: mkLabel() };
    rt.current = { renderer, scene: scene3, camera, controls, group: null, raf: 0, labels, aabb: null };

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

    const tmp = new THREE.Vector3();
    const positionLabels = () => {
      const r = rt.current;
      if (!r?.labels || !r.aabb || r.aabb.isEmpty()) return;
      const { min, max } = r.aabb;
      const w = renderer.domElement.clientWidth || 1;
      const h = renderer.domElement.clientHeight || 1;
      const place = (el: HTMLDivElement, x: number, y: number, z: number) => {
        tmp.set(x, y, z).project(camera);
        el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`;
        el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
        el.style.display = tmp.z < 1 ? "block" : "none";
      };
      place(r.labels.w, (min.x + max.x) / 2, min.y, max.z); // width — bottom front edge
      place(r.labels.h, max.x, (min.y + max.y) / 2, max.z); // height — right front edge
      place(r.labels.d, max.x, min.y, (min.z + max.z) / 2); // depth — bottom right edge
    };
    const loop = () => { controls.update(); renderer.render(scene3, camera); positionLabels(); if (rt.current) rt.current.raf = requestAnimationFrame(loop); };
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
      labels.w.remove(); labels.h.remove(); labels.d.remove();
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
    const group = buildStructureGroup(scene, colorRef.current);
    r.scene.add(group);
    r.group = group;
    highlightBoard(group, selectedId);
    // C5 — refresh the dimension overlay: bounding box + W/H/D text (mm)
    r.aabb = new THREE.Box3().setFromObject(group);
    if (r.labels) {
      const d = sceneDimsMm(scene);
      r.labels.w.textContent = `${d.w}`;
      r.labels.h.textContent = `${d.h}`;
      r.labels.d.textContent = `${d.d}`;
    }
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

  // ── F1: re-colour boards when the material plan changes (no geometry rebuild) ──
  useEffect(() => {
    if (rt.current?.group) {
      recolorBoards(rt.current.group, colorFn);
      highlightBoard(rt.current.group, selectedId); // recolor clears nothing but re-assert selection
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFn]);

  const dims = sceneDimsMm(scene);
  return (
    <div style={overlay}>
      <div style={bar}>
        <b style={{ fontSize: 15 }}>Karkas blok</b>
        {/* C2 — live W×H×D: type the client's dimensions; the block reflows (content scales) */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <DimField label="Ш" value={dims.w} onCommit={(mm) => resize("w", mm)} />
          <DimField label="В" value={dims.h} onCommit={(mm) => resize("h", mm)} />
          <DimField label="Г" value={dims.d} onCommit={(mm) => resize("d", mm)} />
          <span style={{ ...mono, fontSize: 10 }}>mm</span>
        </div>
        <button onClick={() => setModel(buildDemoModel())} style={pill} type="button">Тумба</button>
        <button onClick={() => setModel(buildLCornerModel())} style={pill} type="button">L-угол</button>
        <span style={{ ...mono, color: "#006b3f" }}>{selectedId ? `▸ ${selectedId}` : "panelni bosing"}</span>
        <button onClick={addToProject} style={{ ...pill, marginLeft: "auto", borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a", fontWeight: 700 }} type="button">{editingBlockId ? "💾 Loyihada yangilash" : "＋ Loyihaga"}</button>
        <button onClick={saveToBiblioteka} style={{ ...pill, borderColor: "#00a961", color: "#006b3f", fontWeight: 700 }} type="button">📚 Bibliotekaga</button>
        <button onClick={saveProject} style={pill} type="button">💾 Saqlash</button>
        <button onClick={() => fileRef.current?.click()} style={pill} type="button">📂 Ochish</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onFileChange} />
        {onClose && <button onClick={onClose} style={pill} type="button">✕ Yopish</button>}
      </div>
      {/* Phase 4 — edit toolbar: engine operations on the target section (selected panel's, else first leaf) */}
      <div style={editbar}>
        <button style={act} onClick={() => add("shelf")} type="button">＋ Polka</button>
        <button style={adv} onClick={() => add("shelf", { doubled: true })} type="button">＋ Polka 32мм</button>
        <button style={act} onClick={() => add("door")} type="button">＋ Eshik</button>
        <button style={adv} onClick={() => add("door", { glazedGrid: { lights: 3 } })} type="button">＋ Витрина</button>
        <button style={act} onClick={() => add("drawer")} type="button">＋ Yashik</button>
        <button style={act} onClick={() => add("divider")} type="button">＋ Razdelitel</button>
        <button style={{ ...act, ...(showDivide ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={() => setShowDivide((v) => !v)} type="button">⊟ Bo'lish…</button>
        <button style={{ ...act, opacity: canUndo ? 1 : 0.4 }} onClick={() => undo()} disabled={!canUndo} type="button">↺ Ortga</button>
        <button style={{ ...act, marginLeft: "auto", borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }} onClick={() => setShowTree((v) => !v)} type="button">☰ Detallar</button>
        <button style={{ ...act, borderColor: "#c9a24b", background: "#f7efd8", color: "#8a6d1f" }} onClick={() => setShowSpec((v) => !v)} type="button">📋 Spetsifikatsiya</button>
        <button style={{ ...act, borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a" }} onClick={exportCnc} type="button">⬇ CNC · SWJ008</button>
      </div>
      {/* C3 — numeric divide + shelf count (imos AS_O_Number). x = columns, y = rows/floors. */}
      {showDivide && (
        <div style={selBar}>
          <span style={mono}>Yo'nalish:</span>
          <button style={{ ...pill, ...(divAxis === "x" ? { borderColor: "#00a961", background: "#e3f3ea", color: "#006b3f" } : {}) }} onClick={() => setDivAxis("x")} type="button">↔ Ustun</button>
          <button style={{ ...pill, ...(divAxis === "y" ? { borderColor: "#00a961", background: "#e3f3ea", color: "#006b3f" } : {}) }} onClick={() => setDivAxis("y")} type="button">↕ Qavat</button>
          <label style={dimField}><input style={dimInput} value={divN} inputMode="numeric" onChange={(e) => setDivN(e.target.value.replace(/[^\d]/g, ""))} /></label>
          <button style={act} onClick={() => divideBy(divAxis, parseInt(divN, 10) || 2)} type="button">Teng bo'lish</button>
          <span style={{ ...mono, marginLeft: 10 }}>Polka:</span>
          <label style={dimField}><input style={dimInput} value={shelfN} inputMode="numeric" onChange={(e) => setShelfN(e.target.value.replace(/[^\d]/g, ""))} /></label>
          <button style={act} onClick={() => addShelves(parseInt(shelfN, 10) || 1)} type="button">＋ Qo'shish</button>
        </div>
      )}
      {/* Phase 6 — selected-component actions: doubling / glazing status + load-bearing declaration */}
      {selComp && (
        <div style={selBar}>
          <span style={mono}>{selComp.name}</span>
          {selComp.doubled && <span style={badge}>32мм</span>}
          {(selComp.glazed || selComp.glazedGrid) && <span style={badge}>Витрина{selComp.glazedGrid ? ` ×${selComp.glazedGrid.lights}` : ""}</span>}
          {selComp.loadBearing && <span style={{ ...badge, background: "#e7d6f5", color: "#5b2a86" }}>⚖ Yuk</span>}
          {/* C4 — per-part thickness (imos Part Thickness) */}
          <span style={{ ...mono, marginLeft: 6 }}>Qalinlik:</span>
          <DimField label="T" value={Math.round((selComp.thickness_mm10 ?? 160) / 10)} onCommit={setThickness} />
          {/* F2 — per-part material override (imos Material_O per part) */}
          <span style={mono}>Material:</span>
          <select value={selComp.material ?? ""} onChange={(e) => setMaterial(e.target.value || null)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 160 }}>
            <option value="">Rol bo'yicha</option>
            {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
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
        {showTree && <TreePanel onClose={() => setShowTree(false)} />}
        {showSpec && <SpecPanel onClose={() => setShowSpec(false)} />}
      </div>
    </div>
  );
}

/** One live dimension input (C2). Holds a local string, resyncs when the model changes, and commits
 *  the resize on blur / Enter only (so a single edit is one undo step, not one per keystroke). */
function DimField({ label, value, onCommit }: { label: string; value: number; onCommit: (mm: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(v, 10);
    if (n > 0 && n !== value) onCommit(n);
    else setV(String(value)); // reject empty / unchanged
  };
  return (
    <label style={dimField}>
      <span style={dimLabel}>{label}</span>
      <input
        style={dimInput}
        value={v}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}

/** Left «Detallar» drawer (C1) — every solved part listed; click a row to select it (syncs both
 *  ways with the 3D highlight), like imos's Article-Designer component tree. */
function TreePanel({ onClose }: { onClose: () => void }) {
  const parts = useKarkas((s) => s.parts);
  const plan = useKarkas((s) => s.plan);
  const selectedId = useKarkas((s) => s.selectedId);
  const tapPart = useKarkas((s) => s.tapPart);
  const rows = estimate(parts, plan).parts;
  return (
    <div style={treePanel}>
      <div style={specHead}>
        <b style={{ fontSize: 15 }}>Detallar ({rows.length})</b>
        <button onClick={onClose} style={{ ...pill, marginLeft: "auto" }} type="button">✕</button>
      </div>
      <div style={specList}>
        {rows.map((p) => {
          const on = p.id === selectedId;
          return (
            <div key={p.id} onClick={() => tapPart(on ? null : p.id)} style={{ ...treeRow, ...(on ? treeRowOn : {}) }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ ...mono, ...(on ? { color: "#1f478a" } : {}) }}>{p.w_mm}×{p.l_mm}×{p.t_mm}</span>
            </div>
          );
        })}
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
  const model = useKarkas((s) => s.model);
  const setPlanMaterial = useKarkas((s) => s.setPlanMaterial);
  const e = estimate(parts, plan);
  const hw = hardwareEstimate(model);
  const total = e.priceRub + hw.priceRub;
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
      <div style={{ ...mono, padding: "2px 14px 6px" }}>
        {e.byMaterial.map((g) => `${g.name}: ${g.count} · ${g.priceRub.toLocaleString("ru-RU")}₽`).join("     ")}
      </div>
      {hw.lines.length > 0 && (
        <div style={{ ...mono, padding: "0 14px 6px" }}>
          Фурнитура: {hw.lines.map((l) => `${l.name} ×${l.qty}`).join(" · ")} — {hw.priceRub.toLocaleString("ru-RU")}₽
        </div>
      )}
      <div style={totalRow}>
        <span>Итого</span>
        <span>{total.toLocaleString("ru-RU")} ₽</span>
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
const dimField: CSSProperties = { display: "flex", alignItems: "center", gap: 2, border: "1px solid #d8d2c4", borderRadius: 7, padding: "1px 3px", background: "#fff" };
const dimLabel: CSSProperties = { fontFamily: "system-ui", fontSize: 11, fontWeight: 700, color: "#8a6d1f", width: 12, textAlign: "center" };
const dimInput: CSSProperties = { width: 44, border: "none", outline: "none", background: "transparent", font: "600 13px ui-monospace, monospace", color: "#18241d", textAlign: "right", padding: "3px 2px" };
const pill: CSSProperties = { padding: "6px 12px", borderRadius: 999, border: "1px solid #d8d2c4", background: "none", color: "#18241d", font: "600 13px system-ui", cursor: "pointer" };
const editbar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, flexWrap: "wrap" };
const act: CSSProperties = { padding: "8px 13px", borderRadius: 10, border: "1px solid #00a961", background: "#e3f3ea", color: "#006b3f", font: "650 13px system-ui", cursor: "pointer" };
const adv: CSSProperties = { padding: "8px 13px", borderRadius: 10, border: "1px solid #8a52c9", background: "#efe3fa", color: "#5b2a86", font: "650 13px system-ui", cursor: "pointer" };
const selBar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const badge: CSSProperties = { padding: "3px 8px", borderRadius: 999, background: "#e3f3ea", color: "#006b3f", font: "600 11px system-ui" };
const warnBar: CSSProperties = { margin: "0 14px 10px", padding: "8px 12px", borderRadius: 8, background: "#fdf3e0", border: "1px solid #f0d9a8", color: "#8a5a1f", display: "flex", gap: 10, alignItems: "center", font: "13px system-ui", minWidth: 0 };
const specPanel: CSSProperties = { position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 92vw)", background: "#fbfaf6", borderLeft: "1px solid #e0dccf", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 5 };
const treePanel: CSSProperties = { position: "absolute", top: 0, left: 0, bottom: 0, width: "min(300px, 84vw)", background: "#fbfaf6", borderRight: "1px solid #e0dccf", boxShadow: "8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 5 };
const treeRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "8px 8px", borderBottom: "1px solid #f0ece1", fontFamily: "system-ui", fontSize: 13, cursor: "pointer", borderRadius: 6 };
const treeRowOn: CSSProperties = { background: "#e0ecff", color: "#1f478a", fontWeight: 700 };
const specHead: CSSProperties = { padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e6e1d4", fontFamily: "system-ui" };
const specTotals: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e6e1d4", padding: 1, margin: "10px 14px 6px", borderRadius: 8, overflow: "hidden" };
const cell: CSSProperties = { background: "#fff", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2, fontFamily: "system-ui", fontSize: 15 };
const specList: CSSProperties = { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 14px" };
const specRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0ece1", fontFamily: "system-ui", fontSize: 13 };
const totalRow: CSSProperties = { margin: "0 14px 8px", padding: "8px 12px", borderRadius: 8, background: "#e3f3ea", color: "#00532f", display: "flex", justifyContent: "space-between", alignItems: "center", font: "800 17px system-ui" };
const picker: CSSProperties = { padding: "10px 14px 2px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid #eee7d8" };
const matRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const swatch: CSSProperties = { width: 16, height: 16, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", flex: "0 0 auto" };
const matSel: CSSProperties = { flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 7, border: "1px solid #d8d2c4", background: "#fff", font: "13px system-ui", cursor: "pointer" };
