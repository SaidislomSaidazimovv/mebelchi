// Phase C — "Конструктор". Re-skinned to mirror the room editor (Phase A): a live
// 3D stage with its own chrome (price + nav bar on top, a category toolbar on the
// bottom). Bottom-left carries two round toggles like the room editor — a 3D/2D
// view switcher and a render-style switcher (realistic / translucent / wireframe).
// Tapping a module in the scene selects + highlights it and swaps the bottom
// toolbar to per-item actions (edit / open / duplicate / delete).
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { priceCabs } from "../model/toProject";
import { fmtSum } from "../model/format";
import { VariantScene } from "../three/VariantScene";
import { ConstructorPlan } from "../components/ConstructorPlan";
import { KitchenElevation } from "../components/KitchenElevation";
import { FurnitureEditor, emptyCfg, type PartCfg } from "../components/FurnitureEditor";
import { planRuns } from "../model/runPlan";
import { type Cabinet } from "../model/cabinet";
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

const APPL_LBL: Record<string, string> = {
  sink: "Мойка",
  hob: "Плита",
  cooktop: "Варочная панель",
  oven: "Духовой шкаф",
  fridge: "Холодильник",
  dishwasher: "Посудомойка",
  hood: "Вытяжка",
};

/** A real built-in appliance (excludes plain modules and render-only fillers). */
const isAppliance = (c: Cabinet) => !!c.appliance && c.appliance !== "none" && c.appliance !== "filler";

function labelFor(c: Cabinet): string {
  if (isAppliance(c)) return APPL_LBL[c.appliance as string] ?? "Модуль";
  const k = c.kind === "upper" ? "Верхний" : c.kind === "tall" ? "Пенал" : "Тумба";
  return `${k} ${c.w}`;
}

function subFor(c: Cabinet): string {
  if (isAppliance(c)) return "Встроенная техника";
  return c.kind === "upper" ? "Навесной шкаф" : c.kind === "tall" ? "Высокий пенал" : "Напольный шкаф";
}

type Sheet = null | "pickCab" | "pickAppl" | "editor" | "dining" | "extra";

const MODES = [
  { v: "wire", label: "Линии", Icon: IconLines },
  { v: "xray", label: "Прозрачный", Icon: IconTransparent },
  { v: "real", label: "Реалистичный", Icon: IconRealistic },
] as const;

export function ConfigScreen() {
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
  const flash = useStore((s) => s.flash);
  const goTo = useStore((s) => s.goTo);
  const back = useStore((s) => s.back);
  const next = useStore((s) => s.next);

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
  const [sheetClosing, setSheetClosing] = useState(false);
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

  if (!cabs.length) {
    return (
      <section className="screen">
        <h1 className="h1">Конструктор</h1>
        <p className="sub" style={{ margin: "12px 0 20px" }}>Сначала выберите раскладку.</p>
        <button className="gen-btn-lg" onClick={() => goTo("variants")} type="button">
          К раскладкам →
        </button>
      </section>
    );
  }

  const cabIdxs = cabs.map((_, j) => j).filter((j) => !isAppliance(cabs[j]) && cabs[j].appliance !== "filler");
  const applIdxs = cabs.map((_, j) => j).filter((j) => isAppliance(cabs[j]));
  const i = selIdx >= 0 && selIdx < cabs.length ? selIdx : 0;
  const sel = picked ? cabs.find((c) => c.id === picked) ?? null : null;
  const selIndex = picked ? cabs.findIndex((c) => c.id === picked) : -1;
  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";

  // select + highlight a module by id (from the scene or a chip)
  const pick = (id: string | null) => {
    setPicked(id);
    if (id) {
      const idx = cabs.findIndex((c) => c.id === id);
      if (idx >= 0) selectCab(idx);
    }
  };
  // pick a module from a chooser chip, then drop straight into its editor
  const pickAndEdit = (id: string) => {
    pick(id);
    setSheet("editor");
  };

  // the editor config for the active module + an updater
  const curId = cabs[i]?.id ?? "";
  const curCfg = partCfg[curId] ?? emptyCfg();
  const updateCfg = (updater: (c: PartCfg) => PartCfg) => setPartCfg((m) => ({ ...m, [curId]: updater(m[curId] ?? emptyCfg()) }));

  // opening a category chooser: make sure the active selection belongs to that category
  const openSheet = (kind: Sheet) => {
    if (kind === "pickCab" && !cabIdxs.includes(i)) selectCab(cabIdxs[0] ?? 0);
    if (kind === "pickAppl" && !applIdxs.includes(i)) selectCab(applIdxs[0] ?? 0);
    setSheet(kind);
  };

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
  const runs = front ? planRuns(points, waterWall, runLayout, openings).runs : [];
  // run indices that actually carry modules, in order
  const runIdxs = front
    ? Array.from(new Set(cabs.map((c) => c.run ?? 0))).filter((r) => r < runs.length).sort((a, b) => a - b)
    : [];
  const wall = runIdxs.includes(wallIdx) ? wallIdx : runIdxs[0] ?? 0;
  const wallPos = Math.max(0, runIdxs.indexOf(wall));
  const runLabel = (r: number) => {
    const k = runs[r]?.kind;
    return k === "island" ? "Остров" : k === "peninsula" ? "Полуостров" : `Стена ${runIdxs.indexOf(r) + 1}`;
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
          {fmtSum(priceCabs(cabs))}
          <span className="cfg-price-i" aria-hidden>ⓘ</span>
        </div>
        <div className="cfg-nav">
          <button className="cfg-back" onClick={back} type="button" aria-label="Назад">←</button>
          <button className="step-next" onClick={next} type="button">Дальше →</button>
        </div>
      </div>

      {/* front view: switch which wall run / island is shown + edited */}
      {front && runIdxs.length > 0 && (
        <div className="wall-switcher">
          <button className="wall-arrow" onClick={() => cycleWall(-1)} disabled={runIdxs.length < 2} type="button" aria-label="Предыдущая стена">←</button>
          <span className="wall-label">{runLabel(wall)}</span>
          <button className="wall-arrow" onClick={() => cycleWall(1)} disabled={runIdxs.length < 2} type="button" aria-label="Следующая стена">→</button>
        </div>
      )}

      <div className="scene-area">
        {view === "3d" ? (
          <VariantScene
            points={points}
            ceiling={ceiling}
            openings={openings}
            coveringColor={coveringColor}
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
            selectedId={picked}
            onSelectCab={pick}
            onMovePlan={moveCabPlan}
            onBeginEdit={beginCabEdit}
            onMountY={(id, mountY) => {
              const idx = cabs.findIndex((c) => c.id === id);
              if (idx >= 0) patchCab(idx, { mountY });
            }}
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
            selectedId={picked}
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
            selectedId={picked}
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
            <div className="item-card-dim">{sel.w} × {sel.h} мм</div>
          </div>
        )}

        {!sel && showHint && (
          <div className="plan-hint">Коснитесь мебели, чтобы выбрать · выберите категорию ниже</div>
        )}

        {/* bottom-left toggles: 3D/2D view + render style */}
        <div className="scene-ctl cfg-toolset">
          <button className="round-ctl" onClick={() => toggleMenu("view")} type="button" aria-label="Вид">
            <ViewIcon />
          </button>
          <button className="round-ctl" onClick={() => toggleMenu("mode")} type="button" aria-label="Отображение">
            <ModeIcon />
          </button>
        </div>

        {/* undo/redo for constructor edits (move/rotate/resize/reorder/edit/…) */}
        <div className="scene-ctl undo-redo">
          <button type="button" onClick={undoCab} disabled={!canUndoCab} aria-label="Отменить">
            <IconUndo />
          </button>
          <button type="button" onClick={redoCab} disabled={!canRedoCab} aria-label="Повторить">
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
                        <span>Включить Магнит</span>
                        <button className={`switch${g3dMagnet ? " on" : ""}`} onClick={() => setG3dMagnet((m) => !m)} type="button" aria-pressed={g3dMagnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  {view === "front" && (
                    <>
                      <div className="vm-toggle">
                        <span>Включить Магнит</span>
                        <button className={`switch${magnet ? " on" : ""}`} onClick={() => setMagnet((m) => !m)} type="button" aria-pressed={magnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-toggle">
                        <span>Включить Гид</span>
                        <button className={`switch${guide ? " on" : ""}`} onClick={() => setGuide((g) => !g)} type="button" aria-pressed={guide}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  {view === "plan" && (
                    <>
                      <div className="vm-toggle">
                        <span>Включить Сетку</span>
                        <button className={`switch${planGrid ? " on" : ""}`} onClick={() => setPlanGrid((g) => !g)} type="button" aria-pressed={planGrid}><span className="knob" /></button>
                      </div>
                      <div className="vm-toggle">
                        <span>Включить Магнит</span>
                        <button className={`switch${planMagnet ? " on" : ""}`} onClick={() => setPlanMagnet((m) => !m)} type="button" aria-pressed={planMagnet}><span className="knob" /></button>
                      </div>
                      <div className="vm-sep" />
                    </>
                  )}
                  <button className={view === "3d" ? "vm-on" : ""} onClick={() => pickView("3d")} type="button">
                    <Icon3D /> 3D-вид
                    {view === "3d" && <span className="vm-check">✓</span>}
                  </button>
                  <button className={view === "front" ? "vm-on" : ""} onClick={() => pickView("front")} type="button">
                    <IconFront /> Вид спереди
                    {view === "front" && <span className="vm-check">✓</span>}
                  </button>
                  <button className={view === "plan" ? "vm-on" : ""} onClick={() => pickView("plan")} type="button">
                    <IconPlan /> План (2D)
                    {view === "plan" && <span className="vm-check">✓</span>}
                  </button>
                </>
              ) : (
                MODES.map(({ v, label, Icon }) => (
                  <button key={v} className={mode === v ? "vm-on" : ""} onClick={() => pickMode(v)} type="button">
                    <Icon /> {label}
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
          aria-label="Свернуть панель"
          type="button"
        />
        <div className="toolbar-row">
          {sel ? (
            <>
              <button className="tool-btn" onClick={editSel} type="button">
                <span className="ico"><IconEditItem /></span>
                <span className="lbl">Редактировать</span>
              </button>
              <button className="tool-btn" onClick={openSel} type="button">
                <span className="ico"><IconOpenItem /></span>
                <span className="lbl">{picked && openIds.includes(picked) ? "Закрыть" : "Открыть"}</span>
              </button>
              <button className="tool-btn" onClick={dupSel} type="button">
                <span className="ico"><IconDuplicateItem /></span>
                <span className="lbl">Дублировать</span>
              </button>
              <button className="tool-btn" onClick={delSel} type="button">
                <span className="ico"><IconDeleteItem /></span>
                <span className="lbl">Удалить</span>
              </button>
            </>
          ) : (
            <>
              <button className="tool-btn" onClick={() => openSheet("pickCab")} type="button">
                <span className="ico"><IconCabinets /></span>
                <span className="lbl">Шкафы</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("pickAppl")} type="button">
                <span className="ico"><IconAppliance /></span>
                <span className="lbl">Бытовая</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("dining")} type="button">
                <span className="ico"><IconDining /></span>
                <span className="lbl">Обеденная</span>
              </button>
              <button className="tool-btn" onClick={() => openSheet("extra")} type="button">
                <span className="ico"><IconExtra /></span>
                <span className="lbl">Дополнительные</span>
              </button>
            </>
          )}
        </div>
      </div>

      {sheet && (
        <>
          <div className={`sheet-backdrop dim${sheetClosing ? " closing" : ""}`} onClick={closeSheet} />
          <div className={`bottom-sheet${sheet === "pickCab" || sheet === "pickAppl" || sheet === "editor" ? " tall" : ""}${sheetClosing ? " closing" : ""}`}>
            <div className="sheet-grip" />

            {(sheet === "pickCab" || sheet === "pickAppl") && (() => {
              const list = sheet === "pickCab" ? cabIdxs : applIdxs;
              const title = sheet === "pickCab" ? "Шкафы" : "Бытовая Техника";
              const empty = sheet === "pickCab" ? "Нет шкафов для настройки." : "В этой раскладке нет встроенной техники.";
              return (
                <>
                  <div className="sheet-head">
                    <div className="sheet-title">{title}</div>
                    <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                  </div>
                  {list.length === 0 ? (
                    <div className="var-blurb">{empty}</div>
                  ) : (
                    <div className="cfg-sheet-body">
                      <div className="pick-hint">Выберите модуль для редактирования</div>
                      {list.map((j) => (
                        <button key={cabs[j].id} className="pick-row" onClick={() => pickAndEdit(cabs[j].id)} type="button">
                          <span className="pick-thumb" />
                          <span className="pick-meta">
                            <span className="pick-name">{labelFor(cabs[j])}</span>
                            <span className="pick-sub">{subFor(cabs[j])}</span>
                          </span>
                          <span className="chev">›</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {sheet === "editor" && cabs[i] && (
              <FurnitureEditor
                cab={cabs[i]}
                index={i}
                name={labelFor(cabs[i])}
                sub={subFor(cabs[i])}
                patchCab={patchCab}
                onResizeWidth={resizeCab}
                cfg={curCfg}
                onCfg={updateCfg}
                onClose={closeSheet}
                flash={flash}
              />
            )}

            {sheet === "dining" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Обеденная зона</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="var-blurb" style={{ padding: "12px 0" }}>
                  Столы и стулья появятся на следующем этапе.
                  <span className="soon-tag" style={{ marginLeft: 8 }}>Далее</span>
                </div>
              </>
            )}

            {sheet === "extra" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Дополнительные</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="var-blurb" style={{ padding: "12px 0" }}>
                  Полки, декор и техника появятся на следующем этапе.
                  <span className="soon-tag" style={{ marginLeft: 8 }}>Далее</span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* inline dimension editor (front view — tap a measurement number) */}
      {feEdit && (
        <input
          className="num-edit"
          autoFocus
          inputMode="numeric"
          style={{
            left: Math.max(60, Math.min(feEdit.x, window.innerWidth - 60)),
            top: Math.max(96, Math.min(feEdit.y, window.innerHeight - 60)),
          }}
          value={feVal}
          onChange={(e) => setFeVal(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitFe();
            if (e.key === "Escape") setFeEdit(null);
          }}
          onBlur={commitFe}
        />
      )}
    </div>
  );
}
