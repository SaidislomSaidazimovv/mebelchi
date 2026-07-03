// The furniture editor — a multi-panel bottom sheet for one module:
//   main   → width/height, Наполнение/Заменять, the editable-parts list, add-ons
//   fill   → Наполнение: shelves/drawers/open + counts
//   edit   → a part's dimension settings (e.g. overhang left/right)
//   style  → the Eman.uz material picker (with pricing) for a part
// Real fields (width/height/fill/count) drive the model + price; per-part material
// picks, add-ons and toggles are kept in `cfg` (scaffold until Eman is wired in).
import { useState, type ReactNode } from "react";
import { useT } from "../i18n/useT";
import { useMoney } from "../useMoney";
import { HANDLES, defaultHandlePos, type Cabinet, type FinishKey, type DoorOpening, type HandlePos } from "../model/cabinet";
import { cabinetParts, PART_FINISH, type Part } from "../model/parts";
import { EMAN_MATERIALS, matPriceLabel, hexToInt, catalogByColor } from "../model/materials";
import { matSwatchStyle } from "../three/pbr";
import type { KitchenStyle } from "../model/layout";
import { IconSearch, IconFilter } from "./icons";

export interface PartCfg {
  materials: Record<string, string>; // partId → material id
  removed: string[]; // removed part ids
  addons: string[]; // active add-on ids
  toggles: string[]; // active switch ids
  partition: number; // Перегородка count (visual)
}
export const emptyCfg = (): PartCfg => ({ materials: {}, removed: [], addons: [], toggles: [], partition: 0 });

type Panel = { k: "main" } | { k: "edit"; part: Part } | { k: "style"; part: Part };

const cm = (mm: number) => Math.round(mm / 10);

// simple line illustration per part TYPE, drawn over the material swatch so each row
// shows BOTH what the part is (door / handle / worktop / carcass) and its material
const PART_ICON: Record<string, ReactNode> = {
  front: (
    <>
      <rect x="8" y="5" width="24" height="30" rx="2.5" />
      <line x1="26" y1="14" x2="26" y2="26" />
    </>
  ),
  handle: (
    <>
      <line x1="9" y1="17" x2="31" y2="17" />
      <line x1="12" y1="17" x2="12" y2="23" />
      <line x1="28" y1="17" x2="28" y2="23" />
    </>
  ),
  worktop: (
    <>
      <rect x="6" y="15" width="28" height="7" rx="1.5" />
      <line x1="6" y1="18.5" x2="34" y2="18.5" />
    </>
  ),
  carcass: (
    <>
      <rect x="9" y="8" width="22" height="27" rx="1.5" />
      <line x1="9" y1="19" x2="31" y2="19" />
      <line x1="9" y1="27" x2="31" y2="27" />
    </>
  ),
};

function PartThumb({ partId, style }: { partId: string; style?: Record<string, string> }) {
  return (
    <span className="part-thumb" style={style}>
      {PART_ICON[partId] && (
        <svg className="part-ico" viewBox="0 0 40 40" aria-hidden="true">
          {PART_ICON[partId]}
        </svg>
      )}
    </span>
  );
}

export function FurnitureEditor({
  cab,
  index,
  name,
  sub,
  patchCab,
  onResizeWidth,
  applyFinishToAll,
  applyToAll,
  style,
  cfg,
  onCfg,
  onClose,
  onOpenFill,
  onReplace,
  onSaveToLibrary,
  flash,
}: {
  cab: Cabinet;
  index: number;
  name: string;
  sub: string;
  /** the kitchen-wide finish (default colour per part when the module has no override) */
  style: KitchenStyle;
  patchCab: (i: number, patch: Partial<Cabinet>) => void;
  /** width change pushes the neighbouring module (keeps the row tiled) */
  onResizeWidth: (cabId: string, newW: number) => void;
  /** push a finish (part → colour) onto every module ("apply to all") */
  applyFinishToAll: (finish: Partial<Record<FinishKey, number>>) => void;
  /** push a patch (e.g. handle type) onto every module ("apply to all") */
  applyToAll: (patch: Partial<Cabinet>) => void;
  cfg: PartCfg;
  onCfg: (updater: (c: PartCfg) => PartCfg) => void;
  onClose: () => void;
  /** open the focused full-screen fill (Наполнение) editor for this module */
  onOpenFill: () => void;
  /** open the catalog to swap this module for another type (keeps its place) */
  onReplace: () => void;
  /** save THIS module (with its full layout/finish) to the personal block library */
  onSaveToLibrary: () => void;
  flash: (msg: string) => void;
}) {
  const t = useT();
  const money = useMoney();
  const [panel, setPanel] = useState<Panel>({ k: "main" });
  const [wStr, setWStr] = useState(String(cm(cab.w)));
  const [hStr, setHStr] = useState(String(cm(cab.h)));
  const [matSearch, setMatSearch] = useState("");
  // Each material / handle change applies to THIS module immediately (live preview), and is
  // ACCUMULATED into a pending patch. We DON'T interrupt with the "apply to all?" popup on
  // every tap (annoying) — instead it's raised ONCE when the user leaves the panel (Назад)
  // or closes the sheet (✕), so they can try options freely and decide scope at the end.
  const [pendPatch, setPendPatch] = useState<Partial<Cabinet>>({});
  const [pendFinish, setPendFinish] = useState<Partial<Record<FinishKey, number>>>({});
  const [scopeNext, setScopeNext] = useState<{ run: () => void } | null>(null);
  const hasPending = Object.keys(pendPatch).length > 0 || Object.keys(pendFinish).length > 0;
  const queueCab = (patch: Partial<Cabinet>) => setPendPatch((p) => ({ ...p, ...patch }));
  const queueFinish = (finish: Partial<Record<FinishKey, number>>) => setPendFinish((f) => ({ ...f, ...finish }));
  // leaving a panel / closing the sheet: raise the scope popup first if anything changed
  const leave = (run: () => void) => (hasPending ? setScopeNext({ run }) : run());
  const resolveScope = (all: boolean) => {
    if (all) {
      if (Object.keys(pendPatch).length) applyToAll(pendPatch);
      if (Object.keys(pendFinish).length) applyFinishToAll(pendFinish);
    }
    setPendPatch({});
    setPendFinish({});
    const next = scopeNext;
    setScopeNext(null);
    next?.run();
  };
  const setHandleType = (idx: number) => { patchCab(index, { handle: idx }); queueCab({ handle: idx }); };
  // whole-cabinet door opening + handle placement (mirror the Fill Editor's door settings).
  // While the user hasn't pinned a placement, it auto-follows the hinge (opposite edge);
  // once they tap a placement it stays put.
  const curOpening: DoorOpening = cab.opening ?? "left";
  const curHandlePos: HandlePos = cab.handlePos ?? defaultHandlePos(curOpening);
  const setOpening = (o: DoorOpening) => { patchCab(index, { opening: o }); queueCab({ opening: o }); };
  const setHandlePos = (p: HandlePos) => { patchCab(index, { handlePos: p }); queueCab({ handlePos: p }); };

  const isApplianceFill = !!cab.appliance && cab.appliance !== "none" && cab.appliance !== "filler";
  const parts = cabinetParts(cab).filter((p) => !cfg.removed.includes(p.id));

  const commitDim = (which: "w" | "h", str: string) => {
    const v = parseInt(str, 10);
    if (!v) return;
    if (which === "w") onResizeWidth(cab.id, v * 10); // input is cm → mm; pushes the neighbour
    else patchCab(index, { h: Math.max(200, Math.min(2400, v * 10)) });
  };
  // pick a material for a part → record it (for the BOM/price) AND recolour this
  // module's matching render part live (facade/worktop/handle/carcass). Stays open so
  // you can browse finishes and see each one applied immediately.
  const chooseMaterial = (partId: string, mid: string) => {
    onCfg((c) => ({ ...c, materials: { ...c.materials, [partId]: mid } }));
    const m = EMAN_MATERIALS.find((x) => x.id === mid);
    const key = PART_FINISH[partId];
    if (m && key) {
      const col = hexToInt(m.color);
      patchCab(index, { finish: { ...cab.finish, [key]: col } }); // this module (live preview)
      queueFinish({ [key]: col }); // … remembered for the scope prompt on leaving
    }
  };
  const removePart = (partId: string) => onCfg((c) => ({ ...c, removed: [...c.removed, partId] }));

  const matName = (partId: string) => {
    const m = EMAN_MATERIALS.find((x) => x.id === cfg.materials[partId]);
    return m ? `${m.name} · ${m.desc}` : t.fe.emanMaterials;
  };
  // a REAL, dynamic thumbnail for a part = its current material: the picked Eman material
  // first (texture/colour), else the module's per-part finish colour (mapped back to a
  // catalog material for its texture), else the kitchen-wide default. Updates the instant
  // the user changes the facade wood / worktop / handle.
  const partThumb = (partId: string): Record<string, string> | undefined => {
    const picked = EMAN_MATERIALS.find((x) => x.id === cfg.materials[partId]);
    if (picked) return matSwatchStyle(picked.color, picked.tex);
    const key = PART_FINISH[partId];
    if (!key) return undefined; // non-material part → keep the default placeholder
    const colInt = cab.finish?.[key] ?? style[key];
    if (colInt == null) return undefined;
    const hex = `#${(colInt >>> 0).toString(16).padStart(6, "0")}`;
    return matSwatchStyle(hex, catalogByColor(colInt, key)?.tex);
  };
  const matsForPart = (part: Part) => {
    const key = PART_FINISH[part.id];
    return EMAN_MATERIALS.filter(
      (m) => (!key || m.part === key) && (m.name + " " + m.desc).toLowerCase().includes(matSearch.toLowerCase()),
    );
  };

  return (
    <>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{name} <span className="item-card-i">ⓘ</span></div>
          {panel.k === "main" && (
            <>
              <div className="fe-sub">{sub}</div>
              <div className="fe-dim">{cm(cab.w)}×{cm(cab.h)}cm</div>
            </>
          )}
        </div>
        <button className="sheet-x" onClick={() => leave(onClose)} type="button" aria-label={t.fe.close}>✕</button>
      </div>

      {panel.k !== "main" && (
        <div className="fe-subhead">
          <button className="fe-back" onClick={() => leave(() => setPanel({ k: "main" }))} type="button">{t.fe.back}</button>
          <span className="fe-subtitle">
            {panel.k === "style" ? t.fe.style : panel.part.editLabel ? t.fe.editLabel(panel.part.editLabel) : t.fe.edit}
          </span>
        </div>
      )}

      {/* ---- MAIN ---- */}
      {panel.k === "main" && (
        <div className="cfg-sheet-body">
          <div className="fe-field">
            <span className="fe-field-lbl2">{t.fe.width}</span>
            <div className="fe-input">
              <input inputMode="numeric" value={wStr} onChange={(e) => setWStr(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => commitDim("w", wStr)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <span>cm</span>
            </div>
          </div>
          <div className="fe-field">
            <span className="fe-field-lbl2">{t.fe.height}</span>
            <div className="fe-input">
              <input inputMode="numeric" value={hStr} onChange={(e) => setHStr(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => commitDim("h", hStr)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <span>cm</span>
            </div>
          </div>

          <div className="fe-actions">
            {!isApplianceFill && (
              <button className="fe-action" onClick={onOpenFill} type="button">
                <span className="fe-action-ic">⊞</span> {t.fe.fill}
              </button>
            )}
            <button className="fe-action fe-action-2" onClick={onReplace} type="button">
              <span className="fe-action-ic">⟳</span> {t.fe.replace}
            </button>
            <button className="fe-action" onClick={() => { onSaveToLibrary(); flash(`${t.fe.saveToLibrary} ✓`); }} type="button">
              <span className="fe-action-ic">▤</span> {t.fe.saveToLibrary}
            </button>
          </div>

          <div className="fe-list-title">{t.fe.changeSome}</div>
          {parts.map((p) => (
            <div className="part-card" key={p.id}>
              <PartThumb partId={p.id} style={partThumb(p.id)} />
              <div className="part-body">
                <div className="part-name">{p.name} <span className="item-card-i">ⓘ</span></div>
                <div className="part-sub">{matName(p.id)}</div>
                <div className="part-actions">
                  {p.actions.includes("edit") && (
                    <button className="part-btn" onClick={() => setPanel({ k: "edit", part: p })} type="button">{t.fe.edit}</button>
                  )}
                  {p.actions.includes("style") && (
                    <button className="part-btn" onClick={() => { setMatSearch(""); setPanel({ k: "style", part: p }); }} type="button">{t.fe.style}</button>
                  )}
                  {p.actions.includes("delete") && (
                    <button className="part-btn" onClick={() => removePart(p.id)} type="button">{t.fe.delete}</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- EDIT a part ---- */}
      {/* handle → door opening side + handle placement (same options as the Fill Editor) */}
      {panel.k === "edit" && panel.part.id === "handle" && (
        <div className="cfg-sheet-body">
          <div className="cfg-field-lbl">{t.fe.opening}</div>
          <div className="pillrow fe-fill">
            {(["left", "right", "top", "bottom"] as DoorOpening[]).map((o) => (
              <button key={o} className={`chip${curOpening === o ? " sel" : ""}`} onClick={() => setOpening(o)} type="button">{t.fe.opt[o]}</button>
            ))}
          </div>
          <div className="cfg-field-lbl">{t.fe.handlePos}</div>
          <div className="pillrow fe-fill">
            {(["left", "right", "top", "bottom", "center", "none"] as HandlePos[]).map((p) => (
              <button key={p} className={`chip${curHandlePos === p ? " sel" : ""}`} onClick={() => setHandlePos(p)} type="button">{t.fe.opt[p]}</button>
            ))}
          </div>
        </div>
      )}
      {panel.k === "edit" && panel.part.id !== "handle" && (
        <div className="cfg-sheet-body">
          {[t.fe.left, t.fe.right].map((side) => (
            <div className="fe-field-row" key={side}>
              <span className="fe-side-lbl">{side}:</span>
              <div className="fe-pair">
                <div className="fe-input sm">
                  <input inputMode="numeric" defaultValue="30" onChange={(e) => (e.target.value = e.target.value.replace(/[^0-9]/g, ""))} />
                  <span>cm</span>
                </div>
                <button className="apply-all" onClick={() => flash(t.fe.appliedAll)} type="button">{t.fe.applyAll}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- STYLE (Eman material picker) ---- */}
      {panel.k === "style" && (() => {
        const mats = matsForPart(panel.part);
        const chosen = cfg.materials[panel.part.id];
        const isHandle = panel.part.id === "handle";
        return (
          <div className="cfg-sheet-body">
            {/* handle style = its TYPE (bar/profile/knob/none) + the metal colour below */}
            {isHandle && (
              <>
                <div className="cfg-field-lbl">{t.fe.handleType}</div>
                <div className="pillrow fe-fill">
                  {HANDLES.map((_, i) => (
                    <button key={i} className={`chip${cab.handle === i ? " sel" : ""}`} onClick={() => setHandleType(i)} type="button">{t.labels.handles[i]}</button>
                  ))}
                </div>
                <div className="cfg-field-lbl">{t.fe.metalColor}</div>
              </>
            )}
            <div className="search-box">
              <input className="search-input" placeholder={t.fe.search} value={matSearch} onChange={(e) => setMatSearch(e.target.value)} />
              <span className="search-ic"><IconSearch /></span>
            </div>
            <div className="color-bar">
              <span className="color-count">{t.fe.products(mats.length)}</span>
              <button className="filter-btn" onClick={() => flash(t.fe.filtersSoon)} type="button">{t.fe.allFilters} <IconFilter /></button>
            </div>
            <div className="cover-list">
              {mats.map((m) => (
                <button key={m.id} className={`mat-card${chosen === m.id ? " sel" : ""}`} onClick={() => chooseMaterial(panel.part.id, m.id)} type="button">
                  <span className="mat-top">
                    <span className="mat-thumb" style={matSwatchStyle(m.color, m.tex)} />
                    <span className="cover-meta">
                      <span className="cover-name">{m.name} <span className="item-card-i">ⓘ</span></span>
                      <span className="cover-desc">{m.desc}</span>
                      <span className="cover-desc">{m.thickness}</span>
                    </span>
                  </span>
                  <span className="mat-foot">{matPriceLabel(m, money)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* raised on leaving a panel / closing after changes: apply to this module or all? */}
      {scopeNext && (
        <div className="scope-modal" onClick={() => resolveScope(false)}>
          <div className="scope-card" onClick={(e) => e.stopPropagation()}>
            <div className="scope-title">{t.fe.scopeTitle}</div>
            <div className="scope-sub">{t.fe.scopeSub}</div>
            <div className="scope-actions">
              <button className="scope-this" onClick={() => resolveScope(false)} type="button">{t.fe.scopeThis}</button>
              <button className="scope-all" onClick={() => resolveScope(true)} type="button">{t.fe.scopeAll}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
