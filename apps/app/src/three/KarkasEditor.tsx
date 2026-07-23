// three/KarkasEditor.tsx — the store-backed StructuralModel editor (Phase 3). Reads the model /
// scene / selection from karkasStore and renders it in plain three.js (structureRenderer). Rebuilds
// the 3D group when the model changes and re-tints on selection change; taps write back to the
// store. Opened as a focused overlay from the Biblioteka (Phase 3.3) or the /#karkas dev route —
// entirely parallel to the kitchen constructor, which it never touches.
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useKarkas, blockOfPart, type ZoneRow } from "./karkasStore";
import type { DivisionRule, JointProfile } from "../../../../engine/contracts/variables";
import type { PanelCutout as PanelCutoutT } from "../../../../engine/contracts/structure";
import { leafSections } from "../../../../engine/contracts/structure";
import type { Box3D, HandleType, LiftType, ApplianceKind, StructuralModel, PrimitiveShape } from "../../../../engine/contracts/structure";
import { lineNeighbours, extentAlong } from "../../../../engine/structure/operations.js";
import { useStore } from "../store";
import { useMoney } from "../useMoney";
import { buildBedFrame, buildBench, buildBookshelf, buildCarcassModel, buildChair, buildCoffeeTable, buildConsole, buildDemoModel, buildEmptyModel, buildLCornerModel, buildPedestal, buildStool, buildTable } from "../../../../engine/structure/demoModel.js";
import { exportModelToSWJ008, solveModelToParts, defaultJointProfile } from "../../../../engine/cnc.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { kromkaMetersByVariable } from "../../../../engine/structure/features.js";
import { buildBlockDrawing } from "./blockDrawing";
import { blockHoles } from "./blockHoles";
import { drawingSheetSvg, viewThumbSvg, panelThumbSvg } from "./drawingSvg";
import { buildStructureGroup, highlightBoard, highlightBlocks, recolorBoards, disposeStructureGroup, applyRenderMode, buildHoleMarkers, buildKromkaEdges, buildHandleGroup, buildApplianceGroup, buildRoomGroup, buildGhostProps, buildSectionHitboxes, buildGizmo, createDimLine, type DimLine, type RenderMode } from "./structureRenderer";
import { handleFittings } from "./handles";
import { applianceFittings, withApplianceCutouts } from "./appliances";
import { arDiagnostics, ArSessionError, detectArSupport, exportGlb, startArSession, type ArSession, type ArSupport } from "./karkasAr";
import { tagFacades, fadeFacades, hideFacades, applyMaterialsView } from "./karkasLayer";
import { sceneDimsMm, layoutBounds, leafSectionBoxes } from "./structureScene";
import { estimate, hardwareEstimate, applianceEstimate } from "./estimate";
import { BOARDS, EDGES, APPLIANCE, boardForRole, boardById, edgeVarById, hexToInt, partColorLookup, partFinishLookup, partTextureLookup, planThickness, selectionColors, projectMaterials, materialIdLookup, materialCategory, type MaterialPlan } from "./materials";
import "./moblo/moblo.css";

/**
 * PAPER_INK — text colour for every hardcoded-light surface in this editor (the spec/tree sheets, the
 * floating tool cards, popovers, dialogs). Those panels pin their background to paper tones, so they must
 * pin the ink too: without it the text inherits .mob-root's `--mob-ink`, which in DARK theme is
 * near-white — white text on a white card. Declared here, above every style constant that uses it.
 */
const PAPER_INK = "#1f2430";

/** The Moblo shell's tabs (U2). U2.1 wires «build»; the rest arrive in U2.4. */
type MobTab = "build" | "parts" | "drawing" | "ar";
const MOB_TABS: { id: MobTab; label: string }[] = [
  { id: "build", label: "Yig'ish" },
  { id: "parts", label: "Detallar" },
  { id: "drawing", label: "Chizma" },
  { id: "ar", label: "AR" },
];

/** M1.2 — the furniture template gallery: carcass starters + the M1.1 free-assembly library, grouped.
    Each `make` seeds a fresh model via setModel; default dims come from the engine builders (editable
    afterwards through the dimension bar, which reflows the template via the "table law"). */
type TemplateDef = { id: string; emoji: string; name: string; make: () => StructuralModel };
const TEMPLATE_GROUPS: { group: string; items: TemplateDef[] }[] = [
  { group: "Boshlash", items: [
    { id: "empty", emoji: "✦", name: "Bo'sh", make: () => buildEmptyModel() },
    { id: "cabinet", emoji: "🚪", name: "Shkaf", make: () => buildCarcassModel(600, 720, 560) },
    { id: "demo", emoji: "▦", name: "Namuna shkaf", make: () => buildDemoModel() },
    { id: "lcorner", emoji: "⌐", name: "L-burchak", make: () => buildLCornerModel() },
  ] },
  { group: "Stollar", items: [
    { id: "table", emoji: "🍽", name: "Stol", make: () => buildTable(1200, 750, 700) },
    { id: "coffee", emoji: "☕", name: "Jurnal stol", make: () => buildCoffeeTable() },
  ] },
  { group: "O'tirg'ich", items: [
    { id: "chair", emoji: "🪑", name: "Stul", make: () => buildChair() },
    { id: "stool", emoji: "🟫", name: "Taburetka", make: () => buildStool() },
    { id: "bench", emoji: "🛋", name: "Skameyka", make: () => buildBench() },
  ] },
  { group: "Saqlash", items: [
    { id: "console", emoji: "📺", name: "TV-tumba", make: () => buildConsole() },
    { id: "bookshelf", emoji: "📚", name: "Stellaj", make: () => buildBookshelf() },
    { id: "pedestal", emoji: "🗄", name: "Tumba", make: () => buildPedestal() },
  ] },
  { group: "Karavot", items: [
    { id: "bed", emoji: "🛏", name: "Karavot", make: () => buildBedFrame() },
  ] },
];

/** All PanelRole values the solver stamps → the decor names SWJ008 should carry, from the plan. */
function materialMap(plan: MaterialPlan): Record<string, string> {
  const roles = ["carcass_side", "carcass_top", "carcass_bottom", "carcass_back", "carcass_plinth", "carcass_worktop", "internal_shelf", "facade"];
  return Object.fromEntries(roles.map((r) => [r, boardForRole(plan, r)?.name ?? ""]));
}

interface RT {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  group: THREE.Group | null;
  grid: THREE.GridHelper; // U2.1b — Moblo floor grid (re-created on theme change)
  sectionGroup: THREE.Group | null; // U3.1 — tappable compartment hit-boxes (space/add mode)
  gizmoGroup: THREE.Group | null; // gizmos — axis move-arrows on the selected free board
  holeGroup: THREE.Group | null; // «Teshiklar» — drill-hole markers, toggled on/off
  kromkaGroup: THREE.Group | null; // Step 8.2 — coloured banded-edge lines, shown in Frame view
  handleGroup: THREE.Group | null; // Phase 1.3d — 3D handle meshes (bow bar / knob) on handled doors
  applianceGroup: THREE.Group | null; // Phase 3.b — 3D appliance meshes (oven / hob / sink / …)
  roomGroup: THREE.Group | null; // Phase 5.r1 — the room's wall backdrop (matte, non-interactive)
  ghostGroup: THREE.Group | null; // Step 9 — Application-view ghost props (boiler / clothes / …)
  // Live 3D dimension lines, built on drag-start and torn down on pointer-up. A list because a divider
  // drag needs TWO at once — the bay either side of it.
  dimLines: DimLine[];
  raf: number;
  labels: { w: HTMLDivElement; h: HTMLDivElement; d: HTMLDivElement } | null; // C5 dimension overlays
  aabb: THREE.Box3 | null;
  framedKey: string; // F3 — last camera-framing signature; lives on rt so a remount reframes fresh
}

/** U2.1b — the Moblo floor grid, coloured for the active theme. Re-created on theme change (GridHelper
 *  bakes its colours into vertex colours, so a swap reads cleaner than mutating them). */
function makeGrid(theme: "light" | "dark"): THREE.GridHelper {
  const [c1, c2] = theme === "dark" ? [0x51607a, 0x333c4b] : [0xb2bccb, 0xd6dde6];
  const g = new THREE.GridHelper(8, 32, c1, c2);
  const m = g.material as THREE.Material;
  m.transparent = true; m.opacity = theme === "dark" ? 0.42 : 0.6;
  return g;
}

/** Responsive breakpoint: `compact` covers phones + tablets in portrait (< 900px) — they get the swipe
 *  toolbar, full-screen panels and bigger tap targets; wider screens keep the full desktop layout. */
function useViewport(): { w: number; compact: boolean } {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { w, compact: w < 900 };
}

export function KarkasEditor({ onClose }: { onClose?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rt = useRef<RT | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // U2 — Moblo shell state: theme (light default, explicit dark toggle) + the active top-bar tab.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<MobTab>("build");
  const [toolsOpen, setToolsOpen] = useState(false); // mobile: the «⋯ ko'proq» slide-up sheet
  const [rpanel, setRpanel] = useState<"none" | "add" | "material">("none"); // U2.3 right panel
  // #3 — tap-a-dimension math keypad: an usta-friendly calculator (600+18, 1200/2…) that opens on tapping
  // a W/H/D chip on mobile, so no fiddly native keyboard. `mm` is always in mm; the pad handles cm display.
  const [keypad, setKeypad] = useState<{ label: string; value: number; units: "mm" | "cm"; onCommit: (mm: number) => void; min?: number; suffix?: string } | null>(null);
  const [swatchTarget, setSwatchTarget] = useState<SwatchTarget | null>(null); // M3.4 — open material swatch picker
  // AR — what this device can actually do (WebXR is Android-only in practice), plus the last failure so
  // a refused session tells the usta WHY instead of doing nothing.
  const [arSupport, setArSupport] = useState<ArSupport>("checking");
  const [arError, setArError] = useState<string | null>(null);
  const [arActive, setArActive] = useState(false);
  const [arNoFloor, setArNoFloor] = useState(false); // session granted, but without floor hit-test
  const [arDiag, setArDiag] = useState<string | null>(null); // device's own WebXR report, on failure
  const [arCopied, setArCopied] = useState(false);
  const arOverlayRef = useRef<HTMLDivElement | null>(null);
  const arSessionRef = useRef<ArSession | null>(null);
  // #4 — live measure readout while dragging a face to resize: the active dim + its current size (mm), shown
  // as a floating callout so the usta sees the measurement change in real time. Cleared on pointer-up.
  const [measure, setMeasure] = useState<{ dim: "w" | "h" | "d"; mm: number; move?: boolean; snapped?: boolean; rot?: boolean } | null>(null);
  const measureRef = useRef(setMeasure); // stable handle for the once-mounted pointer effect
  measureRef.current = setMeasure;
  // Commit a pending DimField edit before a control hides/unmounts the editor: blur the focused input so
  // its onBlur commit fires FIRST (synchronously). Mobile taps on the sheet's ✕ / ⋯ / FABs don't reliably
  // blur the numeric keyboard, which silently dropped an in-progress edit (e.g. «Yashik b.»). These close
  // actions never change the selection, so the blurred field still commits to the right part.
  const commitActiveEdit = () => { const el = document.activeElement as HTMLElement | null; if (el && el.tagName === "INPUT") el.blur(); };
  const scene = useKarkas((s) => s.scene);
  const selectedId = useKarkas((s) => s.selectedId);
  const tapPart = useKarkas((s) => s.tapPart);
  const setModel = useKarkas((s) => s.setModel);
  const add = useKarkas((s) => s.add);
  const addFreeBoard = useKarkas((s) => s.addFreeBoard);
  const addBlock = useKarkas((s) => s.addBlock);
  const selectedBlockIds = useKarkas((s) => s.selectedBlockIds);
  const groupSelectedBlocks = useKarkas((s) => s.groupSelectedBlocks);
  const groupAllBlocks = useKarkas((s) => s.groupAllBlocks);
  const ungroupSelectedBlocks = useKarkas((s) => s.ungroupSelectedBlocks);
  const setRunLength = useKarkas((s) => s.setRunLength);
  const setRunMemberRule = useKarkas((s) => s.setRunMemberRule);
  const snapRunToWall = useKarkas((s) => s.snapRunToWall);
  // 5.r2 — how many walls the room has (primitive number, React 18 rule) — drives the «Devorga» wall picker.
  const roomWallCount = useKarkas((s) => s.model.room?.walls.length ?? 0);
  const resizeFreeBoard = useKarkas((s) => s.resizeFreeBoard);
  const renameFreePart = useKarkas((s) => s.renameFreePart);
  const setFreeBoardShape = useKarkas((s) => s.setFreeBoardShape);
  const resizeFreeBoardTo = useKarkas((s) => s.resizeFreeBoardTo);
  const rotateFreeBoard = useKarkas((s) => s.rotateFreeBoard);
  const rotateBlockTo = useKarkas((s) => s.rotateBlockTo);
  const setPlinth = useKarkas((s) => s.setPlinth);
  const setWorktop = useKarkas((s) => s.setWorktop);
  const setBlockShell = useKarkas((s) => s.setBlockShell);
  const duplicateSelected = useKarkas((s) => s.duplicateSelected);
  const applyToAllIdentical = useKarkas((s) => s.applyToAllIdentical);
  const setFreeBoardMaterial = useKarkas((s) => s.setFreeBoardMaterial);
  const removeFreeBoard = useKarkas((s) => s.removeFreeBoard);
  const divide = useKarkas((s) => s.divide);
  const undo = useKarkas((s) => s.undo);
  const canUndo = useKarkas((s) => s.past.length > 0);
  const redo = useKarkas((s) => s.redo);
  const canRedo = useKarkas((s) => s.future.length > 0);
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
  // M3.2 — part id → surface finish (gloss/glass/metal/mirror), parallel to colorFn. Same lifecycle.
  const finishFn = useMemo(() => partFinishLookup(parts, plan), [parts, plan]);
  const finishRef = useRef(finishFn);
  finishRef.current = finishFn;
  // M3.3 — part id → procedural texture kind (wood/marble/leather/fabric), parallel to colorFn/finishFn.
  const textureFn = useMemo(() => partTextureLookup(parts, plan), [parts, plan]);
  const textureRef = useRef(textureFn);
  textureRef.current = textureFn;
  const selComp = useKarkas((s) => s.selectedComponent());
  // NB: selectedParts() returns a FRESH array each call, so subscribing to it directly (`useKarkas(s =>
  // s.selectedParts())`) makes zustand's snapshot change every render → an infinite re-render loop (blank
  // screen). Subscribe to the stable function ref + memoize the result on selectedId/parts instead.
  const selectedPartsFn = useKarkas((s) => s.selectedParts);
  const selParts = useMemo(() => selectedPartsFn(), [selectedPartsFn, selectedId, parts]);
  // Group of identical parts behind the selection. Same fresh-object hazard as selectedParts() above —
  // subscribe to the stable fn and memoize, never `useKarkas(s => s.selectedGroup())`.
  const selectedGroupFn = useKarkas((s) => s.selectedGroup);
  const selGroup = useMemo(() => selectedGroupFn(), [selectedGroupFn, selectedId, parts]);
  /** ≥2 identical parts exist AND at least one has been edited apart → «apply to all» is worth offering. */
  const canApplyToAll = !!selGroup && selGroup.size > 1 && !selGroup.united;
  // (3.3d) selectedParts() only covers instance parts (shelves/drawers/facades); a divider or a carcass
  // panel is a bare part whose id IS the selection — fall back to it so the readout shows their dims too.
  const selPart = useMemo(() => selParts[0] ?? parts.find((p) => p.id === selectedId) ?? null, [selParts, parts, selectedId]);
  // U3.3 — the selected FREE board (if any), so its own editor bar (resize / delete / …) can appear.
  const selFreeBoard = useMemo(() => {
    if (!selectedId || !selectedId.includes("__free_")) return null;
    const fid = selectedId.slice(selectedId.indexOf("__free_") + "__free_".length);
    return model.blocks[0]?.freeParts?.find((f) => f.id === fid) ?? null;
  }, [selectedId, model]);
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
        const box = blockOfPart(st.model, id)?.box; // B — the ACTIVE cabinet's box (arrow-key face nudge)
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
  const setEdgeKromka = useKarkas((s) => s.setEdgeKromka);
  // Step 7 — Joint profile (System-32 grid + cam). jointProfile() returns a fresh object → memo on model.
  const jointProfileFn = useKarkas((s) => s.jointProfile);
  const joint = useMemo(() => jointProfileFn(), [jointProfileFn, model]);
  // Phase 6.2 — workshop (factory) profile: store actions + primitive per-role thickness overrides (mm; 0 =
  // the decor default). Selectors return primitives (never a fresh object — the React 18 useSyncExternalStore rule).
  const setRoleThickness = useKarkas((s) => s.setRoleThickness);
  const saveWorkshopDefault = useKarkas((s) => s.saveWorkshopDefault);
  const applyWorkshopDefault = useKarkas((s) => s.applyWorkshopDefault);
  const workshopSummaryFn = useKarkas((s) => s.workshopSummary);
  const thkCarcass = useKarkas((s) => (s.thickness.carcass ? Math.round(s.thickness.carcass / 10) : 0));
  const thkBack = useKarkas((s) => (s.thickness.back ? Math.round(s.thickness.back / 10) : 0));
  const thkShelf = useKarkas((s) => (s.thickness.shelf ? Math.round(s.thickness.shelf / 10) : 0));
  const thkFacade = useKarkas((s) => (s.thickness.facade ? Math.round(s.thickness.facade / 10) : 0));
  const thkWorktop = useKarkas((s) => (s.thickness.worktop ? Math.round(s.thickness.worktop / 10) : 0));
  const setJointProfile = useKarkas((s) => s.setJointProfile);
  // Only ONE tool/panel is open at a time (mobile fix): a single active-panel state, toggled per button,
  // replaces the old independent booleans so panels never stack/overlap.
  const { compact } = useViewport();
  // On compact screens a floating panel becomes a near-full-screen sheet (never overlaps the 3D / another
  // panel); a big ✕ closes it. Spread AFTER the panel's desktop style to override its corner + width.
  // Mobile: float these panels as a CONTENT-HEIGHT card just ABOVE the bottom bar (not a full-height box),
  // so a short list (materials legend / joints / hole / app) is only as tall as its content, Moblo-style.
  const compactSheet: CSSProperties = compact ? { left: 8, right: 8, bottom: 122, top: "auto", width: "auto", maxWidth: "none", maxHeight: "56vh", borderRadius: 16, overflowY: "auto", zIndex: 80 } : {};
  const [activePanel, setActivePanel] = useState<null | "divide" | "corners" | "cutout" | "kromka" | "materials" | "app" | "joints" | "workshop" | "tree" | "spec">(null);
  const togglePanel = (p: NonNullable<typeof activePanel>) => setActivePanel((cur) => (cur === p ? null : p));
  const showDivide = activePanel === "divide";
  const showCorners = activePanel === "corners";
  const showCutout = activePanel === "cutout";
  const showKromka = activePanel === "kromka";
  const showMaterials = activePanel === "materials";
  const appView = activePanel === "app";
  const showJoints = activePanel === "joints";
  const showWorkshop = activePanel === "workshop"; // Phase 6.2 — the factory profile panel
  const [wsSaved, setWsSaved] = useState(0); // Phase 6.2 — bump on save (forces the summary to refresh + a ✓)
  const showTree = activePanel === "tree";
  const showSpec = activePanel === "spec";
  const jointFindingsFn = useKarkas((s) => s.jointFindings);
  const jointFinds = useMemo(() => (showJoints ? jointFindingsFn() : []), [jointFindingsFn, model, showJoints]);
  const exportOverride = useKarkas((s) => s.exportOverride);
  const setExportOverride = useKarkas((s) => s.setExportOverride);
  const selectedHole = useKarkas((s) => s.selectedHole);
  const selectHole = useKarkas((s) => s.selectHole);
  const setHoleOverride = useKarkas((s) => s.setHoleOverride);
  const clearHoleOverride = useKarkas((s) => s.clearHoleOverride);
  // Step 8 — progressive-zoom dimension labels: each leaf section's height (level 1) + width (level 2),
  // in world coords (same centering as the boards). Overall W/H/D stays the 3 fixed DOM labels (level 0).
  const dimLabels = useMemo(() => {
    const out: { text: string; wx: number; wy: number; wz: number; level: 1 | 2 }[] = [];
    if (!model.blocks.length) return out;
    const bd = layoutBounds(solveLayout(model, planThickness(plan)));
    const WX = (v: number) => (v - bd.cx) / 10000, WY = (v: number) => (v - bd.minY) / 10000, WZ = (v: number) => (v - bd.cz) / 10000;
    // B — every cabinet's leaf-section labels, offset by that block's world position (block.box) so the
    // 2nd cabinet's section dims land in place, not stacked over block-0.
    for (const b of model.blocks) for (const z of b.zones) for (const s of leafSections(z.root)) {
      const zf = b.box.z + s.box.z + s.box.d; // front face
      out.push({ text: `${Math.round(s.box.h / 10)}`, wx: WX(b.box.x + s.box.x), wy: WY(b.box.y + s.box.y + s.box.h / 2), wz: WZ(zf), level: 1 });
      out.push({ text: `${Math.round(s.box.w / 10)}`, wx: WX(b.box.x + s.box.x + s.box.w / 2), wy: WY(b.box.y + s.box.y), wz: WZ(zf), level: 2 });
    }
    return out;
  }, [model, plan]);
  const [dimScreen, setDimScreen] = useState<{ text: string; x: number; y: number; vis: boolean }[]>([]);
  // Step 9 — Application view: tag spaces + show ghost contents (esp. the wall boiler). (appView derived above)
  const activePurposeFn = useKarkas((s) => s.activePurpose);
  const activePurpose = useMemo(() => activePurposeFn(), [activePurposeFn, model, targetId]);
  const setPurpose = useKarkas((s) => s.setPurpose);
  const boilerFindingsFn = useKarkas((s) => s.boilerFindings);
  const boilerFinds = useMemo(() => boilerFindingsFn(), [boilerFindingsFn, model]);
  const ghostItems = useMemo(() => {
    const out: { purpose: string; cx: number; cy: number; cz: number; w: number; h: number; d: number }[] = [];
    if (!model.blocks.length) return out;
    const bd = layoutBounds(solveLayout(model, planThickness(plan)));
    // B — ghost contents for every cabinet's purpose-tagged sections, offset by the block's world position.
    for (const b of model.blocks) for (const z of b.zones) for (const s of leafSections(z.root)) {
      if (!s.purpose || s.purpose === "structural") continue;
      out.push({ purpose: s.purpose, cx: (b.box.x + s.box.x + s.box.w / 2 - bd.cx) / 10000, cy: (b.box.y + s.box.y + s.box.h / 2 - bd.minY) / 10000, cz: (b.box.z + s.box.z + s.box.d / 2 - bd.cz) / 10000, w: s.box.w / 10000, h: s.box.h / 10000, d: s.box.d / 10000 });
    }
    return out;
  }, [model, plan]);
  const setTarget = useKarkas((s) => s.setTarget);
  const activeTarget = targetId && sections.some((x) => x.id === targetId) ? targetId : sections[0]?.id;
  const toggleLoadBearing = useKarkas((s) => s.toggleLoadBearing);
  const remove = useKarkas((s) => s.remove);
  const nestDrawerInSelected = useKarkas((s) => s.nestDrawerInSelected);
  const setDrawerHeight = useKarkas((s) => s.setDrawerHeight);
  const drawerHeightMm = useKarkas((s) => s.selectedDrawerHeight());
  /**
   * What the mobile property bar shows for the current selection, or null when it should not appear.
   * Hoisted out of the JSX because the zone pill-row has to move up to make room for it — the two sat
   * at the same height and overlapped.
   */
  const mobileProps = useMemo(() => {
    if (!(tab === "build" && compact && !toolsOpen && selectedId && !selFreeBoard && rpanel === "none")) return null;
    if (selComp) return { comp: selComp, blk: null };
    const isCarcass = (parts.find((p) => p.id === selectedId)?.role ?? "").startsWith("carcass") && !selectedId.includes("__div_");
    const blk = isCarcass ? blockOfPart(model, selectedId) : null;
    return blk ? { comp: null, blk } : null;
  }, [tab, compact, toolsOpen, selectedId, selFreeBoard, rpanel, selComp, parts, model]);
  const setThickness = useKarkas((s) => s.setThickness);
  const setAngle = useKarkas((s) => s.setAngle);
  const shelfMaxAngle = useKarkas((s) => s.selectedShelfMaxAngle());
  const setLip = useKarkas((s) => s.setLip);
  const setMaterial = useKarkas((s) => s.setMaterial);
  const setPlanMaterialTop = useKarkas((s) => s.setPlanMaterial);
  const setHinge = useKarkas((s) => s.setHinge);
  const setHandle = useKarkas((s) => s.setHandle);
  const setLift = useKarkas((s) => s.setLift);
  const setDividers = useKarkas((s) => s.setDividers);
  const setAppliance = useKarkas((s) => s.setAppliance);
  const toggleLCorner = useKarkas((s) => s.toggleLCorner);
  const setLegB = useKarkas((s) => s.setLegB);
  const setLCornerHand = useKarkas((s) => s.setLCornerHand);
  const setRoom = useKarkas((s) => s.setRoom);
  const clearRoom = useKarkas((s) => s.clearRoom);
  const fitCorner = useKarkas((s) => s.fitCorner);
  // 5.r1 — PRIMITIVE room selectors (React 18 rule): the preset (none/I/L/U) + wall lengths as a comma string.
  const roomPreset = useKarkas((s) => { const n = s.model.room?.walls.length ?? 0; return n === 0 ? "none" : n === 1 ? "I" : n === 2 ? "L" : "U"; });
  const roomLens = useKarkas((s) => (s.model.room?.walls ?? []).map((w) => Math.round(w.length_mm10 / 10)).join(","));
  // 4.a — PRIMITIVE selectors (never a fresh object — the React 18 useSyncExternalStore rule): is the
  // selected block an L-corner, and its return-leg dims (mm).
  const isLCorner = useKarkas((s) => !!blockOfPart(s.model, s.selectedId)?.footprint);
  const legBLen = useKarkas((s) => { const f = blockOfPart(s.model, s.selectedId)?.footprint; return f ? Math.round(f.legB.length_mm10 / 10) : 0; });
  const legBDepth = useKarkas((s) => { const f = blockOfPart(s.model, s.selectedId)?.footprint; return f ? Math.round(f.legB.depth_mm10 / 10) : 0; });
  // 4 polish — which way the L turns (primitive string, React 18 rule). Absent footprint → "left".
  const lHand = useKarkas((s) => blockOfPart(s.model, s.selectedId)?.footprint?.hand ?? "left");
  const combineSelectedDoor = useKarkas((s) => s.combineSelectedDoor);
  const splitSelectedDoor = useKarkas((s) => s.splitSelectedDoor);
  // Select PRIMITIVES (booleans), not a fresh object — a new-object selector trips React 18's
  // useSyncExternalStore "getSnapshot should be cached" guard and bails the whole property bar out of render.
  const canCombineDoor = useKarkas((s) => s.selectedDoorCombine()?.canCombine ?? false);
  const canSplitDoor = useKarkas((s) => s.selectedDoorCombine()?.canSplit ?? false);
  const exportProject = useKarkas((s) => s.exportProject);
  const importProject = useKarkas((s) => s.importProject);
  const resize = useKarkas((s) => s.resize);
  const divideBy = useKarkas((s) => s.divideBy);
  const addShelves = useKarkas((s) => s.addShelves);
  const [chainCorners, setChainCorners] = useState(true);
  const [activeKromka, setActiveKromka] = useState<string | null>(EDGES[0]?.id ?? null); // the K-pill in hand
  const [edgeBalls, setEdgeBalls] = useState<{ i: number; x: number; y: number; k: string | null; vis: boolean }[]>([]);
  const [units, setUnits] = useState<"mm" | "cm">("mm"); // Step 4b — length-field display unit (mm ⇄ cm)
  const [chips, setChips] = useState<{ i: number; x: number; y: number; r: number; vis: boolean }[]>([]); // 3D corner chips
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
  // Step 8 — No-facade view: fully hide the fronts (separate from «Ichini ko'rish» fade).
  const [noFacade, setNoFacade] = useState(false);
  const noFacadeRef = useRef(noFacade);
  noFacadeRef.current = noFacade;
  // apply the current Visual Style + fade state to a group (fade is moot in wireframe — faces vanish)
  const applyVisuals = (group: THREE.Group): void => {
    applyRenderMode(group, modeRef.current);
    if (modeRef.current !== "wireframe") fadeFacades(group, insideRef.current);
    hideFacades(group, noFacadeRef.current); // Step 8 — No-facade wins over fade (fully hidden)
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
  const [menu, setMenu] = useState<null | "polka" | "eshik" | "more" | "mode" | "sel" | "tools">(null);
  const [showTemplates, setShowTemplates] = useState(false); // M1.2 — template gallery overlay
  // Step 3.2 (v4 §5) — the two permanent selection modes: ◇ Part-select (edit) / ▢ Space-select (add).
  const [selMode, setSelMode] = useState<"part" | "space" | "block">("part");
  // U3.1 — the mount-effect raycast is a stable closure, so it reads the live select-mode via this ref.
  const selModeRef = useRef(selMode);
  useEffect(() => { selModeRef.current = selMode; }, [selMode]);
  // U2.4 — the RAF loop reads the active tab via this ref, to hide the 3D dim labels off the «Yig'ish» tab.
  const tabRef = useRef(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);
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
    // Step 7c — export gate: joint rule breaks block the cut file until the master explicitly overrides.
    const finds = useKarkas.getState().jointFindings();
    if (finds.length > 0 && !useKarkas.getState().exportOverride) {
      alert(`Eksport to'xtatildi — ${finds.length} ta birikma qoidasi buzilgan:\n• ${finds.slice(0, 4).map((f) => f.message_ru).join("\n• ")}${finds.length > 4 ? `\n• …+${finds.length - 4}` : ""}\n\n«⚙ Birikma» panelida «Usta override»ni belgilang yoki teshiklarni to'g'rilang.`);
      setActivePanel("joints");
      return;
    }
    try {
      const text = exportModelToSWJ008(withApplianceCutouts(model), {}, materialMap(plan), Object.fromEntries(BOARDS.map((b) => [b.id, b.name]))); // 3.c — mill the hob/sink worktop cutout
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
  // Moblo — the technical drawing SVG, memoised so BOTH the inline Chizma-tab preview AND the «open»
  // (print) window render the same sheet. Rebuilds only when the model / material plan changes.
  const drawingSvg = useMemo(() => {
    try {
      const drawing = buildBlockDrawing(solveLayout(withApplianceCutouts(model), planThickness(plan)), solveModelToParts(withApplianceCutouts(model), planThickness(plan)));
      const boardName = (id: string) => BOARDS.find((b) => b.id === id)?.name ?? "—";
      const carcass = boardName(plan.carcass);
      const edge = EDGES.find((e) => e.id === plan.edge)?.name ?? "—";
      return drawingSheetSvg(drawing, {
        firm: "MEBELCHI",
        name: "Karkas blok",
        date: new Date().toISOString().slice(0, 10),
        materials: carcass,
        legend: [`Korpus: ${carcass}`, `Fasad: ${boardName(plan.facade)}`, `Orqa: ${boardName(plan.back)}`, `Kromka: ${edge}`],
      });
    } catch { return ""; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, plan]);
  const printDrawing = () => {
    if (!drawingSvg) { alert("Chizma tayyorlanmadi."); return; }
    const w = window.open("", "_blank");
    if (!w) { alert("Chizma oynasi ochilmadi — popup ruxsatini bering."); return; }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Chizma — Karkas blok</title><style>` +
      "@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0}svg{display:block;width:100vw;height:100vh}" +
      "</style></head><body>" + drawingSvg +
      "<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>",
    );
    w.document.close();
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // M3.1 — a photographic pipeline. NeutralToneMapping (Khronos PBR Neutral) is built for product/furniture
    // viewers: it tames highlights (metal/gloss no longer blow out) WITHOUT the colour wash-out ACES gives, so
    // the wood decors keep their warmth. Boards stay matte via a low envMapIntensity (structureRenderer).
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.8;
    // M3.1 — soft contact shadows ground the furniture. One 1024 shadow map from the key light only (the
    // scene is a handful of boxes, so this stays cheap on mobile); PCFSoft for feathered edges.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 480);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene3 = new THREE.Scene();
    // M3.1 — a PMREM room environment: generated once at mount, it gives every PBR surface soft, believable
    // indoor reflections (the foundation the M3.2 finishes — gloss / metal / glass / mirror — reflect into).
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene3.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(42, (mount.clientWidth || 320) / (mount.clientHeight || 480), 0.02, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 0.4; controls.maxDistance = 12;
    scene3.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 0.55)); // M3.1 — lowered from 1.0: the envMap now carries part of the ambient fill
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2, 4, 3);
    key.castShadow = true; // M3.1 — only the key light casts, so the cost is a single shadow pass
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1; key.shadow.camera.far = 24;
    key.shadow.camera.left = -3; key.shadow.camera.right = 3; key.shadow.camera.top = 3.5; key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; // kill shadow acne on the thin boards
    scene3.add(key);
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
    const grid = makeGrid("light"); scene3.add(grid); // U2.1b — Moblo floor grid (theme-swapped by the effect below)
    // M3.1 — an invisible shadow-catcher at the floor (model base sits at world y=0, see WY = v − minY). A
    // ShadowMaterial shows ONLY the shadow, so the furniture reads as standing on the ground, not floating.
    const shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
    shadowGround.rotation.x = -Math.PI / 2; shadowGround.position.y = -0.002; shadowGround.receiveShadow = true;
    scene3.add(shadowGround);
    rt.current = { renderer, scene: scene3, camera, controls, group: null, grid, sectionGroup: null, gizmoGroup: null, holeGroup: null, kromkaGroup: null, handleGroup: null, applianceGroup: null, roomGroup: null, ghostGroup: null, dimLines: [], raf: 0, labels, aabb: null, framedKey: "" };
    // dev-only: expose the three runtime so local tooling (puppeteer) can assert on the SCENE GRAPH — a
    // 3D overlay like the dimension line has no DOM to query. Stripped from prod builds, like __karkas.
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      (globalThis as unknown as { __karkas3d: unknown }).__karkas3d = rt.current;
    }

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
      | { kind: "freemove"; fpId: string; plane: THREE.Plane; last: THREE.Vector3; first: boolean }
      // gizmo drags are ABSOLUTE (startPos + pointer travel → ideal position) so a magnetic snap can pull
      // the object without the incremental `last` accumulator drifting away from the pointer.
      | { kind: "gizmomove"; fpId: string; axis: "x" | "y" | "z"; plane: THREE.Plane; start: number; startPos: number; first: boolean }
      | { kind: "gizmoresize"; fpId: string; axis: "x" | "y" | "z"; plane: THREE.Plane; start: number; startSize: number; first: boolean }
      | { kind: "blockmove"; blockId: string; axis: "x" | "y" | "z"; plane: THREE.Plane; start: number; startPos: number; first: boolean }
      | { kind: "shelfmove"; instId: string; axis: "x" | "y" | "z"; plane: THREE.Plane; start: number; startPos: number; first: boolean }
      | { kind: "gizmorotate"; target: "free" | "block"; id: string; centre: THREE.Vector3; plane: THREE.Plane; startAng: number; startDeg: number; first: boolean }
      | null = null;
    // ── live 3D dimension line ──────────────────────────────────────────────────────────────────────
    // Where the figure hangs: alongside the axis being measured, pushed just OUTSIDE the box (front and
    // below/right), so the shaft never disappears inside the panel it is measuring.
    const dimEnds = (
      c: readonly [number, number, number],
      s: readonly [number, number, number],
      axis: "x" | "y" | "z",
    ): [[number, number, number], [number, number, number]] => {
      const o = 0.035; // clearance from the surface (m)
      const [cx, cy, cz] = c, [sx, sy, sz] = s;
      if (axis === "x") {
        const y = cy - sy / 2 - o, z = cz + sz / 2 + o;
        return [[cx - sx / 2, y, z], [cx + sx / 2, y, z]];
      }
      if (axis === "y") {
        const x = cx + sx / 2 + o, z = cz + sz / 2 + o;
        return [[x, cy - sy / 2, z], [x, cy + sy / 2, z]];
      }
      const x = cx + sx / 2 + o, y = cy - sy / 2 - o;
      return [[x, y, cz - sz / 2], [x, y, cz + sz / 2]];
    };
    const showDim = (
      slot: number,
      centre: readonly [number, number, number],
      size: readonly [number, number, number],
      axis: "x" | "y" | "z",
      label: string,
    ): void => {
      const r = rt.current;
      if (!r) return;
      let dl = r.dimLines[slot];
      if (!dl) { dl = createDimLine(); r.dimLines[slot] = dl; r.scene.add(dl.group); }
      const [from, to] = dimEnds(centre, size, axis);
      dl.update(from, to, label);
    };
    const hideDim = (): void => {
      const r = rt.current;
      if (!r) return;
      for (const dl of r.dimLines) { r.scene.remove(dl.group); dl.dispose(); }
      r.dimLines = [];
    };
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
      const st = useKarkas.getState();
      // gizmos — a move-arrow of the selected free board takes priority: start an axis-CONSTRAINED drag
      // (the arrows sit on top, so this catches before the board hit-test below).
      const gz = rt.current?.gizmoGroup;
      const gTarget = gz?.userData.target as { kind: "free" | "block" | "shelf"; id: string } | undefined;
      if (gz && gTarget) {
        // Pick order: RESIZE HANDLE → ROTATE RING → arrow. The ring needs priority over the ARROWS,
        // because the hoop necessarily crosses the long +X / +Z shafts and the shaft would otherwise
        // always win. It must NOT outrank the resize handles: the hoop is a closed loop that a ray aimed
        // square at a handle also pierces (near side or far), and letting that win meant grabbing the +X
        // handle started a ROTATE instead of a resize. The handles are the smallest, most deliberate
        // targets on the gizmo, so they outrank everything.
        const gHits = raycaster.intersectObjects(gz.children, false);
        const gHit = gHits.find((h) => h.object.userData.resizeAxis)
          ?? gHits.find((h) => h.object.userData.rotateAxis === "y")
          ?? gHits[0];
        const rAxis = gHit?.object.userData.resizeAxis as "x" | "y" | "z" | undefined; // handle cube → resize
        const mAxis = gHit?.object.userData.gizmoAxis as "x" | "y" | "z" | undefined; // arrow → move
        // ring → rotate about the vertical axis: track the pointer's bearing around the gizmo centre
        // A shelf never rotates; a cabinet only does so in Blok mode (the ring is not built otherwise),
        // which is what stopped ordinary panel editing from spinning the whole cabinet by accident.
        if (gHit && gHit.object.userData.rotateAxis === "y" && gTarget.kind !== "shelf") {
          const centre = gz.position.clone();
          const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -centre.y); // horizontal plane at the object
          const pt = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(plane, pt)) {
            const startDeg = gTarget.kind === "block"
              ? st.model.blocks.find((bb) => bb.id === gTarget.id)?.rotY_deg ?? 0
              : blockOfPart(st.model, st.selectedId)?.freeParts?.find((f) => f.id === gTarget.id)?.rotY_deg ?? 0;
            drag = {
              kind: "gizmorotate", target: gTarget.kind === "block" ? "block" : "free", id: gTarget.id, centre, plane,
              startAng: Math.atan2(pt.x - centre.x, pt.z - centre.z), startDeg, first: true,
            };
            controls.enabled = false;
            return;
          }
        }
        const axis = rAxis ?? mAxis;
        if (gHit && axis) {
          const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
          const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, gHit.point);
          const start = alongAxis(e, axis, plane);
          const lo = (bx: { x: number; y: number; z: number }) => (axis === "x" ? bx.x : axis === "y" ? bx.y : bx.z);
          if (start != null) {
            if (gTarget.kind === "shelf") {
              // a shelf slides inside its own bay — the anchor is block-local, so the drag works in the
              // same mm10 space as the block box the other gizmos use
              const found = st.model.blocks.flatMap((bb) => bb.instances.map((i) => ({ bb, i }))).find((x) => x.i.id === gTarget.id);
              if (found) drag = { kind: "shelfmove", instId: gTarget.id, axis, plane, start, startPos: found.i.anchor[axis], first: true };
            } else if (gTarget.kind === "block") {
              const blk = st.model.blocks.find((bb) => bb.id === gTarget.id);
              if (blk) drag = { kind: "blockmove", blockId: gTarget.id, axis, plane, start, startPos: lo(blk.box), first: true };
            } else {
              const fp = blockOfPart(st.model, st.selectedId)?.freeParts?.find((f) => f.id === gTarget.id);
              if (fp && rAxis) {
                const startSize = rAxis === "x" ? fp.box.w : rAxis === "y" ? fp.box.h : fp.box.d;
                drag = { kind: "gizmoresize", fpId: gTarget.id, axis: rAxis, plane, start, startSize, first: true };
              } else if (fp) {
                drag = { kind: "gizmomove", fpId: gTarget.id, axis, plane, start, startPos: lo(fp.box), first: true };
              }
            }
            if (drag) { controls.enabled = false; return; }
          }
        }
      }
      const hit = raycaster.intersectObjects(g.children, false)[0];
      const pid = hit?.object.userData.partId as string | undefined;
      // dragging is armed only on the ALREADY-selected part under the pointer (v4 §5 drag = move / resize)
      if (hit && pid && pid === st.selectedId) {
        const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, hit.point);
        if (pid.includes("__free_")) {
          // (U3.2b) a free board → drag it anywhere in the camera-facing plane (Moblo free-assembly)
          drag = { kind: "freemove", fpId: pid.slice(pid.indexOf("__free_") + "__free_".length), plane, last: hit.point.clone(), first: true };
          controls.enabled = false;
        } else if (pid.includes("__div_")) {
          // (3.3b) a divider → move the dividing line, rule-aware reflow of the two zones it splits
          const lineId = pid.slice(pid.indexOf("__div_") + "__div_".length);
          const line = blockOfPart(st.model, pid)?.lines.find((l) => l.id === lineId); // B — dragged divider's own block
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
          const box = blockOfPart(st.model, pid)?.box; // B — resize the dragged cabinet's face, not block-0
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
      // (U3.2b) free board — move it in the camera plane; snap to 5 mm (Shift = 1 mm), one undo step per drag
      if (drag.kind === "freemove") {
        raycaster.setFromCamera(ndc(e), camera);
        const pt = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(drag.plane, pt)) return;
        const stepF = e.shiftKey ? 10 : 50; // mm10
        const sx = Math.round(Math.round((pt.x - drag.last.x) * 10000) / stepF) * stepF;
        const sy = Math.round(Math.round((pt.y - drag.last.y) * 10000) / stepF) * stepF;
        const sz = Math.round(Math.round((pt.z - drag.last.z) * 10000) / stepF) * stepF;
        if (sx || sy || sz) {
          useKarkas.getState().moveFreePart(drag.fpId, { x: sx, y: sy, z: sz }, drag.first);
          drag.first = false;
          drag.last.set(drag.last.x + sx / 10000, drag.last.y + sy / 10000, drag.last.z + sz / 10000);
        }
        return;
      }
      // gizmos — ROTATE: the board follows the pointer's bearing around the ring, clicking to 15° steps
      // (Shift = free 1°). Render-only, so the cut list never changes.
      if (drag.kind === "gizmorotate") {
        raycaster.setFromCamera(ndc(e), camera);
        const pt = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(drag.plane, pt)) return;
        const ang = Math.atan2(pt.x - drag.centre.x, pt.z - drag.centre.z);
        const step = e.shiftKey ? 1 : 15; // degrees
        const raw = drag.startDeg - ((ang - drag.startAng) * 180) / Math.PI; // −: screen-CW reads as CW
        const deg = Math.round(raw / step) * step;
        const st2 = useKarkas.getState();
        if (drag.target === "block") st2.rotateBlockTo(drag.id, deg, drag.first);
        else st2.rotateFreePartTo(drag.id, deg, drag.first);
        drag.first = false;
        measureRef.current({ dim: "h", mm: ((deg % 360) + 360) % 360, rot: true });
        return;
      }
      // gizmos — axis-CONSTRAINED move with a live MAGNETIC snap: the board clicks flush to a nearby
      // compartment face while you pull it (not only when you let go).
      if (drag.kind === "gizmomove") {
        const cur = alongAxis(e, drag.axis, drag.plane);
        if (cur == null) return;
        const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
        const ideal = Math.round((drag.startPos + Math.round((cur - drag.start) * 10000)) / step) * step;
        const res = useKarkas.getState().moveFreePartTo(drag.fpId, drag.axis, ideal, drag.first);
        drag.first = false;
        measureRef.current({ dim: drag.axis === "x" ? "w" : drag.axis === "y" ? "h" : "d", mm: Math.round((res.pos - drag.startPos) / 10), move: true, snapped: res.snapped });
        return;
      }
      // gizmos — RESIZE: pull a face handle along its axis; the board grows/shrinks that dimension only
      // (its origin stays, so it grows the way you pull). Live frames don't stack undo entries.
      if (drag.kind === "gizmoresize") {
        const cur = alongAxis(e, drag.axis, drag.plane);
        if (cur == null) return;
        const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
        const next = Math.max(30, Math.round((drag.startSize + Math.round((cur - drag.start) * 10000)) / step) * step);
        const dim = drag.axis === "x" ? "w" : drag.axis === "y" ? "h" : "d";
        // read these out BEFORE the store calls: `drag` is a mutable capture, so TS drops the narrowing
        // the moment any function that could reassign it runs.
        const { fpId, axis } = drag;
        // M1.3b — snap the growing face to a nearby part; `res.size` is the applied (possibly snapped) mm.
        const res = resizeFreeBoardTo(fpId, dim, Math.round(next / 10), drag.first);
        drag.first = false;
        measureRef.current({ dim, mm: res.size, snapped: res.snapped }); // SIZE readout + snap flag
        // the board has just been re-solved, so read its NEW box rather than extrapolating the drag
        const bd = useKarkas.getState().scene.boards.find((x) => x.id.endsWith(`__free_${fpId}`));
        if (bd) showDim(0, bd.pos, bd.size, axis, `${res.size} mm`);
        return;
      }
      // gizmos — slide a SHELF up or down inside its bay (the engine clamps it to the section, so it can
      // never be dragged out through the carcass).
      if (drag.kind === "shelfmove") {
        const cur = alongAxis(e, drag.axis, drag.plane);
        if (cur == null) return;
        const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
        const ideal = Math.round((drag.startPos + Math.round((cur - drag.start) * 10000)) / step) * step;
        const at = useKarkas.getState().moveInstanceTo(drag.instId, drag.axis, ideal, drag.first);
        drag.first = false;
        measureRef.current({ dim: drag.axis === "x" ? "w" : drag.axis === "y" ? "h" : "d", mm: Math.round(at / 10), move: true });
        return;
      }
      // gizmos — move the WHOLE cabinet along one axis, clicking FLUSH to a neighbouring cabinet (or the
      // floor on Y) — how a kitchen run gets laid out by hand.
      if (drag.kind === "blockmove") {
        const cur = alongAxis(e, drag.axis, drag.plane);
        if (cur == null) return;
        const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
        const ideal = Math.round((drag.startPos + Math.round((cur - drag.start) * 10000)) / step) * step;
        const res = useKarkas.getState().moveBlockTo(drag.blockId, drag.axis, ideal, drag.first);
        drag.first = false;
        measureRef.current({ dim: drag.axis === "x" ? "w" : drag.axis === "y" ? "h" : "d", mm: Math.round((res.pos - drag.startPos) / 10), move: true, snapped: res.snapped });
        return;
      }
      const cur = alongAxis(e, drag.axis, drag.plane);
      if (cur == null) return;
      // (3.3d) magnetic snap — quantise to a 5 mm grid so drags land on round sizes; hold Shift → fine 1 mm
      const step = e.shiftKey ? 10 : 50; // mm10 (1 mm / 5 mm)
      if (drag.kind === "line") {
        const raw = Math.round((cur - drag.last) * 10000);
        const snapped = Math.round(raw / step) * step; // emit whole grid steps → the divider clicks to 5 mm
        if (snapped !== 0) { useKarkas.getState().moveLine(drag.lineId, snapped, "line", drag.first); drag.first = false; drag.last += snapped / 10000; }
        // Live measure for a divider: the number that matters is the BAY EITHER SIDE, not the line's own
        // coordinate — so draw a dimension figure across each neighbouring compartment.
        const n = lineNeighbours(useKarkas.getState().model, drag.lineId);
        if (n) {
          const M = (v: number) => v / 10000; // mm10 → metres
          const bx = (b: Box3D): [[number, number, number], [number, number, number]] => [
            [M(b.x + b.w / 2), M(b.y + b.h / 2), M(b.z + b.d / 2)],
            [M(b.w), M(b.h), M(b.d)],
          ];
          [n.before, n.after].forEach((sec, i) => {
            const [c, s2] = bx(sec.box);
            showDim(i, c, s2, n.axis, `${Math.round(extentAlong(sec.box, n.axis) / 10)} mm`);
          });
          measureRef.current(null); // the two figures ARE the readout; a pill would repeat them
        }
      } else {
        // absolute extent = start extent + outward drag distance (world m → mm10 ×10000), min-side inverted
        const raw = drag.startExtent + drag.sign * Math.round((cur - drag.startWorld) * 10000);
        const nextExtent = Math.round(raw / step) * step; // snap the absolute extent to the grid
        if (Math.abs(nextExtent - drag.startExtent) >= 1) { useKarkas.getState().resizeDrag(drag.dim, nextExtent, drag.first); drag.first = false; }
        const mm = Math.round(nextExtent / 10);
        measureRef.current({ dim: drag.dim, mm }); // #4 — live measure readout
        // …and the same figure drawn ON the cabinet, read off the block box the resize just produced
        const stt = useKarkas.getState();
        const blk = blockOfPart(stt.model, stt.selectedId);
        if (blk) {
          const M = (v: number) => v / 10000; // mm10 → metres (the scale layoutToScene uses)
          showDim(
            0,
            [M(blk.box.x + blk.box.w / 2), M(blk.box.y + blk.box.h / 2), M(blk.box.z + blk.box.d / 2)],
            [M(blk.box.w), M(blk.box.h), M(blk.box.d)],
            drag.axis,
            `${mm} mm`,
          );
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) { if (drag.kind === "freemove") useKarkas.getState().snapFreePart(drag.fpId); drag = null; controls.enabled = true; measureRef.current(null); hideDim(); return; } // finished a move / resize (free board snaps to a face)
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a camera orbit, not a tap
      raycaster.setFromCamera(ndc(e), camera);
      // Step 7c — a tap on a drill marker selects that individual hole (markers sit proud of the face)
      const hg = rt.current?.holeGroup;
      if (hg) {
        const hHit = raycaster.intersectObjects(hg.children, false)[0];
        const hole = hHit?.object.userData.hole as { partId: string; opId: string; fx: number; fy: number } | undefined;
        if (hole) { useKarkas.getState().selectHole(hole); return; }
      }
      // U3.1 — in «space» (add) mode a tap chooses the target COMPARTMENT (where the next add lands)
      if (selModeRef.current === "space" && rt.current?.sectionGroup) {
        const sHit = raycaster.intersectObjects(rt.current.sectionGroup.children, false)[0];
        const sid = sHit?.object.userData.sectionId as string | undefined;
        if (sid) { useKarkas.getState().setTarget(sid); return; }
      }
      // U4.2 — «Blok» mode: a tap picks/unpicks the WHOLE cabinet (block) for grouping, never a single
      // part. The block is the slice of the partId before its first `__` separator (`${blockId}__…`).
      if (selModeRef.current === "block") {
        const gb = rt.current?.group;
        const bHit = gb ? raycaster.intersectObjects(gb.children, false)[0] : undefined;
        const bpid = bHit?.object.userData.partId as string | undefined;
        if (bpid) { const sep = bpid.indexOf("__"); useKarkas.getState().toggleBlockSel(sep < 0 ? bpid : bpid.slice(0, sep)); }
        else setSelMode("part"); // tapped empty space → leave Blok mode (tap-away dismiss, like the ✕)
        return;
      }
      const g = rt.current?.group; if (!g) return;
      const hit = raycaster.intersectObjects(g.children, false)[0]; // faces only (not edge lines)
      // 3.d — appliances live in a separate group (no board part); raycast it too (recurse into the per-kind
      // sub-groups) and take the NEARER hit, so tapping an oven/hob selects its instance.
      const ag = rt.current?.applianceGroup;
      const aHit = ag ? raycaster.intersectObjects(ag.children, true)[0] : undefined;
      const pick = aHit && (!hit || aHit.distance < hit.distance) ? aHit : hit;
      useKarkas.getState().selectHole(null); // a panel tap clears any hole selection
      tapPart((pick?.object.userData.partId as string) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);

    const tmp = new THREE.Vector3();
    const positionLabels = () => {
      const r = rt.current;
      if (!r?.labels) return;
      // Off the «Yig'ish» tab the 3D stage is covered — hide the W/H/D dim labels so they don't linger.
      if (tabRef.current !== "build" || !r.aabb || r.aabb.isEmpty()) {
        r.labels.w.style.display = "none"; r.labels.h.style.display = "none"; r.labels.d.style.display = "none";
        return;
      }
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
      if (rt.current?.grid) { rt.current.grid.geometry.dispose(); (rt.current.grid.material as THREE.Material).dispose(); }
      if (rt.current?.sectionGroup) disposeStructureGroup(rt.current.sectionGroup);
      if (rt.current?.gizmoGroup) disposeStructureGroup(rt.current.gizmoGroup);
      for (const dl of rt.current?.dimLines ?? []) dl.dispose(); // a drag can be interrupted by an unmount
      if (rt.current?.group) disposeStructureGroup(rt.current.group);
      if (rt.current?.holeGroup) disposeStructureGroup(rt.current.holeGroup);
      if (rt.current?.kromkaGroup) disposeStructureGroup(rt.current.kromkaGroup);
      if (rt.current?.handleGroup) disposeStructureGroup(rt.current.handleGroup);
      if (rt.current?.applianceGroup) disposeStructureGroup(rt.current.applianceGroup);
      if (rt.current?.roomGroup) disposeStructureGroup(rt.current.roomGroup);
      if (rt.current?.ghostGroup) disposeStructureGroup(rt.current.ghostGroup);
      labels.w.remove(); labels.h.remove(); labels.d.remove();
      scene3.environment?.dispose(); // M3.1 — free the PMREM env texture (three won't auto-dispose it on unmount)
      shadowGround.geometry.dispose(); (shadowGround.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rt.current = null;
    };
  }, [tapPart]);

  // ── U2.1b — re-colour the floor grid when the theme changes (works in both light + dark) ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    r.scene.remove(r.grid);
    r.grid.geometry.dispose();
    (r.grid.material as THREE.Material).dispose();
    const g = makeGrid(theme);
    r.grid = g;
    r.scene.add(g);
  }, [theme]);

  // ── U3.1 — tap-to-place: in «space» (add) mode, drop invisible hit-boxes on every compartment and
  //    glow the active target; a tap on the 3D then chooses WHERE the next add lands. ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    if (r.sectionGroup) { r.scene.remove(r.sectionGroup); disposeStructureGroup(r.sectionGroup); r.sectionGroup = null; }
    const m = useKarkas.getState().model;
    if (selMode === "space" && rpanel === "add") {
      // tap-to-place: ALL leaf compartments are tappable; the active target glows.
      const boxes = leafSectionBoxes(m, solveLayout(m));
      r.sectionGroup = buildSectionHitboxes(boxes, activeTarget ?? null);
      r.scene.add(r.sectionGroup);
    } else if (sections.length > 1 && targetId && !selectedId && sections.some((x) => x.id === targetId)) {
      // «Qayerga» feedback — glow JUST the chosen compartment so the usta sees WHERE the next add lands.
      // Only after an EXPLICIT pick (targetId set by tapping a «N-bo'lim» pill) and NOT while editing a
      // selected part — so a fresh model / plain viewing / part-editing stays clean (was always-on before).
      const boxes = leafSectionBoxes(m, solveLayout(m)).filter((box) => box.id === targetId);
      if (boxes.length) { r.sectionGroup = buildSectionHitboxes(boxes, targetId); r.scene.add(r.sectionGroup); }
    }
    r.renderer.render(r.scene, r.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selMode, activeTarget, targetId, selectedId, rpanel, sections.length]);

  // ── gizmos — show axis move-arrows on the selected FREE board (a free part is the freely-movable Moblo
  //    primitive; carcass parts are rule-driven). The arrows are sized to the board and drag it along one axis. ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    if (r.gizmoGroup) { r.scene.remove(r.gizmoGroup); disposeStructureGroup(r.gizmoGroup); r.gizmoGroup = null; }
    const st = useKarkas.getState();
    if (selectedId && selectedId.includes("__free_")) {
      // a FREE board — move arrows + a resize handle per axis, sized to the board
      const bd = scene.boards.find((b) => b.id === selectedId);
      if (bd) {
        r.gizmoGroup = buildGizmo(bd.pos, bd.size);
        r.gizmoGroup.userData.target = { kind: "free", id: selectedId.slice(selectedId.indexOf("__free_") + "__free_".length) };
      }
    } else if (selectedId && !selectedId.includes("__div_")) {
      // Everything else that is a solved board gets its gizmo ON THE PART the master tapped, sized to
      // that part. It used to be drawn at the whole BLOCK's centre and sized to the block, so tapping the
      // top panel put the arrows a third of a metre away and reaching 0.84 m — on a 0.6 m cabinet.
      // A divider is excluded: it has its own drag gesture, and a gizmo there swallowed the pointer.
      const bd = scene.boards.find((b) => b.id === selectedId);
      const role = st.parts.find((p) => p.id === selectedId)?.role ?? "";
      if (bd && role === "internal_shelf") {
        const r2 = resolveInstanceIdOfPart(st.model, selectedId);
        if (r2) {
          // A shelf spans its bay — X and Z come from the section, so HEIGHT is the only honest handle.
          r.gizmoGroup = buildGizmo(bd.pos, bd.size, { resize: false, rotate: false, axes: ["y"], biDir: true });
          r.gizmoGroup.userData.target = { kind: "shelf", id: r2 };
        }
      } else if (bd && role.startsWith("carcass")) {
        // A carcass panel is rule-driven, so its arrows slide the WHOLE cabinet — but they now sit on the
        // panel you grabbed, like taking hold of the cabinet by its side. No rotate ring: it sat across
        // these arrows and turned the whole cabinet by accident (cabinet rotation lives in Blok mode).
        const blk = blockOfPart(st.model, selectedId);
        if (blk) {
          // Turning the cabinet stays possible, but only in BLOK mode — a deliberate act. In part mode the
          // ring sat across these very arrows, so ordinary panel editing kept spinning the whole cabinet.
          r.gizmoGroup = buildGizmo(bd.pos, bd.size, { resize: false, rotate: selMode === "block" });
          r.gizmoGroup.userData.target = { kind: "block", id: blk.id };
        }
      }
    }
    if (r.gizmoGroup) r.scene.add(r.gizmoGroup);
    r.renderer.render(r.scene, r.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, selectedId, selMode]);

  // ── rebuild the group + reframe when the model (scene) changes ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    if (r.group) { r.scene.remove(r.group); disposeStructureGroup(r.group); }
    const group = buildStructureGroup(scene, colorRef.current, finishRef.current, textureRef.current);
    tagFacades(group, parts); // «Ichini ko'rish» — mark fronts, then apply the current mode + fade
    applyVisuals(group);
    r.scene.add(group);
    r.group = group;
    // Step 8.2 — rebuild the coloured kromka edge lines (shown only in Frame view)
    if (r.kromkaGroup) { r.scene.remove(r.kromkaGroup); disposeStructureGroup(r.kromkaGroup); }
    const kg = buildKromkaEdges(scene, (kId) => hexToInt(edgeVarById(kId)?.hex ?? "#8a6d1f"));
    kg.visible = modeRef.current === "wireframe";
    r.scene.add(kg);
    r.kromkaGroup = kg;
    // Phase 1.3d — rebuild the 3D handle meshes (bow bar / knob) from the drilled Ø4.5 holes. Same parts
    // + places as the hole markers (line ~405), so a handle sits exactly on its screw seats. Always on.
    if (r.handleGroup) { r.scene.remove(r.handleGroup); disposeStructureGroup(r.handleGroup); }
    const hplaces = solveLayout(model, planThickness(plan));
    const hg = buildHandleGroup(handleFittings(solveModelToParts(model, planThickness(plan)), hplaces), layoutBounds(hplaces));
    r.scene.add(hg);
    r.handleGroup = hg;
    // Phase 3.b — rebuild the 3D appliance meshes from the appliance fittings (real size in each section).
    if (r.applianceGroup) { r.scene.remove(r.applianceGroup); disposeStructureGroup(r.applianceGroup); }
    const ag = buildApplianceGroup(applianceFittings(model, hplaces));
    r.scene.add(ag);
    r.applianceGroup = ag;
    // Phase 5.r1 — rebuild the room's wall backdrop (matte, non-interactive). Empty group when there's no room.
    if (r.roomGroup) { r.scene.remove(r.roomGroup); disposeStructureGroup(r.roomGroup); }
    const rg = buildRoomGroup(scene);
    r.scene.add(rg);
    r.roomGroup = rg;
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
      // Stand in FRONT of the cabinet (−Z). The back panel sits at +Z, so framing from +Z showed the
      // master the closed back: a tap in the middle of the screen selected `__back`, and dividers and
      // shelves could not be reached at all until they thought to orbit.
      r.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.4, ctr.z - dist * 0.95);
      r.camera.lookAt(ctr);
      r.controls.update();
    }
    rebuildHoles(); // keep the drill markers in sync with the new geometry
    // selectedId intentionally omitted — the next effect owns highlight changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // ── «Teshiklar» — rebuild the drill markers when toggled, and when the model changes (a JointProfile
  //    edit only affects drilling, not the scene geometry, so it must refresh here too, Step 7a). ──
  useEffect(() => {
    if (!rt.current) return;
    rebuildHoles();
    rt.current.renderer.render(rt.current.scene, rt.current.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHoles, model]);

  // ── re-tint on selection change (no rebuild). Blok mode paints whole picked cabinets green ON TOP of
  //    the (cleared) per-part blue; outside Blok mode the pick is invisible so nothing bleeds through. ──
  useEffect(() => {
    if (!rt.current?.group) return;
    highlightBoard(rt.current.group, selectedId);
    highlightBlocks(rt.current.group, selMode === "block" ? selectedBlockIds : []);
  }, [selectedId, selectedBlockIds, selMode]);

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

  // ── Step 6: kromka edge balls — project the selected panel's 4 edge midpoints; tap one to paint it
  //    with the active K-variable. Reprojected on every camera move, like the corner chips. ──
  useEffect(() => {
    const r = rt.current;
    const board = scene.boards.find((b) => b.id === selectedId);
    if (!r || !showKromka || !selectedId || selectedId.includes("__div_") || !board) { setEdgeBalls([]); return; }
    const compute = () => setEdgeBalls(edgeBallPositions(board, r.camera, r.renderer, selFeatures?.kromka));
    compute();
    r.controls.addEventListener("change", compute);
    return () => r.controls.removeEventListener("change", compute);
  }, [showKromka, selectedId, scene, selFeatures]);

  // ── Step 8: progressive-zoom dimensions — in Frame (wireframe) view, show more section dimensions the
  //    closer the camera gets (level 0 far → overall only; 1 mid → heights; 2 near → + widths). ──
  useEffect(() => {
    const r = rt.current;
    if (!r || renderMode !== "wireframe") { setDimScreen([]); return; }
    const v = new THREE.Vector3();
    const compute = () => {
      const dist = r.camera.position.distanceTo(r.controls.target);
      const radius = Math.max(scene.radius, 0.3);
      const level = dist < radius * 1.5 ? 2 : dist < radius * 2.6 ? 1 : 0;
      const w = r.renderer.domElement.clientWidth || 1, h = r.renderer.domElement.clientHeight || 1;
      setDimScreen(dimLabels.filter((d) => d.level <= level).map((d) => {
        v.set(d.wx, d.wy, d.wz).project(r.camera);
        return { text: d.text, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 };
      }));
    };
    compute();
    r.controls.addEventListener("change", compute);
    return () => r.controls.removeEventListener("change", compute);
  }, [dimLabels, renderMode, scene]);

  // ── Step 9: Application view — build the ghost props for tagged spaces + fade the furniture so the
  //    client sees what goes inside (boiler / clothes / dishes). Off → restore the normal visuals. ──
  useEffect(() => {
    const r = rt.current;
    if (!r) return;
    if (r.ghostGroup) { r.scene.remove(r.ghostGroup); disposeStructureGroup(r.ghostGroup); r.ghostGroup = null; }
    if (appView) {
      const gg = buildGhostProps(ghostItems);
      r.scene.add(gg);
      r.ghostGroup = gg;
      r.group?.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && "opacity" in mat) { mat.transparent = true; mat.opacity = 0.15; mat.depthWrite = false; mat.needsUpdate = true; }
      });
    } else if (r.group) {
      applyVisuals(r.group);
    }
    r.renderer.render(r.scene, r.camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appView, ghostItems, scene]);

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
      if (rt.current.kromkaGroup) rt.current.kromkaGroup.visible = renderMode === "wireframe"; // Frame-only edges
      highlightBoard(rt.current.group, selectedId);
      rt.current.renderer.render(rt.current.scene, rt.current.camera);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insideView, renderMode, noFacade]);

  // ── U2.2 — camera recenter (F3 framing on demand) + screenshot (PNG download) ──
  const recenter = () => {
    const r = rt.current;
    if (!r) return;
    const ctr = new THREE.Vector3(scene.center[0], scene.center[1], scene.center[2]);
    const dist = (Math.max(scene.radius, 0.3) / (2 * Math.tan((r.camera.fov * Math.PI) / 360))) * 2.2;
    r.controls.target.copy(ctr);
    r.camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.4, ctr.z - dist * 0.95); // front (−Z), as above
    r.camera.lookAt(ctr);
    r.controls.update();
    r.framedKey = ""; // let the next bounds change reframe again
  };
  const screenshot = () => {
    const r = rt.current;
    if (!r) return;
    r.renderer.render(r.scene, r.camera);
    const a = document.createElement("a");
    a.href = r.renderer.domElement.toDataURL("image/png");
    a.download = "karkas.png";
    a.click();
  };
  // ── AR — detect once on mount; build the model on demand (never at import time) ──
  useEffect(() => { let live = true; void detectArSupport().then((s) => { if (live) setArSupport(s); }); return () => { live = false; }; }, []);
  /** A freshly built structure group for AR / export — independent of the editor's live group. */
  const arGroup = () => buildStructureGroup(scene, colorRef.current, finishRef.current, textureRef.current);
  /** Turn a refused session into advice the master can act on — the raw WebXR text alone helps nobody. */
  const arAdvice = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    // ArSessionError wraps the real DOMException, so read `reason` (the original .name) when present —
    // otherwise every failure would look alike and the advice would be wrong.
    const name = err instanceof ArSessionError ? err.reason : err instanceof Error ? err.name : "";
    const low = `${name} ${msg}`.toLowerCase();
    if (low.includes("notallowed") || low.includes("permission") || low.includes("security")) {
      return "Kamera ruxsati berilmadi. Brauzer manzil satridagi 🔒 → Kamera → «Ruxsat».";
    }
    if (low.includes("not supported") || low.includes("notsupported")) {
      // The device advertises immersive-ar but refuses every config — on Android this is almost always
      // ARCore missing or out of date, not a permission problem.
      return "Qurilma AR sessiyasini bermadi. Play Market'dan «Google Play Services for AR» (ARCore) ni o'rnating/yangilang, so'ng Chrome'ni qayta oching.";
    }
    return `Xato: ${msg}`;
  };
  const startAr = async () => {
    setArError(null);
    setArNoFloor(false);
    setArDiag(null);
    setArCopied(false);
    // Show the dom-overlay root SYNCHRONOUSLY. setArActive() alone is not enough: React flushes state
    // asynchronously, so the root would still be display:none when requestSession inspects it — and a
    // hidden overlay root gets the whole config rejected.
    if (arOverlayRef.current) arOverlayRef.current.style.display = "flex";
    setArActive(true);
    try {
      const sess = await startArSession(arGroup(), arOverlayRef.current ?? undefined, () => {
        arSessionRef.current = null;
        setArActive(false);
      });
      arSessionRef.current = sess;
      setArNoFloor(!sess.hitTest); // no hit-test → no reticle, so the hint must not promise one
    } catch (err) {
      if (arOverlayRef.current) arOverlayRef.current.style.display = "none";
      setArActive(false);
      setArError(`AR ochilmadi. ${arAdvice(err)}`);
      // Collect what the device ACTUALLY reports, so a failure can be diagnosed from facts instead of
      // guesses — the master can copy this block and send it to us.
      const diag = await arDiagnostics();
      const lines = Object.entries(diag).map(([k, v]) => `${k}: ${v}`);
      if (err instanceof ArSessionError) {
        lines.push("", "So'rovlar:");
        err.attempts.forEach((a, i) =>
          lines.push(`${i + 1}) majburiy=[${a.required.join(",")}] ixtiyoriy=[${a.optional.join(",")}] → ${a.error}`));
      }
      setArDiag(lines.join("\n"));
    }
  };
  const downloadGlb = async () => {
    setArError(null);
    try {
      const blob = await exportGlb(arGroup());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "karkas.glb";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) {
      setArError(`Faylni yaratib bo'lmadi: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // U3.3 fix — the readout / resize reflects a CARCASS block, not the scene bounds (which would balloon
  // when a free board floats far away). B (multi-block) — it follows the ACTIVE cabinet: the selected
  // part's block, else block-0. So selecting a part in the 2nd cabinet shows + edits that cabinet's size.
  const activeBlock = blockOfPart(model, selectedId);
  const dims = activeBlock ? { w: Math.round(activeBlock.box.w / 10), h: Math.round(activeBlock.box.h / 10), d: Math.round(activeBlock.box.d / 10) } : sceneDimsMm(scene);
  return (
    <KeypadCtx.Provider value={compact ? (o) => setKeypad(o) : null}>
    <SwatchCtx.Provider value={setSwatchTarget}>
    <div className="mob-root" data-theme={theme}>
      {/* ── U2.1 — Moblo top bar (home · document · tabs · theme · menu) ── */}
      <header className="mob-topbar">
        <div className="mob-top-left">
          {onClose && <button className="mob-iconbtn" title="Chiqish" aria-label="Chiqish" type="button" onClick={onClose}><MobHome /></button>}
          <div className="mob-doc"><span className="mob-doc-name">Karkas blok</span><MobPencil /></div>
        </div>
        <nav className="mob-tabs" role="tablist" aria-label="Rejim">
          {MOB_TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={"mob-tab" + (tab === t.id ? " is-active" : "")} onClick={() => setTab(t.id)} type="button">{t.label}</button>
          ))}
        </nav>
        <div className="mob-top-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="mob-iconbtn" title={theme === "dark" ? "Yorug' tema" : "Qorong'i tema"} aria-label="Tema" type="button" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>{theme === "dark" ? <MobSun /> : <MobMoon />}</button>
          <div style={popWrap}>
            <button className="mob-iconbtn" title="Menyu" aria-label="Menyu" type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === "more" ? null : "more"); }}><MobMenu /></button>
            {menu === "more" && (
              <div style={popRight}>
                <button style={popItem} onClick={saveToBiblioteka} type="button">📚 Bibliotekaga saqlash</button>
                <button style={popItem} onClick={saveProject} type="button">💾 Faylga saqlash</button>
                <button style={popItem} onClick={() => fileRef.current?.click()} type="button">📂 Fayldan ochish</button>
                {/* U4.3 — grouping entry lives in the ⋯ menu (not the mode segment). Only when ≥2 cabinets
                    exist. Enters Blok mode → the bottom grouping bar takes over. */}
                {tab === "build" && model.blocks.length > 1 && (
                  <>
                    <div style={popSep} />
                    <button style={popItem} onClick={() => { setSelMode("block"); setRpanel("none"); setMenu(null); }} type="button">⬛ Bloklarni guruhlash</button>
                  </>
                )}
                <div style={popSep} />
                {/* M1.2 — every starter + the free-assembly library now live in one gallery overlay. */}
                <button style={popItem} onClick={() => { setMenu(null); setShowTemplates(true); }} type="button">▦ Shablonlar</button>
                {onClose && <><div style={popSep} /><button style={{ ...popItem, color: "#a01a2e" }} onClick={onClose} type="button">✕ Yopish</button></>}
              </div>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onFileChange} />
      </header>

      {/* M1.2 — template gallery overlay (opened from the ⋯ menu). Click-outside or × closes it; picking a
          card seeds a fresh model via setModel and drops any open panel. */}
      {showTemplates && (
        <div style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setShowTemplates(false)}>
          <div role="dialog" aria-label="Shablonlar" onClick={(e) => e.stopPropagation()} style={{ background: theme === "dark" ? "#1c2230" : "#fff", color: theme === "dark" ? "#e7ebf2" : "#1a1a1a", borderRadius: 14, padding: 18, width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 10px 44px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <strong style={{ fontSize: 16 }}>▦ Shablonlar</strong>
              <button type="button" onClick={() => setShowTemplates(false)} aria-label="Yopish" style={{ border: "none", background: "transparent", color: "inherit", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>×</button>
            </div>
            {TEMPLATE_GROUPS.map((g) => (
              <div key={g.group} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.55, marginBottom: 8 }}>{g.group}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 10 }}>
                  {g.items.map((t) => (
                    <button key={t.id} type="button" title={t.name} onClick={() => { setModel(t.make()); setShowTemplates(false); setRpanel("none"); setActivePanel(null); }}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "15px 8px", borderRadius: 12, border: theme === "dark" ? "1px solid #33405a" : "1px solid #e3e6eb", background: theme === "dark" ? "#232b3d" : "#f7f8fa", color: "inherit", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                      <span style={{ fontSize: 30, lineHeight: 1 }} aria-hidden="true">{t.emoji}</span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* M3.4 — the one material swatch picker, opened from any MatSelect slot or the free-board bar. */}
      {swatchTarget && <MaterialSwatchOverlay target={swatchTarget} theme={theme} onClose={() => setSwatchTarget(null)} />}

      {/* ── U2.1 — Moblo bottom contextual bar (overall dims · selection · +Loyihaga) ── */}
      {tab === "build" && selMode !== "block" && (
        <div className="mob-bottombar">
          <div className="mob-dims" title="Butun mebel — eni × bo'y × chuqurlik">
            <MobDim axis="x" value={dims.w} units={units} locked={!!selFreeBoard} onCommit={(mm) => resize("w", mm)} onKeypad={compact ? () => setKeypad({ label: "Eni", value: dims.w, units, onCommit: (mm) => resize("w", mm) }) : undefined} />
            <MobDim axis="y" value={dims.h} units={units} locked={!!selFreeBoard} onCommit={(mm) => resize("h", mm)} onKeypad={compact ? () => setKeypad({ label: "Bo'yi", value: dims.h, units, onCommit: (mm) => resize("h", mm) }) : undefined} />
            <MobDim axis="z" value={dims.d} units={units} locked={!!selFreeBoard} onCommit={(mm) => resize("d", mm)} onKeypad={compact ? () => setKeypad({ label: "Chuqurligi", value: dims.d, units, onCommit: (mm) => resize("d", mm) }) : undefined} />
            <button type="button" className="mob-unit" title="mm ⇄ cm" onClick={() => setUnits((u) => (u === "mm" ? "cm" : "mm"))}>{units}</button>
          </div>
          <div className="mob-divider" />
          {selectedId ? (
            <div className="mob-sel-wrap">
              <span style={{ display: "flex", flexDirection: "column", width: 5, height: 20, borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
                {selectionColors(selParts, plan).map((c, i) => <span key={i} style={{ flex: 1, background: c }} />)}
              </span>
              <span className="mob-sel">{selComp?.name ?? "Bo'lak"}</span>
              <button className="mob-sel-menu" type="button" aria-label="Amallar" onClick={(e) => { e.stopPropagation(); setMenu(menu === "sel" ? null : "sel"); }}>⋮</button>
              {menu === "sel" && (
                <div style={{ ...popover, top: "auto", bottom: "calc(100% + 8px)" }}>
                  {canApplyToAll && (
                    <button style={popItem} onClick={() => { applyToAllIdentical(); setMenu(null); }} type="button">
                      ⛓ Hammasiga qo'llash ({selGroup?.size})
                    </button>
                  )}
                  <button style={popItem} onClick={() => { duplicateSelected(); setMenu(null); }} type="button">⧉ Nusxalash</button>
                  <button style={popItem} onClick={() => { remove(); setMenu(null); }} type="button">🗑 O'chirish</button>
                  <button style={popItem} onClick={() => { saveToBiblioteka(); setMenu(null); }} type="button">💾 Kutubxonaga</button>
                </div>
              )}
            </div>
          ) : <span className="mob-sel">Butun mebel</span>}
          <button className="mob-project-btn" type="button" onClick={addToProject} title={editingBlockId ? "Yangilash" : "Loyihaga qo'shish"}>{compact ? "💾" : (editingBlockId ? "💾 Yangilash" : fromCabinet ? "＋ Nusxa" : "＋ Loyihaga")}</button>
        </div>
      )}

      {/* #3 — math keypad: tap a W/H/D chip on mobile to enter a size with a calculator (600+18, 1200/2…) */}
      {keypad && <MathKeypad label={keypad.label} value={keypad.value} units={keypad.units} min={keypad.min} suffix={keypad.suffix} onCommit={keypad.onCommit} onClose={() => setKeypad(null)} />}

      {/* #4 — live readout: SIZE while resizing a face · MOVE (displacement) while dragging a gizmo arrow.
          The two are labelled distinctly so a gizmo move never reads like a dimension change. */}
      {measure && tab === "build" && (() => {
        const col = measure.dim === "w" ? "var(--ax-x)" : measure.dim === "h" ? "var(--ax-y)" : "var(--ax-z)";
        const val = units === "cm" ? +(measure.mm / 10).toFixed(1) : measure.mm;
        if (measure.rot) { // gizmo rotate — an ANGLE, not a length
          return (
            <div className="mob-measure" style={{ borderColor: "#7a5cc9" }}>
              <span className="mob-measure-dot" style={{ background: "#7a5cc9" }} />
              <span className="mob-measure-label">Burilish</span>
              <span className="mob-measure-val">↻ {measure.mm}°</span>
            </div>
          );
        }
        if (measure.move) { // gizmo move — show the AXIS + signed displacement (not a size)
          const axisLetter = measure.dim === "w" ? "X" : measure.dim === "h" ? "Y" : "Z";
          const sign = measure.mm > 0 ? "+" : "";
          return (
            <div className="mob-measure" style={{ borderColor: measure.snapped ? "var(--mob-accent)" : col }}>
              <span className="mob-measure-dot" style={{ background: col }} />
              <span className="mob-measure-label">Siljish · {axisLetter}</span>
              <span className="mob-measure-val">{sign}{val} {units}</span>
              {measure.snapped && <span className="mob-measure-snap">🧲 yopishdi</span>}
            </div>
          );
        }
        // A SIZE readout now has a real dimension line drawn on the model itself, so repeating the number
        // in a pill (on top of the persistent block-dim chips) put the same «1365» on screen three times.
        // Move and rotate keep their pill — neither draws a figure in the scene.
        if (rt.current?.dimLines.length) return null;
        const arrow = measure.dim === "w" ? "↔" : measure.dim === "h" ? "↕" : "⤢";
        const label = measure.dim === "w" ? "Eni" : measure.dim === "h" ? "Bo'yi" : "Chuqurligi";
        return (
          <div className="mob-measure" style={{ borderColor: col }}>
            <span className="mob-measure-dot" style={{ background: col }} />
            <span className="mob-measure-label">{label}</span>
            <span className="mob-measure-val">{arrow} {val} {units}</span>
          </div>
        );
      })()}

      {/* ── U2.4 — Detallar tab = the full parts list / spec (cut list · materials · price · export) ── */}
      {tab === "parts" && (
        <>
          <div style={{ position: "absolute", inset: "60px 0 0 0", background: "var(--mob-surface-2)", zIndex: 3 }} />
          <SpecPanel variant="tab" onClose={() => setTab("build")} />
        </>
      )}
      {/* ── Chizma tab = the technical drawing (print / PDF) ── */}
      {/* Chizma tab — the technical drawing shown INLINE (preview) right here + an «open» button that
          pops the full A4 sheet in a new window for a close-up / print. Was an empty placeholder before. */}
      {tab === "drawing" && (
        <div style={{ position: "absolute", inset: "60px 0 0 0", background: "var(--mob-surface-2)", zIndex: 3, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 16px", background: "var(--mob-surface)", borderBottom: "1px solid var(--mob-border)" }}>
            <b style={{ fontSize: 15 }}>📐 Chizma</b>
            <button type="button" className="mob-project-btn" style={{ padding: "9px 15px" }} onClick={printDrawing}>⛶ Ochish / Chop etish</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
            {drawingSvg
              ? <div className="mob-drawing-inline" style={{ width: "100%", maxWidth: 1040, background: "#fff", color: PAPER_INK, boxShadow: "0 2px 16px rgba(0,0,0,0.14)", borderRadius: 6, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: drawingSvg }} />
              : <p style={{ color: "var(--mob-muted)", marginTop: 40 }}>Chizma tayyorlanmadi.</p>}
          </div>
        </div>
      )}
      {/* ── AR tab — native camera placement (deferred) ── */}
      {tab === "ar" && (
        <div className="mob-ar">
          <div className="mob-ar-card">
            <b className="mob-ar-title">📱 AR — xonada ko'rish</b>
            {arSupport === "checking" && <span className="mob-ar-text">Qurilma tekshirilmoqda…</span>}
            {arSupport === "webxr" && (
              <>
                <span className="mob-ar-text">Kamerani polga qarating — ko'k halqa chiqadi, bosing va shkaf o'sha joyga qo'yiladi. Qayta bosib ko'chirasiz.</span>
                <button type="button" className="mob-ar-go" onClick={startAr}>Kamerani ochish</button>
              </>
            )}
            {arSupport === "unsupported" && (
              <span className="mob-ar-text">
                Bu qurilma brauzerida kamerali AR yo'q. <b>Android + Chrome</b> da ishlaydi; iPhone Safari uni hali qo'llamaydi.
                Quyidagi <b>.glb</b> faylni yuklab olib, istalgan 3D ko'ruvchida (yoki iPhone'da «Файлы» orqali) ocha olasiz.
              </span>
            )}
            {arError && <span className="mob-ar-err">{arError}</span>}
            {arDiag && (
              <details className="mob-ar-diag">
                <summary>🔍 Qurilma hisoboti — bizga yuboring</summary>
                <pre className="mob-ar-diag-body">{arDiag}</pre>
                <button
                  type="button"
                  className="mob-ar-alt"
                  onClick={() => { void navigator.clipboard?.writeText(arDiag).then(() => setArCopied(true)); }}
                >{arCopied ? "✓ Nusxa olindi" : "⧉ Nusxa olish"}</button>
              </details>
            )}
            <button type="button" className="mob-ar-alt" onClick={downloadGlb}>⬇ 3D fayl (.glb) yuklab olish</button>
            <span className="mob-ar-note">Model haqiqiy o'lchamda (1 m = 1 m) — mijozga yuborsa ham bo'ladi.</span>
          </div>
        </div>
      )}
      {/* dom-overlay root — the browser paints this over the camera feed during an AR session */}
      <div ref={arOverlayRef} className="mob-ar-overlay" style={{ display: arActive ? "flex" : "none" }}>
        <span className="mob-ar-hint">
          {arNoFloor ? "Pol aniqlanmadi — bosing, mebel oldingizga qo'yiladi" : "Polga qarating → ko'k halqa → bosing"}
        </span>
        <button type="button" className="mob-ar-exit" onClick={() => arSessionRef.current?.end()}>✕ Chiqish</button>
      </div>

      {/* ── U2.2 — Moblo left mini-toolbar: undo/redo · render mode · view toggles · screenshot · recenter ── */}
      {tab === "build" && (
        <div className="mob-lefttools">
          <button className="mob-round" title="Ortga (undo)" aria-label="Ortga" type="button" disabled={!canUndo} onClick={() => undo()}><MobUndo /></button>
          <button className="mob-round" title="Oldinga (redo)" aria-label="Oldinga" type="button" disabled={!canRedo} onClick={() => redo()}><MobRedo /></button>
          <div style={popWrap}>
            <button className={"mob-round" + (renderMode !== "realistic" ? " is-active" : "")} title="Ko'rinish rejimi" aria-label="Ko'rinish rejimi" type="button" onClick={(e) => { e.stopPropagation(); setMenu(menu === "mode" ? null : "mode"); }}><MobCube /></button>
            {menu === "mode" && (
              <div style={{ ...popover, left: "calc(100% + 8px)", top: 0 }}>
                {([["realistic", "Realistik"], ["wireframe", "Karkas"], ["xray", "Rentgen"], ["shaded", "Soya"]] as const).map(([m, label]) => (
                  <button key={m} style={{ ...popItem, ...(renderMode === m ? { background: "#dce9f0", color: "#1f5570", fontWeight: 700 } : {}) }} onClick={() => { setRenderMode(m); setMenu(null); }} type="button">{renderMode === m ? "✓ " : ""}{label}</button>
                ))}
              </div>
            )}
          </div>
          <button className={"mob-round" + (insideView ? " is-active" : "")} title="Ichini ko'rish" aria-label="Ichini ko'rish" type="button" onClick={() => setInsideView((v) => !v)}><MobInside /></button>
          <button className={"mob-round" + (noFacade ? " is-active" : "")} title="Fasadsiz" aria-label="Fasadsiz" type="button" onClick={() => setNoFacade((v) => !v)}><MobFacade /></button>
          <button className={"mob-round" + (showHoles ? " is-active" : "")} title="Teshiklar" aria-label="Teshiklar" type="button" onClick={() => setShowHoles((v) => !v)}><MobHoles /></button>
          <button className="mob-round" title="Skrinshot" aria-label="Skrinshot" type="button" onClick={screenshot}><MobCamera /></button>
          <button className="mob-round" title="Markazga qaytar" aria-label="Markazga qaytar" type="button" onClick={recenter}><MobTarget /></button>
        </div>
      )}

      {/* ── U2.3 — Moblo right rail (add ＋ · materials 🎨) + panel. Desktop only for now; on mobile the
          add tools stay in the «⋯ ko'proq» sheet (FAB) until U2.4 folds everything into sheets/tabs. ── */}
      {tab === "build" && !compact && (
        <div className="mob-rightrail">
          <button className={"mob-hex" + (rpanel === "add" ? " is-active" : "")} title="Qo'shish" aria-label="Qo'shish" type="button" onClick={() => setRpanel((p) => (p === "add" ? "none" : "add"))}><MobPlus /></button>
          <button className={"mob-round" + (rpanel === "material" ? " is-active" : "")} title="Materiallar" aria-label="Materiallar" type="button" onClick={() => setRpanel((p) => (p === "material" ? "none" : "material"))}><MobPaint /></button>
        </div>
      )}
      {tab === "build" && rpanel !== "none" && (
        <aside className={"mob-panel" + (compact ? " is-sheet" : "")} style={compact ? undefined : { right: 72 }}>
          <div className="mob-panel-head">
            <span>{rpanel === "add" ? "Qo'shish" : "Materiallar"}</span>
            <button className="mob-x" type="button" onClick={() => setRpanel("none")} aria-label="Yopish">×</button>
          </div>
          <div className="mob-panel-body">
            {rpanel === "add" ? (
              <>
                {/* U4.1 — add a whole new cabinet (block) beside the current run. Grouping (E1) needs ≥2
                    blocks; this seeds the second one. Distinct from the compartment adds below. */}
                <button className="mob-addbtn" type="button" onClick={() => { addBlock(); setRpanel("none"); }} style={{ width: "100%", marginBottom: 12, borderColor: "#1f5570", color: "#1f5570", fontWeight: 700 }}>🗄 ＋ Yangi shkaf (blok)</button>
                <div className="mob-modeseg">
                  {([["part", "◇ Bo'lak"], ["space", "▢ Bo'shliq"]] as const).map(([m, label]) => (
                    <button key={m} type="button" className={"mob-modebtn" + (selMode === m ? " is-active" : "")} onClick={() => setSelMode(m)}>{label}</button>
                  ))}
                </div>
                {selMode === "space" ? (
                  <div className="mob-addgrid">
                    <button className="mob-addbtn" type="button" onClick={() => add("shelf")}>＋ Polka 16</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("shelf", { doubled: true })}>＋ Polka 32</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("door")}>＋ Eshik</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("door", { glazed: true })}>＋ Oyna eshik</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("door", { glazedGrid: { lights: 3 } })}>＋ Vitrina</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("drawer")}>＋ Yashik</button>
                    <button className="mob-addbtn" type="button" onClick={() => add("divider")}>＋ Razdelitel</button>
                    <button className={"mob-addbtn" + (showDivide ? " is-active" : "")} type="button" onClick={() => togglePanel("divide")}>⊟ Bo'lish</button>
                    {/* Phase 3.d — built-in appliances (Техника): one button per kind, adds + selects it */}
                    {(Object.keys(APPLIANCE) as (keyof typeof APPLIANCE)[]).map((kind) => (
                      <button key={kind} className="mob-addbtn" type="button" style={{ borderColor: "#6b7280", color: "#374151" }} onClick={() => { add("appliance", { appliance: kind }); if (compact) setRpanel("none"); }}>🔌 {APPLIANCE[kind].name}</button>
                    ))}
                  </div>
                ) : (
                  <p className="mob-hint">Bir taxtani tanlang — so'ng burchak, o'yiq yoki jiyak qo'shing.</p>
                )}
                {/* Free primitives — the from-nothing path, and deliberately OUTSIDE the mode switch.
                    They lived under «Bo'shliq» mode, so opening ＋ on an empty document showed only
                    «select a board first» — with no board in existence to select. A free part answers to
                    no compartment, so no mode should gate it. One flat board used to be the only shape on
                    offer too: a leg meant adding a shelf and fighting it through a rotate and three
                    resizes. Each of these arrives already the right way round and already sized. */}
                <div className="mob-addgrid" style={{ marginTop: 10 }}>
                  <span style={{ gridColumn: "1 / -1", ...mono, fontSize: 11, opacity: 0.6 }}>Erkin qismlar — istalgan joyga</span>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("board"); setRpanel("none"); }}>▬ Taxta</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("panel"); setRpanel("none"); }}>▮ Yon panel</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("post"); setRpanel("none"); }}>┃ Oyoq</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("box"); setRpanel("none"); }}>◧ Quti</button>
                  {/* M4 — round / curved primitives. They are NOT sheet panels, so they stay out of the
                      cut list, the CNC file and the m² price (they appear under «Boshqa qismlar»). The
                      RAIL is the one every wardrobe needs and had no shape at all until now. */}
                  <span style={{ gridColumn: "1 / -1", ...mono, fontSize: 11, opacity: 0.6, marginTop: 4 }}>Yumaloq / egri — listdan kesilmaydi</span>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("rail"); setRpanel("none"); }}>▬◯ Ilgich quvuri</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("cylinder"); setRpanel("none"); }}>◯ Yumaloq oyoq</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("tube"); setRpanel("none"); }}>◎ Quvur</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("sphere"); setRpanel("none"); }}>⬤ Shar</button>
                  <button className="mob-addbtn" type="button" style={{ borderStyle: "dashed" }} onClick={() => { addFreeBoard("wedge"); setRpanel("none"); }}>◺ Pona</button>
                </div>
                {selectedId && !selectedId.includes("__div_") && (
                  <div className="mob-addgrid" style={{ marginTop: 10 }}>
                    <button className={"mob-addbtn" + (showCorners ? " is-active" : "")} type="button" onClick={() => togglePanel("corners")}>⌜ Burchak</button>
                    <button className={"mob-addbtn" + (showCutout ? " is-active" : "")} type="button" onClick={() => togglePanel("cutout")}>▢ O'yiq</button>
                    <button className={"mob-addbtn" + (showKromka ? " is-active" : "")} type="button" onClick={() => togglePanel("kromka")}>▤ Jiyak</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <MatSelect label="Korpus" slot="carcass" />
                <MatSelect label="Fasad" slot="facade" />
                <MatSelect label="Polka" slot="shelf" />
                <MatSelect label="Orqa" slot="back" />
                <button className={"mob-addbtn" + (showMaterials ? " is-active" : "")} type="button" style={{ width: "100%", marginTop: 12 }} onClick={() => { togglePanel("materials"); if (compact) setRpanel("none"); }}>▦ {matFilter ? "Ajratilgan ✓" : "3D'da ajratish"}</button>
              </>
            )}
          </div>
        </aside>
      )}

      {/* ── mobile bottom tab bar (CSS-hidden on desktop, which uses the top tabs) ── */}
      <nav className="mob-tabbar" role="tablist" aria-label="Rejim">
        {MOB_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={"mob-tabbar-btn" + (tab === t.id ? " is-active" : "")} onClick={() => setTab(t.id)} type="button">{t.label}</button>
        ))}
      </nav>
      {/* ── mobile FAB group: ＋ Qo'shish · 🎨 Materiallar · ⋯ Ko'proq (hidden while editing a free board) ── */}
      {tab === "build" && compact && !selFreeBoard && (
        <div className="mob-fabgroup">
          <button className="mob-fab-mini" type="button" title="Ko'proq" aria-label="Ko'proq" onClick={() => { commitActiveEdit(); setToolsOpen((o) => !o); }}>⋯</button>
          <button className={"mob-fab-mini" + (rpanel === "material" ? " is-active" : "")} type="button" title="Materiallar" aria-label="Materiallar" onClick={() => { commitActiveEdit(); setRpanel((p) => (p === "material" ? "none" : "material")); }}><MobPaint /></button>
          <button className="mob-fab" type="button" title="Qo'shish" aria-label="Qo'shish" onClick={() => { commitActiveEdit(); setRpanel((p) => (p === "add" ? "none" : "add")); }}>{rpanel === "add" ? "×" : <MobPlus />}</button>
        </div>
      )}
      {/* U4.3 — Blok-mode grouping bar. Lives at the BOTTOM where the dims bar sits (which we hide in Blok
          mode) and is styled with the Moblo tokens so it matches the shell + follows the theme. The usta
          taps CABINETS in 3D (they glow green); ≥2 free → «Guruhlash», ≥2 grouped → «Ajratish» (which
          re-separates them), «Barchasini» groups all. Entered from the ⋯ menu; «✕» leaves. */}
      {tab === "build" && selMode === "block" && (() => {
        const validSel = selectedBlockIds.filter((id) => model.blocks.some((b) => b.id === id));
        const claimed = new Set((model.runs ?? []).flatMap((r) => r.members.map((m) => m.blockId)));
        const free = validSel.filter((id) => !claimed.has(id));      // ticked, not yet in a run → groupable
        const grouped = validSel.filter((id) => claimed.has(id));    // ticked, already in a run → detachable
        const enough = model.blocks.length > 1;
        // U4.4 — the run a ticked grouped cabinet belongs to → its wall length is editable (one is enough)
        const run = grouped.length ? (model.runs ?? []).find((r) => r.members.some((m) => grouped.includes(m.blockId))) : null;
        // U4.5 — with EXACTLY one grouped cabinet ticked, its own rule (Fixed/Ratio/Flex) is editable
        const oneId = grouped.length === 1 ? grouped[0] : null;
        const rule = oneId && run ? run.members.find((m) => m.blockId === oneId)?.rule : undefined;
        const oneBlk = oneId ? model.blocks.find((b) => b.id === oneId) : null;
        const axisMm = oneBlk && run ? Math.round((run.axis === "x" ? oneBlk.box.w : run.axis === "y" ? oneBlk.box.h : oneBlk.box.d) / 10) : 0;
        return (
          <div className="mob-groupbar">
            <span className="mob-groupbar-hint">{!enough ? "shkaf qo'shing" : validSel.length ? `${validSel.length} ta` : "tanlang"}</span>
            {run && (
              <label className="mob-groupbar-run" title="Butun ryadni devor uzunligiga moslash">
                <span>Devor</span>
                <input className="mob-run-input" inputMode="numeric" key={`${run.id}:${run.length_mm10}`} defaultValue={Math.round(run.length_mm10 / 10)}
                  onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt(e.currentTarget.value.replace(/[^\d]/g, ""), 10); if (v) setRunLength(run.id, v); e.currentTarget.blur(); } }}
                  onBlur={(e) => { const v = parseInt(e.currentTarget.value.replace(/[^\d]/g, ""), 10); if (v && v !== Math.round(run.length_mm10 / 10)) setRunLength(run.id, v); }} />
                <span>mm</span>
              </label>
            )}
            {run && roomWallCount > 0 && (
              <div className="mob-groupbar-rule" title="Ryadni devorga yopishtirish (orqasi devorga, oldi xonaga)">
                <span style={{ fontSize: 11, color: "#8a8a8a" }}>Devorga</span>
                <button type="button" className="mob-gbtn" style={!run.wallId ? { borderColor: "#00a961", color: "#006b3f" } : undefined} onClick={() => snapRunToWall(run.id, null)}>Yo'q</button>
                {Array.from({ length: roomWallCount }, (_, i) => (
                  <button key={i} type="button" className="mob-gbtn" style={run.wallId === `wall_${i}` ? { borderColor: "#00a961", color: "#006b3f" } : undefined} onClick={() => snapRunToWall(run.id, `wall_${i}`)}>{i + 1}</button>
                ))}
              </div>
            )}
            {rule && oneId && run && (
              <div className="mob-groupbar-rule" title="Shu shkaf qoidasi — bosib almashtiring: erkin / qat'iy / nisbat">
                <button type="button" className="mob-gbtn"
                  onClick={() => setRunMemberRule(run.id, oneId, rule.kind === "flex" ? { kind: "fixed", mm10: axisMm * 10 } : rule.kind === "fixed" ? { kind: "ratio", weight: 1 } : { kind: "flex" })}>
                  {rule.kind === "fixed" ? "🔒 Qat'iy" : rule.kind === "ratio" ? "⚖ Nisbat" : "↔ Erkin"}
                </button>
                {rule.kind === "fixed" && (
                  <>
                    <input className="mob-run-input" style={{ width: 54 }} inputMode="numeric" key={`f${oneId}:${rule.mm10}`} defaultValue={Math.round(rule.mm10 / 10)}
                      onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt(e.currentTarget.value.replace(/[^\d]/g, ""), 10); if (v) setRunMemberRule(run.id, oneId, { kind: "fixed", mm10: v * 10 }); e.currentTarget.blur(); } }}
                      onBlur={(e) => { const v = parseInt(e.currentTarget.value.replace(/[^\d]/g, ""), 10); if (v) setRunMemberRule(run.id, oneId, { kind: "fixed", mm10: v * 10 }); }} />
                    <span>mm</span>
                  </>
                )}
                {rule.kind === "ratio" && (
                  <input className="mob-run-input" style={{ width: 42 }} inputMode="decimal" key={`r${oneId}:${rule.weight}`} defaultValue={rule.weight}
                    onKeyDown={(e) => { if (e.key === "Enter") { const v = parseFloat(e.currentTarget.value.replace(",", ".")); if (v > 0) setRunMemberRule(run.id, oneId, { kind: "ratio", weight: v }); e.currentTarget.blur(); } }}
                    onBlur={(e) => { const v = parseFloat(e.currentTarget.value.replace(",", ".")); if (v > 0) setRunMemberRule(run.id, oneId, { kind: "ratio", weight: v }); }} />
                )}
              </div>
            )}
            <div className="mob-groupbar-actions">
              {free.length >= 2 && <button type="button" className="mob-gbtn is-group" onClick={groupSelectedBlocks}>🔗 Guruhlash</button>}
              {grouped.length >= 2 && <button type="button" className="mob-gbtn is-ungroup" onClick={ungroupSelectedBlocks}>🔓 Ajratish</button>}
              {enough && <button type="button" className="mob-gbtn" onClick={groupAllBlocks}>⛓ Barcha</button>}
              <button type="button" className="mob-gbtn is-close" onClick={() => setSelMode("part")} title="Blok rejimidan chiqish">✕</button>
            </div>
          </div>
        );
      })()}
      {/* Step 3.3a (v4 §5 readout law) — the selection's dimensions in a FIXED top-centre strip, never
          hidden by the hand. Updates live during a drag/resize (later pieces). 2 axes only (face w×h). */}
      {tab === "build" && selectedId && selPart && (
        <div style={{ position: "fixed", top: compact ? 64 : 70, left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "rgba(31,85,112,0.94)", color: "#fff", borderRadius: 9, padding: "5px 15px", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 10px rgba(0,0,0,0.22)", display: "flex", gap: 11, alignItems: "center", pointerEvents: precise ? "auto" : "none", whiteSpace: "nowrap", maxWidth: "94vw", overflowX: "auto" }}>
          <span>{selComp?.name ?? "Bo'lak"}</span>
          <span style={{ opacity: 0.5 }}>│</span>
          <span style={{ fontFamily: "monospace" }}>{Math.round(selPart.length_mm10 / 10)} × {Math.round(selPart.width_mm10 / 10)} mm</span>
          {/* Group of identical parts. This strip is the ONLY selection readout on mobile (the bottom-bar
              chip and the legacy property bar are both display:none under the mobile breakpoint), so the
              affordance has to live here or the master never sees it. The strip is pointer-transparent so
              it never eats a tap meant for the model — the button re-enables pointers just for itself. */}
          {selGroup && selGroup.size > 1 && (
            canApplyToAll ? (
              <button
                type="button"
                onClick={applyToAllIdentical}
                title={`Shu detalning o'lchov/materialini ${selGroup.size} ta bir xil detalga qo'llash`}
                style={{ pointerEvents: "auto", cursor: "pointer", border: "none", borderRadius: 7, padding: "3px 9px", background: "#f5a623", color: "#3d2500", font: "700 12px system-ui", whiteSpace: "nowrap" }}
              >⛓ {selGroup.size} taga</button>
            ) : (
              <span title={`${selGroup.size} ta bir xil detal`} style={{ opacity: 0.62, fontSize: 12, fontWeight: 600 }}>⛓×{selGroup.size}</span>
            )
          )}
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
          <div style={{ background: "#fff", color: PAPER_INK, borderRadius: 14, padding: 18, width: 400, maxWidth: "92vw", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}>
            <b style={{ fontSize: 15 }}>Yangi material aniqlandi</b>
            <p style={{ fontSize: 12.5, color: "#555", margin: "6px 0 12px" }}>Bu blok loyihada yo'q dekor ishlatadi. Har birini mavjud materialga bog'lang, yoki yangi material sifatida saqlang.</p>
            {pendingBinding.foreign.map((d) => (
              <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: 4, background: boardById(d)?.hex ?? "#ccc", border: "1px solid rgba(0,0,0,0.15)", flex: "0 0 auto" }} />
                <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{boardById(d)?.name ?? d}</span>
                <span style={{ opacity: 0.5, fontSize: 16 }}>→</span>
                <select value={bindChoices[d] ?? "__new"} onChange={(e) => setBindChoices((c) => ({ ...c, [d]: e.target.value === "__new" ? null : e.target.value }))} style={{ flex: "0 0 auto", maxWidth: 180, padding: "4px 6px", borderRadius: 7, border: "1px solid #d8d2c4", background: "#fff", color: PAPER_INK, cursor: "pointer" }}>
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
      {/* Stacked ABOVE the mobile property bar when that is showing — the two sat at the same height,
          so the ratio pills vanished behind it. */}
      {tab === "build" && !(compact && (toolsOpen || rpanel !== "none")) && zoneRow && (selectedId || showDivide) && (
        <div style={{ position: "fixed", bottom: compact ? (mobileProps ? 176 : 122) : 70, left: "50%", transform: "translateX(-50%)", zIndex: 59, background: "rgba(238,240,243,0.97)", borderRadius: 12, padding: "8px 12px", boxShadow: "0 3px 14px rgba(0,0,0,0.18)", display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
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
      {/* Step 6 (fixture 06-kromka-mode) — the K-variable pill row (paint metaphor): pick a jiyak, then
          tap the edge balls. «✕ Yo'q» strips the band. */}
      {tab === "build" && !(compact && (toolsOpen || rpanel !== "none")) && showKromka && (
        <div style={{ position: "fixed", bottom: compact ? 122 : 70, left: "50%", transform: "translateX(-50%)", zIndex: 59, background: "rgba(255,255,255,0.97)", borderRadius: 12, padding: "8px 12px", boxShadow: "0 3px 14px rgba(0,0,0,0.18)", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", maxWidth: "92vw" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#555", marginRight: 2 }}>Jiyak:</span>
          {EDGES.map((e) => (
            <button key={e.id} type="button" onClick={() => setActiveKromka(e.id)} title={e.name}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 9, cursor: "pointer", border: activeKromka === e.id ? "2px solid #1f5570" : "1px solid #ddd", background: activeKromka === e.id ? "#eaf2f6" : "#fff", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 15, height: 15, borderRadius: 4, background: e.hex, border: "1px solid rgba(0,0,0,0.15)" }} />
              {e.name.replace(/^(ПВХ|ABS)\s*/, "")}
            </button>
          ))}
          <button type="button" onClick={() => setActiveKromka(null)} title="Jiyakni olib tashlash"
            style={{ padding: "5px 9px", borderRadius: 9, cursor: "pointer", border: activeKromka === null ? "2px solid #1f5570" : "1px solid #ddd", background: activeKromka === null ? "#eaf2f6" : "#fff", fontSize: 12, fontWeight: 600 }}>✕ Yo'q</button>
        </div>
      )}
      {/* ── Mobile property bar ────────────────────────────────────────────────────────────────────
          On a phone the ONLY always-visible fields were the cabinet's W/H/D chips: thickness, angle,
          lip and drawer height lived inside the «Asboblar» sheet behind the ⋯ button, so a master had
          to know to open it before he could change the part he had just tapped. This puts the fields
          for the CURRENT selection on screen, scrolling sideways if there are several. It hides while
          that sheet is open (the same fields are in there) and for a free board (which has its own
          bar), so nothing is ever shown twice. */}
      {mobileProps && (() => {
        const { blk } = mobileProps;
        return (
          <div className="mob-props">
            <span className="mob-props-name">{selComp?.name ?? "Shkaf"}</span>
            {selComp && (
              <label className="mob-props-f"><span>Qalinlik</span>
                <DimField label="T" value={Math.round((selComp.thickness_mm10 ?? 160) / 10)} onCommit={setThickness} />
              </label>
            )}
            {selComp?.role === "internal_shelf" && (
              <>
                <label className="mob-props-f"><span>Burchak</span>
                  <DimField label="°" value={selComp.angle_deg ?? 0} onCommit={setAngle} min={0} suffix="°" />
                </label>
                <label className="mob-props-f"><span>Bort</span>
                  <DimField label="mm" value={Math.round((selComp.lip_mm10 ?? 0) / 10)} onCommit={setLip} min={0} />
                </label>
              </>
            )}
            {drawerHeightMm != null && (
              <label className="mob-props-f"><span>Yashik b.</span>
                <DimField label="mm" value={drawerHeightMm} onCommit={setDrawerHeight} min={50} units={units} />
              </label>
            )}
            {/* 2.3c — drawer organizer: number of divider boards inside the drawer (0 = none). Drawer only. */}
            {selComp?.drawer && (
              <label className="mob-props-f"><span>Bo'linma</span>
                <DimField label="×" value={selComp.organizer?.dividers ?? 0} onCommit={setDividers} min={0} suffix="×" />
              </label>
            )}
            {/* 1.3c — handle on the mobile quick bar too (mobile-primary): drives the Ø4.5 holes + price */}
            {(selComp?.role === "facade" || selComp?.drawer) && (
              <label className="mob-props-f"><span>Dastak</span>
                <select value={selComp.handle ?? ""} onChange={(e) => setHandle((e.target.value || null) as HandleType | null)}>
                  <option value="">Yo'q</option>
                  <option value="bow">Скоба</option>
                  <option value="knob">Кнопка</option>
                  <option value="profile">Профиль</option>
                </select>
              </label>
            )}
            {/* 2.1c — lift (podyomnik) on the mobile quick bar too: a top-opening door counts a lift not
                hinges + drills no side cups. Doors only. */}
            {selComp?.role === "facade" && (
              <label className="mob-props-f"><span>Lift</span>
                <select value={selComp.lift ?? ""} onChange={(e) => setLift((e.target.value || null) as LiftType | null)}>
                  <option value="">Yo'q</option>
                  <option value="swing">Ochiladigan</option>
                  <option value="parallel">Parallel</option>
                </select>
              </label>
            )}
            {/* 2.2b — combine / split a door on the mobile quick bar too */}
            {selComp?.role === "facade" && canCombineDoor && (
              <button type="button" className="mob-props-toggle" onClick={combineSelectedDoor}>⧉ Birlashtirish</button>
            )}
            {selComp?.role === "facade" && canSplitDoor && (
              <button type="button" className="mob-props-toggle" onClick={splitSelectedDoor}>⤢ Ajratish</button>
            )}
            {/* 3.d — appliance kind on the mobile quick bar too */}
            {selComp?.appliance && (
              <label className="mob-props-f"><span>Texnika</span>
                <select value={selComp.appliance} onChange={(e) => setAppliance(e.target.value as ApplianceKind)}>
                  {(Object.keys(APPLIANCE) as (keyof typeof APPLIANCE)[]).map((k) => <option key={k} value={k}>{APPLIANCE[k].name}</option>)}
                </select>
              </label>
            )}
            {/* Turning a lone cabinet had no home at all once the rotate ring moved to Blok mode (whose
                menu needs >1 block). A typed angle is better than the ring anyway: exact, and it cannot
                be nudged by accident while dragging something else. */}
            {blk && (
              <label className="mob-props-f"><span>Burilish</span>
                <DimField label="°" value={Math.round(blk.rotY_deg ?? 0)} onCommit={(d) => rotateBlockTo(blk.id, ((d % 360) + 360) % 360, true)} min={0} suffix="°" />
              </label>
            )}
            {/* Phase 1.1b — sokol: 0 = none, 100 = the standard toe-kick. box.h is unchanged; the plinth
                is an extra part below the carcass, so the cabinet rises onto it. */}
            {blk && (
              <label className="mob-props-f"><span>Sokol</span>
                <DimField label="mm" value={Math.round((blk.plinth_mm10 ?? 0) / 10)} onCommit={(mm) => setPlinth(blk.id, mm * 10)} min={0} units={units} />
              </label>
            )}
            {/* Phase 1.2c — worktop: a boolean, so a toggle (not a mm field). Its thickness comes from the
                worktop material and the overhang is constant, so there is nothing to type. Tap the
                worktop in 3D to pick its material. */}
            {blk && (
              <button
                type="button"
                className={"mob-props-toggle" + (blk.worktop ? " is-on" : "")}
                aria-pressed={!!blk.worktop}
                onClick={() => setWorktop(blk.id, !blk.worktop)}
              >Stoleshnitsa{blk.worktop ? " ✓" : ""}</button>
            )}
            {/* M2.3 — carcass shell: drop panels for open shelving / a back-less or open-top unit. Each chip
                toggles one wall; ✕ = removed. L-corner: top/bottom/back hit both legs; sides hit leg-A. */}
            {blk && (
              <div className="mob-props-f" style={{ alignItems: "flex-start" }}>
                <span>Devorlar</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(([["sideL", "Chap"], ["sideR", "O'ng"], ["top", "Tepa"], ["bottom", "Tag"], ["back", "Orqa"]] as const)).map(([k, label]) => {
                    const shown = blk.shell?.[k] !== false;
                    return (
                      <button key={k} type="button" className={"mob-props-toggle" + (shown ? " is-on" : "")} aria-pressed={shown}
                        title={shown ? `${label} — bor` : `${label} — olib tashlangan`}
                        onClick={() => setBlockShell(blk.id, { [k]: !shown })}
                        style={{ padding: "3px 9px", fontSize: 12 }}>{label}{shown ? "" : " ✕"}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 4.a — L-corner: toggle the block to/from an L, then size the return leg */}
            {blk && (
              <button type="button" className={"mob-props-toggle" + (isLCorner ? " is-on" : "")} aria-pressed={isLCorner} onClick={toggleLCorner}>⌐ L-burchak{isLCorner ? " ✓" : ""}</button>
            )}
            {blk && isLCorner && (
              <>
                <label className="mob-props-f"><span>Qaytish uz.</span>
                  <DimField label="mm" value={legBLen} onCommit={(v) => setLegB(v, legBDepth)} min={100} units={units} />
                </label>
                <label className="mob-props-f"><span>Qaytish ch.</span>
                  <DimField label="mm" value={legBDepth} onCommit={(v) => setLegB(legBLen, v)} min={100} units={units} />
                </label>
                <button type="button" className="mob-props-toggle" onClick={() => setLCornerHand(lHand === "left" ? "right" : "left")} title="L burchakni chapga / o'ngga aylantirish">⇄ {lHand === "left" ? "Chap" : "O'ng"} burchak</button>
              </>
            )}
          </div>
        );
      })()}
      {/* ── U3.3 — free-board editor: appears when a free board is selected (resize W/H/D · delete) ── */}
      {tab === "build" && !(compact && toolsOpen) && selFreeBoard && rpanel === "none" && (
        <div style={{ position: "fixed", bottom: compact ? 118 : 70, left: "50%", transform: "translateX(-50%)", zIndex: 62, background: "rgba(255,255,255,0.98)", borderRadius: 12, padding: "7px 12px", boxShadow: "0 3px 14px rgba(0,0,0,0.18)", display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap", flexWrap: "wrap", maxWidth: "94vw" }}>
          <span style={{ ...mono, fontWeight: 700, color: "#1f5570" }}>🪵</span>
          <input key={selFreeBoard.id} defaultValue={selFreeBoard.name} title="Nom" aria-label="Nom"
            onBlur={(e) => renameFreePart(selFreeBoard.id, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{ ...mono, fontWeight: 700, color: "#1f5570", width: 100, border: "1px solid #cdd5df", borderRadius: 6, padding: "3px 7px", background: "#fff" }} />
          <DimField label="Ш" value={Math.round(selFreeBoard.box.w / 10)} onCommit={(mm) => resizeFreeBoard(selFreeBoard.id, "w", mm)} units={units} />
          <DimField label="В" value={Math.round(selFreeBoard.box.h / 10)} onCommit={(mm) => resizeFreeBoard(selFreeBoard.id, "h", mm)} units={units} />
          <DimField label="Г" value={Math.round(selFreeBoard.box.d / 10)} onCommit={(mm) => resizeFreeBoard(selFreeBoard.id, "d", mm)} units={units} />
          <button type="button" title="90° aylantirish" onClick={() => rotateFreeBoard(selFreeBoard.id)} style={{ ...act, borderColor: "#7a5cc9", background: "#e9e2f7", color: "#4a2f8a", minHeight: 34, padding: "6px 11px" }}>↻</button>
          <button type="button" title="Nusxalash" onClick={duplicateSelected} style={{ ...act, borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a", minHeight: 34, padding: "6px 11px" }}>⧉</button>
          {/* M4 — switch this part's primitive. Back to «Quti» makes it a flat, cuttable panel again. */}
          <select value={selFreeBoard.shape ?? "box"} onChange={(e) => setFreeBoardShape(selFreeBoard.id, e.target.value as PrimitiveShape)} title="Shakl" style={{ ...matSel, flex: "0 0 auto", maxWidth: 112, minHeight: 34 }}>
            <option value="box">▭ Quti</option>
            <option value="cylinder">◯ Silindr</option>
            <option value="tube">◎ Quvur</option>
            <option value="sphere">⬤ Shar</option>
            <option value="wedge">◺ Pona</option>
          </select>
          <button type="button" aria-haspopup="dialog" title="Material" onClick={() => setSwatchTarget({ kind: "free", id: selFreeBoard.id })} style={{ ...matSel, flex: "0 0 auto", maxWidth: 150, minHeight: 34, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...swatch, background: BOARDS.find((bd) => bd.id === selFreeBoard.material)?.hex ?? "#e6e6e6" }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{BOARDS.find((bd) => bd.id === selFreeBoard.material)?.name ?? "Standart"}</span>
          </button>
          <button type="button" title="O'chirish" onClick={() => removeFreeBoard(selFreeBoard.id)} style={{ ...act, borderColor: "#d1495b", background: "#fbe4e8", color: "#a01a2e", minHeight: 34, padding: "6px 11px" }}>🗑</button>
        </div>
      )}
      {/* ── U2.1 — the pre-Moblo editing tools float in this transitional card until U2.2–U2.4 move
          each cluster into its Moblo zone. On desktop it floats at the right; on mobile it's a slide-up
          sheet toggled by the ＋ FAB (Moblo pattern), so the small screen stays uncluttered. ── */}
      {tab === "build" && (!compact || toolsOpen) && <div className={"mob-legacy" + (compact ? " is-sheet" : "")}>
        <div className="mob-sheet-head"><span>Asboblar</span><button type="button" className="mob-x" onClick={() => { commitActiveEdit(); setToolsOpen(false); }} aria-label="Yopish">×</button></div>
      {/* Phase 4 — edit toolbar. It stays WRAP (never overflow-clip, else the ＋Polka/＋Eshik/🎨 popovers get
          cut off); on compact the «⋯ Ko'proq» menu removes the 10 secondary tools so it stays short. */}
      <div style={editbar}>
        {/* U2.3 — the add tools (Bo'lak/Bo'shliq · Polka/Eshik/Yashik/Razdelitel/Bo'lish · Burchak/O'yiq/Jiyak)
            moved to the right ＋ panel — a side panel on desktop, a bottom sheet (＋ FAB) on mobile. */}
        {/* U2.2 — undo/redo + render-mode moved to the Moblo left toolbar */}
        {/* U2.3 — on mobile these tools show DIRECTLY inside the «⋯ Asboblar» sheet (no nested dropdown) */}
        <div style={!compact ? { display: "contents" } : { display: "flex", flexWrap: "wrap", gap: 8, width: "100%" }}>
        {/* Step 5 — materials view: list the decors in use; click one to isolate it in 3D */}
        <button style={{ ...act, ...(showMaterials ? { borderColor: "#8a6d1f", background: "#f7efd8", color: "#8a6d1f" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => togglePanel("materials")} type="button">▦ {matFilter ? "Material ✓" : "Materiallar"}</button>
        {/* U2.2 — inside / facade / holes view toggles moved to the Moblo left toolbar */}
        {/* Step 9 — Application view: show what goes inside (boiler / clothes / dishes) */}
        <button style={{ ...act, ...(appView ? { borderColor: "#7a5cc9", background: "#e9e2f7", color: "#4a2f8a" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => togglePanel("app")} type="button" title="Ichidagini ko'rsatish (kotyol, kiyim…)">🛋 {appView ? "Ichida ✓" : "Ichida nima"}</button>
        {/* (holes toggle → Moblo left toolbar, U2.2) */}
        {/* Step 7 — Birikma (joints) mode: the JointProfile editor; turning it on shows the drilled holes */}
        <button style={{ ...act, ...(showJoints ? { borderColor: "#8a5a1f", background: "#f2e3cd", color: "#6b3f0f" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => { if (activePanel !== "joints") setShowHoles(true); togglePanel("joints"); }} type="button" title="Birikma profili (System-32 teshiklar)">⚙ Birikma</button>
        {/* Phase 6.2 — the factory (workshop) profile: per-role thickness + save/apply the global default */}
        <button style={{ ...act, ...(showWorkshop ? { borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a" } : { borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }) }} onClick={() => togglePanel("workshop")} type="button" title="Fabrika profili (qalinlik + saqlangan default)">📋 Fabrika profili</button>
        <button style={{ ...act, borderColor: "#6b7280", background: "#eef0f3", color: "#374151" }} onClick={() => togglePanel("tree")} type="button">☰ Detallar</button>
        <button style={{ ...act, borderColor: "#c9a24b", background: "#f7efd8", color: "#8a6d1f" }} onClick={() => togglePanel("spec")} type="button">📋 Spec</button>
        <button style={{ ...act, borderColor: "#7a5cc9", background: "#e9e2f7", color: "#4a2f8a" }} onClick={printDrawing} type="button">📐 Chizma</button>
        <button style={{ ...act, borderColor: "#4b74c9", background: "#e0e8f7", color: "#1f478a" }} onClick={exportCnc} type="button">⬇ CNC</button>
        </div>
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
          {/* Group state — the editor forks a part onto its own component on EVERY per-part edit, so
              without this the master cannot tell which parts are still identical, nor that the change
              they just made landed on one shelf only. Tapping applies it to the whole family. */}
          {selGroup && selGroup.size > 1 && (
            canApplyToAll ? (
              <button
                type="button"
                onClick={applyToAllIdentical}
                title={`Bu detalning o'lchov/materialini ${selGroup.size} ta bir xil detalga qo'llash`}
                style={{ ...badge, background: "#fbe9d2", color: "#8a4b0f", border: "none", cursor: "pointer" }}
              >✂ Alohida · ⛓ {selGroup.size} taga qo'llash</button>
            ) : (
              <span style={{ ...badge, background: "#dbe6f7", color: "#1f478a" }} title="Bu detallar bir xil — birini o'zgartirsangiz faqat o'sha o'zgaradi">⛓ Bir xil ×{selGroup.size}</span>
            )
          )}
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
              <DimField label="°" value={selComp.angle_deg ?? 0} onCommit={setAngle} min={0} suffix="°" />
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
          {/* Task B — hinge side per door (engine drills the chosen edge; handle sits opposite). Hidden on a
              LIFT door — a top-opening door has no side hinge (2.1c). */}
          {selComp.role === "facade" && !selComp.lift && (
            <>
              <span style={mono}>Petlya:</span>
              <select value={selComp.hingeEdge === "right" ? "right" : "left"} onChange={(e) => setHinge(e.target.value as "left" | "right")} style={{ ...matSel, flex: "0 0 auto", maxWidth: 110 }}>
                <option value="left">◧ Chap</option>
                <option value="right">◨ O'ng</option>
              </select>
            </>
          )}
          {/* 2.1c — lift hinge (podyomnik) per door: a top-opening wall-cabinet door on a mechanism instead
              of side hinges. Counts a lift not hinges + drills no side cups (2.1a). Doors only. */}
          {selComp.role === "facade" && (
            <>
              <span style={mono}>Lift:</span>
              <select value={selComp.lift ?? ""} onChange={(e) => setLift((e.target.value || null) as LiftType | null)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 140 }}>
                <option value="">Yo'q</option>
                <option value="swing">⤒ Ochiladigan</option>
                <option value="parallel">⇈ Parallel</option>
              </select>
            </>
          )}
          {/* 2.2b — combine a door with its neighbours (move it onto the parent section) / split it back */}
          {selComp.role === "facade" && canCombineDoor && (
            <button style={{ ...act, borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a" }} onClick={combineSelectedDoor} type="button" title="Bu eshikni yon bo'lim bilan bitta katta eshikka birlashtirish">⧉ Birlashtirish</button>
          )}
          {selComp.role === "facade" && canSplitDoor && (
            <button style={{ ...act, borderColor: "#8a6d1f", background: "#faf1dc", color: "#7a5a12" }} onClick={splitSelectedDoor} type="button" title="Birlashgan eshikni yana bitta bo'limga qaytarish">⤢ Ajratish</button>
          )}
          {/* 3.d — appliance kind on a selected built-in appliance (oven → hob …); drives mesh + price + cutout */}
          {selComp.appliance && (
            <>
              <span style={mono}>Texnika:</span>
              <select value={selComp.appliance} onChange={(e) => setAppliance(e.target.value as ApplianceKind)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 170 }}>
                {(Object.keys(APPLIANCE) as (keyof typeof APPLIANCE)[]).map((k) => <option key={k} value={k}>{APPLIANCE[k].name}</option>)}
              </select>
            </>
          )}
          {/* 1.3c — handle (dastak) per door/drawer front: drives the Ø4.5 holes + the hardware price */}
          {(selComp.role === "facade" || selComp.drawer) && (
            <>
              <span style={mono}>Dastak:</span>
              <select value={selComp.handle ?? ""} onChange={(e) => setHandle((e.target.value || null) as HandleType | null)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 120 }}>
                <option value="">Yo'q</option>
                <option value="bow">⊐ Скоба</option>
                <option value="knob">● Кнопка</option>
                <option value="profile">▭ Профиль</option>
              </select>
            </>
          )}
          {/* Yashik balandligi — per-drawer front/box height (mm). solve/layout clamp the top at the bay. */}
          {selComp.drawer && (
            <>
              <span style={mono}>Yashik b.:</span>
              <DimField label="mm" value={drawerHeightMm ?? 200} onCommit={setDrawerHeight} min={50} units={units} />
              {/* 2.3c — organizer: number of divider boards inside the drawer (0 = none) */}
              <span style={mono}>Bo'linma:</span>
              <DimField label="×" value={selComp.organizer?.dividers ?? 0} onCommit={setDividers} min={0} suffix="×" />
            </>
          )}
          {/* E2 — drawer-in-drawer: a selected drawer can hold a nested drawer in its clear interior */}
          {selComp.drawer && (
            <button style={{ ...act, borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a" }} onClick={nestDrawerInSelected} type="button" title="Bu yashik ichiga yana bir yashik">🗄＋ Ichki yashik</button>
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
        const carcassRoles = ["carcass_side", "carcass_top", "carcass_bottom", "carcass_back", "carcass_plinth", "carcass_worktop"];
        if (!part || !carcassRoles.includes(part.role ?? "")) return null;
        const slot: "carcass" | "back" | "worktop" = part.role === "carcass_back" ? "back" : part.role === "carcass_worktop" ? "worktop" : "carcass";
        return (
          <div style={selBar}>
            <span style={mono}>{part.name}</span>
            <span style={badge}>karkas</span>
            <span style={{ ...mono, marginLeft: 6 }}>Material:</span>
            <select value={plan[slot]} onChange={(e) => setPlanMaterialTop(slot, e.target.value)} style={{ ...matSel, flex: "0 0 auto", maxWidth: 160 }}>
              {BOARDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ ...mono, fontSize: 10, color: "#8a8a8a", marginLeft: 6 }}>butun karkasga</span>
            {/* 4.a — L-corner: make/unmake + size the return leg (block-level, desktop) */}
            <button style={{ ...act, ...(isLCorner ? { borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a" } : {}) }} onClick={toggleLCorner} type="button" title="Shkafni L-burchakka o'girish / qaytarish">⌐ {isLCorner ? "L-burchak ✓" : "L-burchak"}</button>
            {isLCorner && (
              <>
                <span style={mono}>Qaytish uz.:</span>
                <DimField label="mm" value={legBLen} onCommit={(v) => setLegB(v, legBDepth)} min={100} units={units} />
                <span style={mono}>ch.:</span>
                <DimField label="mm" value={legBDepth} onCommit={(v) => setLegB(legBLen, v)} min={100} units={units} />
                <button style={act} onClick={() => setLCornerHand(lHand === "left" ? "right" : "left")} type="button" title="L burchakni chapga / o'ngga aylantirish">⇄ {lHand === "left" ? "Chap" : "O'ng"}</button>
              </>
            )}
            {/* 5.r1 — Room: pick a wall preset (none / I / L / П) + size each wall. A render-only backdrop. */}
            <span style={{ ...mono, fontSize: 10, color: "#8a8a8a", marginLeft: 6 }}>Xona:</span>
            {(["none", "I", "L", "U"] as const).map((p) => (
              <button key={p} type="button" title="Xona devorlari (fon)"
                style={{ ...act, ...(roomPreset === p ? { borderColor: "#1f5570", background: "#e0e8f7", color: "#1f478a" } : {}) }}
                onClick={() => (p === "none" ? clearRoom() : setRoom(p, roomLens ? roomLens.split(",").map(Number) : []))}>
                {p === "none" ? "Yo'q" : p === "U" ? "П" : p}
              </button>
            ))}
            {roomPreset !== "none" && roomLens.split(",").map((L, i) => (
              <DimField key={i} label="mm" value={Number(L)} min={500} units={units}
                onCommit={(v) => { const lens = roomLens.split(",").map(Number); lens[i] = v; setRoom(roomPreset as "I" | "L" | "U", lens); }} />
            ))}
            {/* 5.r3 — drop an auto-fitted L-corner cabinet into the room's inside corner (L / П rooms) */}
            {roomWallCount >= 2 && (
              <button style={act} onClick={() => fitCorner()} type="button" title="Burchakka L-shkaf avtomatik joylash">⌐ Burchak shkaf</button>
            )}
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
      </div>}
      {/* ── U2.1 — the 3D stage is full-bleed (Moblo); chrome floats over it. The .mob-viewport class
          carries the themed background gradient. NO z-index here: the canvas stays behind the chrome by
          DOM order, but the floating panels inside (z 40-80) must escape into the root stacking context
          so they layer ABOVE the top/bottom bars (a z-index here would trap them below the chrome). ── */}
      <div className="mob-viewport">
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
        {/* Step 6 (fixture 06-kromka-mode) — kromka balls on the selected panel's 4 edges; tap to paint
            with the active K-pill (or strip it if the active pill is «Yo'q»). Coloured by each edge's K. */}
        {/* Step 8 — progressive-zoom dimension labels (Frame view): denser as you zoom in */}
        {renderMode === "wireframe" && dimScreen.map((d, i) => (d.vis ? (
          <div key={i} style={{ position: "absolute", left: d.x, top: d.y, transform: "translate(-50%,-50%)", zIndex: 41, background: "rgba(31,85,112,0.9)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 4px", borderRadius: 4, pointerEvents: "none", fontFamily: "ui-monospace, monospace", whiteSpace: "nowrap" }}>{d.text}</div>
        ) : null))}
        {showKromka && edgeBalls.map((b) => (b.vis ? (
          <button
            key={b.i}
            type="button"
            title={b.k ? edgeVarById(b.k)?.name : "Jiyaksiz"}
            onClick={() => setEdgeKromka(b.i, activeKromka)}
            style={{ position: "absolute", left: b.x, top: b.y, transform: "translate(-50%,-50%)", zIndex: 42, width: 26, height: 26, borderRadius: 13, cursor: "pointer", border: "2px solid #fff", background: b.k ? (edgeVarById(b.k)?.hex ?? "#999") : "rgba(120,120,120,0.55)", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}
          />
        ) : null))}
        {/* Step 5 — materials legend + isolate filter (v4 §3, "see everything by material") */}
        {showMaterials && (
          <div style={{ position: "absolute", left: 10, top: 10, zIndex: 44, background: "#fff", color: PAPER_INK, borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 10, minWidth: 210, maxHeight: "70%", overflow: "auto", ...compactSheet }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ fontSize: 13 }}>Materiallar</b>
              <button onClick={() => setActivePanel(null)} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 22, color: "#888", lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40, marginRight: -6, marginTop: -4 }} type="button">✕</button>
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
        {/* Step 7a — the Joint profile editor (System-32 grid + cam). Editing a value re-drills live. */}
        {showJoints && (
          <div style={{ position: "absolute", right: 10, top: 10, zIndex: 44, background: "#fff", color: PAPER_INK, borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 12, width: 250, ...compactSheet }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>⚙ Birikma profili</b>
              <button onClick={() => setActivePanel(null)} type="button" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 22, color: "#888", lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40, marginRight: -6, marginTop: -4 }}>✕</button>
            </div>
            <p style={{ fontSize: 11, color: "#777", margin: "0 0 6px", lineHeight: 1.35 }}>System-32 to'r (mm). Namunа panelda jonli ko'rinadi — <b>setback/qadam</b> shtok qatorlarini suradi.</p>
            <JointDiagram profile={joint} />
            <p style={{ fontSize: 10, color: "#999", margin: "0 0 8px" }}>Real blokda: shtoklar faqat <b>polka bo'lса</b> ko'rinadi (Ø5).</p>
            {([
              ["Qadam (pitch)", joint.system32.pitch_mm10, (v: number) => setJointProfile({ ...joint, system32: { ...joint.system32, pitch_mm10: v } })],
              ["Old setback", joint.system32.frontSetback_mm10, (v: number) => setJointProfile({ ...joint, system32: { ...joint.system32, frontSetback_mm10: v } })],
              ["Orqa setback", joint.system32.backSetback_mm10, (v: number) => setJointProfile({ ...joint, system32: { ...joint.system32, backSetback_mm10: v } })],
              ["Cam chuqurligi", joint.camSeatDepth_mm10, (v: number) => setJointProfile({ ...joint, camSeatDepth_mm10: v })],
              ["Min chekka", joint.minEdgeMargin_mm10, (v: number) => setJointProfile({ ...joint, minEdgeMargin_mm10: v })],
            ] as const).map(([label, mm10v, commit]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
                <DimField label="mm" value={Math.round(mm10v / 10)} onCommit={(mm) => commit(mm * 10)} min={0} />
              </div>
            ))}
            <button onClick={() => setJointProfile(defaultJointProfile())} type="button" style={{ width: "100%", marginTop: 4, padding: "6px 10px", borderRadius: 8, border: "1px solid #bbb", background: "#f6f6f6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Fabrika qiymatlari</button>
            {/* Step 7c — rule-break warnings (min-edge-margin) + the export-override gate */}
            {jointFinds.length > 0 && (
              <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "#fdf1d6", border: "1px solid #e5b84b" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#8a5a1f", marginBottom: 4 }}>⚠ {jointFinds.length} ta teshik chekkага yaqin</div>
                <div style={{ fontSize: 10.5, color: "#7a5a2f", maxHeight: 66, overflow: "auto", lineHeight: 1.4 }}>
                  {jointFinds.slice(0, 5).map((f, i) => <div key={i}>• {f.message_ru}</div>)}
                  {jointFinds.length > 5 && <div>• …+{jointFinds.length - 5}</div>}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={exportOverride} onChange={(e) => setExportOverride(e.target.checked)} />
                  <span style={{ fontWeight: 600 }}>Usta override (eksportga ruxsat)</span>
                </label>
              </div>
            )}
          </div>
        )}
        {/* Phase 6.2 — the factory (workshop) profile: per-role thickness + save / apply the GLOBAL default */}
        {showWorkshop && (() => {
          void wsSaved; // referenced so a save (which bumps it) re-runs this + refreshes the summary below
          const ws = workshopSummaryFn(); // the saved factory default (read from localStorage)
          const decor = (id: string): string => BOARDS.find((b) => b.id === id)?.name ?? id;
          const roles: readonly [string, "carcass" | "back" | "shelf" | "facade" | "worktop", number][] = [
            ["Korpus", "carcass", thkCarcass], ["Orqa", "back", thkBack], ["Polka", "shelf", thkShelf],
            ["Fasad", "facade", thkFacade], ["Stoleshnitsa", "worktop", thkWorktop],
          ];
          return (
            <div style={{ position: "absolute", right: 10, top: 10, zIndex: 44, background: "#fff", color: PAPER_INK, borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 12, width: 260, ...compactSheet }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <b style={{ fontSize: 13 }}>📋 Fabrika profili</b>
                <button onClick={() => setActivePanel(null)} type="button" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 22, color: "#888", lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40, marginRight: -6, marginTop: -4 }}>✕</button>
              </div>
              <p style={{ fontSize: 11, color: "#777", margin: "0 0 8px", lineHeight: 1.35 }}>Material «Materiallar»da, birikma «⚙ Birikma»da. Bu yerda <b>qalinlik</b> (decordan alohida) + saqlangan <b>fabrika default</b>.</p>
              {roles.map(([label, role, mm]) => (
                <div key={role} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <DimField label={mm ? "mm" : "decor"} value={mm} onCommit={(v) => setRoleThickness(role, v)} min={0} />
                    {mm > 0 && <button onClick={() => setRoleThickness(role, 0)} type="button" title="Decor qalinligiga qaytarish" style={{ border: "1px solid #ccc", background: "#f6f6f6", borderRadius: 6, cursor: "pointer", fontSize: 12, padding: "2px 6px" }}>↺</button>}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: "#f4f6f9", border: "1px solid #dde3ea", fontSize: 11, color: "#555", lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: "#1f478a", marginBottom: 3 }}>Saqlangan fabrika default{wsSaved > 0 ? " ✓" : ""}</div>
                <div>Korpus: {decor(ws.plan.carcass)} · Fasad: {decor(ws.plan.facade)}</div>
                <div>Qalinlik override: {ws.thickness && Object.keys(ws.thickness).length ? Object.keys(ws.thickness).length + " ta rol" : "yo'q"}</div>
              </div>
              <button onClick={() => { saveWorkshopDefault(); setWsSaved((n) => n + 1); }} type="button" style={{ width: "100%", marginTop: 8, padding: "7px 10px", borderRadius: 8, border: "1px solid #1f5570", background: "#e0e8f7", color: "#1f478a", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>💾 Joriyni fabrika sifatida saqlash</button>
              <button onClick={() => { applyWorkshopDefault(); setWsSaved(0); }} type="button" style={{ width: "100%", marginTop: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid #bbb", background: "#f6f6f6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Fabrikaga qaytarish</button>
            </div>
          );
        })()}
        {/* Step 7c — the selected drill hole: move it on the panel face (persists as an override) or reset */}
        {selectedHole && (
          <div style={{ position: "absolute", left: 10, bottom: 10, zIndex: 45, background: "#fff", color: PAPER_INK, borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 12, width: 214, ...compactSheet }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>🕳 Teshik — ko'chirish</b>
              <button onClick={() => selectHole(null)} type="button" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 22, color: "#888", lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40, marginRight: -6, marginTop: -4 }}>✕</button>
            </div>
            <p style={{ fontSize: 10.5, color: "#888", margin: "0 0 8px" }}>Panel yuzasidagi joyi (mm). O'zgartirsangiz — usta override bo'ladi.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <DimField label="X" value={Math.round(selectedHole.fx / 10)} min={0} onCommit={(mm) => { const nx = mm * 10; setHoleOverride(selectedHole.partId, selectedHole.opId, nx, selectedHole.fy); selectHole({ ...selectedHole, fx: nx }); }} />
              <DimField label="Y" value={Math.round(selectedHole.fy / 10)} min={0} onCommit={(mm) => { const ny = mm * 10; setHoleOverride(selectedHole.partId, selectedHole.opId, selectedHole.fx, ny); selectHole({ ...selectedHole, fy: ny }); }} />
            </div>
            <button onClick={() => { clearHoleOverride(selectedHole.partId, selectedHole.opId); selectHole(null); }} type="button" style={{ width: "100%", marginTop: 8, padding: "6px 10px", borderRadius: 8, border: "1px solid #bbb", background: "#f6f6f6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Avto joyga qaytar</button>
          </div>
        )}
        {/* Step 9 — Application view: tag the active space's purpose + boiler-clearance warning */}
        {appView && (
          <div style={{ position: "absolute", right: 10, top: 10, zIndex: 45, background: "#fff", color: PAPER_INK, borderRadius: 12, boxShadow: "0 3px 16px rgba(0,0,0,0.2)", padding: 12, width: 220, ...compactSheet }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>🛋 Bo'shliq maqsadi</b>
              <button onClick={() => setActivePanel(null)} type="button" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 22, color: "#888", lineHeight: 1, padding: 6, minWidth: 40, minHeight: 40, marginRight: -6, marginTop: -4 }}>✕</button>
            </div>
            <p style={{ fontSize: 10.5, color: "#888", margin: "0 0 8px" }}>Bo'shliqni bosib tanlang, keyin maqsad bering — ichida ne borligi ko'rinadi.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PURPOSES.map((p) => (
                <button key={p.id} type="button" onClick={() => setPurpose(p.id)} style={{ ...pill, ...(activePurpose === p.id ? { borderColor: "#7a5cc9", background: "#e9e2f7", color: "#4a2f8a", fontWeight: 700 } : {}) }}>{p.icon} {p.label}</button>
              ))}
              <button type="button" onClick={() => setPurpose(null)} style={{ ...pill }}>✕ Yo'q</button>
            </div>
            {boilerFinds.length > 0 && (
              <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: "#fdf1d6", border: "1px solid #e5b84b", fontSize: 11.5, color: "#8a5a1f", fontWeight: 600 }}>⚠ Kotyol joyi kichik — kamida 500×800×300mm kerak</div>
            )}
          </div>
        )}
        {showTree && <TreePanel onClose={() => setActivePanel(null)} />}
        {showSpec && <SpecPanel onClose={() => setActivePanel(null)} />}
      </div>
    </div>
    </SwatchCtx.Provider>
    </KeypadCtx.Provider>
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

/** Step 6 — screen positions (canvas px) of a board's 4 edge midpoints for the kromka balls. Edge order
 *  mirrors the engine [front, back, side, side]: 0 = +v (top), 1 = −v (bottom), 2 = +u (right), 3 = −u
 *  (left) on the largest face. `kromka` supplies each edge's current K id. `vis` false when behind. */
function edgeBallPositions(
  board: { pos: [number, number, number]; size: [number, number, number] },
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  kromka?: readonly (string | null)[],
): { i: number; x: number; y: number; k: string | null; vis: boolean }[] {
  const [sx, sy, sz] = board.size;
  let tAxis: 0 | 1 | 2 = 0;
  if (sy <= sx && sy <= sz) tAxis = 1;
  else if (sz <= sx && sz <= sy) tAxis = 2;
  const faceAxes = [0, 1, 2].filter((a) => a !== tAxis) as [number, number];
  const w = renderer.domElement.clientWidth || 1, h = renderer.domElement.clientHeight || 1;
  const specs: [number, number, number][] = [[0, 0, 1], [1, 0, -1], [2, 1, 0], [3, -1, 0]]; // [i, u-sign, v-sign]
  const v = new THREE.Vector3();
  return specs.map(([i, ua, va]) => {
    const p: [number, number, number] = [board.pos[0], board.pos[1], board.pos[2]];
    p[faceAxes[0]] += (ua * board.size[faceAxes[0]]) / 2;
    p[faceAxes[1]] += (va * board.size[faceAxes[1]]) / 2;
    v.set(p[0], p[1], p[2]).project(camera);
    return { i, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, k: kromka?.[i] ?? null, vis: v.z < 1 };
  });
}

/** Step 7b — a live sample-panel diagram of the System-32 grid: two pin rows (front + back setback) with
 *  dots at the pitch spacing. Redraws as the profile is edited, so the effect is visible even on a block
 *  with no shelves. Purely illustrative (a fixed 560×360 sample side panel), not the real geometry. */
function JointDiagram({ profile }: { profile: JointProfile }) {
  const W = 210, H = 128, pad = 8;
  const depth = 5600, height = 3600; // sample side panel mm10
  const sx = (W - 2 * pad) / depth, sy = (H - 2 * pad) / height;
  const front = Math.max(0, profile.system32.frontSetback_mm10);
  const back = Math.max(0, profile.system32.backSetback_mm10);
  const pitch = Math.max(profile.system32.pitch_mm10, 60);
  const rows = [front, depth - back].filter((x) => x >= 0 && x <= depth); // clamp rows to the panel
  const dots: { x: number; y: number }[] = [];
  for (const rx of rows) for (let y = pitch; y < height; y += pitch) dots.push({ x: pad + rx * sx, y: pad + y * sy });
  return (
    <svg width={W} height={H} style={{ display: "block", margin: "0 auto 8px" }}>
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} rx={4} fill="#fff" stroke="#c9bd9e" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#8a5a1f" strokeWidth={2} />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={2.3} fill="#1f6f86" />)}
      <text x={pad + 3} y={pad + 11} fontSize={8} fill="#8a5a1f">old</text>
      <text x={W - pad - 20} y={pad + 11} fontSize={8} fill="#8a5a1f">orqa</text>
    </svg>
  );
}

/**
 * How a numeric field asks for the math keypad. Supplied by the editor only on MOBILE — on desktop the
 * fields keep their normal typing behaviour. Routed through context rather than a prop so EVERY DimField
 * gets the keypad (there are a dozen-plus of them, and any new one should not have to remember).
 */
const KeypadCtx = createContext<null | ((o: {
  label: string; value: number; units: "mm" | "cm"; min: number; suffix?: string; onCommit: (v: number) => void;
}) => void)>(null);

function DimField({ label, value, onCommit, min = 1, units = "mm", suffix }: { label: string; value: number; onCommit: (mm: number) => void; min?: number; units?: "mm" | "cm"; suffix?: string }) {
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
  // On mobile the field is a keypad TRIGGER, not a text box: readOnly so no caret and no native keyboard
  // (which would cover the model and cannot do 600+18 anyway).
  const openKeypad = useContext(KeypadCtx);
  return (
    <label style={dimField}>
      <span style={dimLabel}>{label}</span>
      <input
        style={dimInput}
        value={v}
        inputMode="decimal"
        readOnly={!!openKeypad}
        onClick={openKeypad ? () => openKeypad({ label, value, units, min, suffix, onCommit }) : undefined}
        onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={openKeypad ? undefined : commit}
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
  const { compact } = useViewport();
  const parts = useKarkas((s) => s.parts);
  const plan = useKarkas((s) => s.plan);
  const selectedId = useKarkas((s) => s.selectedId);
  const tapPart = useKarkas((s) => s.tapPart);
  const rows = estimate(parts, plan).parts;
  return (
    <div style={compact ? { ...treePanel, top: "auto", left: 8, right: 8, bottom: 122, width: "auto", maxHeight: "56vh", borderRadius: 16, zIndex: 80 } : treePanel}>
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
// M3.4 — one material target the swatch picker acts on: a plan slot, or a specific free board.
type SwatchTarget = { kind: "plan"; slot: keyof Omit<MaterialPlan, "edge"> } | { kind: "free"; id: string };
/** M3.4 — a MatSelect (used in the mobile panel AND the deep SpecPanel) opens the ONE swatch overlay via
 *  this context, so neither has to prop-drill the setter (Antigravity's single-overlay pattern). */
const SwatchCtx = createContext<null | ((t: SwatchTarget) => void)>(null);
const SWATCH_ORDER = ["Laminat", "Yog'och", "Shisha", "Metall", "Marmar", "Mato"] as const;
const SWATCH_BADGE: Record<string, string> = { "Laminat": "▤", "Yog'och": "🪵", "Shisha": "🧊", "Metall": "✨", "Marmar": "◈", "Mato": "🧵" };

/** M3.4 — ONE centralised material swatch picker (Antigravity's single-overlay pattern). Opened from any
 *  MatSelect slot or the free-board bar; picks a board (or «Standart» for a free board) and closes. Boards
 *  are grouped by materialCategory (Laminat / Yog'och / Shisha / Metall / Marmar / Mato), each a colour chip. */
function MaterialSwatchOverlay({ target, theme, onClose }: { target: SwatchTarget; theme: "light" | "dark"; onClose: () => void }) {
  const setPlanMaterial = useKarkas((s) => s.setPlanMaterial);
  const setFreeBoardMaterial = useKarkas((s) => s.setFreeBoardMaterial);
  const current = useKarkas((s) => (target.kind === "plan" ? s.plan[target.slot] : s.model.blocks[0]?.freeParts?.find((f) => f.id === target.id)?.material ?? ""));
  const pick = (id: string): void => { if (target.kind === "plan") setPlanMaterial(target.slot, id); else setFreeBoardMaterial(target.id, id); onClose(); };
  const dark = theme === "dark";
  const groups = SWATCH_ORDER.map((g) => ({ g, items: BOARDS.filter((b) => materialCategory(b) === g) })).filter((x) => x.items.length);
  const chip = (key: string, bg: string, active: boolean, label: string, on: () => void) => (
    <button key={key} type="button" title={label} aria-label={label} onClick={on}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10, border: active ? "2px solid #1f5570" : `1px solid ${dark ? "#33405a" : "#e3e6eb"}`, background: dark ? "#232b3d" : "#f7f8fa", color: "inherit", cursor: "pointer", fontSize: 12.5, fontWeight: 600, textAlign: "left" }}>
      <span style={{ width: 20, height: 20, borderRadius: 5, background: bg, border: "1px solid rgba(0,0,0,0.18)", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 211, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-label="Material tanlash" onClick={(e) => e.stopPropagation()} style={{ background: dark ? "#1c2230" : "#fff", color: dark ? "#e7ebf2" : "#1a1a1a", borderRadius: 14, padding: 18, width: "min(560px, 94vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 10px 44px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>▦ Material</strong>
          <button type="button" onClick={onClose} aria-label="Yopish" style={{ border: "none", background: "transparent", color: "inherit", fontSize: 24, lineHeight: 1, cursor: "pointer" }}>×</button>
        </div>
        {target.kind === "free" && <div style={{ marginBottom: 12 }}>{chip("std", "#e6e6e6", current === "", "Standart (rol bo'yicha)", () => pick(""))}</div>}
        {groups.map(({ g, items }) => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, opacity: 0.55, marginBottom: 7 }}>{SWATCH_BADGE[g]} {g}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              {items.map((b) => chip(b.id, b.hex, current === b.id, b.name, () => pick(b.id)))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatSelect({ label, slot }: { label: string; slot: keyof Omit<MaterialPlan, "edge"> }) {
  const value = useKarkas((s) => s.plan[slot]);
  const money = useMoney();
  const openSwatch = useContext(SwatchCtx);
  const b = BOARDS.find((x) => x.id === value);
  return (
    <label style={matRow}>
      <span style={{ ...mono, width: 62 }}>{label}</span>
      <button type="button" aria-haspopup="dialog" onClick={() => openSwatch?.({ kind: "plan", slot })} style={{ ...matSel, display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
        <span style={{ ...swatch, background: b?.hex ?? "#ccc" }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b?.name ?? value}</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{b ? `${money(b.pricePerM2)}/м²` : ""}</span>
      </button>
    </label>
  );
}

/** Right-hand «Спецификация» drawer — material picker + cut list + material-plan price totals. */
function SpecPanel({ onClose, variant = "side" }: { onClose: () => void; variant?: "side" | "tab" }) {
  const { compact } = useViewport();
  const parts = useKarkas((s) => s.parts);
  const plan = useKarkas((s) => s.plan);
  const model = useKarkas((s) => s.model);
  const setPlanMaterial = useKarkas((s) => s.setPlanMaterial);
  const lockedQuote = useKarkas((s) => s.lockedQuote);
  const lockQuote = useKarkas((s) => s.lockQuote);
  const unlockQuote = useKarkas((s) => s.unlockQuote);
  const money = useMoney();
  const e = estimate(parts, plan);
  const hw = hardwareEstimate(model);
  const ap = applianceEstimate(model); // Phase 3 — «Техника» (bought appliances)
  const total = e.priceUzs + hw.priceUzs + ap.priceUzs;
  // Step 6 — per-K painted kromka metres from the features overlay (counted once per physical panel,
  // matching the render board id or its layout base id so a 32mm double isn't double-counted).
  const kromkaByVar = useMemo(() => {
    const acc: Record<string, number> = {};
    const feats = model.features;
    if (feats) {
      const byId = new Map(parts.map((p) => [p.id, p] as const));
      for (const [pid, f] of Object.entries(feats)) {
        if (!f.kromka) continue;
        const part = byId.get(pid) ?? parts.find((p) => p.id.replace(/__(a|b|front)$/, "") === pid);
        if (!part) continue;
        for (const [k, v] of Object.entries(kromkaMetersByVariable(part.length_mm10, part.width_mm10, f.kromka, f.corners))) acc[k] = (acc[k] ?? 0) + v;
      }
    }
    return acc;
  }, [parts, model.features]);
  const kromkaVars = Object.entries(kromkaByVar).filter(([, mm10]) => mm10 > 0);
  // Ortho thumbnails (Moblo's Elements tab): the SAME three drafting views the «Chizma» sheet draws —
  // plan / front / section — shrunk to read at a glance above the cut list. Rebuilt only with the model.
  const ortho = useMemo(() => {
    try {
      const d = buildBlockDrawing(solveLayout(withApplianceCutouts(model), planThickness(plan)), solveModelToParts(withApplianceCutouts(model), planThickness(plan)));
      return [
        { key: "top", label: "Ustidan", svg: viewThumbSvg(d.plan, 120) },
        { key: "front", label: "Oldidan", svg: viewThumbSvg(d.front, 120) },
        { key: "side", label: "Yonidan", svg: viewThumbSvg(d.side, 120) },
      ];
    } catch { return []; } // a model the drawing can't project must never take the spec panel down
  }, [model, plan]);
  return (
    <div style={variant === "tab"
      ? { position: "absolute", top: 62, bottom: 0, left: "50%", transform: "translateX(-50%)", width: "min(680px, 100%)", background: "#fbfaf6", color: PAPER_INK, display: "flex", flexDirection: "column", overflow: "auto", zIndex: 4 }
      : compact ? { ...specPanel, top: "auto", left: 8, right: 8, bottom: 122, width: "auto", maxHeight: "56vh", borderRadius: 16, zIndex: 80 } : specPanel}>
      <div style={specHead}>
        <b style={{ fontSize: 15 }}>Спецификация</b>
        <button onClick={onClose} style={{ ...pill, marginLeft: "auto" }} type="button">✕</button>
      </div>

      {/* Ortho views — Top / Front / Side, so the usta sees WHAT is being cut before reading the list */}
      {ortho.length > 0 && (
        <div className="mob-ortho">
          {ortho.map((v) => (
            <figure key={v.key} className="mob-ortho-cell">
              <div className="mob-ortho-thumb" dangerouslySetInnerHTML={{ __html: v.svg }} />
              <figcaption className="mob-ortho-label">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      )}

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
      {/* Step 6 (Gate 6) — per-K painted kromka running metres (from the paint UI), beside the uniform edge total */}
      {kromkaVars.length > 0 && (
        <div style={{ ...mono, padding: "0 14px 6px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ color: "#8a6d1f", fontWeight: 700 }}>Jiyak (bo'yalgan):</span>
          {kromkaVars.map(([k, mm10]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: edgeVarById(k)?.hex ?? "#999", border: "1px solid rgba(0,0,0,0.15)" }} />
              {edgeVarById(k)?.name ?? k}: {(mm10 / 10000).toFixed(2)} m
            </span>
          ))}
        </div>
      )}
      {hw.lines.length > 0 && (
        <div style={{ ...mono, padding: "0 14px 6px" }}>
          Фурнитура: {hw.lines.map((l) => `${l.name} ×${l.qty}`).join(" · ")} — {money(hw.priceUzs)}
        </div>
      )}
      {ap.lines.length > 0 && (
        <div style={{ ...mono, padding: "0 14px 6px" }}>
          Техника: {ap.lines.map((l) => `${l.name} ×${l.qty}`).join(" · ")} — {money(ap.priceUzs)}
        </div>
      )}
      <div style={totalRow}>
        <span>Итого</span>
        <span>{money(total)}</span>
      </div>
      {/* Step 11 — client sign-off: lock the approved quote (snapshot); flag drift if the price changed */}
      <div style={{ margin: "0 14px 8px" }}>
        {!lockedQuote ? (
          <button type="button" onClick={() => lockQuote(total)} style={{ width: "100%", padding: "9px", borderRadius: 8, border: "none", background: "#00a961", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>✓ Tasdiqlash — narxni qulflash</button>
        ) : (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: lockedQuote.total === total ? "#e3f3ea" : "#fdf1d6", border: `1px solid ${lockedQuote.total === total ? "#00a961" : "#e5b84b"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ color: lockedQuote.total === total ? "#00532f" : "#8a5a1f" }}>🔒 Tasdiqlangan · {lockedQuote.date}</b>
              <button type="button" onClick={() => unlockQuote()} style={{ ...pill }}>🔓 Ochish</button>
            </div>
            <div style={{ ...mono, marginTop: 4 }}>Qulflangan narx: {money(lockedQuote.total)}</div>
            {lockedQuote.total !== total && <div style={{ fontSize: 11.5, color: "#8a5a1f", fontWeight: 600, marginTop: 2 }}>⚠ Joriy narx o'zgardi: {money(total)} (farq {money(total - lockedQuote.total)})</div>}
          </div>
        )}
      </div>
      <div style={specList}>
        {e.parts.map((p) => (
          <div key={p.id} style={specRow}>
            {/* panel silhouette — true L×W proportions, banded edges inked heavy */}
            <span className="mob-part-thumb" title="Panel shakli · qalin qirra = kromka" dangerouslySetInnerHTML={{ __html: panelThumbSvg(p.l_mm, p.w_mm, p.bands, 40) }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}<span style={{ ...mono, color: "#9a8a5f", marginLeft: 6 }}>{p.materialName}</span></span>
            <span style={mono}>{p.w_mm}×{p.l_mm}×{p.t_mm}</span>
            <span style={{ ...mono, color: "#8a6d1f", letterSpacing: 1 }} title="banded edges (1·2·3·4)">{p.bands.map((b) => (b ? "▪" : "·")).join("")}</span>
          </div>
        ))}
      </div>
      {/* M4 — non-box parts (a round leg, a wardrobe hanging rail, a knob) are not sheet panels: they carry
          no area, no kromka and no m² price, and never reach the CNC file. Listed here so the usta can
          source or turn them, and price them by hand. */}
      {e.others.length > 0 && (
        <>
          <div style={{ ...mono, padding: "8px 14px 4px", fontSize: 11, borderTop: "1px solid #e6e1d4", color: "#8a6d1f", fontWeight: 700 }}>
            ◯ Boshqa qismlar ({e.others.length}) — listdan kesilmaydi, narx qo'lda
          </div>
          <div style={specList}>
            {e.others.map((p) => (
              <div key={p.id} style={specRow}>
                <span style={{ width: 40, textAlign: "center", fontSize: 17 }} aria-hidden="true">◯</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}<span style={{ ...mono, color: "#9a8a5f", marginLeft: 6 }}>{p.materialName}</span></span>
                <span style={mono}>{p.w_mm}×{p.l_mm}×{p.t_mm}</span>
                <span style={{ ...mono, color: "#9a8a5f" }}>—</span>
              </div>
            ))}
          </div>
        </>
      )}
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

/* ── U2.1 — Moblo bottom-bar dimension control: a colour-dotted, tap-to-edit number (axis-coloured,
 *  like Moblo's readout). Commits the whole-block resize on blur / Enter. mm / cm aware. ── */
/** Safe left-to-right arithmetic for the keypad: digits, . , + − × ÷ (× ÷ bind tighter). No eval, no
 *  parens — an usta needs "600+18" / "1200/2", not a formula language. Returns null on an invalid/partial
 *  expression (e.g. a trailing operator) so the OK button can stay disabled until it resolves. */
function evalExpr(src: string): number | null {
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/\s/g, "");
  if (!s || !/^[-+*/.\d]+$/.test(s)) return null;
  const tokens = s.match(/(\d+\.?\d*|\.\d+|[-+*/])/g);
  if (!tokens) return null;
  const pass1: string[] = []; // fold × ÷ first
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i]!;
    if (tk === "*" || tk === "/") {
      const a = parseFloat(pass1.pop() ?? ""), b = parseFloat(tokens[i += 1] ?? "");
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      pass1.push(String(tk === "*" ? a * b : a / b));
    } else pass1.push(tk);
  }
  let acc: number | null = null, op = "+"; // then + −, left to right
  for (const tk of pass1) {
    if (tk === "+" || tk === "-") op = tk;
    else {
      const n = parseFloat(tk);
      if (!Number.isFinite(n)) return null;
      acc = acc === null ? (op === "-" ? -n : n) : op === "+" ? acc + n : acc - n;
    }
  }
  return acc === null || !Number.isFinite(acc) ? null : acc;
}

/**
 * The instance a solved part belongs to. Part ids are `<block>__inst_<instance>` (plus a suffix for the
 * pieces of a multi-part placement such as a drawer), which is the only link back from something the
 * master tapped in 3D to the placement the engine can move.
 */
function resolveInstanceIdOfPart(model: { blocks: readonly { id: string; instances: readonly { id: string }[] }[] }, partId: string): string | null {
  for (const b of model.blocks) {
    for (const i of b.instances) {
      const base = `${b.id}__inst_${i.id}`;
      if (partId === base || partId.startsWith(`${base}__`)) return i.id;
    }
  }
  return null;
}

/** #3 — usta-friendly numeric keypad with + − × ÷. Opens over a tapped dimension; commits the evaluated
 *  result (in mm). Accepts on-screen taps AND the physical keyboard (digits / operators / Enter / ⌫ / Esc). */
function MathKeypad({ label, value, units, onCommit, onClose, min = 1, suffix }: { label: string; value: number; units: "mm" | "cm"; onCommit: (mm: number) => void; onClose: () => void; min?: number; suffix?: string }) {
  // `min` because not every field bottoms out at 1 — a corner radius or a shelf angle may legitimately be
  // 0 (flat / square), and hard-coding 1 silently refused those. `suffix` because not every field is a
  // length: the tilt field is degrees and must not read «mm».
  const unitText = suffix ?? units;
  const toDisp = (mm: number) => (units === "cm" ? String(+(mm / 10).toFixed(1)) : String(mm));
  const [expr, setExpr] = useState(toDisp(value));
  const [fresh, setFresh] = useState(true); // first digit replaces the prefilled value; an operator keeps it
  const preview = evalExpr(expr);
  const push = (ch: string) => setExpr((e) => {
    const isOp = "+-*/".includes(ch);
    if (fresh) { setFresh(false); return isOp ? e + ch : ch; } // typing a number clears the prefill; an op extends it
    return e + ch;
  });
  const back = () => { setFresh(false); setExpr((e) => e.slice(0, -1)); };
  const clear = () => { setFresh(false); setExpr(""); };
  const ok = () => {
    if (preview === null) return;
    const mm = units === "cm" ? Math.round(preview * 10) : Math.round(preview);
    if (mm >= min) onCommit(mm);
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); ok(); }
      else if (e.key === "Escape") onClose();
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
      else if (/^[0-9.]$/.test(e.key)) push(e.key);
      else if ("+-*/".includes(e.key)) push(e.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so the handlers close over the latest expr/preview
  const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ".", "⌫", "+"] as const;
  const send = (k: string) => (k === "⌫" ? back() : push(k === "×" ? "*" : k === "÷" ? "/" : k === "−" ? "-" : k));
  return (
    <div className="mob-kp-backdrop" onClick={onClose}>
      <div className="mob-kp" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${label} — o'lcham`}>
        <div className="mob-kp-head"><span>{label}</span><button type="button" className="mob-x" onClick={onClose} aria-label="Yopish">×</button></div>
        <div className="mob-kp-display">
          <span className="mob-kp-expr">{expr || "0"}</span>
          <span className="mob-kp-eq">{preview !== null && /[-+*/]/.test(expr) ? `= ${+preview.toFixed(2)} ${unitText}` : unitText}</span>
        </div>
        <div className="mob-kp-grid">
          {KEYS.map((k) => <button key={k} type="button" className={"mob-kp-key" + ("÷×−+".includes(k) ? " is-op" : "") + (k === "⌫" ? " is-back" : "")} onClick={() => send(k)}>{k}</button>)}
        </div>
        <div className="mob-kp-actions">
          <button type="button" className="mob-kp-clear" onClick={clear}>C</button>
          <button type="button" className="mob-kp-ok" onClick={ok} disabled={preview === null}>OK</button>
        </div>
      </div>
    </div>
  );
}

function MobDim({ axis, value, onCommit, units, onKeypad, locked }: { axis: "x" | "y" | "z"; value: number; onCommit: (mm: number) => void; units: "mm" | "cm"; onKeypad?: () => void; locked?: boolean }) {
  const toDisp = (mm: number) => (units === "cm" ? String(+(mm / 10).toFixed(1)) : String(mm));
  const [v, setV] = useState(toDisp(value));
  useEffect(() => { setV(toDisp(value)); }, [value, units]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const raw = parseFloat(v.replace(",", "."));
    const mm = units === "cm" ? Math.round(raw * 10) : Math.round(raw);
    if (Number.isFinite(mm) && mm >= 1 && mm !== value) onCommit(mm);
    else setV(toDisp(value));
  };
  const color = axis === "x" ? "var(--ax-x)" : axis === "y" ? "var(--ax-y)" : "var(--ax-z)";
  // `locked` — the whole-cabinet bar is READ-ONLY while a free board is selected, so tapping it can't
  // accidentally resize the cabinet (the free board is edited by its own «Erkin taxta» card instead).
  // #3 — otherwise, on mobile the chip opens the math keypad (readOnly input so no caret/native keyboard).
  return (
    <label className="mob-dim" style={locked ? { opacity: 0.5 } : undefined}>
      <span className="dot" style={{ background: color }} />
      <input className="mob-dim-input" value={v} inputMode="decimal"
        readOnly={locked || !!onKeypad}
        onClick={locked ? undefined : onKeypad}
        onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={locked || onKeypad ? undefined : commit} onFocus={locked || onKeypad ? undefined : (e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

/* ── U2.1 — Moblo top-bar icons (inline stroke SVG) ── */
const MOB_ICO = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function MobHome() { return <svg {...MOB_ICO}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>; }
function MobMenu() { return <svg {...MOB_ICO}><path d="M4 7h16M4 12h16M4 17h16" /></svg>; }
function MobPencil() { return <svg {...MOB_ICO} width={14} height={14}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>; }
function MobMoon() { return <svg {...MOB_ICO}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>; }
function MobSun() { return <svg {...MOB_ICO}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
/* U2.2 — left-toolbar icons */
function MobUndo() { return <svg {...MOB_ICO}><path d="M9 7 4 12l5 5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>; }
function MobRedo() { return <svg {...MOB_ICO}><path d="M15 7l5 5-5 5" /><path d="M4 18v-2a4 4 0 0 1 4-4h12" /></svg>; }
function MobCube() { return <svg {...MOB_ICO}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>; }
function MobInside() { return <svg {...MOB_ICO}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>; }
function MobFacade() { return <svg {...MOB_ICO}><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" /><path d="M9 9h6v6H9z" /></svg>; }
function MobHoles() { return <svg {...MOB_ICO}><circle cx="8" cy="8" r="1.4" /><circle cx="16" cy="8" r="1.4" /><circle cx="8" cy="16" r="1.4" /><circle cx="16" cy="16" r="1.4" /></svg>; }
function MobCamera() { return <svg {...MOB_ICO}><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>; }
function MobTarget() { return <svg {...MOB_ICO}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>; }
function MobPlus() { return <svg {...MOB_ICO} width={24} height={24} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>; }
function MobPaint() { return <svg {...MOB_ICO}><rect x="4" y="3" width="12" height="8" rx="2" /><path d="M16 7h3v5a3 3 0 0 1-3 3h-2v4" /><path d="M10 15v3" /></svg>; }
const mono: CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#5c6a61" };
const dimField: CSSProperties = { display: "flex", alignItems: "center", gap: 2, border: "1px solid #d8d2c4", borderRadius: 7, padding: "1px 3px", background: "#fff", color: PAPER_INK };
const dimLabel: CSSProperties = { fontFamily: "system-ui", fontSize: 11, fontWeight: 700, color: "#8a6d1f", width: 12, textAlign: "center" };
const dimInput: CSSProperties = { width: 44, border: "none", outline: "none", background: "transparent", font: "600 13px ui-monospace, monospace", color: "#18241d", textAlign: "right", padding: "3px 2px" };
const pill: CSSProperties = { padding: "7px 12px", minHeight: 34, borderRadius: 999, border: "1px solid #d8d2c4", background: "none", color: "inherit", font: "600 13px system-ui", cursor: "pointer", flex: "0 0 auto", whiteSpace: "nowrap" };
const editbar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, flexWrap: "wrap" };
// Step 9 — the purpose tags a client cares about (each id is a SectionPurpose)
const PURPOSES = [
  { id: "boiler", icon: "🔥", label: "Kotyol" },
  { id: "hanging", icon: "👔", label: "Osma" },
  { id: "storage", icon: "📦", label: "Saqlash" },
  { id: "appliance", icon: "🔌", label: "Texnika" },
  { id: "display", icon: "🖼", label: "Vitrina" },
  { id: "drawer", icon: "🗄", label: "Tortma" },
] as const;
const matLegendRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 7px", marginBottom: 2, border: "1px solid transparent", borderRadius: 8, background: "transparent", cursor: "pointer", font: "600 12px system-ui", color: "#222" };
const matLegendActive: CSSProperties = { borderColor: "#c9a24b", background: "#f7efd8" };
const matLegendSwatch: CSSProperties = { width: 20, height: 20, borderRadius: 5, flex: "0 0 auto", border: "1px solid rgba(0,0,0,0.15)" };
const popWrap: CSSProperties = { position: "relative", display: "inline-flex", zIndex: 56 };
const popover: CSSProperties = { position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 176, background: "#fff", color: PAPER_INK, border: "1px solid #e0dccf", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.17)", padding: 6, display: "flex", flexDirection: "column", gap: 2, zIndex: 60 };
const popRight: CSSProperties = { ...popover, left: "auto", right: 0 };
const popItem: CSSProperties = { padding: "9px 12px", borderRadius: 8, border: "none", background: "none", color: "inherit", font: "600 13px system-ui", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" };
const popSep: CSSProperties = { height: 1, background: "#eee7d8", margin: "4px 2px" };
const act: CSSProperties = { padding: "9px 13px", minHeight: 40, borderRadius: 10, border: "1px solid #00a961", background: "#e3f3ea", color: "#006b3f", font: "650 13px system-ui", cursor: "pointer", flex: "0 0 auto", whiteSpace: "nowrap" };
const selBar: CSSProperties = { padding: "0 14px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
const badge: CSSProperties = { padding: "3px 8px", borderRadius: 999, background: "#e3f3ea", color: "#006b3f", font: "600 11px system-ui" };
const warnBar: CSSProperties = { margin: "0 14px 10px", padding: "8px 12px", borderRadius: 8, background: "#fdf3e0", border: "1px solid #f0d9a8", color: "#8a5a1f", display: "flex", gap: 10, alignItems: "center", font: "13px system-ui", minWidth: 0 };
const specPanel: CSSProperties = { position: "absolute", top: 0, right: 0, bottom: 0, width: "min(380px, 92vw)", background: "#fbfaf6", color: PAPER_INK, borderLeft: "1px solid #e0dccf", boxShadow: "-8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 5 };
const treePanel: CSSProperties = { position: "absolute", top: 0, left: 0, bottom: 0, width: "min(300px, 84vw)", background: "#fbfaf6", color: PAPER_INK, borderRight: "1px solid #e0dccf", boxShadow: "8px 0 24px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", zIndex: 5 };
const treeRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "8px 8px", borderBottom: "1px solid #f0ece1", fontFamily: "system-ui", fontSize: 13, cursor: "pointer", borderRadius: 6 };
const treeRowOn: CSSProperties = { background: "#e0ecff", color: "#1f478a", fontWeight: 700 };
const specHead: CSSProperties = { padding: "12px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e6e1d4", fontFamily: "system-ui" };
const specTotals: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#e6e1d4", padding: 1, margin: "10px 14px 6px", borderRadius: 8, overflow: "hidden" };
const cell: CSSProperties = { background: "#fff", color: PAPER_INK, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2, fontFamily: "system-ui", fontSize: 15 };
const specList: CSSProperties = { flex: 1, minHeight: 0, overflow: "auto", padding: "4px 14px" };
const specRow: CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0ece1", fontFamily: "system-ui", fontSize: 13 };
const totalRow: CSSProperties = { margin: "0 14px 8px", padding: "8px 12px", borderRadius: 8, background: "#e3f3ea", color: "#00532f", display: "flex", justifyContent: "space-between", alignItems: "center", font: "800 17px system-ui" };
const picker: CSSProperties = { padding: "10px 14px 2px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid #eee7d8" };
const matRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const swatch: CSSProperties = { width: 16, height: 16, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", flex: "0 0 auto" };
const matSel: CSSProperties = { flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 7, border: "1px solid #d8d2c4", background: "#fff", color: PAPER_INK, font: "13px system-ui", cursor: "pointer" };
