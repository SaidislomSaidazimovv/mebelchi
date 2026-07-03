// Phase A.2b — the room design scene (Figma "12"). Live three.js room + an
// editable 2D floor plan. Tap a wall to select it, tap the floor for covering /
// edit, drag corners (with 90°/45° magnet) and openings, edit numbers inline.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { ThreeScene, type SceneView } from "../three/ThreeScene";
import { FloorPlan } from "../components/FloorPlan";
import { WaterPicker } from "../components/WaterPicker";
import { OpeningThumb, FittingThumb } from "../components/Thumb";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";
import { FLOOR_COVERINGS, ROOM_TYPES } from "../model/floors";
import { fittingCatalog, fittingKind, openingCatalog, wallSegments, defaultFittingHeight, defaultOpeningSill, OPENING_FINISHES, type FittingCategory, type OpeningKind, type OpeningKindId, type Pt } from "../model/room";
import { WALL_COVERINGS, WALL_FAMILIES, familyCount, coveringColor as wallColorHex, dominantColor, leafRects, defaultSurface, type SurfPath } from "../model/walls";
import { matSwatchStyle } from "../three/pbr";
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
  | "openingFinish"
  | FittingCategory
  | OpeningKindId;
interface Editor {
  x: number;
  y: number;
  value: number;
  apply: (v: number) => void;
}

export function RoomScene() {
  const t = useT();
  const fitTitle = (c: FittingCategory) => (c === "electric" ? t.room.fitElectric : c === "heating" ? t.room.fitHeating : t.room.fitVent);
  const openTitle = (k: OpeningKindId) => (k === "window" ? t.room.openWindow : k === "door" ? t.room.openDoor : t.room.openOpening);
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
  const pendingWater = useStore((s) => s.pendingWater);
  const clearPendingWater = useStore((s) => s.clearPendingWater);
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
  const setOpeningFinish = useStore((s) => s.setOpeningFinish);
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
    flash(t.room.dragAlongWall);
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
    flash(t.room.dragOnWall);
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

  // arriving from the variants "add water?" prompt → open the water picker straight away
  useEffect(() => {
    if (pendingWater) { enterWaterPick(); clearPendingWater(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWater]);

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
  const floorId = FLOOR_COVERINGS[floorCovering]?.id;

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
  const itemName = selOpen ? selOpen.name : selKind?.name ?? t.room.element;
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
    flash(t.room.duplicated);
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
          {t.room.back}
        </button>
        <button className="step-next" onClick={next} type="button">
          {t.room.toVariants}
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
            floorId={floorId}
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
              {t.room.wall(wall3D + 1)}
              <span className="item-card-i" aria-hidden>ⓘ</span>
            </div>
            <div className="item-card-desc">
              {(() => {
                const c = dominantColor(wallSurfaces[wall3D] ?? defaultSurface());
                return c >= 0 ? WALL_COVERINGS[c].name : t.room.noCovering;
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
                {k?.name ?? t.room.element}
                <span className="item-card-i" aria-hidden>ⓘ</span>
              </div>
              <div className="item-card-desc">{t.room.dragToMove}</div>
            </div>
          );
        })()}

        {!waterPick && !itemSelected && view === "plan" && !addWall && showHint && (
          <div className="plan-hint">{t.room.hintPlan}</div>
        )}
        {!waterPick && view === "plan" && addWall && (
          <div className="plan-hint">{t.room.hintAddWall}</div>
        )}

        {!waterPick && (
          <button className="scene-ctl plan-toggle" onClick={() => setViewMenu((v) => !v)} type="button" aria-label={t.room.view}>
            <ViewIcon />
          </button>
        )}

        {!waterPick && (
          <div className="scene-ctl undo-redo">
            <button onClick={undo} disabled={!canUndo} type="button" aria-label={t.room.undo}>
              <IconUndo />
            </button>
            <button onClick={redo} disabled={!canRedo} type="button" aria-label={t.room.redo}>
              <IconRedo />
            </button>
          </div>
        )}

        {viewMenu && (
          <>
            <div className="sheet-backdrop" onClick={closeMenu} />
            <div className={`view-menu pop-anim${menuClosing ? " closing" : ""}`}>
              <button className="view-disabled" disabled type="button">
                <IconVirtual /> {t.room.virtualTour} <span className="soon-tag">{t.room.soon}</span>
              </button>
              <button onClick={() => pickView("3d")} type="button">
                <Icon3D /> {t.room.v3d}
              </button>
              <button className="view-disabled" disabled type="button">
                <IconFront /> {t.room.vfront} <span className="soon-tag">{t.room.soon}</span>
              </button>
              <button onClick={() => pickView("plan")} type="button">
                <IconPlan /> {t.room.vplan}
              </button>
            </div>
          </>
        )}
      </div>

      {/* bottom toolbar — collapsible via the grip; add-wall / water-pick modes swap it */}
      {waterPick ? (
        <div className="water-bar">
          <div className="water-bar-hint">{t.room.placeWater}</div>
          <div className="water-bar-row">
            <button className="btn btn-back" onClick={() => setWaterPick(false)} type="button">
              {t.room.cancel}
            </button>
            <button
              className="btn btn-next"
              onClick={() => {
                setWaterWall(draftWater);
                setWaterPick(false);
              }}
              type="button"
            >
              {t.room.ok}
            </button>
          </div>
        </div>
      ) : addWall ? (
        <div className="addwall-bar">
          <button className="btn btn-back" onClick={exitAddWall} type="button">
            {t.room.cancel}
          </button>
          <button className="btn btn-next" onClick={commitWall} type="button">
            {t.room.approve}
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
            aria-label={t.room.collapse}
            type="button"
          />
          <div className="toolbar-row">
            {fit3D != null ? (
              <>
                <button className="tool-btn" onClick={() => { const id = duplicateFitting(fit3D); if (id) setFit3D(id); }} type="button">
                  <span className="ico">
                    <IconDuplicate />
                  </span>
                  <span className="lbl">{t.room.duplicate}</span>
                </button>
                <button className="tool-btn" onClick={() => removeFitting(fit3D)} type="button">
                  <span className="ico">
                    <IconTrash />
                  </span>
                  <span className="lbl">{t.room.del}</span>
                </button>
              </>
            ) : wall3D != null ? (
              <>
                <button className="tool-btn" onClick={() => { setColorSearch(""); setSheet("wallColor"); }} type="button">
                  <span className="ico">
                    <IconCovering />
                  </span>
                  <span className="lbl">{t.room.coverings}</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("wallModify")} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">{t.room.edit}</span>
                </button>
              </>
            ) : itemSelected ? (
              <>
                <button className="tool-btn" onClick={editItem} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">{t.room.edit}</span>
                </button>
                {selOpen && (selOpen.kind === "window" || selOpen.kind === "door") && (
                  <button className="tool-btn" onClick={() => setSheet("openingFinish")} type="button">
                    <span className="ico">
                      <IconCovering />
                    </span>
                    <span className="lbl">{t.room.color}</span>
                  </button>
                )}
                <button className="tool-btn" onClick={duplicateItem} type="button">
                  <span className="ico">
                    <IconDuplicate />
                  </span>
                  <span className="lbl">{t.room.duplicate}</span>
                </button>
                <button className="tool-btn" onClick={deleteItem} type="button">
                  <span className="ico">
                    <IconTrash />
                  </span>
                  <span className="lbl">{t.room.del}</span>
                </button>
              </>
            ) : floorSelected ? (
              <>
                <button className="tool-btn" onClick={() => setSheet("covering")} type="button">
                  <span className="ico">
                    <IconCovering />
                  </span>
                  <span className="lbl">{t.room.coverings}</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("edit")} type="button">
                  <span className="ico">
                    <IconEdit />
                  </span>
                  <span className="lbl">{t.room.edit}</span>
                </button>
              </>
            ) : (
              <>
                <button className="tool-btn" onClick={() => setSheet("shape")} type="button">
                  <span className="ico">
                    <IconRoomShape />
                  </span>
                  <span className="lbl">{t.room.roomShape}</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("elements")} type="button">
                  <span className="ico">
                    <IconElements />
                  </span>
                  <span className="lbl">{t.room.elements}</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("openings")} type="button">
                  <span className="ico">
                    <IconOpenings />
                  </span>
                  <span className="lbl">{t.room.openings}</span>
                </button>
                <button className="tool-btn" onClick={() => setSheet("ceiling")} type="button">
                  <span className="ico">
                    <IconCeiling />
                  </span>
                  <span className="lbl">{t.room.ceiling}</span>
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
                  <div className="sheet-title">{t.room.wallColorTitle}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder={t.room.search} value={colorSearch} onChange={(e) => setColorSearch(e.target.value)} />
                  <span className="search-ic"><IconSearch /></span>
                </div>
                <div className="color-bar">
                  <span className="color-count">{t.room.products(filteredColors.length)}</span>
                  <button className="filter-btn" onClick={() => setColorFilterOpen(true)} type="button">
                    {t.room.allFilters} <IconFilter />
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
                          <span className="cover-desc">{t.room.wallPaint}</span>
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
                  <div className="sheet-title">{t.room.wallModifyTitle}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">{t.room.currentCovering}</span>
                  <span className="cur-color">
                    <span className="color-sw" style={{ background: wallColorHex(dominantColor(wallSurf)) ?? "#e6e6e6" }} />
                    {dominantColor(wallSurf) >= 0 ? WALL_COVERINGS[dominantColor(wallSurf)].name : t.room.noCovering}
                  </span>
                </div>
                <button
                  className="btn btn-next"
                  style={{ marginTop: 8 }}
                  onClick={() => { setSurfSel(null); setSurfEdit(true); closeSheet(); }}
                  type="button"
                >
                  {t.room.customizeSurface}
                </button>
              </>
            )}

            {sheet === "openingFinish" && selOpen && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">{t.room.colorOf(selOpen.kind === "window")}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="cover-list">
                  {OPENING_FINISHES.map((f) => (
                    <button key={f.id} className={`fit-item${selOpen.finish === f.id ? " sel" : ""}`} onClick={() => { setOpeningFinish(selOpen.id, f.id); closeSheet(); }} type="button">
                      <span className="color-thumb" style={matSwatchStyle(f.color, f.tex)} />
                      <span className="cover-meta">
                        <span className="cover-name">{f.name}</span>
                        <span className="cover-desc">{f.tex ? t.room.wood : t.room.paint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {sheet === "elements" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">{t.room.elements}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <button className="elem-row" onClick={() => openFitSheet("electric")} type="button">
                  <span className="ei"><IconElements /></span>
                  <span className="el">{t.room.electric}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={enterWaterPick} type="button">
                  <span className="ei"><IconWater /></span>
                  <span className="el">{t.room.water}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openFitSheet("heating")} type="button">
                  <span className="ei"><IconHeating /></span>
                  <span className="el">{t.room.heating}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openFitSheet("vent")} type="button">
                  <span className="ei"><IconVent /></span>
                  <span className="el">{t.room.vent}</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {fitCat && (
              <>
                <div className="sheet-head">
                  <button className="sheet-back" onClick={() => setSheet("elements")} type="button" aria-label={t.room.back2}>‹</button>
                  <div className="sheet-title">{fitTitle(fitCat)}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder={t.room.search} value={fitSearch} onChange={(e) => setFitSearch(e.target.value)} />
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
                  <div className="sheet-title">{t.room.openings}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <button className="elem-row" onClick={() => openOpenSheet("window")} type="button">
                  <span className="ei"><IconOpenings /></span>
                  <span className="el">{t.room.windows}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openOpenSheet("door")} type="button">
                  <span className="ei"><IconDoor /></span>
                  <span className="el">{t.room.doors}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={() => openOpenSheet("opening")} type="button">
                  <span className="ei"><IconWallOpening /></span>
                  <span className="el">{t.room.wallOpenings}</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {openCat && (
              <>
                <div className="sheet-head">
                  <button className="sheet-back" onClick={() => setSheet("openings")} type="button" aria-label={t.room.back2}>‹</button>
                  <div className="sheet-title">{openTitle(openCat)}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="search-box">
                  <input className="search-input" placeholder={t.room.search} value={openSearch} onChange={(e) => setOpenSearch(e.target.value)} />
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
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="item-edit-replace">
                  <span>{t.room.wantReplace}</span>
                  <button className="replace-btn" onClick={startReplace} type="button">{t.room.replace}</button>
                </div>
                <div className="item-edit-section">{t.room.dimensions}</div>
                <div className="edit-row">
                  <span className="edit-row-lbl">{t.room.width}</span>
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
                    <span className="edit-row-lbl">{t.room.height}</span>
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
                    <span className="edit-row-lbl">{t.room.sill}</span>
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
                    <div className="item-edit-section">{t.room.position}</div>
                    <div className="edit-row">
                      <span className="edit-row-lbl">{t.room.wallSide}</span>
                      <button className={`side-toggle${selOpen.flip ? " flip" : ""}`} onClick={() => flipOpening(selOpen.id)} type="button" aria-label={t.room.side}>
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
                  <div className="sheet-title">{t.room.roomShape}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <button className="elem-row" onClick={() => setSheet("shapePick")} type="button">
                  <span className="ei"><IconReshape /></span>
                  <span className="el">{t.room.changeShape}</span>
                  <span className="chev">›</span>
                </button>
                <button className="elem-row" onClick={enterAddWall} type="button">
                  <span className="ei"><IconAddWall /></span>
                  <span className="el">{t.room.addWall}</span>
                  <span className="chev">›</span>
                </button>
              </>
            )}

            {sheet === "shapePick" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">{t.room.shapeForm}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="cards">
                  <OptionCard square selected={shape === "i"} onClick={() => tryShape("i")} title={t.room.straight}>
                    <Illustration kind="shape_i" />
                  </OptionCard>
                  <OptionCard square selected={shape === "l"} onClick={() => tryShape("l")} title={t.room.corner}>
                    <Illustration kind="shape_l" />
                  </OptionCard>
                </div>
              </>
            )}

            {sheet === "ceiling" && (
              <>
                <div className="sheet-title">{t.room.ceiling}</div>
                <div className="stepper">
                  <button onClick={() => setCeiling(-100)} type="button" aria-label={t.room.less}>−</button>
                  <div className="num">{ceiling}<small>{t.room.ceilingStep}</small></div>
                  <button onClick={() => setCeiling(100)} type="button" aria-label={t.room.more}>+</button>
                </div>
              </>
            )}

            {sheet === "edit" && (
              <>
                <div className="sheet-head">
                  <div>
                    <div className="edit-area-lbl">{t.room.area}</div>
                    <div className="edit-area-val">{areaM2} {t.labels.m2}</div>
                  </div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">{t.room.name}</span>
                  <input className="edit-input" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                </div>
                <div className="edit-row">
                  <span className="edit-row-lbl">{t.room.roomType}</span>
                  <select className="edit-select" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt} value={rt}>{t.labels.roomTypes[rt] ?? rt}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {sheet === "covering" && (
              <>
                <div className="sheet-head">
                  <div className="sheet-title">{t.room.changeFloor}</div>
                  <button className="sheet-x" onClick={closeSheet} type="button" aria-label={t.room.close}>✕</button>
                </div>
                <input className="cover-search" placeholder={t.room.search} value={coverSearch} onChange={(e) => setCoverSearch(e.target.value)} />
                <div className="cover-list">
                  {filtered.map((f) => {
                    const idx = FLOOR_COVERINGS.indexOf(f);
                    return (
                      <button key={f.id} className={`cover-item${floorCovering === idx ? " sel" : ""}`} onClick={() => setFloorCovering(idx)} type="button">
                        <span className="cover-sw" style={matSwatchStyle(f.color, f.tex)} />
                        <span className="cover-meta">
                          <span className="cover-name">{t.labels.floors[f.id]?.name ?? f.name}</span>
                          <span className="cover-desc">{t.labels.floors[f.id]?.desc ?? f.desc}</span>
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
            <div className="confirm-title">{t.room.changeShape}</div>
            <div className="confirm-body">{t.room.overwriteBody}</div>
            <div className="confirm-actions">
              <button className="btn btn-back" onClick={() => setConfirm(null)} type="button">
                {t.room.no}
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
                {t.room.overwrite}
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
              <div className="sheet-title">{t.room.filterByColor}</div>
              <button className="sheet-x" onClick={() => setColorFilterOpen(false)} type="button" aria-label={t.room.close}>✕</button>
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
              <button className="btn btn-back" onClick={() => setColorFamilies([])} type="button">{t.room.reset}</button>
              <button className="btn btn-next" onClick={() => setColorFilterOpen(false)} type="button">{t.room.done}</button>
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
            <div className="confirm-body">{t.room.applyColor}</div>
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
                {t.room.toSelected}
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
                {t.room.toAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* customize-surface editor: the wall surface centred; tap a part to split / recolour */}
      {surfEdit && wallSurf && wall3D != null && (
        <div className="surf-editor">
          <div className="surf-head">
            <button className="step-back" onClick={() => { setSurfEdit(false); setSurfSel(null); }} type="button">{t.room.back}</button>
            <div className="surf-title">{t.room.surfaceWall(wall3D + 1)}</div>
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
              <div className="surf-menu-title">{t.room.customizeSurface}</div>
              <div className="surf-menu-row">
                <span>{t.room.hSplit}</span>
                <button className="btn-change" onClick={() => { splitWallSurface(wall3D, surfSel, "h"); setSurfSel([...surfSel, "a"]); }} type="button">{t.room.add}</button>
              </div>
              <div className="surf-menu-row">
                <span>{t.room.vSplit}</span>
                <button className="btn-change" onClick={() => { splitWallSurface(wall3D, surfSel, "v"); setSurfSel([...surfSel, "a"]); }} type="button">{t.room.add}</button>
              </div>
              <div className="surf-menu-row">
                <span>{t.room.changeCovering}</span>
                <button className="btn-change" onClick={() => { setColorSearch(""); setSheet("wallColor"); }} type="button">{t.room.edit}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
