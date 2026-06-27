// Phase A.2b — the room design scene (Figma "12"). Live three.js room + an
// editable 2D floor plan. Tap a wall to select it, tap the floor for covering /
// edit, drag corners (with 90°/45° magnet) and openings, edit numbers inline.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { ThreeScene, type SceneView } from "../three/ThreeScene";
import { FloorPlan } from "../components/FloorPlan";
import { WaterPicker } from "../components/WaterPicker";
import { OpeningThumb, FittingThumb } from "../components/Thumb";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";
import { FLOOR_COVERINGS, ROOM_TYPES } from "../model/floors";
import { fittingCatalog, fittingKind, openingCatalog, wallSegments, defaultFittingHeight, defaultOpeningSill, type FittingCategory, type OpeningKind, type OpeningKindId, type Pt } from "../model/room";
import { WALL_COVERINGS, WALL_FAMILIES, familyCount, coveringColor as wallColorHex, dominantColor, leafRects, defaultSurface, type SurfPath } from "../model/walls";
import {
  IconRoomShape,
  IconElements,
  IconOpenings,
  IconCeiling,
  IconCovering,
  IconEdit,
  IconVirtual,
  IconWater,
  IconHeating,
  IconVent,
  IconReshape,
  IconAddWall,
  IconDoor,
  IconWallOpening,
  IconDuplicate,
  IconTrash,
  IconSearch,
  IconFilter,
  Icon3D,
  IconFront,
  IconPlan,
  IconUndo,
  IconRedo,
} from "../components/icons";

type Sheet =
  | null
  | "shape"
  | "shapePick"
  | "ceiling"
  | "covering"
  | "edit"
  | "elements"
  | "openings"
  | "itemEdit"
  | "wallColor"
  | "wallModify"
  | FittingCategory
  | OpeningKindId;
const FIT_TITLES: Record<FittingCategory, string> = {
  electric: "Добавить Электротовары",
  heating: "Добавить Радиаторы",
  vent: "Добавить Вентиляцию",
};
const OPEN_TITLES: Record<OpeningKindId, string> = {
  window: "Добавить Окна",
  door: "Добавить Двери",
  opening: "Добавить Проёмы",
};
interface Editor {
  x: number;
  y: number;
  value: number;
  apply: (v: number) => void;
}

export function RoomScene() {
  const shape = useStore((s) => s.shape);
  const ceiling = useStore((s) => s.ceiling);
  const roomPoints = useStore((s) => s.roomPoints);
  const openings = useStore((s) => s.openings);
  const interiorWalls = useStore((s) => s.interiorWalls);
  const addInteriorWall = useStore((s) => s.addInteriorWall);
  const moveInteriorPoint = useStore((s) => s.moveInteriorPoint);
  const setInteriorWallLength = useStore((s) => s.setInteriorWallLength);
  const fittings = useStore((s) => s.fittings);
  const addFitting = useStore((s) => s.addFitting);
  const dragFittingTo = useStore((s) => s.dragFittingTo);
  const moveFitting = useStore((s) => s.moveFitting);
  const setFittingWidth = useStore((s) => s.setFittingWidth);
  const setFittingHeight = useStore((s) => s.setFittingHeight);
  const dragFitting3D = useStore((s) => s.dragFitting3D);
  const removeFitting = useStore((s) => s.removeFitting);
  const duplicateFitting = useStore((s) => s.duplicateFitting);
  const replaceFitting = useStore((s) => s.replaceFitting);
  const waterWall = useStore((s) => s.waterWall);
  const setWaterWall = useStore((s) => s.setWaterWall);
  const wallSurfaces = useStore((s) => s.wallSurfaces);
  const setWallColor = useStore((s) => s.setWallColor);
  const setAllWallsColor = useStore((s) => s.setAllWallsColor);
  const splitWallSurface = useStore((s) => s.splitWallSurface);
  const colorWallSurface = useStore((s) => s.colorWallSurface);
  const roomName = useStore((s) => s.roomName);
  const roomType = useStore((s) => s.roomType);
  const floorCovering = useStore((s) => s.floorCovering);
  const setShape = useStore((s) => s.setShape);
  const setCeiling = useStore((s) => s.setCeiling);
  const setRoomName = useStore((s) => s.setRoomName);
  const setRoomType = useStore((s) => s.setRoomType);
  const setFloorCovering = useStore((s) => s.setFloorCovering);
  const moveCorner = useStore((s) => s.moveCorner);
  const setWallEndpoints = useStore((s) => s.setWallEndpoints);
  const setWallLength = useStore((s) => s.setWallLength);
  const moveOpening = useStore((s) => s.moveOpening);
  const dragOpeningTo = useStore((s) => s.dragOpeningTo);
  const setOpeningWidth = useStore((s) => s.setOpeningWidth);
  const addOpening = useStore((s) => s.addOpening);
  const removeOpening = useStore((s) => s.removeOpening);
  const duplicateOpening = useStore((s) => s.duplicateOpening);
  const replaceOpening = useStore((s) => s.replaceOpening);
  const setOpeningHeight = useStore((s) => s.setOpeningHeight);
  const setOpeningSill = useStore((s) => s.setOpeningSill);
  const flipOpening = useStore((s) => s.flipOpening);
  const beginEdit = useStore((s) => s.beginEdit);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const back = useStore((s) => s.back);
  const next = useStore((s) => s.next);
  const flash = useStore((s) => s.flash);

  const [view, setView] = useState<SceneView>("3d");
  const [viewMenu, setViewMenu] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showHint, setShowHint] = useState(true);
  const [selectedWall, setSelectedWall] = useState<number | null>(null);
  const [floorSelected, setFloorSelected] = useState(false);
  const [selectedFitting, setSelectedFitting] = useState<string | null>(null);
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [coverSearch, setCoverSearch] = useState("");
  const [fitSearch, setFitSearch] = useState("");
  const [openSearch, setOpenSearch] = useState("");
  const [addWall, setAddWall] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [confirm, setConfirm] = useState<"i" | "l" | null>(null);
  const [nameEdit, setNameEdit] = useState<{ x: number; y: number } | null>(null);
  const [waterPick, setWaterPick] = useState(false);
  const [draftWater, setDraftWater] = useState<number | null>(null);
  // 3D wall painting / item manipulation
  const [wall3D, setWall3D] = useState<number | null>(null);
  const [fit3D, setFit3D] = useState<string | null>(null);
  const [colorSearch, setColorSearch] = useState("");
  const [colorFilterOpen, setColorFilterOpen] = useState(false);
  const [colorFamilies, setColorFamilies] = useState<string[]>([]); // empty = all
  const [pendingColor, setPendingColor] = useState<number | null>(null); // awaiting apply-scope
  const [surfEdit, setSurfEdit] = useState(false); // customize-surface editor open
  const [surfSel, setSurfSel] = useState<SurfPath | null>(null); // leaf selected in editor
  // replace-in-place target (set when "Заменить" is tapped, consumed on next pick)
  const [replacing, setReplacing] = useState<{ type: "opening" | "fitting"; id: string } | null>(null);
  // edit-sheet dimension fields (committed on blur / Enter)
  const [editW, setEditW] = useState("");
  const [editH, setEditH] = useState("");
  const [editSill, setEditSill] = useState(""); // window: height from floor

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (selectedWall != null && selectedWall >= wallSegments(roomPoints, interiorWalls).length) setSelectedWall(null);
  }, [roomPoints, interiorWalls, selectedWall]);
  useEffect(() => {
    if (selectedFitting != null && !fittings.some((e) => e.id === selectedFitting)) setSelectedFitting(null);
  }, [fittings, selectedFitting]);
  useEffect(() => {
    if (selectedOpening != null && !openings.some((o) => o.id === selectedOpening)) setSelectedOpening(null);
  }, [openings, selectedOpening]);
  useEffect(() => {
    if (fit3D != null && !fittings.some((e) => e.id === fit3D)) setFit3D(null);
  }, [fittings, fit3D]);

  // exit animations: keep mounted briefly, play the out-animation, then remove
  const [sheetClosing, setSheetClosing] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const closeSheet = () => {
    setSheetClosing(true);
    setReplacing(null);
    setTimeout(() => {
      setSheet(null);
      setSheetClosing(false);
    }, 230);
  };
  const closeMenu = () => {
    setMenuClosing(true);
    setTimeout(() => {
      setViewMenu(false);
      setMenuClosing(false);
    }, 200);
  };

  // grip: tap toggles; drag down collapses, drag up expands
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
    if (gripStart.current != null) setCollapsed((c) => !c); // tap
    gripStart.current = null;
  };

  const onEditNumber = (x: number, y: number, value: number, apply: (v: number) => void) => {
    setEditor({ x, y, value, apply });
    setEditVal(String(value));
  };
  const commitEdit = () => {
    if (editor) {
      const v = parseInt(editVal, 10);
      if (v && v >= 100 && v !== editor.value) editor.apply(v);
    }
    setEditor(null);
  };

  const selectWall = (i: number | null) => {
    setSelectedWall(i);
    setFloorSelected(false);
    setSelectedFitting(null);
    setSelectedOpening(null);
    setEditor(null);
  };
  const selectFloor = () => {
    setFloorSelected(true);
    setSelectedWall(null);
    setSelectedFitting(null);
    setSelectedOpening(null);
    setWall3D(null);
    setFit3D(null);
    setEditor(null);
  };
  const selectFitting = (id: string | null) => {
    setSelectedFitting(id);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedOpening(null);
    setEditor(null);
  };
  const selectOpening = (id: string | null) => {
    setSelectedOpening(id);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedFitting(null);
    setWall3D(null);
    setFit3D(null);
    setEditor(null);
  };
  const pickView = (v: SceneView) => {
    setView(v);
    setViewMenu(false);
    setEditor(null);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedFitting(null);
    setSelectedOpening(null);
    setWall3D(null);
    setFit3D(null);
  };
  // a wall tapped in the 3D / front view → paint target
  const selectWall3D = (w: number | null) => {
    setWall3D(w);
    setFit3D(null);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedFitting(null);
    setSelectedOpening(null);
  };
  // an item tapped in 3D → manipulate target
  const selectFit3D = (id: string) => {
    setFit3D(id);
    setWall3D(null);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedFitting(null);
    setSelectedOpening(null);
  };
  const placeFitting = (category: FittingCategory, kind: string) => {
    if (replacing?.type === "fitting") {
      replaceFitting(replacing.id, category, kind);
      setReplacing(null);
      setView("plan");
      selectFitting(replacing.id);
      closeSheet();
      return;
    }
    const id = addFitting(category, kind, selectedWall ?? 0);
    setView("plan");
    selectFitting(id);
    closeSheet();
    flash("Перетащите элемент по стене");
  };
  const openFitSheet = (category: FittingCategory) => {
    setReplacing(null);
    setFitSearch("");
    setSheet(category);
  };
  const placeOpening = (item: OpeningKind) => {
    if (replacing?.type === "opening") {
      replaceOpening(replacing.id, item);
      setReplacing(null);
      setView("plan");
      selectOpening(replacing.id);
      closeSheet();
      return;
    }
    const id = addOpening(item, selectedWall ?? undefined);
    setView("plan");
    selectOpening(id);
    closeSheet();
    flash("Перетащите по стене");
  };
  const openOpenSheet = (kind: OpeningKindId) => {
    setReplacing(null);
    setOpenSearch("");
    setSheet(kind);
  };
  const enterWaterPick = () => {
    setDraftWater(waterWall);
    setWaterPick(true);
    setSelectedWall(null);
    setFloorSelected(false);
    setSelectedFitting(null);
    setSelectedOpening(null);
    closeSheet();
  };

  const enterAddWall = () => {
    setAddWall(true);
    setDraft([]);
    setView("plan");
    setSelectedWall(null);
    setFloorSelected(false);
    closeSheet();
  };
  const exitAddWall = () => {
    setAddWall(false);
    setDraft([]);
  };
  const commitWall = () => {
    if (draft.length >= 2) addInteriorWall(draft);
    exitAddWall();
  };
  const addPoint = (x: number, y: number) => setDraft((d) => [...d, { x, y }]);
  const moveDraftPoint = (pi: number, x: number, y: number) => setDraft((d) => d.map((p, i) => (i === pi ? { x, y } : p)));
  const tryShape = (v: "i" | "l") => (v === shape ? closeSheet() : setConfirm(v));

  const ViewIcon = view === "3d" ? Icon3D : view === "front" ? IconFront : IconPlan;
  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";

  let a = 0;
  for (let i = 0; i < roomPoints.length; i++) {
    const q = roomPoints[(i + 1) % roomPoints.length];
    a += roomPoints[i].x * q.y - q.x * roomPoints[i].y;
  }
  const areaRaw = Math.round((Math.abs(a) / 2 / 1e6) * 10) / 10;
  const areaM2 = Number.isInteger(areaRaw) ? `${areaRaw}` : areaRaw.toFixed(1);

  const filtered = FLOOR_COVERINGS.filter((f) => f.name.toLowerCase().includes(coverSearch.toLowerCase()));
  const fitCat: FittingCategory | null =
    sheet === "electric" || sheet === "heating" || sheet === "vent" ? sheet : null;
  const filteredFit = fitCat
    ? fittingCatalog(fitCat).filter((e) => e.name.toLowerCase().includes(fitSearch.toLowerCase()))
    : [];
  const filteredColors = WALL_COVERINGS.filter(
    (w) => (colorFamilies.length === 0 || colorFamilies.includes(w.family)) && w.name.toLowerCase().includes(colorSearch.toLowerCase()),
  );
  const wallSurf = wall3D != null ? wallSurfaces[wall3D] ?? defaultSurface() : null;
  const openCat: OpeningKindId | null =
    sheet === "window" || sheet === "door" || sheet === "opening" ? sheet : null;
  const filteredOpen = openCat
    ? openingCatalog(openCat).filter((e) => e.name.toLowerCase().includes(openSearch.toLowerCase()))
    : [];

  // the currently-selected wall item (window/door/opening or a fitting), unified
  const selOpen = selectedOpening ? openings.find((o) => o.id === selectedOpening) ?? null : null;
  const selFit = selectedFitting ? fittings.find((f) => f.id === selectedFitting) ?? null : null;
  const itemSelected = !!(selOpen || selFit);
  const selKind = selFit ? fittingKind(selFit.category, selFit.kind) : null;
  const itemName = selOpen ? selOpen.name : selKind?.name ?? "Элемент";
  const itemDesc = selOpen ? selOpen.desc : selKind?.desc ?? "";

  const editItem = () => {
    setEditW(String(selOpen ? selOpen.width : selFit ? selFit.width : ""));
    setEditH(String(selOpen ? selOpen.height : selFit ? selFit.height ?? defaultFittingHeight(selFit.category) : ""));
    setEditSill(String(selOpen && selOpen.kind === "window" ? selOpen.sill ?? defaultOpeningSill(selOpen.kind, selOpen.design) : ""));
    setSheet("itemEdit");
  };
  const duplicateItem = () => {
    if (selOpen) {
      const id = duplicateOpening(selOpen.id);
      if (id) selectOpening(id);
    } else if (selFit) {
      const id = duplicateFitting(selFit.id);
      if (id) selectFitting(id);
    }
    flash("Дубликат создан");
  };
  const deleteItem = () => {
    if (selOpen) removeOpening(selOpen.id);
    else if (selFit) removeFitting(selFit.id);
  };
  const startReplace = () => {
    if (selOpen) {
      setReplacing({ type: "opening", id: selOpen.id });
      setOpenSearch("");
      setSheet(selOpen.kind);
    } else if (selFit) {
      setReplacing({ type: "fitting", id: selFit.id });
      setFitSearch("");
      setSheet(selFit.category);
    }
  };
  const commitWidth = () => {
    const v = parseInt(editW, 10);
    if (v && v >= 40) {
      if (selOpen) setOpeningWidth(selOpen.id, v);
      else if (selFit) setFittingWidth(selFit.id, v);
    }
  };
  const commitHeight = () => {
    const v = parseInt(editH, 10);
    if (!v) return;
    if (selOpen && v >= 300) setOpeningHeight(selOpen.id, v);
    else if (selFit && v >= 40) setFittingHeight(selFit.id, v);
  };
  const commitSill = () => {
    const v = parseInt(editSill, 10);
    if (selOpen && selOpen.kind === "window" && editSill !== "" && v >= 0) setOpeningSill(selOpen.id, v);
  };

  return (
    <div className="roomscene">
      <div className="stepbar">
        <button className="step-back" onClick={back} type="button">
          ← Назад
        </button>
        <button className="step-next" onClick={next} type="button">
          варианты →
        </button>
      </div>

      <div className="scene-area">
        {waterPick ? (
          <WaterPicker
            points={roomPoints}
            openings={openings}
            interiorWalls={interiorWalls}
            coveringColor={coveringColor}
            roomName={roomName}
            selected={draftWater}
            onSelect={setDraftWater}
          />
        ) : view === "plan" ? (
          <FloorPlan
            points={roomPoints}
            openings={openings}
            selectedWall={selectedWall}
            coveringColor={coveringColor}
            roomName={roomName}
            interiorWalls={interiorWalls}
            fittings={fittings}
            selectedFitting={selectedFitting}
            selectedOpening={selectedOpening}
            waterWall={waterWall}
            addWall={addWall}
            draft={draft}
            onAddPoint={addPoint}
            onMoveDraftPoint={moveDraftPoint}
            onMoveInteriorPoint={moveInteriorPoint}
            onEditName={(x, y) => setNameEdit({ x, y })}
            onSelectWall={selectWall}
            onSelectFloor={selectFloor}
            onSelectFitting={selectFitting}
            onDragFittingTo={dragFittingTo}
            onMoveFitting={moveFitting}
            onSetFittingWidth={setFittingWidth}
            onSelectOpening={selectOpening}
            onSetDrawnWallLength={setInteriorWallLength}
            onMoveCorner={moveCorner}
            onMoveWall={setWallEndpoints}
            onDragOpeningTo={dragOpeningTo}
            onBeginEdit={beginEdit}
            onSetWallLength={setWallLength}
            onMoveOpening={moveOpening}
            onSetOpeningWidth={setOpeningWidth}
            onEditNumber={onEditNumber}
          />
        ) : (
          <ThreeScene
            points={roomPoints}
            ceiling={ceiling}
            view={view}
            openings={openings}
            coveringColor={coveringColor}
            interiorWalls={interiorWalls}
            fittings={fittings}
            wallSurfaces={wallSurfaces}
            selectedWall3D={wall3D}
            selectedFit3D={fit3D}
            selectedOpen3D={selectedOpening}
            floorSel3D={floorSelected}
            onWallClick={selectWall3D}
            onFittingClick={selectFit3D}
            onFittingDrag={dragFitting3D}
            onOpeningClick={selectOpening}
            onFloorClick={selectFloor}
          />
        )}

        {/* selected-item info card */}
        {!waterPick && itemSelected && (
          <div className="item-card">
            <div className="item-card-name">
              {itemName}
              <span className="item-card-i" aria-hidden>ⓘ</span>
            </div>
            <div className="item-card-desc">{itemDesc}</div>
          </div>
        )}

        {/* selected 3D wall info card */}
        {wall3D != null && (
          <div className="item-card">
            <div className="item-card-name">
              Стена {wall3D + 1}
              <span className="item-card-i" aria-hidden>ⓘ</span>
            </div>
            <div className="item-card-desc">
              {(() => {
                const c = dominantColor(wallSurfaces[wall3D] ?? defaultSurface());
                return c >= 0 ? WALL_COVERINGS[c].name : "Без покрытия";
              })()}
            </div>
          </div>
        )}

        {/* selected 3D item info card */}
        {fit3D != null && (() => {
          const f = fittings.find((x) => x.id === fit3D);
          if (!f) return null;
          const k = fittingKind(f.category, f.kind);
          return (
            <div className="item-card">
              <div className="item-card-name">
                {k?.name ?? "Элемент"}
                <span className="item-card-i" aria-hidden>ⓘ</span>
              </div>
              <div className="item-card-desc">Перетащите, чтобы передвинуть по стене</div>
            </div>
          );
        })()}

        {!waterPick && !itemSelected && view === "plan" && !addWall && showHint && (
          <div className="plan-hint">Тяните углы и стены · двигайте двери/окна · щипок для зума</div>
        )}
        {!waterPick && view === "plan" && addWall && (
          <div className="plan-hint">Коснитесь, чтобы добавить точки стены · замкните контур и нажмите «Одобрять»</div>
        )}

        {!waterPick && (
          <button className="scene-ctl plan-toggle" onClick={() => setViewMenu((v) => !v)} type="button" aria-label="Вид">
            <ViewIcon />
          </button>
        )}

        {!waterPick && (
          <div className="scene-ctl undo-redo">
            <button onClick={undo} disabled={!canUndo} type="button" aria-label="Отменить">
              <IconUndo />
            </button>
            <button onClick={redo} disabled={!canRedo} type="button" aria-label="Повторить">
              <IconRedo />
            </button>
          </div>
        )}

        {viewMenu && (
          <>
            <div className="sheet-backdrop" onClick={closeMenu} />
            <div className={`view-menu pop-anim${menuClosing ? " closing" : ""}`}>
              <button className="view-disabled" disabled type="button">
                <IconVirtual /> Виртуальный визит <span className="soon-tag">Далее</span>
              </button>
              <button onClick={() => pickView("3d")} type="button">
                <Icon3D /> 3D-вид
              </button>
              <button className="view-disabled" disabled type="button">
                <IconFront /> Вид спереди <span className="soon-tag">Далее</span>
              </button>
              <button onClick={() => pickView("plan")} type="button">
                <IconPlan /> План помещения
              </button>
            </div>
          </>
        )}
      </div>

      {/* bottom toolbar — collapsible via the grip; add-wall / water-pick modes swap it */}
      {waterPick ? (
        <div className="water-bar">
          <div className="water-bar-hint">Разместите водоснабжение</div>
          <div className="water-bar-row">
            <button className="btn btn-back" onClick={() => setWaterPick(false)} type="button">
              Отмена
            </button>
            <button
              className="btn btn-next"
              onClick={() => {
                setWaterWall(draftWater);
                setWaterPick(false);
              }}
              type="button"
            >
              ОК
            </button>
          </div>
        </div>
      ) : addWall ? (
        <div className="addwall-bar">
          <button className="btn btn-back" onClick={exitAddWall} type="button">
            Отмена
          </button>
          <button className="btn btn-next" onClick={commitWall} type="button">
            ✓ Одобрять
          </button>
        </div>
      ) : (
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
            {fit3D != null ? (
              <>
                <button className="tool-btn" onClick={() => { const id = duplicateFitting(fit3D); if (id) setFit3D(id); }} type="button">
                  <span className="ico">
                    <IconDuplicate />
                  </span>
                  <span className="lbl">Дублировать</span>
                </button>
                <button className="tool-btn" onClick={() => removeFitting(fit3D)} type="button">
                  <span className="ico">
                    <IconTrash />
                  </span>
                  <span className="lbl">Удалить</span>
                </button>
              </>
            ) : wall3D != null ? (
              <>
                <button className="tool-btn" onClick={() => { setColorSearch(""); setSheet("wallColor"); }} type="button">
                  <span className="ico">
                    <IconCovering />
                  </span>
                  <span className="lbl">Покрытия</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("wallModify")} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">Изменить</span>
                </button>
              </>
            ) : itemSelected ? (
              <>
                <button className="tool-btn" onClick={editItem} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">Изменить</span>
                </button>
                <button className="tool-btn" onClick={duplicateItem} type="button">
                  <span className="ico">
                    <IconDuplicate />
                  </span>
                  <span className="lbl">Дублировать</span>
                </button>
                <button className="tool-btn" onClick={deleteItem} type="button">
                  <span className="ico">
                    <IconTrash />
                  </span>
                  <span className="lbl">Удалить</span>
                </button>
              </>
            ) : floorSelected ? (
              <>
                <button className="tool-btn" onClick={() => setSheet("covering")} type="button">
                  <span className="ico">
                    <IconCovering />
                  </span>
                  <span className="lbl">Покрытия</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("edit")} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">Изменить</span>
                </button>
              </>
            ) : (
              <>
                <button className="tool-btn" onClick={() => setSheet("shape")} type="button">
                  <span className="ico">
                    <IconRoomShape />
                  </span>
                  <span className="lbl">Форма комнаты</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("elements")} type="button">
                  <span className="ico">
                    <IconElements />
                  </span>
                  <span className="lbl">Элементы</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("openings")} type="button">
                  <span className="ico">
                    <IconOpenings />
                  </span>
                  <span className="lbl">Открытия</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("ceiling")} type="button">
                  <span className="ico">
                    <IconCeiling />
                  </span>
                  <span className="lbl">Высота потолков</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* inline number editor */}
      {editor && (
        <input
          className="num-edit"
          autoFocus
          inputMode="numeric"
          style={{
            left: Math.max(60, Math.min(editor.x, window.innerWidth - 60)),
            top: Math.max(96, Math.min(editor.y, window.innerHeight - 60)),
          }}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value.replace(/[^0-9]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditor(null);
          }}
          onBlur={commitEdit}
        />
      )}

      {/* inline room-name editor (tap the name on the plan) */}
      {nameEdit && (
        <input
          className="num-edit name-edit"
          autoFocus
          style={{
            left: Math.max(80, Math.min(nameEdit.x, window.innerWidth - 80)),
            top: Math.max(96, Math.min(nameEdit.y, window.innerHeight - 60)),
          }}
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setNameEdit(null);
          }}
          onBlur={() => setNameEdit(null)}
        />
      )}

      {sheet && (
        <>
          <div className={`sheet-backdrop dim${sheetClosing ? " closing" : ""}`} onClick={closeSheet} />
          <div className={`bottom-sheet${sheet === "covering" || fitCat || openCat || sheet === "wallColor" ? " tall" : ""}${sheetClosing ? " closing" : ""}`}>
            <div className="sheet-grip" />

            {sheet === "wallColor" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Изменить Цвет Стен</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder="Поиск" value={colorSearch} onChange={(e) => setColorSearch(e.target.value)} />
                  <span className="search-ic"><IconSearch /></span>
                </div>
                <div className="color-bar">
                  <span className="color-count">{filteredColors.length} Товаров</span>
                  <button className="filter-btn" onClick={() => setColorFilterOpen(true)} type="button">
                    Все фильтры <IconFilter />
                  </button>
                </div>
                <div className="cover-list">
                  {filteredColors.map((w) => {
                    const idx = WALL_COVERINGS.indexOf(w);
                    return (
                      <button key={w.id} className="fit-item" onClick={() => setPendingColor(idx)} type="button">
                        <span className="color-thumb" style={{ background: w.color }} />
                        <span className="cover-meta">
                          <span className="cover-name">{w.name}</span>
                          <span className="cover-desc">покраска стен</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {sheet === "wallModify" && wallSurf && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Изменить стену</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">Текущее покрытие</span>
                  <span className="cur-color">
                    <span className="color-sw" style={{ background: wallColorHex(dominantColor(wallSurf)) ?? "#e6e6e6" }} />
                    {dominantColor(wallSurf) >= 0 ? WALL_COVERINGS[dominantColor(wallSurf)].name : "Без покрытия"}
                  </span>
                </div>
                <button
                  className="btn btn-next"
                  style={{ marginTop: 8 }}
                  onClick={() => { setSurfSel(null); setSurfEdit(true); closeSheet(); }}
                  type="button"
                >
                  Настроить поверхность
                </button>
              </>
            )}

            {sheet === "elements" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Элементы</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <button className="elem-row" onClick={() => openFitSheet("electric")} type="button">
                  <span className="ei"><IconElements /></span>
                  <span className="el">Электричество</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={enterWaterPick} type="button">
                  <span className="ei"><IconWater /></span>
                  <span className="el">Водоснабжение</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openFitSheet("heating")} type="button">
                  <span className="ei"><IconHeating /></span>
                  <span className="el">Отопление</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openFitSheet("vent")} type="button">
                  <span className="ei"><IconVent /></span>
                  <span className="el">Вентиляция</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {fitCat && (
              <>
                <div className="sheet-head">
                  <button className="sheet-back" onClick={() => setSheet("elements")} type="button" aria-label="Назад">‹</button>
                  <div className="sheet-title">{FIT_TITLES[fitCat]}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder="Поиск" value={fitSearch} onChange={(e) => setFitSearch(e.target.value)} />
                  <span className="search-ic"><IconSearch /></span>
                </div>
                <div className="cover-list">
                  {filteredFit.map((e) => (
                    <button key={e.id} className="fit-item" onClick={() => placeFitting(fitCat, e.id)} type="button">
                      <FittingThumb symbol={e.symbol} />
                      <span className="cover-meta">
                        <span className="cover-name">{e.name}</span>
                        <span className="cover-desc">{e.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet === "openings" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Открытия</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <button className="elem-row" onClick={() => openOpenSheet("window")} type="button">
                  <span className="ei"><IconOpenings /></span>
                  <span className="el">Окна</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openOpenSheet("door")} type="button">
                  <span className="ei"><IconDoor /></span>
                  <span className="el">Двери</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openOpenSheet("opening")} type="button">
                  <span className="ei"><IconWallOpening /></span>
                  <span className="el">Проёмы в стене</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {openCat && (
              <>
                <div className="sheet-head">
                  <button className="sheet-back" onClick={() => setSheet("openings")} type="button" aria-label="Назад">‹</button>
                  <div className="sheet-title">{OPEN_TITLES[openCat]}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder="Поиск" value={openSearch} onChange={(e) => setOpenSearch(e.target.value)} />
                  <span className="search-ic"><IconSearch /></span>
                </div>
                <div className="cover-list">
                  {filteredOpen.map((e) => (
                    <button key={e.id} className="fit-item" onClick={() => placeOpening(e)} type="button">
                      <OpeningThumb kind={e.kind} design={e.design} />
                      <span className="cover-meta">
                        <span className="cover-name">{e.name}</span>
                        <span className="cover-desc">{e.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet === "itemEdit" && itemSelected && (
              <>
                <div className="sheet-head">
                  <div>
                    <div className="sheet-title">{itemName} <span className="item-card-i">ⓘ</span></div>
                    <div className="item-edit-sub">{itemDesc}</div>
                  </div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="item-edit-replace">
                  <span>Хотите заменить этот продукт?</span>
                  <button className="replace-btn" onClick={startReplace} type="button">Заменить</button>
                </div>
                <div className="item-edit-section">Размеры</div>
                <div className="edit-row">
                  <span className="edit-row-lbl">Ширина</span>
                  <input
                    className="edit-input dim-input"
                    inputMode="numeric"
                    value={editW}
                    onChange={(e) => setEditW(e.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={commitWidth}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                </div>
                {(selOpen || (selFit && selFit.category !== "electric")) && (
                  <div className="edit-row">
                    <span className="edit-row-lbl">Высота</span>
                    <input
                      className="edit-input dim-input"
                      inputMode="numeric"
                      value={editH}
                      onChange={(e) => setEditH(e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={commitHeight}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                )}
                {selOpen && selOpen.kind === "window" && (
                  <div className="edit-row">
                    <span className="edit-row-lbl">Высота от пола</span>
                    <input
                      className="edit-input dim-input"
                      inputMode="numeric"
                      value={editSill}
                      onChange={(e) => setEditSill(e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={commitSill}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                )}
                {selOpen && selOpen.kind === "door" && (
                  <>
                    <div className="item-edit-section">Положение</div>
                    <div className="edit-row">
                      <span className="edit-row-lbl">Сторона стены</span>
                      <button className={`side-toggle${selOpen.flip ? " flip" : ""}`} onClick={() => flipOpening(selOpen.id)} type="button" aria-label="Сторона">
                        <span className="side-leaf">◗</span>
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {sheet === "shape" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Форма комнаты</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <button className="elem-row" onClick={() => setSheet("shapePick")} type="button">
                  <span className="ei"><IconReshape /></span>
                  <span className="el">Изменить форму комнаты</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={enterAddWall} type="button">
                  <span className="ei"><IconAddWall /></span>
                  <span className="el">Добавить стену</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {sheet === "shapePick" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Форма помещения</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="cards">
                  <OptionCard square selected={shape === "i"} onClick={() => tryShape("i")} title="Прямая">
                    <Illustration kind="shape_i" />
                  </OptionCard>
                  <OptionCard square selected={shape === "l"} onClick={() => tryShape("l")} title="Угловая">
                    <Illustration kind="shape_l" />
                  </OptionCard>
                </div>
              </>
            )}

            {sheet === "ceiling" && (
              <>
                <div className="sheet-title">Высота потолков</div>
                <div className="stepper">
                  <button onClick={() => setCeiling(-100)} type="button" aria-label="Меньше">−</button>
                  <div className="num">{ceiling}<small>мм · шаг 100</small></div>
                  <button onClick={() => setCeiling(100)} type="button" aria-label="Больше">+</button>
                </div>
              </>
            )}

            {sheet === "edit" && (
              <>
                <div className="sheet-head">
                  <div>
                    <div className="edit-area-lbl">Площадь</div>
                    <div className="edit-area-val">{areaM2} м²</div>
                  </div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">Название</span>
                  <input className="edit-input" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">Тип Номера</span>
                  <select className="edit-select" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                    {ROOM_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {sheet === "covering" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">Поменяйте напольное покрытие</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label="Закрыть">✕</button>
                </div>
                <input className="cover-search" placeholder="Поиск" value={coverSearch} onChange={(e) => setCoverSearch(e.target.value)} />
                <div className="cover-list">
                  {filtered.map((f) => {
                    const idx = FLOOR_COVERINGS.indexOf(f);
                    return (
                      <button key={f.id} className={`cover-item${floorCovering === idx ? " sel" : ""}`} onClick={() => setFloorCovering(idx)} type="button">
                        <span className="cover-sw" style={{ background: f.color }} />
                        <span className="cover-meta">
                          <span className="cover-name">{f.name}</span>
                          <span className="cover-desc">{f.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* overwrite confirmation */}
      {confirm && (
        <div className="confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="confirm-box pop-anim" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Изменить форму комнаты</div>
            <div className="confirm-body">Перезаписать ваш текущий план помещения?</div>
            <div className="confirm-actions">
              <button className="btn btn-back" onClick={() => setConfirm(null)} type="button">
                Нет
              </button>
              <button
                className="btn btn-next"
                onClick={() => {
                  setShape(confirm);
                  setConfirm(null);
                  closeSheet();
                }}
                type="button"
              >
                Перезаписать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* colour-filter popup (checkmark families) */}
      {colorFilterOpen && (
        <div className="confirm-overlay" onClick={() => setColorFilterOpen(false)}>
          <div className="filter-sheet pop-anim" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <div className="sheet-title">Фильтр по цвету</div>
              <button className="sheet-x" onClick={() => setColorFilterOpen(false)} type="button" aria-label="Закрыть">✕</button>
            </div>
            {WALL_FAMILIES.map((f) => {
              const on = colorFamilies.includes(f);
              return (
                <button
                  key={f}
                  className="filter-row"
                  onClick={() => setColorFamilies((cf) => (on ? cf.filter((x) => x !== f) : [...cf, f]))}
                  type="button"
                >
                  <span className={`chk-box${on ? " on" : ""}`}>{on ? "✓" : ""}</span>
                  <span className="fam-sw" style={{ background: WALL_COVERINGS.find((w) => w.family === f)?.color }} />
                  <span>{f} <span className="fam-count">({familyCount(f)})</span></span>
                </button>
              );
            })}
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-back" onClick={() => setColorFamilies([])} type="button">Сбросить</button>
              <button className="btn btn-next" onClick={() => setColorFilterOpen(false)} type="button">Готово</button>
            </div>
          </div>
        </div>
      )}

      {/* apply-scope dialog after a colour is chosen */}
      {pendingColor != null && (
        <div className="confirm-overlay" onClick={() => setPendingColor(null)}>
          <div className="confirm-box pop-anim" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">
              <span className="color-sw" style={{ background: WALL_COVERINGS[pendingColor].color }} /> {WALL_COVERINGS[pendingColor].name}
            </div>
            <div className="confirm-body">Применить выбранный цвет?</div>
            <div className="confirm-actions">
              <button
                className="btn btn-back"
                onClick={() => {
                  if (surfEdit && wall3D != null && surfSel) colorWallSurface(wall3D, surfSel, pendingColor);
                  else if (wall3D != null) setWallColor(wall3D, pendingColor);
                  setPendingColor(null);
                  closeSheet();
                }}
                type="button"
              >
                К выбранной
              </button>
              <button
                className="btn btn-next"
                onClick={() => {
                  setAllWallsColor(pendingColor);
                  setPendingColor(null);
                  closeSheet();
                }}
                type="button"
              >
                Ко всем
              </button>
            </div>
          </div>
        </div>
      )}

      {/* customize-surface editor: the wall surface centred; tap a part to split / recolour */}
      {surfEdit && wallSurf && wall3D != null && (
        <div className="surf-editor">
          <div className="surf-head">
            <button className="step-back" onClick={() => { setSurfEdit(false); setSurfSel(null); }} type="button">← Назад</button>
            <div className="surf-title">Поверхность · Стена {wall3D + 1}</div>
          </div>
          <div className="surf-stage">
            <div className="surf-canvas">
              {leafRects(wallSurf).map((lr, li) => {
                const sel = surfSel != null && surfSel.length === lr.path.length && surfSel.every((p, i) => p === lr.path[i]);
                const col = wallColorHex(lr.c);
                return (
                  <button
                    key={li}
                    className={`surf-leaf${sel ? " sel" : ""}`}
                    style={{
                      left: `${lr.x0 * 100}%`,
                      width: `${(lr.x1 - lr.x0) * 100}%`,
                      bottom: `${lr.y0 * 100}%`,
                      height: `${(lr.y1 - lr.y0) * 100}%`,
                      background: col ?? "#ededed",
                    }}
                    onClick={() => setSurfSel(lr.path)}
                    type="button"
                  />
                );
              })}
            </div>
          </div>
          {surfSel && (
            <div className="surf-menu">
              <div className="surf-menu-title">Настроить поверхность</div>
              <div className="surf-menu-row">
                <span>Горизонтальное разделение</span>
                <button className="btn-change" onClick={() => { splitWallSurface(wall3D, surfSel, "h"); setSurfSel([...surfSel, "a"]); }} type="button">Добавить</button>
              </div>
              <div className="surf-menu-row">
                <span>Вертикальное разделение</span>
                <button className="btn-change" onClick={() => { splitWallSurface(wall3D, surfSel, "v"); setSurfSel([...surfSel, "a"]); }} type="button">Добавить</button>
              </div>
              <div className="surf-menu-row">
                <span>Изменить покрытие</span>
                <button className="btn-change" onClick={() => { setColorSearch(""); setSheet("wallColor"); }} type="button">Изменить</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
