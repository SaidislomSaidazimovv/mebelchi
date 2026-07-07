// three/KarkasEditor.tsx — the store-backed StructuralModel editor (Phase 3). Reads the model /
// scene / selection from karkasStore and renders it in plain three.js (structureRenderer). Rebuilds
// the 3D group when the model changes and re-tints on selection change; taps write back to the
// store. Opened as a focused overlay from the Biblioteka (Phase 3.3) or the /#karkas dev route —
// entirely parallel to the kitchen constructor, which it never touches.
import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useKarkas, type ZoneRow } from "./karkasStore";
import type { DivisionRule } from "../../../../engine/contracts/variables";
import type { PanelCutout as PanelCutoutT } from "../../../../engine/contracts/structure";
import { useStore } from "../store";
import { useMoney } from "../useMoney";
import { buildDemoModel, buildLCornerModel } from "../../../../engine/structure/demoModel.js";
import { exportModelToSWJ008, solveModelToParts } from "../../../../engine/cnc.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { buildBlockDrawing } from "./blockDrawing";
import { blockHoles } from "./blockHoles";
import { drawingSheetSvg } from "./drawingSvg";
import { buildStructureGroup, highlightBoard, recolorBoards, disposeStructureGroup, applyRenderMode, buildHoleMarkers, type RenderMode } from "./structureRenderer";
import { tagFacades, fadeFacades, applyMaterialsView } from "./karkasLayer";
import { sceneDimsMm, layoutBounds } from "./structureScene";
import { estimate, hardwareEstimate } from "./estimate";
import { BOARDS, EDGES, boardForRole, boardById, partColorLookup, planThickness, selectionColors, projectMaterials, materialIdLookup, type MaterialPlan } from "./materials";

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
  holeGroup: THREE.Group | null; // «Teshiklar» — drill-hole markers, toggled on/off
  raf: number;
  labels: { w: HTMLDivElement; h: HTMLDivElement; d: HTMLDivElement } | null; // C5 dimension overlays
  aabb: THREE.Box3 | null;
  framedKey: string; // F3 — last camera-framing signature; lives on rt so a remount reframes fresh
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
  // F1 — part id → decor colour (int). Recomputed when parts or the material plan change. Uses the
  // shared lookup so a doubled/partial-double part still colours its single render board (else it
  // falls back to bare WOOD — the 32mm-shelf / glazed-frame colour regression).
  const colorFn = useMemo(() => partColorLookup(parts, plan), [parts, plan]);
  const colorRef = useRef(colorFn);
  colorRef.current = colorFn;
  const selComp = useKarkas((s) => s.selectedComponent());
  // NB: selectedParts() returns a FRESH array each call, so subscribing to it directly (`useKarkas(s =>
  // s.selectedParts())`) makes zustand's snapshot change every render → an infinite re-render loop (blank
  // screen). Subscribe to the stable function ref + memoize the result on selectedId/parts instead.
  const selectedPartsFn = useKarkas((s) => s.selectedParts);
  const selParts = useMemo(() => selectedPartsFn(), [selectedPartsFn, selectedId, parts]);
  // (3.3d) selectedParts() only covers instance parts (shelves/drawers/facades); a divider or a carcass
  // panel is a bare part whose id IS the selection — fall back to it so the readout shows their dims too.
  const selPart = useMemo(() => selParts[0] ?? parts.find((p) => p.id === selectedId) ?? null, [selParts, parts, selectedId]);
  // (3.3d) numeric-entry target for the readout: a divider → a typed ±mm nudge; a carcass panel → a typed
  // absolute block dim. Everything else falls through to the block DimField, so no inline entry is shown.
  const precise = useMemo(() => {
    const id = selectedId;
    if (!id) return null;
    if (id.includes("__div_")) return { kind: "line" as const, lineId: id.slice(id.indexOf("__div_") + 6) };
    if (!id.includes("__inst_")) {
      const dim = id.endsWith("__side_l") || id.endsWith("__side_r") ? ("w" as const)
        : id.endsWith("__top") || id.endsWith("__bottom") ? ("h" as const)
        : id.endsWith("__back") ? ("d" as const) : null;
      if (dim) return { kind: "resize" as const, dim };
    }
    return null;
  }, [selectedId]);
  // (3.3d) keyboard nudge — arrow keys move the selected divider / resize the block by exactly 5 mm
  // (Shift → 1 mm); each press is one undo step. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) return;
      const dir = ev.key === "ArrowRight" || ev.key === "ArrowUp" ? 1 : ev.key === "ArrowLeft" || ev.key === "ArrowDown" ? -1 : 0;
      if (!dir) return;
      const st = useKarkas.getState();
      const id = st.selectedId;
      if (!id) return;
      const step = ev.shiftKey ? 10 : 50; // mm10 → 1 mm fine / 5 mm coarse
      if (id.includes("__div_")) {
        ev.preventDefault();
        st.moveLine(id.slice(id.indexOf("__div_") + 6), dir * step, "line", true);
      } else if (!id.includes("__inst_")) {
        const dim = id.endsWith("__side_l") || id.endsWith("__side_r") ? "w" : id.endsWith("__top") || id.endsWith("__bottom") ? "h" : id.endsWith("__back") ? "d" : null;
        const box = st.model.blocks[0]?.box;
        if (!dim || !box) return;
        ev.preventDefault();
        const cur = dim === "w" ? box.w : dim === "h" ? box.h : box.d;
        st.resizeDrag(dim as "w" | "h" | "d", cur + dir * step, true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const sections = useKarkas((s) => s.sections);
  const targetId = useKarkas((s) => s.targetId);
  // (Step 4) ratio pill-row — zoneRow() returns a FRESH object each call, so (like selParts) subscribe to
  // the stable fn ref and memoise on the inputs that actually change it (selection, target, reflow=parts).
  const zoneRowFn = useKarkas((s) => s.zoneRow);
  const zoneRow = useMemo(() => zoneRowFn(), [zoneRowFn, selectedId, targetId, parts]);
  const setZoneRuleAt = useKarkas((s) => s.setZoneRuleAt);
  const addZone = useKarkas((s) => s.addZone);
  // (Step 4b) corner rounding — features() returns a fresh value, so subscribe to the fn ref + memoise.
  const selectedFeaturesFn = useKarkas((s) => s.selectedFeatures);
  const selFeatures = useMemo(() => selectedFeaturesFn(), [selectedFeaturesFn, selectedId, parts]);
  const setCornerRadius = useKarkas((s) => s.setCornerRadius);
  const addOrUpdateCutout = useKarkas((s) => s.addOrUpdateCutout);
  const removeCutout = useKarkas((s) => s.removeCutout);
  const setTarget = useKarkas((s) => s.setTarget);
  const activeTarget = targetId && sections.some((x) => x.id === targetId) ? targetId : sections[0]?.id;
  const toggleLoadBearing = useKarkas((s) => s.toggleLoadBearing);
  const remove = useKarkas((s) => s.remove);
  const setThickness = useKarkas((s) => s.setThickness);
  const setAngle = useKarkas((s) => s.setAngle);
  const shelfMaxAngle = useKarkas((s) => s.selectedShelfMaxAngle());
  const setLip = useKarkas((s) => s.setLip);
  const setMaterial = useKarkas((s) => s.setMaterial);
  const setPlanMaterialTop = useKarkas((s) => s.setPlanMaterial);
  const setHinge = useKarkas((s) => s.setHinge);
  const exportProject = useKarkas((s) => s.exportProject);
  const importProject = useKarkas((s) => s.importProject);
  const resize = useKarkas((s) => s.resize);
  const divideBy = useKarkas((s) => s.divideBy);
  const addShelves = useKarkas((s) => s.addShelves);
  const [showDivide, setShowDivide] = useState(false);
  const [showCorners, setShowCorners] = useState(false);
  const [chainCorners, setChainCorners] = useState(true);
  const [showCutout, setShowCutout] = useState(false);
  const [units, setUnits] = useState<"mm" | "cm">("mm"); // Step 4b — length-field display unit (mm ⇄ cm)
  const [chips, setChips] = useState<{ i: number; x: number; y: number; r: number; vis: boolean }[]>([]); // 3D corner chips
  const [showMaterials, setShowMaterials] = useState(false); // Step 5 — materials view panel
  const [matFilter, setMatFilter] = useState<string | null>(null); // isolated material id, or null
  const projMaterials = useMemo(() => projectMaterials(parts, plan), [parts, plan]);
  const matLookup = useMemo(() => materialIdLookup(parts, plan), [parts, plan]);
  // Step 5.2 — slot-binding prompt when an opened block introduced decors outside the material pool
  const pendingBinding = useKarkas((s) => s.pendingBinding);
  const materialPool = useKarkas((s) => s.materialPool);
  const resolveBinding = useKarkas((s) => s.resolveBinding);
  const cancelBinding = useKarkas((s) => s.cancelBinding);
  const [bindChoices, setBindChoices] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!pendingBinding) return;
    const init: Record<string, string | null> = {};
    for (const d of pendingBinding.foreign) init[d] = materialPool[0] ?? null; // default: map to the first pool decor
    setBindChoices(init);
  }, [pendingBinding, materialPool]);
  const [divAxis, setDivAxis] = useState<"x" | "y">("y");
  const [divN, setDivN] = useState("3");
  const [shelfN, setShelfN] = useState("2");
  const saveKarkasToLibrary = useStore((s) => s.saveKarkasToLibrary);
  const addProjectBlock = useStore((s) => s.addProjectBlock);
  const updateProjectBlock = useStore((s) => s.updateProjectBlock);
  const editingBlockId = useKarkas((s) => s.editingBlockId);
  const fromCabinet = useKarkas((s) => s.fromCabinet);
  const [showSpec, setShowSpec] = useState(false);
  const [showTree, setShowTree] = useState(false);
  // «Ichini ko'rish» — fade the fronts so the interior shows. Default ON in the editor (like imos's
  // always-transparent Article Designer) so you always see the structure you're building.
  const [insideView, setInsideView] = useState(true);
  const insideRef = useRef(insideView);
  insideRef.current = insideView;
  // #7 — imos Visual Styles: realistic / wireframe / shaded. Ref so the group-rebuild effect reads
  // the live mode without re-subscribing.
  const [renderMode, setRenderMode] = useState<RenderMode>("realistic");
  const modeRef = useRef(renderMode);
  modeRef.current = renderMode;
  // apply the current Visual Style + fade state to a group (fade is moot in wireframe — faces vanish)
  const applyVisuals = (group: THREE.Group): void => {
    applyRenderMode(group, modeRef.current);
    if (modeRef.current !== "wireframe") fadeFacades(group, insideRef.current);
  };
  // «Teshiklar» — show/hide the drilling markers (Ø5 pins, Ø35 cups) on the 3D block, like imos.
  const [showHoles, setShowHoles] = useState(false);
  const holesRef = useRef(showHoles);
  holesRef.current = showHoles;
  const rebuildHoles = (): void => {
    const r = rt.current;
    if (!r) return;
    if (r.holeGroup) {
      r.scene.remove(r.holeGroup);
      r.holeGroup.traverse((o) => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose(); const mat = mm.material as THREE.Material | undefined; if (mat) mat.dispose(); });
      r.holeGroup = null;
    }
    if (holesRef.current) {
      const places = solveLayout(model, planThickness(plan));
      const g = buildHoleMarkers(blockHoles(solveModelToParts(model, planThickness(plan)), places), layoutBounds(places));
      r.scene.add(g);
      r.holeGroup = g;
    }
  };
  // compact toolbar: which dropdown (add-variants / overflow) is open
  const [menu, setMenu] = useState<null | "polka" | "eshik" | "more" | "mode" | "sel">(null);
  // Step 3.2 (v4 §5) — the two permanent selection modes: ◇ Part-select (edit) / ▢ Space-select (add).
  const [selMode, setSelMode] = useState<"part" | "space">("part");
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const id = setTimeout(() => document.addEventListener("click", close), 0); // skip the opening click
    return () => { clearTimeout(id); document.removeEventListener("click", close); };
  }, [menu]);

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
      // A converter copy of a kitchen module is a NEW block, not an in-place edit of the cabinet —
      // say so, so the usta isn't surprised to see both the original module and the copy.
      window.alert(fromCabinet ? "Nusxa loyihaga qo'shildi ✓ — asl oshxona moduli o'zgarmaydi" : "Loyihaga qo'shildi ✓");
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

  // #3+#4 — 2D drawing views (imos Drawing Views): project the block to Front / Plan / Section A-A,
  // wrap in a title block, and open a print window so the usta can save it as PDF / print it. SVG
  // only (no GPU) → mobile-safe. Materials label = the carcass decor from the plan.
  const printDrawing = () => {
    try {
      const drawing = buildBlockDrawing(solveLayout(model, planThickness(plan)), solveModelToParts(model, planThickness(plan)));
      const boardName = (id: string) => BOARDS.find((b) => b.id === id)?.name ?? "—";
      const carcass = boardName(plan.carcass);
      const edge = EDGES.find((e) => e.id === plan.edge)?.name ?? "—";
      const svg = drawingSheetSvg(drawing, {
        firm: "MEBELCHI",
        name: "Karkas blok",
        date: new Date().toISOString().slice(0, 10),
        materials: carcass,
        legend: [
          `Korpus: ${carcass}`,
          `Fasad: ${boardName(plan.facade)}`,
          `Orqa: ${boardName(plan.back)}`,
          `Kromka: ${edge}`,
        ],
      });
      const w = window.open("", "_blank");
      if (!w) { alert("Chizma oynasi ochilmadi — popup ruxsatини bering."); return; }
      w.document.write(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chizma — Karkas blok</title><style>` +
        "@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0}svg{display:block;width:100vw;height:100vh}" +
        "</style></head><body>" + svg +
        "<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>",
      );
      w.document.close();
    } catch (err) {
      alert("Chizma xatosi: " + (err instanceof Error ? err.message : String(err)));
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
    rt.current = { renderer, scene: scene3, camera, controls, group: null, holeGroup: null, raf: 0, labels, aabb: null, framedKey: "" };

    const raycaster = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const down = { x: 0, y: 0 };
    // Step 3.3b — an active divider drag (null = not dragging). Dragging the SELECTED divider re-solves
    // the split live (moveLine); model metres → mm10 is ×10000 (layoutToScene scales mm10 by /10000).
    let drag:
      | { kind: "line"; lineId: string; axis: "x" | "y" | "z"; plane: THREE.Plane; last: number; first: boolean }
      | { kind: "resize"; dim: "w" | "h" | "d"; axis: "x" | "y" | "z"; sign: number; plane: THREE.Plane; startWorld: number; startExtent: number; first: boolean }
      | null = null;
    const alongAxis = (e: PointerEvent, axis: "x" | "y" | "z", plane: THREE.Plane): number | null => {
      raycaster.setFromCamera(ndc(e), camera);
      const pt = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, pt)) return null;
      return axis === "x" ? pt.x : axis === "y" ? pt.y : pt.z;
    };
    const onDown = (e: PointerEvent) => {
      down.x = e.clientX; down.y = e.clientY;
      const g = rt.current?.group; if (!g) return;
      raycaster.setFromCamera(ndc(e), camera);
      const hit = raycaster.intersectObjects(g.children, false)[0];
      const pid = hit?.object.userData.partId as string | undefined;
      const st = useKarkas.getState();
      // dragging is armed only on the ALREADY-selected part under the pointer (v4 §5 drag = move / resize)
      if (hit && pid && pid === st.selectedId) {
        const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit.point);
        if (pid.includes("__div_")) {
          // (3.3b) a divider → move the dividing line, rule-aware reflow of the two zones it splits
          const lineId = pid.slice(pid.indexOf("__div_") + "__div_".length);
          const line = st.model.blocks[0]?.lines.find((l) => l.id === lineId);
          if (line) {
            const start = alongAxis(e, line.axis, plane);
            if (start != null) { drag = { kind: "line", lineId, axis: line.axis, plane, last: start, first: true }; controls.enabled = false; }
          }
        } else if (!pid.includes("__inst_")) {
          // (3.3c) a carcass OUTER panel → resize the whole block along that face's axis (Step 2 rule-aware).
          // side_l/side_r → width, bottom/top → height, back → depth; min-side grows when dragged outward (−sign).
          const spec = pid.endsWith("__side_l") ? { dim: "w" as const, axis: "x" as const, sign: -1 }
            : pid.endsWith("__side_r") ? { dim: "w" as const, axis: "x" as const, sign: 1 }
            : pid.endsWith("__bottom") ? { dim: "h" as const, axis: "y" as const, sign: -1 }
            : pid.endsWith("__top") ? { dim: "h" as const, axis: "y" as const, sign: 1 }
            : pid.endsWith("__back") ? { dim: "d" as const, axis: "z" as const, sign: 1 }
            : null;
          const box = st.model.blocks[0]?.box;
          if (spec && box) {
            const start = alongAxis(e, spec.axis, plane);
            const startExtent = spec.dim === "w" ? box.w : spec.dim === "h" ? box.h : box.d;
            if (start != null) { drag = { kind: "resize", dim: spec.dim, axis: spec.axis, sign: spec.sign, plane, startWorld: start, startExtent, first: true }; controls.enabled = false; }
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      const cur = alongAxis(e, drag.axis, drag.plane);
      if (cur == null) return;
      // (3.3d) magnetic snap — quantise to a 5 mm grid so drags land on round sizes; hold Shift → fine 1 mm
      const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
      if (drag.kind === "line") {
        const raw = Math.round((cur - drag.last) * 10000);
        const snapped = Math.round(raw / step) * step; // emit whole grid steps → the divider clicks to 5 mm
        if (snapped !== 0) { useKarkas.getState().moveLine(drag.lineId, snapped, "line", drag.first); drag.first = false; drag.last += snapped / 10000; }
      } else {
        // absolute extent = start extent + outward drag distance (world m → mm10 ×10000), min-side inverted
        const raw = drag.startExtent + drag.sign * Math.round((cur - drag.startWorld) * 10000);
        const nextExtent = Math.round(raw / step) * step; // snap the absolute extent to the grid
        if (Math.abs(nextExtent - drag.startExtent) >= 1) { useKarkas.getState().resizeDrag(drag.dim, nextExtent, drag.first); drag.first = false; }
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) { drag = null; controls.enabled = true; return; } // finished a divider move / block resize
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a camera orbit, not a tap
      const g = rt.current?.group; if (!g) return;
      raycaster.setFromCamera(ndc(e), camera);
      const hit = raycaster.intersectObjects(g.children, false)[0]; // faces only (not edge lines)
      tapPart((hit?.object.userData.partId as string) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
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
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      if (rt.current?.group) disposeStructureGroup(rt.current.group);
      if (rt.current?.holeGroup) disposeStructureGroup(rt.current.holeGroup);
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
    tagFacades(group, parts); // «Ichini ko'rish» — mark fronts, then apply the current mode + fade
    applyVisuals(group);
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
    // F3 — reframe the camera ONLY when the block's bounds change (resize / a different block), so a
    // property edit (material / thickness / load-bearing / add) keeps the user's current orbit.
    const framing = `${scene.center.map((n) => Math.round(n * 100)).join(",")}|${Math.round(scene.radius * 100)}`;
    if (framing !== r.framedKey) {
      r.framedKey = framing;
      const ctr = new THREE.Vector3(scene.center[0], scene.center[1], scene.center[2]);
      const dist = (Math.max(scene.radius, 0.3) / (2 * Math.tan((r.camera.fov * Math.PI) / 360))) * 2.2;
      r.controls.target.copy(ctr);
      r.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.4, ctr.z + dist * 0.95);
      r.camera.lookAt(ctr);
      r.controls.update();
    }
    rebuildHoles(); // keep the drill markers in sync with the new geometry
    // selectedId intentionally omitted — the next effect owns highlight changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // ── «Teshiklar» — rebuild the drill markers when toggled (no geometry rebuild) ──
  useEffect(() => {
    if (!rt.current) return;
    rebuildHoles();
    rt.current.renderer.render(rt.current.scene, rt.current.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHoles]);

  // ── re-tint on selection change (no rebuild) ──
  useEffect(() => {
    if (rt.current?.group) highlightBoard(rt.current.group, selectedId);
  }, [selectedId]);

  // ── Step 4b: 3D corner chips — project the selected panel's face corners to canvas px, and reproject on
  //    every camera move (OrbitControls "change"). Only while the corner tool is open on a real panel. ──
  useEffect(() => {
    const r = rt.current;
    const board = scene.boards.find((b) => b.id === selectedId);
    if (!r || !showCorners || !selectedId || selectedId.includes("__div_") || !board) { setChips([]); return; }
    const compute = () => setChips(cornerChipPositions(board, r.camera, r.renderer, selFeatures?.corners));
    compute();
    r.controls.addEventListener("change", compute);
    return () => r.controls.removeEventListener("change", compute);
  }, [showCorners, selectedId, scene, selFeatures, units]);

  // ── Step 5: Materials view (v4 §143) — ON makes every board translucent + tinted by material, and the
  //    chosen filter isolates one; OFF restores the edge outlines (the view dims them) + normal visuals. ──
  useEffect(() => {
    const r = rt.current;
    if (!r?.group) return;
    if (showMaterials) {
      applyMaterialsView(r.group, matFilter, matLookup);
    } else {
      r.group.traverse((o) => {
        for (const c of (o as THREE.Object3D).children) {
          const lm = (c as THREE.LineSegments).material as THREE.LineBasicMaterial | undefined;
          if (lm && "opacity" in lm) { lm.transparent = false; lm.opacity = 1; lm.needsUpdate = true; }
        }
      });
      applyVisuals(r.group);
    }
    r.renderer.render(r.scene, r.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaterials, matFilter, scene, matLookup]);

  // ── F1: re-colour boards when the material plan changes (no geometry rebuild) ──
  useEffect(() => {
    if (rt.current?.group) {
      recolorBoards(rt.current.group, colorFn);
      applyVisuals(rt.current.group); // keep the current mode (shaded/wireframe) after a recolour
      highlightBoard(rt.current.group, selectedId); // recolor clears nothing but re-assert selection
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFn]);

  // ── «Ichini ko'rish» + Visual Style — re-apply the mode + fade when either changes (no rebuild) ──
  useEffect(() => {
    if (rt.current?.group) {
      applyVisuals(rt.current.group);
      highlightBoard(rt.current.group, selectedId);
      rt.current.renderer.render(rt.current.scene, rt.current.camera);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insideView, renderMode]);

  const dims = sceneDimsMm(scene);
  return (
    <div style={overlay}>
      <div style={bar}>
        <b style={{ fontSize: 15 }}>Karkas blok</b>
        {/* C2 — live W×H×D: type the client's dimensions; the block reflows (content scales) */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <DimField label="Ш" value={dims.w} onCommit={(mm) => resize("w", mm)} units={units} />
          <DimField label="В" value={dims.h} onCommit={(mm) => resize("h", mm)} units={units} />
          <DimField label="Г" value={dims.d} onCommit={(mm) => resize("d", mm)} units={units} />
          <button type="button" onClick={() => setUnits((u) => (u === "mm" ? "cm" : "mm"))} title="mm ⇄ cm birlik" style={{ ...mono, fontSize: 10, cursor: "pointer", border: "1px solid #d8d2c4", borderRadius: 6, padding: "2px 7px", background: "#fff", fontWeight: 700 }}>{units} ⇄</button>
        </div>
        {/* Step 3.1 — the selection INFO CARD (v4 §5, fixture 03-info-card): a multi-segment material
            colour bar + the component-accent name + a «⋯» menu. */}
        {selectedId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid #e6e1d4", borderRadius: 10, padding: "3px 7px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", flexDirection: "column", width: 5, height: 20, borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
              {selectionColors(selParts, plan).map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
            </div>
            <span style={{ fontWeight: 700, color: "#1f5570", fontSize: 13, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selComp?.name ?? selectedId}</span>
            <div style={popWrap}>
              <button onClick={(e) => { e.stopPropagation(); setMenu(menu === "sel" ? null : "sel"); }} style={{ ...pill, padding: "2px 7px", lineHeight: 1 }} type="button" aria-label="Amallar">⋮</button>
              {menu === "sel" && (
                <div style={popover}>
                  {[
                    { label: "🗑 O'chirish", fn: () => { remove(); setMenu(null); }, on: true },
                    { label: "⧉ Nusxa", on: false },
                    { label: "🔒 Blok", on: false },
                    { label: "✎ Nomini o'zgartirish", on: false },
                    { label: "🌲 Ierarxiya", on: false },
                    { label: "💾 Kutubxonaga saqlash", on: false },
                    { label: "✂ Ajratish (ungroup)", on: false },
                    { label: "↻ Aylantirish", on: false },
                  ].map((it) => (
                    <button key={it.label} style={{ ...popItem, opacity: it.on ? 1 : 0.4, minWidth: 168, textAlign: "left" }} onClick={it.fn} disabled={!it.on} type="button">{it.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <span style={{ ...mono, color: "#999", fontSize: 11 }}>panelni bosing</span>
        )}
        <button onClick={addToProject} style={{ ...pill, marginLeft: "auto", borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a", fontWeight: 700 }} type="button">{editingBlockId ? "💾 Yangilash" : fromCabinet ? "＋ Nusxa" : "＋ Loyihaga"}</button>
        <div style={popWrap}>
          <button onClick={(e) => { e.stopPropagation(); setMenu(menu === "more" ? null : "more"); }} style={pill} type="button" aria-label="Ko'proq amallar">⋯</button>
          {menu === "more" && (
            <div style={popRight}>
              <button style={popItem} onClick={saveToBiblioteka} type="button">📚 Bibliotekaga saqlash</button>
              <button style={popItem} onClick={saveProject} type="button">💾 Faylga saqlash</button>
              <button style={popItem} onClick={() => fileRef.current?.click()} type="button">📂 Fayldan ochish</button>
              <div style={popSep} />
              <button style={popItem} onClick={() => setModel(buildDemoModel())} type="button">▢ Namuna: Тумба</button>
              <button style={popItem} onClick={() => setModel(buildLCornerModel())} type="button">⌐ Namuna: L-burchak</button>
              {onClose && <><div style={popSep} /><button style={{ ...popItem, color: "#a01a2e" }} onClick={onClose} type="button">✕ Yopish</button></>}
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onFileChange} />
      </div>
      {/* Step 3.3a (v4 §5 readout law) — the selection's dimensions in a FIXED top-centre strip, never
          hidden by the hand. Updates live during a drag/resize (later pieces). 2 axes only (face w×h). */}
      {selectedId && selPart && (
        <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "rgba(31,85,112,0.94)", color: "#fff", borderRadius: 9, padding: "5px 15px", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 10px rgba(0,0,0,0.22)", display: "flex", gap: 11, alignItems: "center", pointerEvents: precise ? "auto" : "none", whiteSpace: "nowrap" }}>
          <span>{selComp?.name ?? "Bo'lak"}</span>
          <span style={{ opacity: 0.5 }}>│</span>
          <span style={{ fontFamily: "monospace" }}>{Math.round(selPart.length_mm10 / 10)} × {Math.round(selPart.width_mm10 / 10)} mm</span>
          {/* (3.3d) tap-readout → numpad: type an exact size (panel → block dim) or a ± nudge (divider). */}
          {precise && (
            <>
              <span style={{ opacity: 0.5 }}>│</span>
              <input
                key={selectedId + (precise.kind === "resize" ? precise.dim : "")}
                defaultValue={precise.kind === "resize" ? String(precise.dim === "w" ? dims.w : precise.dim === "h" ? dims.h : dims.d) : ""}
                placeholder={precise.kind === "line" ? "±mm" : "mm"}
                inputMode="numeric"
                title={precise.kind === "line" ? "Aniq siljitish (± mm) — Enter" : "Aniq o'lcham (mm) — Enter"}
                style={{ width: 62, padding: "2px 6px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.9)", color: "#123", fontFamily: "monospace", fontWeight: 700, fontSize: 12, textAlign: "center" }}
                onKeyDown={(ev) => {
                  if (ev.key !== "Enter") return;
                  const v = parseInt((ev.target as HTMLInputElement).value.replace(/[^\d-]/g, ""), 10);
                  if (!Number.isFinite(v)) return;
                  if (precise.kind === "resize") useKarkas.getState().resizeDrag(precise.dim, v * 10, true);
                  else useKarkas.getState().moveLine(precise.lineId, v * 10, "line", true);
                  (ev.target as HTMLInputElement).blur();
                }}
                onClick={(ev) => (ev.target as HTMLInputElement).select()}
              />
              <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 600 }}>← → 5mm</span>
            </>
          )}
        </div>
      )}
      {/* Step 5.2 (v4 §3.2, Gate 5) — map-or-create prompt: an opened block used decors the project pool
          lacks; bind each to an existing material or keep it as a new variable. Never a silent 5th material. */}
      {pendingBinding && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 18, width: 400, maxWidth: "92vw", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
            <b style={{ fontSize: 15 }}>Yangi material aniqlandi</b>
            <p style={{ fontSize: 12.5, color: "#555", margin: "6px 0 12px" }}>Bu blok loyihada yo'q dekor ishlatadi. Har birini mavjud materialga bog'lang, yoki yangi material sifatida saqlang.</p>
            {pendingBinding.foreign.map((d) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, background: boardById(d)?.hex ?? "#ccc", border: "1px solid rgba(0,0,0,0.15)", flex: "0 0 auto" }} />
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{boardById(d)?.name ?? d}</span>
                <span style={{ opacity: 0.5, fontSize: 16 }}>→</span>
                <select value={bindChoices[d] ?? "__new"} onChange={(e) => setBindChoices((c) => ({ ...c, [d]: e.target.value === "__new" ? null : e.target.value }))} style={{ flex: "0 0 auto", maxWidth: 180, padding: "4px 6px", borderRadius: 7, border: "1px solid #d8d2c4", background: "#fff", cursor: "pointer" }}>
                  {materialPool.map((p) => <option key={p} value={p}>{boardById(p)?.name ?? p}</option>)}
                  <option value="__new">＋ Yangi material</option>
                </select>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => cancelBinding()} type="button" style={{ ...act, borderColor: "#bbb" }}>Bekor</button>
              <button onClick={() => resolveBinding(bindChoices)} type="button" style={{ ...act, borderColor: "#00a961", background: "#cdeedd", color: "#00532f", fontWeight: 700 }}>Tasdiqlash</button>
            </div>
          </div>
        </div>
      )}
      {/* Step 4 (v4 §4, fixture 04-shelf-ratios) — the ratio pill-row editor for the active divided
          section: one pill per zone (Ratio weight / Fixed mm / Flex ↔), edit a value → all zones reflow
          together; the chip cycles the rule; «＋» splits the last zone. Appears when a divider/zone is active. */}
      {zoneRow && (
        <div style={{ position: "fixed", bottom: 70, left: "50%", transform: "translateX(-50%)", zIndex: 59, background: "rgba(238,240,243,0.97)", borderRadius: 12, padding: "8px 12px", boxShadow: "0 3px 14px rgba(0,0,0,0.18)", display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
          {zoneRow.zones.map((z, i) => (
            <Fragment key={z.id}>
              {i > 0 && <div style={{ width: 3, height: 34, borderRadius: 2, background: "#9aa6b2" }} />}
              <ZonePill
                zone={z}
                onValue={(v) => setZoneRuleAt(i, z.rule.kind === "fixed" ? { kind: "fixed", mm10: Math.round(v * 10) } : { kind: "ratio", weight: v })}
                onCycle={() => setZoneRuleAt(i, nextZoneRule(z))}
              />
            </Fragment>
          ))}
          <div style={{ width: 12 }} />
          <button onClick={addZone} title="Yangi bo'shliq qo'shish" style={{ width: 46, height: 40, borderRadius: 9, border: "none", background: "#fff", color: "#1f5570", fontSize: 22, fontWeight: 800, cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>+</button>
          <div style={{ width: 46, height: 40, borderRadius: 9, border: "2px dashed #9aa6b2", opacity: 0.7 }} />
        </div>
      )}
      {/* Phase 4 — edit toolbar: engine operations on the target section (selected panel's, else first leaf) */}
      <div style={editbar}>
        {/* Step 3.2 (v4 §5) — the two permanent selection modes; Space-select reveals the add toolset. */}
        <div style={{ display: "flex", gap: 2, background: "#eef0f3", borderRadius: 8, padding: 2, marginRight: 4 }}>
          {([["part", "◇ Bo'lak", "Bo'lakni tanlash / tahrirlash"], ["space", "▢ Bo'shliq", "Bo'shliqqa qo'shish"]] as const).map(([m, label, title]) => (
            <button key={m} onClick={() => setSelMode(m)} title={title} type="button" style={{ border: "none", borderRadius: 6, padding: "4px 9px", fontSize: 12, fontWeight: 600, cursor: "pointer", ...(selMode === m ? { background: "#fff", color: "#1f5570", boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { background: "transparent", color: "#6b7280" }) }}>{label}</button>
          ))}
        </div>
        {selMode === "space" && (<>
        <div style={popWrap}>
          <button style={{ ...act, ...(menu === "polka" ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={(e) => { e.stopPropagation(); setMenu(menu === "polka" ? null : "polka"); }} type="button">＋ Polka ▾</button>
          {menu === "polka" && (
            <div style={popover}>
              <button style={popItem} onClick={() => add("shelf")} type="button">Oddiy polka · 16мм</button>
              <button style={popItem} onClick={() => add("shelf", { doubled: true })} type="button">Qalin polka · 32мм</button>
            </div>
          )}
        </div>
        <div style={popWrap}>
          <button style={{ ...act, ...(menu === "eshik" ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={(e) => { e.stopPropagation(); setMenu(menu === "eshik" ? null : "eshik"); }} type="button">＋ Eshik ▾</button>
          {menu === "eshik" && (
            <div style={popover}>
              <button style={popItem} onClick={() => add("door")} type="button">Oddiy eshik</button>
              <button style={popItem} onClick={() => add("door", { glazed: true })} type="button">Oyna eshik</button>
              <button style={popItem} onClick={() => add("door", { glazedGrid: { lights: 3 } })} type="button">Витрина · 3 oyna</button>
            </div>
          )}
        </div>
        <button style={act} onClick={() => add("drawer")} type="button">＋ Yashik</button>
        <button style={act} onClick={() => add("divider")} type="button">＋ Razdelitel</button>
        <button style={{ ...act, ...(showDivide ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={() => setShowDivide((v) => !v)} type="button">⊟ Bo'lish…</button>
        {/* Step 4b — corner rounding on the selected panel (not a divider) */}
        {selectedId && !selectedId.includes("__div_") && (
          <button style={{ ...act, ...(showCorners ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={() => setShowCorners((v) => !v)} type="button">⌜ Burchak…</button>
        )}
        {selectedId && !selectedId.includes("__div_") && (
          <button style={{ ...act, ...(showCutout ? { borderColor: "#00a961", background: "#cdeedd" } : {}) }} onClick={() => setShowCutout((v) => !v)} type="button">▢ O'yiq…</button>
        )}
        </>)}
        <button style={{ ...act, opacity: canUndo ? 1 : 0.4 }} onClick={() => undo()} disabled={!canUndo} type="button">↺ Ortga</button>
        {/* #7 — imos Visual Styles: a proper dropdown (matches the ＋Polka / ＋Eshik menus) */}
        <div style={{ ...popWrap, marginLeft: "auto" }}>
          <button style={{ ...act, ...(menu === "mode" ? { borderColor: "#2f6f8f", background: "#dce9f0", color: "#1f5570" } : { borderColor: "#7aa0b8", color: "#1f5570" }) }} onClick={(e) => { e.stopPropagation(); setMenu(menu === "mode" ? null : "mode"); }} type="button" title="Ko'rinish rejimi">
            🎨 {renderMode === "realistic" ? "Realistik" : renderMode === "wireframe" ? "Simli" : "Soya"} ▾
          </button>
          {menu === "mode" && (
            <div style={popover}>
              {([["realistic", "Realistik", "To'liq, rangli"], ["wireframe", "Simli", "Faqat qirralar"], ["shaded", "Soya", "Bir xil kulrang"]] as const).map(([m, label, sub]) => (
                <button key={m} style={{ ...popItem, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, minWidth: 168, ...(renderMode === m ? { background: "#dce9f0", color: "#1f5570", fontWeight: 700 } : {}) }} onClick={() => { setRenderMode(m); setMenu(null); }} type="button">
                  <span>{renderMode === m ? "✓ " : ""}{label}</span>
                  <span style={{ fontSize: 11, color: "#8a8577", fontWeight: 400 }}>{sub}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Step 5 — materials view: list the decors in use; click one to isolate it in 3D */}
        <button style={{ ...act, ...(showMaterials ? { borderColor: "#8a6d1f", background: "#f7efd8", color: "#8a6d1f" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => setShowMaterials((v) => !v)} type="button">▦ {matFilter ? "Material ✓" : "Materiallar"}</button>
        <button style={{ ...act, ...(insideView ? { borderColor: "#2f8f5b", background: "#dcefe3", color: "#1f6b45" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => setInsideView((v) => !v)} type="button">👁 {insideView ? "Ichi ✓" : "Ichini ko'rish"}</button>
        <button style={{ ...act, ...(showHoles ? { borderColor: "#1f6f86", background: "#dcecf2", color: "#13485a" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => setShowHoles((v) => !v)} type="button" title="Teshiklarni ko'rsatish (shtok, petlya)">🕳 {showHoles ? "Teshik ✓" : "Teshiklar"}</button>
        <button style={{ ...act, borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }} onClick={() => setShowTree((v) => !v)} type="button">☰ Detallar</button>
        <button style={{ ...act, borderColor: "#c9a24b", background: "#f7efd8", color: "#8a6d1f" }} onClick={() => setShowSpec((v) => !v)} type="button">📋 Spec</button>
        <button style={{ ...act, borderColor: "#7a5cc9", background: "#e9e2f7", color: "#4a2f8a" }} onClick={printDrawing} type="button">📐 Chizma</button>
        <button style={{ ...act, borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a" }} onClick={exportCnc} type="button">⬇ CNC</button>
      </div>
      {/* Placement (#1) — choose which compartment the next add lands in; tapping a part also sets it */}
      {sections.length > 1 && (
        <div style={selBar}>
          <span style={mono}>Qayerga:</span>
          {sections.map((s) => (
            <button key={s.id} style={{ ...pill, ...(activeTarget === s.id ? { borderColor: "#00a961", background: "#e3f3ea", color: "#006b3f", fontWeight: 700 } : {}) }} onClick={() => setTarget(s.id)} type="button">{s.label}-bo'lim</button>
          ))}
        </div>
      )}
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
      {/* Step 4b (fixtures 04b-round) — corner rounding: chain ×4 (one radius) or per-corner TL/TR/BR/BL */}
      {showCorners && selectedId && !selectedId.includes("__div_") && (
        <div style={selBar}>
          <span style={mono}>Yumaloqlash (mm):</span>
          <button style={{ ...pill, ...(chainCorners ? { borderColor: "#00a961", background: "#e3f3ea", color: "#006b3f" } : {}) }} onClick={() => setChainCorners((v) => !v)} type="button" title="4 burchakni birga o'zgartirish">♾ ×4</button>
          {chainCorners ? (
            <DimField label="R" value={Math.round((selFeatures?.corners?.[0] ?? 0) / 10)} onCommit={(mm) => setCornerRadius("all", mm * 10)} min={0} units={units} />
          ) : (
            (["◜ TL", "◝ TR", "◞ BR", "◟ BL"] as const).map((lbl, i) => (
              <DimField key={lbl} label={lbl} value={Math.round((selFeatures?.corners?.[i] ?? 0) / 10)} onCommit={(mm) => setCornerRadius(i as 0 | 1 | 2 | 3, mm * 10)} min={0} units={units} />
            ))
          )}
          {selFeatures?.corners?.some((r) => r > 0) && (
            <button style={act} onClick={() => setCornerRadius("all", 0)} type="button">✕ Tozalash</button>
          )}
        </div>
      )}
      {/* Step 4b (fixture 04b-cutout) — a rectangular aperture (sink / hob / boiler): size + per-edge
          offset pills with 🔒 locks (a locked offset survives a panel resize) + center-snap. One per panel. */}
      {showCutout && selectedId && !selectedId.includes("__div_") && (() => {
        const cut = selFeatures?.cutouts?.[0] ?? null;
        const panelL = selPart?.length_mm10 ?? 0;
        const panelW = selPart?.width_mm10 ?? 0;
        const upd = (patch: Partial<PanelCutoutT>) => cut && addOrUpdateCutout({ ...cut, ...patch });
        return (
          <div style={selBar}>
            {!cut ? (
              <button style={act} type="button" onClick={() => {
                const w = Math.max(200, Math.round(panelL * 0.4)), h = Math.max(200, Math.round(panelW * 0.4));
                const l = Math.round((panelL - w) / 2), t = Math.round((panelW - h) / 2);
                addOrUpdateCutout({ id: "cut1", w_mm10: w, h_mm10: h, offset: [l, t, l, t], locked: [false, false, false, false] });
              }}>＋ O'yiq qo'shish</button>
            ) : (
              <>
                <span style={mono}>O'lcham:</span>
                <DimField label="Ш" value={Math.round(cut.w_mm10 / 10)} onCommit={(v) => upd({ w_mm10: v * 10 })} units={units} />
                <DimField label="В" value={Math.round(cut.h_mm10 / 10)} onCommit={(v) => upd({ h_mm10: v * 10 })} units={units} />
                <span style={{ ...mono, marginLeft: 6 }}>Otstup:</span>
                {(["Л", "В", "П", "Н"] as const).map((lbl, i) => (
                  <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <DimField label={lbl} value={Math.round(cut.offset[i] / 10)} min={0} units={units} onCommit={(v) => { const o = [...cut.offset] as [number, number, number, number]; o[i] = v * 10; upd({ offset: o }); }} />
                    <button type="button" title="Qulflash — resize'da bu otstup saqlanadi" style={{ ...pill, padding: "2px 5px", ...(cut.locked[i] ? { borderColor: "#d98a00", background: "#ffe7b3" } : {}) }} onClick={() => { const l = [...cut.locked] as [boolean, boolean, boolean, boolean]; l[i] = !l[i]; upd({ locked: l }); }}>{cut.locked[i] ? "🔒" : "🔓"}</button>
                  </span>
                ))}
                <button style={act} type="button" title="Markazga tortish" onClick={() => { const l = Math.round((panelL - cut.w_mm10) / 2), t = Math.round((panelW - cut.h_mm10) / 2); upd({ offset: [l, t, l, t] }); }}>⊹ Markaz</button>
                <button style={act} type="button" onClick={() => removeCutout(cut.id)}>✕ O'chirish</button>
              </>
            )}
          </div>
        );
      })()}
      {/* Phase 6 — selected-component actions: doubling / glazing status + load-bearing declaration */}
      {selComp && (
        <div style={selBar}>
          <span style={mono}>{selComp.name}</span>
          {selComp.doubled && <span style={badge}>32мм</span>}
          {selComp.glazedGrid && <span style={badge}>Витрина ×{selComp.glazedGrid.lights}</span>}
          {selComp.glazed && !selComp.glazedGrid && <span style={badge}>Стекло</span>}
          {selComp.loadBearing && <span style={{ ...badge, background: "#e7d6f5", color: "#5b2a86" }}>⚖ Yuk</span>}
          {selComp.role === "internal_shelf" && selComp.angle_deg ? <span style={{ ...badge, background: "#d8ecf7", color: "#1f5f86" }}>⤢ {selComp.angle_deg}°</span> : null}
          {selComp.role === "internal_shelf" && selComp.lip_mm10 ? <span style={{ ...badge, background: "#e7f0d8", color: "#4d6b1f" }}>▟ Bort {Math.round(selComp.lip_mm10 / 10)}</span> : null}
          {/* C4 — per-part thickness (imos Part Thickness) */}
          <span style={{ ...mono, marginLeft: 6 }}>Qalinlik:</span>
          <DimField label="T" value={Math.round((selComp.thickness_mm10 ?? 160) / 10)} onCommit={setThickness} />
          {/* qiya polka (imos AS_O_Angle) — inclined display shelf; only for internal shelves */}
          {selComp.role === "internal_shelf" && (
            <>
              <span style={mono}>Burchak:</span>
              <DimField label="°" value={selComp.angle_deg ?? 0} onCommit={setAngle} min={0} />
              {shelfMaxAngle != null && <span style={{ ...mono, opacity: 0.55, fontSize: 11 }} title="Bu bo'yga sig'adigan eng katta burchak">max {shelfMaxAngle}°</span>}
              {/* Display shelf (imos CP_O_1_Angle_Shelf): front lip/border height in mm — 0 = tekis */}
              <span style={mono}>Bort:</span>
              <DimField label="mm" value={Math.round((selComp.lip_mm10 ?? 0) / 10)} onCommit={setLip} min={0} />
              <span style={{ ...mono, opacity: 0.55, fontSize: 11 }} title="Eng katta bort balandligi">max 80mm</span>
            </>
          )}
          {/* F2 — per-part material override (imos Material_O per part) */}
          <span style={mono}>Material:</span>
          <select value={selComp.material ?? ""} onChange={(e) => setMaterial(e.target.value || null)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 160 }}>
            <option value="">Rol bo'yicha</option>
            {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {/* Task B — hinge side per door (engine drills the chosen edge; handle sits opposite) */}
          {selComp.role === "facade" && (
            <>
              <span style={mono}>Petlya:</span>
              <select value={selComp.hingeEdge === "right" ? "right" : "left"} onChange={(e) => setHinge(e.target.value as "left" | "right")} style={{ ...matSel, flex: "0 0 auto", maxWidth: 110 }}>
                <option value="left">◧ Chap</option>
                <option value="right">◨ O'ng</option>
              </select>
            </>
          )}
          <button style={{ ...act, marginLeft: "auto", ...(selComp.loadBearing ? { borderColor: "#8a52c9", background: "#efe3fa", color: "#5b2a86" } : {}) }} onClick={toggleLoadBearing} type="button">
            ⚖ {selComp.loadBearing ? "Yuk ✓" : "Yuk-ko'taruvchi"}
          </button>
          <button style={{ ...act, borderColor: "#d1495b", background: "#fbe4e8", color: "#a01a2e" }} onClick={remove} type="button">🗑 O'chirish</button>
        </div>
      )}
      {/* A CARCASS part (bok / верх / низ / задняя / перегородка) isn't a user-added instance, so it
          has no per-part component — but its material still belongs to a plan slot (Корпус / Задняя).
          Show that slot's material picker here so selecting ANY part offers an edit (not just drawers
          / shelves / doors). It applies to the WHOLE carcass, so we say so. */}
      {!selComp && selectedId && (() => {
        const part = parts.find((p) => p.id === selectedId);
        const carcassRoles = ["carcass_side", "carcass_top", "carcass_bottom", "carcass_back"];
        if (!part || !carcassRoles.includes(part.role ?? "")) return null;
        const slot: "carcass" | "back" = part.role === "carcass_back" ? "back" : "carcass";
        return (
          <div style={selBar}>
            <span style={mono}>{part.name}</span>
            <span style={badge}>karkas</span>
            <span style={{ ...mono, marginLeft: 6 }}>Material:</span>
            <select value={plan[slot]} onChange={(e) => setPlanMaterialTop(slot, e.target.value)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 160 }}>
              {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ ...mono, fontSize: 10, color: "#8a8a8a", marginLeft: 6 }}>butun karkasga</span>
          </div>
        );
      })()}
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
        {/* Step 4b (fixture 04b-round-00) — 3D corner chips: a «＋» at each of the selected panel's 4 face
            corners; tap to round it (30mm), tap a rounded one (green, shows its radius) to square it again.
            Chain ×4 → one tap rounds all four. Projected to canvas px + reprojected on every camera move. */}
        {showCorners && chips.map((c) => (c.vis ? (
          <button
            key={c.i}
            type="button"
            title={c.r > 0 ? "Bosib to'g'rilash (kvadrat)" : "Burchakni yumaloqlash"}
            onClick={() => {
              const cur = selFeatures?.corners?.[c.i] ?? 0;
              const nextR = cur > 0 ? 0 : 300; // toggle square ⇄ 30mm
              if (chainCorners) setCornerRadius("all", nextR); else setCornerRadius(c.i as 0 | 1 | 2 | 3, nextR);
            }}
            style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-50%)", zIndex: 42, width: 30, height: 30, borderRadius: 15, border: "2px solid #fff", cursor: "pointer", background: c.r > 0 ? "#00a961" : "#2a6df0", color: "#fff", fontWeight: 800, fontSize: c.r > 0 ? 11 : 18, lineHeight: 1, boxShadow: "0 2px 6px rgba(0,0,0,0.3)", fontFamily: "ui-monospace, monospace" }}
          >
            {c.r > 0 ? (units === "cm" ? +(c.r / 100).toFixed(1) : Math.round(c.r / 10)) : "+"}
          </button>
        ) : null))}
        {/* Step 5 — materials legend + isolate filter (v4 §3, "see everything by material") */}
        {showMaterials && (
          <div style={{ position: "absolute", left: 10, top: 10, zIndex: 44, background: "#fff", borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 10, minWidth: 210, maxHeight: "70%", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ fontSize: 13 }}>Materiallar</b>
              <button onClick={() => setShowMaterials(false)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: "#888", lineHeight: 1 }} type="button">✕</button>
            </div>
            <button onClick={() => setMatFilter(null)} type="button" style={{ ...matLegendRow, ...(matFilter === null ? matLegendActive : {}) }}>
              <span style={{ ...matLegendSwatch, background: "linear-gradient(90deg,#f4f2ec,#c9a877,#4b3a2f)" }} />
              <span style={{ flex: 1, textAlign: "left" }}>Hammasi</span>
            </button>
            {projMaterials.map((m) => (
              <button key={m.id} onClick={() => setMatFilter(matFilter === m.id ? null : m.id)} type="button" style={{ ...matLegendRow, ...(matFilter === m.id ? matLegendActive : {}) }}>
                <span style={{ ...matLegendSwatch, background: m.hex }} />
                <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>×{m.count}</span>
              </button>
            ))}
            {projMaterials.length === 0 && <div style={{ fontSize: 12, color: "#999", padding: "4px 2px" }}>Hali material yo'q</div>}
            {matFilter && <div style={{ fontSize: 11, color: "#8a6d1f", marginTop: 6, paddingLeft: 2 }}>Faqat «{projMaterials.find((m) => m.id === matFilter)?.name}» ajratildi</div>}
          </div>
        )}
        {showTree && <TreePanel onClose={() => setShowTree(false)} />}
        {showSpec && <SpecPanel onClose={() => setShowSpec(false)} />}
      </div>
    </div>
  );
}

/** One live dimension input (C2). Holds a local string, resyncs when the model changes, and commits
 *  the resize on blur / Enter only (so a single edit is one undo step, not one per keystroke). */
/** Step 4b — screen positions (canvas px) of a board's 4 face corners [TL,TR,BR,BL] for the 3D corner
 *  chips. The face = the two largest axes; the corner is taken at mid-thickness. `vis` is false when the
 *  point is behind the camera. `corners` (mm10) supplies each chip's current radius. */
function cornerChipPositions(
  board: { pos: [number, number, number]; size: [number, number, number] },
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  corners?: readonly number[],
): { i: number; x: number; y: number; r: number; vis: boolean }[] {
  const [sx, sy, sz] = board.size;
  let tAxis: 0 | 1 | 2 = 0;
  if (sy <= sx && sy <= sz) tAxis = 1;
  else if (sz <= sx && sz <= sy) tAxis = 2;
  const faceAxes = [0, 1, 2].filter((a) => a !== tAxis) as [number, number];
  const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
  const combos: [number, number][] = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // TL, TR, BR, BL
  const v = new THREE.Vector3();
  return combos.map(([su, sv], i) => {
    const p: [number, number, number] = [board.pos[0], board.pos[1], board.pos[2]];
    p[faceAxes[0]] += (su * board.size[faceAxes[0]]) / 2;
    p[faceAxes[1]] += (sv * board.size[faceAxes[1]]) / 2;
    v.set(p[0], p[1], p[2]).project(camera);
    return { i, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, r: corners?.[i] ?? 0, vis: v.z < 1 };
  });
}

function DimField({ label, value, onCommit, min = 1, units = "mm" }: { label: string; value: number; onCommit: (mm: number) => void; min?: number; units?: "mm" | "cm" }) {
  // `value`/`onCommit` are always in mm; `units="cm"` only changes the display + parse (÷/×10). Fields
  // that aren't lengths (angle °, count) never pass `units`, so they keep their integer-mm behaviour.
  const toDisp = (mm: number) => (units === "cm" ? String(+(mm / 10).toFixed(1)) : String(mm));
  const [v, setV] = useState(toDisp(value));
  useEffect(() => { setV(toDisp(value)); }, [value, units]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const raw = parseFloat(v.replace(",", "."));
    const mm = units === "cm" ? Math.round(raw * 10) : Math.round(raw);
    // `min` lets the angle field accept 0 (flatten a tilted shelf); dimensions keep min = 1.
    if (Number.isFinite(mm) && mm >= min && mm !== value) onCommit(mm);
    else setV(toDisp(value)); // reject empty / below-min / unchanged
  };
  return (
    <label style={dimField}>
      <span style={dimLabel}>{label}</span>
      <input
        style={dimInput}
        value={v}
        inputMode="decimal"
        onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </label>
  );
}

/** Step 4 — the next rule when a pill's chip is tapped: Ratio → Fixed (frozen at the current mm) → Flex →
 *  Ratio. Locked needs a bound component, so cycling a locked pill just returns to Ratio(1). */
function nextZoneRule(z: ZoneRow["zones"][number]): DivisionRule {
  switch (z.rule.kind) {
    case "ratio": return { kind: "fixed", mm10: z.size_mm10 };
    case "fixed": return { kind: "flex" };
    default: return { kind: "ratio", weight: 1 };
  }
}

/** Step 4 — one zone of the ratio pill-row (fixture 04-shelf-ratios): a value (Ratio weight, or Fixed mm)
 *  plus a chip that cycles the rule. Flex/Locked show their current mm read-only. Enter/blur commits and
 *  the whole row reflows via the constraint solver. */
function ZonePill({ zone, onValue, onCycle }: { zone: ZoneRow["zones"][number]; onValue: (v: number) => void; onCycle: () => void }) {
  const editable = zone.rule.kind === "ratio" || zone.rule.kind === "fixed";
  const shown = zone.rule.kind === "ratio" ? String(zone.rule.weight)
    : zone.rule.kind === "fixed" ? String(Math.round(zone.rule.mm10 / 10))
    : String(Math.round(zone.size_mm10 / 10));
  const chip = zone.rule.kind === "ratio" ? "нисбат" : zone.rule.kind === "fixed" ? "фикс мм" : zone.rule.kind === "locked" ? "🔒 lock" : "↔ флекс";
  const [v, setV] = useState(shown);
  useEffect(() => { setV(shown); }, [shown]);
  const commit = () => {
    const n = parseFloat(v.replace(",", "."));
    if (Number.isFinite(n) && n > 0) onValue(n);
    else setV(shown);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <input
        style={{ width: 54, height: 30, border: "none", borderRadius: 8, background: editable ? "#fff" : "#e4e7eb", color: "#18241d", font: "700 15px ui-monospace, monospace", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.12)", opacity: editable ? 1 : 0.75 }}
        value={v}
        disabled={!editable}
        inputMode="decimal"
        onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      <button onClick={onCycle} title="Qoidani almashtirish: нисбат / фикс / флекс" style={{ border: "none", background: "transparent", color: "#5b6b78", fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0 }}>{chip}</button>
    </div>
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
  const money = useMoney();
  const hex = BOARDS.find((b) => b.id === value)?.hex ?? "#ccc";
  return (
    <label style={matRow}>
      <span style={{ ...mono, width: 62 }}>{label}</span>
      <span style={{ ...swatch, background: hex }} />
      <select style={matSel} value={value} onChange={(ev) => setPlanMaterial(slot, ev.target.value)}>
        {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name} · {money(b.pricePerM2)}/м²</option>)}
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
  const money = useMoney();
  const e = estimate(parts, plan);
  const hw = hardwareEstimate(model);
  const total = e.priceUzs + hw.priceUzs;
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
            {EDGES.map((m) => <option key={m.id} value={m.id}>{m.name} · {money(m.pricePerM)}/м</option>)}
          </select>
        </label>
      </div>

      <div style={specTotals}>
        <div style={cell}><span style={mono}>Detallar</span><b>{e.count}</b></div>
        <div style={cell}><span style={mono}>List</span><b>{e.areaM2.toFixed(2)} m²</b></div>
        <div style={cell}><span style={mono}>Kromka</span><b>{e.edgeM.toFixed(2)} m</b></div>
        <div style={cell}><span style={mono}>Narx</span><b>{money(e.priceUzs)}</b></div>
      </div>
      <div style={{ ...mono, padding: "2px 14px 6px" }}>
        {e.byMaterial.map((g) => `${g.name}: ${g.count} · ${money(g.priceUzs)}`).join("     ")}
      </div>
      {hw.lines.length > 0 && (
        <div style={{ ...mono, padding: "0 14px 6px" }}>
          Фурнитура: {hw.lines.map((l) => `${l.name} ×${l.qty}`).join(" · ")} — {money(hw.priceUzs)}
        </div>
      )}
      <div style={totalRow}>
        <span>Итого</span>
        <span>{money(total)}</span>
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
const matLegendRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 7px", marginBottom: 2, border: "1px solid transparent", borderRadius: 8, background: "transparent", cursor: "pointer", font: "600 12px system-ui", color: "#222" };
const matLegendActive: CSSProperties = { borderColor: "#c9a24b", background: "#f7efd8" };
const matLegendSwatch: CSSProperties = { width: 20, height: 20, borderRadius: 5, flex: "0 0 auto", border: "1px solid rgba(0,0,0,0.15)" };
const popWrap: CSSProperties = { position: "relative", display: "inline-flex", zIndex: 56 };
const popover: CSSProperties = { position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 176, background: "#fff", border: "1px solid #e0dccf", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.17)", padding: 6, display: "flex", flexDirection: "column", gap: 2, zIndex: 60 };
const popRight: CSSProperties = { ...popover, left: "auto", right: 0 };
const popItem: CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "none", background: "none", color: "#18241d", font: "600 13px system-ui", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" };
const popSep: CSSProperties = { height: 1, background: "#eee7d8", margin: "4px 2px" };
const act: CSSProperties = { padding: "8px 13px", borderRadius: 10, border: "1px solid #00a961", background: "#e3f3ea", color: "#006b3f", font: "650 13px system-ui", cursor: "pointer" };
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
