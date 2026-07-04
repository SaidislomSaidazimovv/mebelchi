// Phase C — "Конструктор". Re-skinned to mirror the room editor (Phase A): a live
// 3D stage with its own chrome (price + nav bar on top, a category toolbar on the
// bottom). Bottom-left carries two round toggles like the room editor — a 3D/2D
// view switcher and a render-style switcher (realistic / translucent / wireframe).
// Tapping a module in the scene selects + highlights it and swaps the bottom
// toolbar to per-item actions (edit / open / duplicate / delete).
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useKarkas } from "../three/karkasStore";
import { buildCarcassModel } from "../../../../engine/structure/demoModel.js";
import { useT } from "../i18n/useT";
import { priceCabs } from "../model/toProject";
import { useMoney } from "../useMoney";
import { VariantScene } from "../three/VariantScene";
import { ConstructorPlan } from "../components/ConstructorPlan";
import { KitchenElevation } from "../components/KitchenElevation";
import { FurnitureEditor, emptyCfg, type PartCfg } from "../components/FurnitureEditor";
import { FillEditor } from "../components/FillEditor";
import { planRuns } from "../model/runPlan";
import { fillGapSpan } from "../model/fill";
import { dockToRun } from "../model/footprint";
import { type Cabinet } from "../model/cabinet";
import { CABINET_GROUPS, APPLIANCE_GROUPS, FURNITURE_GROUPS, EXTRA_GROUPS, type AddTemplate } from "../model/addCatalog";
import { LIBRARY_GROUPS, type LibraryItem } from "../model/library";
import { FLOOR_COVERINGS } from "../model/floors";
import {
  IconCabinets,
  IconAppliance,
  IconDining,
  IconExtra,
  IconLines,
  IconTransparent,
  IconRealistic,
  IconEditItem,
  IconOpenItem,
  IconDuplicateItem,
  IconDeleteItem,
  IconUndo,
  IconRedo,
  Icon3D,
  IconFront,
  IconPlan,
} from "../components/icons";

/** A real built-in appliance (excludes plain modules and render-only fillers). */
const isAppliance = (c: Cabinet) => !!c.appliance && c.appliance !== "none" && c.appliance !== "filler";

type Sheet = null | "pickCab" | "pickAppl" | "editor" | "dining" | "extra" | "library";

const MODES = [
  { v: "wire", Icon: IconLines },
  { v: "xray", Icon: IconTransparent },
  { v: "real", Icon: IconRealistic },
] as const;

export function ConfigScreen() {
  const t = useT();
  const money = useMoney();
  const cabs = useStore((s) => s.cabs);
  const selIdx = useStore((s) => s.selIdx);
  const mode = useStore((s) => s.mode);
  const runLayout = useStore((s) => s.runLayout);
  const runStyle = useStore((s) => s.runStyle);
  const points = useStore((s) => s.roomPoints);
  const ceiling = useStore((s) => s.ceiling);
  const openings = useStore((s) => s.openings);
  const interiorWalls = useStore((s) => s.interiorWalls);
  const fittings = useStore((s) => s.fittings);
  const wallSurfaces = useStore((s) => s.wallSurfaces);
  const waterWall = useStore((s) => s.waterWall);
  const floorCovering = useStore((s) => s.floorCovering);
  const selectCab = useStore((s) => s.selectCab);
  const patchCab = useStore((s) => s.patchCab);
  const patchCabLive = useStore((s) => s.patchCabLive);
  const applyFinishToAll = useStore((s) => s.applyFinishToAll);
  const patchAllCabs = useStore((s) => s.patchAllCabs);
  const fillCabGap = useStore((s) => s.fillCabGap);
  const addCab = useStore((s) => s.addCab);
  const myLibrary = useStore((s) => s.myLibrary);
  const saveToLibrary = useStore((s) => s.saveToLibrary);
  const removeLibraryItem = useStore((s) => s.removeLibraryItem);
  const replaceCab = useStore((s) => s.replaceCab);
  const removeCab = useStore((s) => s.removeCab);
  const duplicateCab = useStore((s) => s.duplicateCab);
  const resizeCab = useStore((s) => s.resizeCab);
  const moveCabsX = useStore((s) => s.moveCabsX);
  const moveCabPlan = useStore((s) => s.moveCabPlan);
  const beginCabEdit = useStore((s) => s.beginCabEdit);
  const undoCab = useStore((s) => s.undoCab);
  const redoCab = useStore((s) => s.redoCab);
  const canUndoCab = useStore((s) => s.cabsPast.length > 0);
  const canRedoCab = useStore((s) => s.cabsFuture.length > 0);
  const setMode = useStore((s) => s.setMode);
  const saveCurrent = useStore((s) => s.saveCurrent);
  const flash = useStore((s) => s.flash);
  const back = useStore((s) => s.back);
  const next = useStore((s) => s.next);

  const labelFor = (c: Cabinet): string => {
    if (c.furniture) return c.furniture === "table" ? `${t.labels.furn.table} ${c.w}` : t.labels.furn[c.furniture] ?? c.furniture;
    if (isAppliance(c)) return t.labels.appl[c.appliance as string] ?? t.config.module;
    const k = c.kind === "upper" ? t.config.kindUpper : c.kind === "tall" ? t.config.kindTall : t.config.kindBase;
    return `${k} ${c.w}`;
  };
  const subFor = (c: Cabinet): string => {
    if (c.furniture) return t.config.subFurn;
    if (isAppliance(c)) return t.config.subAppl;
    return c.kind === "upper" ? t.config.subUpper : c.kind === "tall" ? t.config.subTall : t.config.subBase;
  };
  const modeLabel = (v: (typeof MODES)[number]["v"]) => (v === "wire" ? t.config.mWire : v === "xray" ? t.config.mXray : t.config.mReal);

  const [view, setView] = useState<"3d" | "plan" | "front">("3d");
  const [magnet, setMagnet] = useState(true); // front-view: snapping / reorder on drag
  const [guide, setGuide] = useState(true); // front-view: alignment guide lines
  const [planGrid, setPlanGrid] = useState(false); // plan: snapping grid overlay
  const [planMagnet, setPlanMagnet] = useState(true); // plan: snap drag/rotate
  const [g3dMagnet, setG3dMagnet] = useState(true); // 3D: snap move/rotate to walls/neighbours/45°
  const [wallIdx, setWallIdx] = useState(0); // which wall run the front view shows
  const [picked, setPicked] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]); // modules with doors/drawers open (3D)
  const [showHint, setShowHint] = useState(true);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [libTab, setLibTab] = useState<"catalog" | "mine">("catalog"); // Biblioteka sheet: catalog vs saved blocks
  const [fillOpen, setFillOpen] = useState(false); // focused full-screen Наполнение editor
  const [sheetClosing, setSheetClosing] = useState(false);
  // when set, picking a catalog item REPLACES this module (instead of adding a new one)
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [ctlMenu, setCtlMenu] = useState<null | "view" | "mode">(null);
  const [menuClosing, setMenuClosing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // per-module editor selections (materials / add-ons / toggles), kept for the
  // session so they survive closing + reopening the editor
  const [partCfg, setPartCfg] = useState<Record<string, PartCfg>>({});
  // inline dimension editor for the front view (tap a measurement number)
  const [feEdit, setFeEdit] = useState<{ x: number; y: number; apply: (v: number) => void } | null>(null);
  const [feVal, setFeVal] = useState("");

  // the toolbar hint auto-hides after 3s (room-editor behaviour)
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(t);
  }, []);
  // drop the selection if its module was deleted out from under us
  useEffect(() => {
    if (picked && !cabs.some((c) => c.id === picked)) setPicked(null);
  }, [cabs, picked]);

  const closeSheet = () => {
    setReplaceId(null); // leaving the catalog cancels any pending replace
    setFillOpen(false);
    setSheetClosing(true);
    setTimeout(() => {
      setSheet(null);
      setSheetClosing(false);
    }, 230);
  };
  const closeMenu = () => {
    setMenuClosing(true);
    setTimeout(() => {
      setCtlMenu(null);
      setMenuClosing(false);
    }, 200);
  };
  const toggleMenu = (which: "view" | "mode") => {
    if (ctlMenu === which) closeMenu();
    else {
      setMenuClosing(false);
      setCtlMenu(which);
    }
  };
  const pickView = (v: "3d" | "plan" | "front") => {
    setView(v);
    closeMenu();
  };
  const pickMode = (m: (typeof MODES)[number]["v"]) => {
    setMode(m);
    closeMenu();
  };

  // grip: tap toggles; drag down collapses, drag up expands (mirrors the room editor)
  const gripStart = useRef<number | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    gripStart.current = e.clientY;
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (gripStart.current == null) return;
    const dy = e.clientY - gripStart.current;
    if (dy > 28) {
      setCollapsed(true);
      gripStart.current = null;
    } else if (dy < -28) {
      setCollapsed(false);
      gripStart.current = null;
    }
  };
  const onGripUp = () => {
    if (gripStart.current != null) setCollapsed((c) => !c);
    gripStart.current = null;
  };

  // NOTE: no early return when `cabs` is empty — deleting the last module must keep the
  // constructor (and the room) on screen so the user can add more. An early return here
  // was ALSO a React hooks-order crash (a useMemo below it would stop being called →
  // "rendered fewer hooks" → white screen). Everything below tolerates 0 cabs.
  const i = selIdx >= 0 && selIdx < cabs.length ? selIdx : 0;
  const sel = picked ? cabs.find((c) => c.id === picked) ?? null : null;
  const selIndex = picked ? cabs.findIndex((c) => c.id === picked) : -1;
  // while the module editor sheet is open, HIDE the on-cabinet selection UI (blue highlight,
  // dimension arrows, move/resize handles) in every view so material/handle changes read
  // clearly — the selection still works in the background (edits target `i`/selIdx).
  const sceneSelId = sheet === "editor" ? null : picked;
  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";
  const floorId = FLOOR_COVERINGS[floorCovering]?.id;

  // select + highlight a module by id (from the scene or a chip)
  const pick = (id: string | null) => {
    setPicked(id);
    if (id) {
      const idx = cabs.findIndex((c) => c.id === id);
      if (idx >= 0) selectCab(idx);
    }
  };
  // add a NEW module from the catalog: auto-fits into a gap, then selects it so the
  // toolbar switches to per-item actions and the scene highlights the new piece
  const addItem = (tpl: AddTemplate) => {
    if (replaceId) {
      replaceCab(replaceId, tpl.cab); // keep the id → selection stays valid
      pick(replaceId);
      flash(t.config.replaced(tpl.name));
      setReplaceId(null);
      closeSheet();
      return;
    }
    // in the front (elevation) view, add to the wall the user is currently looking at
    const id = addCab(tpl.cab, front ? wall : undefined);
    if (id) {
      pick(id);
      flash(t.config.added(tpl.name));
    }
    closeSheet();
  };
  // add a personal library block — same auto-fit + select flow as a catalog item
  const addLibraryItem = (item: LibraryItem) => {
    const id = addCab(item.cab, front ? wall : undefined);
    if (id) {
      pick(id);
      flash(t.config.added(item.name));
    }
    closeSheet();
  };
  // Phase K — open a personal block. A karkas block (from-scratch StructuralModel) re-opens in the
  // karkas editor to edit / show / re-quote; a plain cabinet block adds into the room as before.
  const openLibraryItem = (item: LibraryItem) => {
    if (item.karkasJson) {
      useKarkas.getState().importProject(item.karkasJson); // sets the model + opens the editor
      closeSheet();
      return;
    }
    addLibraryItem(item);
  };
  // Phase K — start a NEW karkas block from scratch at the client's size (0 dan).
  const openNewKarkas = () => {
    const s = window.prompt("O'lcham — en × bo'y × chuqurlik (mm):", "600x720x560");
    if (s == null) return;
    const n = s.split(/[^\d]+/).map((x) => parseInt(x, 10)).filter((x) => x > 0);
    useKarkas.getState().openWith(buildCarcassModel(n[0] ?? 600, n[1] ?? 720, n[2] ?? 560));
    closeSheet();
  };
  // "Заменять" → open the catalog matching this module's category, in replace mode
  const onReplaceCab = () => {
    const cab = cabs[i];
    if (!cab) return;
    setReplaceId(cab.id);
    const target: Sheet = cab.furniture
      ? cab.furniture === "table" || cab.furniture === "chair"
        ? "dining"
        : "extra"
      : isAppliance(cab)
        ? "pickAppl"
        : "pickCab";
    setSheet(target);
  };

  // the editor config for the active module + an updater
  const curId = cabs[i]?.id ?? "";
  const curCfg = partCfg[curId] ?? emptyCfg();
  const updateCfg = (updater: (c: PartCfg) => PartCfg) => setPartCfg((m) => ({ ...m, [curId]: updater(m[curId] ?? emptyCfg()) }));

  const openSheet = (kind: Sheet) => setSheet(kind);

  // selected-module toolbar actions
  const editSel = () => {
    if (!sel) return;
    selectCab(selIndex);
    setSheet("editor");
  };
  // toggle the selected module's doors/drawers open ↔ closed (3D animation)
  const openSel = () => {
    if (!picked) return;
    setOpenIds((ids) => (ids.includes(picked) ? ids.filter((x) => x !== picked) : [...ids, picked]));
  };
  const dupSel = () => {
    if (!picked) return;
    const nid = duplicateCab(picked);
    if (nid) setPicked(nid);
  };
  const delSel = () => {
    if (!picked) return;
    removeCab(picked);
    setOpenIds((ids) => ids.filter((x) => x !== picked));
    setPicked(null);
  };

  const ViewIcon = view === "plan" ? IconPlan : view === "front" ? IconFront : Icon3D;
  const ModeIcon = mode === "wire" ? IconLines : mode === "xray" ? IconTransparent : IconRealistic;

  // front (elevation) view shows one wall run at a time — switchable via the wall bar
  const front = view === "front";
  const allRuns = useMemo(() => planRuns(points, waterWall, runLayout, openings).runs, [points, waterWall, runLayout, openings]);
  const runs = front ? allRuns : [];
  // selected module can fill empty space beside it (after a delete, or after being
  // dragged onto a wall) → contextual chip. A freed (px/pz) module flush to a wall is
  // re-docked for the gap test so the chip appears there too.
  const fillSpan = (() => {
    if (!sel || sheet) return null;
    let cab = sel;
    if (cab.px != null && cab.pz != null) {
      const d = dockToRun(cab, points, waterWall, runLayout, openings);
      if (!d) return null;
      cab = { ...cab, run: d.run, x: d.x, px: undefined, pz: undefined, rot: undefined };
    }
    const list = cab === sel ? cabs : cabs.map((c) => (c.id === cab.id ? cab : c));
    return fillGapSpan(list, cab, allRuns[cab.run ?? 0]?.len ?? Infinity);
  })();
  // run indices that actually carry modules, in order
  const runIdxs = front
    ? Array.from(new Set(cabs.map((c) => c.run ?? 0))).filter((r) => r < runs.length).sort((a, b) => a - b)
    : [];
  const wall = runIdxs.includes(wallIdx) ? wallIdx : runIdxs[0] ?? 0;
  const wallPos = Math.max(0, runIdxs.indexOf(wall));
  const runLabel = (r: number) => {
    const k = runs[r]?.kind;
    return k === "island" ? t.config.island : k === "peninsula" ? t.config.peninsula : t.config.wall(runIdxs.indexOf(r) + 1);
  };
  const cycleWall = (dir: 1 | -1) => {
    if (runIdxs.length < 2) return;
    setWallIdx(runIdxs[(wallPos + dir + runIdxs.length) % runIdxs.length]);
  };
  const run0Len = front ? runs[wall]?.len ?? 4000 : 4000;
  const cabs0 = front ? cabs.filter((c) => (c.run ?? 0) === wall) : cabs;

  // tap a width/height/depth number → inline editor → store
  const onEditDim = ({ clientX, clientY, value, cabId, kind }: { clientX: number; clientY: number; value: number; cabId: string; kind: "w" | "h" | "depth" }) => {
    const idx = cabs.findIndex((c) => c.id === cabId);
    if (idx < 0) return;
    const apply =
      kind === "w"
        ? (v: number) => resizeCab(cabId, v)
        : kind === "depth"
          ? (v: number) => patchCab(idx, { depth: Math.max(200, Math.min(900, v)) })
          : (v: number) => patchCab(idx, { h: Math.max(200, Math.min(2400, v)) });
    setFeEdit({ x: clientX, y: clientY, apply });
    setFeVal(String(value));
  };
  const commitFe = () => {
    if (feEdit) {
      const v = parseInt(feVal, 10);
      if (v && v >= 100) feEdit.apply(v);
    }
    setFeEdit(null);
  };
  // ± buttons on the inline editor: step the dimension by 5 cm and apply LIVE (keep the
  // editor open so the user can keep tapping); onPointerDown-preventDefault keeps the
  // input focused so the button press doesn't blur→commit→close.
  const stepFe = (delta: number) => {
    const v = Math.max(150, Math.min(3000, (parseInt(feVal, 10) || 0) + delta));
    setFeVal(String(v));
    feEdit?.apply(v);
  };
  // commit a front-view drag: row re-tile (x) + the dragged wall unit's mountY
  const onReorder = (updates: { id: string; x: number; mountY?: number }[]) => {
    moveCabsX(
      updates.map((u) => ({
        id: u.id,
        x: Math.max(0, u.x),
        ...(u.mountY != null ? { mountY: Math.max(0, Math.min(ceiling - 100, u.mountY)) } : {}),
      })),
    );
  };

  return (
    <div className="roomscene">
      {/* price + navigation bar (mirrors the room editor's step bar) */}
      <div className="stepbar cfg-bar">
        <div className="cfg-price">
          {money(priceCabs(cabs))}
          <span className="cfg-price-i" aria-hidden>ⓘ</span>
        </div>
        <div className="cfg-nav">
          <button className="cfg-back" onClick={back} type="button" aria-label={t.config.back}>←</button>
          <button className="step-next" onClick={next} type="button">{t.config.next}</button>
        </div>
      </div>

      {/* front view: switch which wall run / island is shown + edited */}
      {front && runIdxs.length > 0 && (
        <div className="wall-switcher">
          <button className="wall-arrow" onClick={() => cycleWall(-1)} disabled={runIdxs.length < 2} type="button" aria-label={t.config.prevWall}>←</button>
          <span className="wall-label">{runLabel(wall)}</span>
          <button className="wall-arrow" onClick={() => cycleWall(1)} disabled={runIdxs.length < 2} type="button" aria-label={t.config.nextWall}>→</button>
        </div>
      )}

      <div className="scene-area">
        {view === "3d" ? (
          <VariantScene
            points={points}
            ceiling={ceiling}
            openings={openings}
            coveringColor={coveringColor}
            floorId={floorId}
            interiorWalls={interiorWalls}
            fittings={fittings}
            wallSurfaces={wallSurfaces}
            waterWall={waterWall}
            layout={runLayout}
            style={runStyle}
            cabs={cabs}
            mode={mode}
            magnet={g3dMagnet}
            nav
            openIds={openIds}
            selectedId={sceneSelId}
            onSelectCab={pick}
            onMovePlan={moveCabPlan}
            onBeginEdit={beginCabEdit}
            onMountY={(id, mountY) => {
              const idx = cabs.findIndex((c) => c.id === id);
              if (idx >= 0) patchCab(idx, { mountY });
            }}
            onResize={(id, patch) => {
              const idx = cabs.findIndex((c) => c.id === id);
              if (idx >= 0) patchCab(idx, patch);
            }}
            onReady={() => saveCurrent(true)}
          />
        ) : view === "plan" ? (
          <ConstructorPlan
            points={points}
            openings={openings}
            interiorWalls={interiorWalls}
            coveringColor={coveringColor}
            layout={runLayout}
            waterWall={waterWall}
            cabs={cabs}
            mode={mode}
            grid={planGrid}
            magnet={planMagnet}
            selectedId={sceneSelId}
            onSelectCab={pick}
            onMovePlan={moveCabPlan}
            onBeginEdit={beginCabEdit}
            onEditDim={onEditDim}
          />
        ) : (
          <KitchenElevation
            cabs={cabs0}
            runLen={run0Len}
            ceiling={ceiling}
            dims
            mode={mode}
            magnet={magnet}
            guide={guide}
            selectedId={sceneSelId}
            onSelect={pick}
            onEditDim={onEditDim}
            onReorder={onReorder}
            className="scene-canvas"
          />
        )}

        {/* selected-module info card */}
        {sel && (
          <div className="item-card">
            <div className="item-card-name">
              {labelFor(sel)}
              <span className="item-card-i" aria-hidden>ⓘ</span>
            </div>
            <div className="item-card-desc">{subFor(sel)}</div>
            <div className="item-card-dim">{sel.w} × {sel.h} {t.config.mm}</div>
          </div>
        )}

        {/* contextual "fill empty space" — only when the selected module borders a gap */}
        {fillSpan && sel && (
          <button className="fill-chip" onClick={() => fillCabGap(sel.id)} type="button">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 5v14M20 5v14" />
              <path d="M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3" />
            </svg>
            {t.config.fill}
          </button>
        )}

        {!sel && showHint && (
          <div className="plan-hint">{t.config.hint}</div>
        )}

        {/* bottom-left toggles: 3D/2D view + render style */}
        <div className="scene-ctl cfg-toolset">
          <button className="round-ctl" onClick={() => toggleMenu("view")} type="button" aria-label={t.config.view}>
            <ViewIcon />
          </button>
          <button className="round-ctl" onClick={() => toggleMenu("mode")} type="button" aria-label={t.config.display}>
            <ModeIcon />
          </button>
        </div>

        {/* undo/redo for constructor edits (move/rotate/resize/reorder/edit/…) */}
        <div className="scene-ctl undo-redo">
          <button type="button" onClick={undoCab} disabled={!canUndoCab} aria-label={t.config.undo}>
            <IconUndo />
          </button>
          <button type="button" onClick={redoCab} disabled={!canRedoCab} aria-label={t.config.redo}>
            <IconRedo />
          </button>
        </div>

        {ctlMenu && (
          <>
            <div className="sheet-backdrop" onClick={closeMenu} />
            <div className={`view-menu pop-anim${menuClosing ? " closing" : ""}`}>
              {ctlMenu === "view" ? (
                <>
                  {view === "3d" && (
                    <>
                      <div className="vm-toggle">
                        <span>{t.config.magnet}</span>
                        <button className={`switch${g3dMagnet ? " on" : ""}`} onClick={() => setG3dMagnet((m) => !m)} type="button" aria-pressed={g3dMagnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  {view === "front" && (
                    <>
                      <div className="vm-toggle">
                        <span>{t.config.magnet}</span>
                        <button className={`switch${magnet ? " on" : ""}`} onClick={() => setMagnet((m) => !m)} type="button" aria-pressed={magnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-toggle">
                        <span>{t.config.guide}</span>
                        <button className={`switch${guide ? " on" : ""}`} onClick={() => setGuide((g) => !g)} type="button" aria-pressed={guide}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  {view === "plan" && (
                    <>
                      <div className="vm-toggle">
                        <span>{t.config.grid}</span>
                        <button className={`switch${planGrid ? " on" : ""}`} onClick={() => setPlanGrid((g) => !g)} type="button" aria-pressed={planGrid}><span className="knob" /></button>
                      </div>
                      <div className="vm-toggle">
                        <span>{t.config.magnet}</span>
                        <button className={`switch${planMagnet ? " on" : ""}`} onClick={() => setPlanMagnet((m) => !m)} type="button" aria-pressed={planMagnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  <button className={view === "3d" ? "vm-on" : ""} onClick={() => pickView("3d")} type="button">
                    <Icon3D /> {t.config.v3d}
                    {view === "3d" && <span className="vm-check">✓</span>}
                  </button>
                  <button className={view === "front" ? "vm-on" : ""} onClick={() => pickView("front")} type="button">
                    <IconFront /> {t.config.vfront}
                    {view === "front" && <span className="vm-check">✓</span>}
                  </button>
                  <button className={view === "plan" ? "vm-on" : ""} onClick={() => pickView("plan")} type="button">
                    <IconPlan /> {t.config.vplan}
                    {view === "plan" && <span className="vm-check">✓</span>}
                  </button>
                </>
              ) : (
                MODES.map(({ v, Icon }) => (
                  <button key={v} className={mode === v ? "vm-on" : ""} onClick={() => pickMode(v)} type="button">
                    <Icon /> {modeLabel(v)}
                    {mode === v && <span className="vm-check">✓</span>}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* bottom toolbar — furniture categories, or per-module actions when selected */}
      <div className={`toolbar${collapsed ? " collapsed" : ""}`}>
        <button
          className="toolbar-grip"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          aria-label={t.config.collapse}
          type="button"
        />
        <div className="toolbar-row">
          {sel ? (
            <>
              <button className="tool-btn" onClick={editSel} type="button">
                <span className="ico"><IconEditItem /></span>
                <span className="lbl">{t.config.edit}</span>
              </button>
              <button className="tool-btn" onClick={openSel} type="button">
                <span className="ico"><IconOpenItem /></span>
                <span className="lbl">{picked && openIds.includes(picked) ? t.config.close : t.config.open}</span>
              </button>
              <button className="tool-btn" onClick={dupSel} type="button">
                <span className="ico"><IconDuplicateItem /></span>
                <span className="lbl">{t.config.duplicate}</span>
              </button>
              <button className="tool-btn" onClick={delSel} type="button">
                <span className="ico"><IconDeleteItem /></span>
                <span className="lbl">{t.config.del}</span>
              </button>
            </>
          ) : (
            <>
              <button className="tool-btn" onClick={() => openSheet("pickCab")} type="button">
                <span className="ico"><IconCabinets /></span>
                <span className="lbl">{t.config.cabinets}</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("pickAppl")} type="button">
                <span className="ico"><IconAppliance /></span>
                <span className="lbl">{t.config.appliances}</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("dining")} type="button">
                <span className="ico"><IconDining /></span>
                <span className="lbl">{t.config.dining}</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("extra")} type="button">
                <span className="ico"><IconExtra /></span>
                <span className="lbl">{t.config.extras}</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("library")} type="button">
                <span className="ico">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M4 4H14V14H4V4ZM18 4H28V14H18V4ZM4 18H14V28H4V18ZM18 18H28V28H18V18Z" fill="var(--accent)" />
                  </svg>
                </span>
                <span className="lbl">{t.config.library}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {sheet && (
        <>
          <div className={`sheet-backdrop dim${sheetClosing ? " closing" : ""}`} onClick={closeSheet} />
          <div className={`bottom-sheet${sheet === "pickCab" || sheet === "pickAppl" || sheet === "dining" || sheet === "extra" || sheet === "library" || sheet === "editor" ? " tall" : ""}${sheetClosing ? " closing" : ""}`}>
            <div className="sheet-grip" />

            {(sheet === "pickCab" || sheet === "pickAppl" || sheet === "dining" || sheet === "extra") && (() => {
              const groups = sheet === "pickCab" ? CABINET_GROUPS : sheet === "pickAppl" ? APPLIANCE_GROUPS : sheet === "dining" ? FURNITURE_GROUPS : EXTRA_GROUPS;
              const title = replaceId
                ? t.config.replaceTo
                : sheet === "pickCab" ? t.config.addCab : sheet === "pickAppl" ? t.config.addAppl : sheet === "dining" ? t.config.addFurn : t.config.addExtra;
              return (
                <>
                  <div className="sheet-head">
                    <div className="sheet-title">{title}</div>
                    <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.config.close}>✕</button>
                  </div>
                  <div className="cfg-sheet-body">
                    {groups.map((g) => (
                      <div className="add-group" key={g.heading}>
                        <div className="add-head">{g.heading}</div>
                        <div className="add-grid">
                          {g.items.map((t) => (
                            <button key={t.id} className="add-chip" onClick={() => addItem(t)} type="button">
                              <span className="add-glyph" aria-hidden="true">{t.glyph}</span>
                              <span className="add-name">{t.name}</span>
                              <span className="add-sub">{t.sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {sheet === "library" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">{t.config.library}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.config.close}>✕</button>
                </div>
                {/* two pages: the full catalog, and the master's own saved blocks */}
                <div className="lib-tabs">
                  <button className={`lib-tab${libTab === "catalog" ? " on" : ""}`} onClick={() => setLibTab("catalog")} type="button">
                    {t.config.catalog}
                  </button>
                  <button className={`lib-tab${libTab === "mine" ? " on" : ""}`} onClick={() => setLibTab("mine")} type="button">
                    {t.config.myBlocks}{myLibrary.length ? ` (${myLibrary.length})` : ""}
                  </button>
                  {/* Phase K: design a new karkas block from scratch at the client's size (0 dan) */}
                  <button className="lib-tab" onClick={openNewKarkas} type="button">
                    🔧 Yangi blok
                  </button>
                </div>
                <div className="cfg-sheet-body">
                  {libTab === "catalog" ? (
                    /* level-1 categories → each chip's level-2 internal layout */
                    LIBRARY_GROUPS.map((g) => (
                      <div className="add-group" key={g.heading}>
                        <div className="add-head">{g.heading}</div>
                        <div className="add-grid">
                          {g.items.map((it) => (
                            <button key={it.id} className="add-chip" onClick={() => addItem(it)} type="button">
                              <span className="add-glyph" aria-hidden="true">{it.glyph}</span>
                              <span className="add-name">{it.name}</span>
                              <span className="add-sub">{it.sub}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : myLibrary.length === 0 ? (
                    <div className="add-sub" style={{ padding: "8px 4px" }}>{t.config.myBlocksEmpty}</div>
                  ) : (
                    <div className="add-grid">
                      {myLibrary.map((item) => (
                        <button key={item.id} className="add-chip" style={{ position: "relative" }} onClick={() => openLibraryItem(item)} type="button">
                          <span
                            role="button"
                            aria-label={t.config.del}
                            onClick={(e) => { e.stopPropagation(); removeLibraryItem(item.id); }}
                            style={{ position: "absolute", top: 2, right: 6, fontSize: 13, lineHeight: 1, color: "var(--muted)", padding: 2 }}
                          >✕</span>
                          <span className="add-glyph" aria-hidden="true">{item.glyph}</span>
                          <span className="add-name">{item.name}</span>
                          <span className="add-sub">{item.karkasJson ? "Karkas" : t.config.myBlock}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {sheet === "editor" && cabs[i] && (
              <FurnitureEditor
                cab={cabs[i]}
                index={i}
                name={labelFor(cabs[i])}
                sub={subFor(cabs[i])}
                patchCab={patchCab}
                onResizeWidth={resizeCab}
                applyFinishToAll={applyFinishToAll}
                applyToAll={patchAllCabs}
                style={runStyle}
                cfg={curCfg}
                onCfg={updateCfg}
                onClose={closeSheet}
                onOpenFill={() => setFillOpen(true)}
                onReplace={onReplaceCab}
                onSaveToLibrary={() => saveToLibrary(cabs[i])}
                flash={flash}
              />
            )}

          </div>
        </>
      )}

      {/* focused full-screen fill (Наполнение) editor — covers the sheet, light bg */}
      {fillOpen && cabs[i] && (
        <FillEditor
          cab={cabs[i]}
          index={i}
          name={labelFor(cabs[i])}
          style={runStyle}
          patchCab={patchCab}
          patchCabLive={patchCabLive}
          beginEdit={beginCabEdit}
          undo={undoCab}
          redo={redoCab}
          canUndo={canUndoCab}
          canRedo={canRedoCab}
          onClose={() => setFillOpen(false)}
        />
      )}

      {/* inline dimension editor (front / plan view — tap a measurement number).
          − / + step by 5 cm and apply live; the input stays open for more taps. */}
      {feEdit && (
        <div
          className="num-stepper"
          style={{
            left: Math.max(110, Math.min(feEdit.x, window.innerWidth - 110)),
            top: Math.max(96, Math.min(feEdit.y, window.innerHeight - 60)),
          }}
        >
          <button className="num-step" type="button" aria-label="−50 мм" onPointerDown={(e) => e.preventDefault()} onClick={() => stepFe(-50)}>−</button>
          <input
            className="num-edit"
            autoFocus
            inputMode="numeric"
            value={feVal}
            onChange={(e) => setFeVal(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitFe();
              if (e.key === "Escape") setFeEdit(null);
            }}
            onBlur={commitFe}
          />
          <button className="num-step" type="button" aria-label="+50 мм" onPointerDown={(e) => e.preventDefault()} onClick={() => stepFe(50)}>+</button>
        </div>
      )}
    </div>
  );
}
