// The furniture editor — a multi-panel bottom sheet for one module:
//   main   → width/height, Наполнение/Заменять, the editable-parts list, add-ons
//   fill   → Наполнение: shelves/drawers/open + counts
//   edit   → a part's dimension settings (e.g. overhang left/right)
//   style  → the Eman.uz material picker (with pricing) for a part
// Real fields (width/height/fill/count) drive the model + price; per-part material
// picks, add-ons and toggles are kept in `cfg` (scaffold until Eman is wired in).
import { useState } from "react";
import { FILLS, type Cabinet } from "../model/cabinet";
import { cabinetParts, PART_ADDONS, PART_TOGGLES, type Part } from "../model/parts";
import { EMAN_MATERIALS, matPriceLabel } from "../model/materials";
import { IconSearch, IconFilter } from "./icons";

export interface PartCfg {
  materials: Record<string, string>; // partId → material id
  removed: string[]; // removed part ids
  addons: string[]; // active add-on ids
  toggles: string[]; // active switch ids
  partition: number; // Перегородка count (visual)
}
export const emptyCfg = (): PartCfg => ({ materials: {}, removed: [], addons: [], toggles: [], partition: 0 });

type Panel = { k: "main" } | { k: "fill" } | { k: "edit"; part: Part } | { k: "style"; part: Part };

const cm = (mm: number) => Math.round(mm / 10);

export function FurnitureEditor({
  cab,
  index,
  name,
  sub,
  patchCab,
  onResizeWidth,
  cfg,
  onCfg,
  onClose,
  flash,
}: {
  cab: Cabinet;
  index: number;
  name: string;
  sub: string;
  patchCab: (i: number, patch: Partial<Cabinet>) => void;
  /** width change pushes the neighbouring module (keeps the row tiled) */
  onResizeWidth: (cabId: string, newW: number) => void;
  cfg: PartCfg;
  onCfg: (updater: (c: PartCfg) => PartCfg) => void;
  onClose: () => void;
  flash: (msg: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>({ k: "main" });
  const [wStr, setWStr] = useState(String(cm(cab.w)));
  const [hStr, setHStr] = useState(String(cm(cab.h)));
  const [matSearch, setMatSearch] = useState("");

  const isApplianceFill = !!cab.appliance && cab.appliance !== "none" && cab.appliance !== "filler";
  const parts = cabinetParts(cab).filter((p) => !cfg.removed.includes(p.id));

  const commitDim = (which: "w" | "h", str: string) => {
    const v = parseInt(str, 10);
    if (!v) return;
    if (which === "w") onResizeWidth(cab.id, v * 10); // input is cm → mm; pushes the neighbour
    else patchCab(index, { h: Math.max(200, Math.min(2400, v * 10)) });
  };
  const setFill = (fill: Cabinet["fill"]) => patchCab(index, { fill, count: fill === "open" ? 0 : fill === "drawers" ? 3 : 2 });
  const setPartition = (n: number) => {
    const v = Math.max(0, Math.min(4, n));
    onCfg((c) => ({ ...c, partition: v }));
    patchCab(index, { div: v > 0 ? 1 : 0 });
  };
  const chooseMaterial = (partId: string, mid: string) => {
    onCfg((c) => ({ ...c, materials: { ...c.materials, [partId]: mid } }));
    setPanel({ k: "main" });
  };
  const removePart = (partId: string) => onCfg((c) => ({ ...c, removed: [...c.removed, partId] }));
  const toggleAddon = (id: string) => onCfg((c) => ({ ...c, addons: c.addons.includes(id) ? c.addons.filter((x) => x !== id) : [...c.addons, id] }));
  const toggleSetting = (id: string) => onCfg((c) => ({ ...c, toggles: c.toggles.includes(id) ? c.toggles.filter((x) => x !== id) : [...c.toggles, id] }));

  const matName = (partId: string) => {
    const m = EMAN_MATERIALS.find((x) => x.id === cfg.materials[partId]);
    return m ? `${m.name} · ${m.desc}` : "Eman Materials";
  };
  const filteredMats = EMAN_MATERIALS.filter(
    (m) => (m.name + " " + m.desc).toLowerCase().includes(matSearch.toLowerCase()),
  );

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
        <button className="sheet-x" onClick={onClose} type="button" aria-label="Закрыть">✕</button>
      </div>

      {panel.k !== "main" && (
        <div className="fe-subhead">
          <button className="fe-back" onClick={() => setPanel({ k: "main" })} type="button">← Назад</button>
          <span className="fe-subtitle">
            {panel.k === "fill" ? "Наполнение" : panel.k === "style" ? "Стиль" : `Редактировать${panel.part.editLabel ? ` (${panel.part.editLabel})` : ""}`}
          </span>
        </div>
      )}

      {/* ---- MAIN ---- */}
      {panel.k === "main" && (
        <div className="cfg-sheet-body">
          <div className="fe-field">
            <span className="fe-field-lbl2">Ширина</span>
            <div className="fe-input">
              <input inputMode="numeric" value={wStr} onChange={(e) => setWStr(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => commitDim("w", wStr)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <span>cm</span>
            </div>
          </div>
          <div className="fe-field">
            <span className="fe-field-lbl2">Высота</span>
            <div className="fe-input">
              <input inputMode="numeric" value={hStr} onChange={(e) => setHStr(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => commitDim("h", hStr)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
              <span>cm</span>
            </div>
          </div>

          <div className="fe-actions">
            {!isApplianceFill && (
              <button className="fe-action" onClick={() => setPanel({ k: "fill" })} type="button">
                <span className="fe-action-ic">⊞</span> Наполнение
              </button>
            )}
            <button className="fe-action" onClick={() => flash("Замена модуля появится позже")} type="button">
              <span className="fe-action-ic">⟳</span> Заменять
            </button>
          </div>

          <div className="fe-list-title">Измените некоторые элементы:</div>
          {parts.map((p) => (
            <div className="part-card" key={p.id}>
              <span className="part-thumb" />
              <div className="part-body">
                <div className="part-name">{p.name} <span className="item-card-i">ⓘ</span></div>
                <div className="part-sub">{matName(p.id)}</div>
                <div className="part-actions">
                  {p.actions.includes("edit") && (
                    <button className="part-btn" onClick={() => setPanel({ k: "edit", part: p })} type="button">Редактировать</button>
                  )}
                  {p.actions.includes("style") && (
                    <button className="part-btn" onClick={() => { setMatSearch(""); setPanel({ k: "style", part: p }); }} type="button">Стиль</button>
                  )}
                  {p.actions.includes("delete") && (
                    <button className="part-btn" onClick={() => removePart(p.id)} type="button">Удалять</button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {PART_ADDONS.map((a) => {
            const on = cfg.addons.includes(a.id);
            return (
              <div className="addon-row" key={a.id}>
                <span>{a.name}</span>
                <button className={`addon-add${on ? " on" : ""}`} onClick={() => toggleAddon(a.id)} type="button">{on ? "✓ Добавлено" : "Добавлять"}</button>
              </div>
            );
          })}
          {PART_TOGGLES.map((t) => {
            const on = cfg.toggles.includes(t.id);
            return (
              <div className="toggle-row" key={t.id}>
                <span>{t.name}</span>
                <button className={`switch${on ? " on" : ""}`} onClick={() => toggleSetting(t.id)} type="button" aria-pressed={on}>
                  <span className="knob" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- FILL (Наполнение) ---- */}
      {panel.k === "fill" && (
        <div className="cfg-sheet-body">
          <div className="pillrow fe-fill">
            {FILLS.map(([v, lbl]) => (
              <button key={v} className={`chip${cab.fill === v ? " sel" : ""}`} onClick={() => setFill(v)} type="button">{lbl}</button>
            ))}
          </div>
          {cab.fill !== "open" && (
            <div className="cfg-field cfg-field-row">
              <span className="cfg-field-lbl">{cab.fill === "drawers" ? "Ящиков" : "Полок"}</span>
              <div className="stepper">
                <button onClick={() => patchCab(index, { count: Math.max(0, cab.count - 1) })} type="button">–</button>
                <span className="num">{cab.count}</span>
                <button onClick={() => patchCab(index, { count: Math.min(6, cab.count + 1) })} type="button">+</button>
              </div>
            </div>
          )}
          <div className="cfg-field cfg-field-row">
            <span className="cfg-field-lbl">Перегородка</span>
            <div className="stepper">
              <button onClick={() => setPartition(cfg.partition - 1)} type="button">–</button>
              <span className="num">{cfg.partition}</span>
              <button onClick={() => setPartition(cfg.partition + 1)} type="button">+</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- EDIT a part ---- */}
      {panel.k === "edit" && (
        <div className="cfg-sheet-body">
          {(["Левый", "Правый"] as const).map((side) => (
            <div className="fe-field-row" key={side}>
              <span className="fe-side-lbl">{side}:</span>
              <div className="fe-pair">
                <div className="fe-input sm">
                  <input inputMode="numeric" defaultValue="30" onChange={(e) => (e.target.value = e.target.value.replace(/[^0-9]/g, ""))} />
                  <span>cm</span>
                </div>
                <button className="apply-all" onClick={() => flash("Применено ко всем")} type="button">Применяется ко всем</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- STYLE (Eman material picker) ---- */}
      {panel.k === "style" && (
        <div className="cfg-sheet-body">
          <div className="search-box">
            <input className="search-input" placeholder="Поиск" value={matSearch} onChange={(e) => setMatSearch(e.target.value)} />
            <span className="search-ic"><IconSearch /></span>
          </div>
          <div className="color-bar">
            <span className="color-count">{filteredMats.length} Товаров</span>
            <button className="filter-btn" onClick={() => flash("Фильтры появятся позже")} type="button">Все фильтры <IconFilter /></button>
          </div>
          <div className="cover-list">
            {filteredMats.map((m) => (
              <button key={m.id} className={`mat-card${cfg.materials[panel.part.id] === m.id ? " sel" : ""}`} onClick={() => chooseMaterial(panel.part.id, m.id)} type="button">
                <span className="mat-top">
                  <span className="mat-thumb" style={{ background: m.color }} />
                  <span className="cover-meta">
                    <span className="cover-name">{m.name} <span className="item-card-i">ⓘ</span></span>
                    <span className="cover-desc">{m.desc}</span>
                    <span className="cover-desc">{m.thickness}</span>
                  </span>
                </span>
                <span className="mat-foot">{matPriceLabel(m)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
