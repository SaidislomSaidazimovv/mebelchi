// KarkasBlockEditor — the edit sheet for a PLACED karkas block, built 1:1 with the cabinet's
// FurnitureEditor "main" panel (same sheet-head / fe-field / fe-actions / part-card classes) so a
// karkas block edits exactly like an existing / library block: width & height inputs, the action
// row (Наполнение / Nusxa / Bibliotekaga / Karkas), and the "change some elements" list of the
// block's components. Deep per-part edits open the karkas editor (that IS a block's part editor).
import { useState } from "react";
import { useT } from "../i18n/useT";
import { blockDimsMm } from "../three/karkasLayer";
import { partColor, boardForRole, boardById, BOARDS, type MaterialPlan } from "../three/materials";
import type { StructuralModel, Component } from "../../../../engine/contracts/structure.js";

const cmOf = (mm: number): number => Math.round(mm / 10);
const hex6 = (int: number): string => `#${(int >>> 0).toString(16).padStart(6, "0")}`;

function parseBlock(json: string): { model: StructuralModel; plan: MaterialPlan | null } | null {
  try {
    const d = JSON.parse(json) as { model?: StructuralModel; plan?: MaterialPlan };
    return d.model && Array.isArray(d.model.blocks) ? { model: d.model, plan: d.plan ?? null } : null;
  } catch {
    return null;
  }
}

export function KarkasBlockEditor({
  name,
  karkasJson,
  onClose,
  onOpenKarkas,
  onDuplicate,
  onSaveToLibrary,
  onResize,
  onSetMaterial,
  insideView,
  onToggleInside,
}: {
  name: string;
  karkasJson: string;
  onClose: () => void;
  onOpenKarkas: () => void;
  onDuplicate: () => void;
  onSaveToLibrary: () => void;
  onResize: (dim: "w" | "h" | "d", mm: number) => void;
  onSetMaterial: (componentId: string, boardId: string) => void;
  insideView: boolean;
  onToggleInside: () => void;
}) {
  const t = useT();
  const dims = blockDimsMm(karkasJson) ?? { w: 0, h: 0, depth: 0 };
  const parsed = parseBlock(karkasJson);
  const plan = parsed?.plan ?? null;
  const components: Component[] = parsed ? parsed.model.blocks.flatMap((b) => b.components) : [];
  const [wStr, setWStr] = useState(String(cmOf(dims.w)));
  const [hStr, setHStr] = useState(String(cmOf(dims.h)));
  const [dStr, setDStr] = useState(String(cmOf(dims.depth)));

  const commit = (dim: "w" | "h" | "d", str: string) => {
    const v = parseInt(str, 10);
    if (v) onResize(dim, v * 10); // cm input → mm
  };
  // the material a component is drawn with: its per-component override, else the plan's role decor.
  const effMaterial = (c: Component): string => c.material ?? (plan ? boardForRole(plan, c.role ?? undefined)?.id ?? "" : "");
  const matName = (c: Component): string => boardById(effMaterial(c))?.name ?? "—";
  const swatch = (c: Component): string => (plan ? hex6(partColor(plan, c.role ?? undefined, c.material)) : "#cccccc");

  const dimField = (label: string, val: string, set: (s: string) => void, dim: "w" | "h" | "d") => (
    <div className="fe-field">
      <span className="fe-field-lbl2">{label}</span>
      <div className="fe-input">
        <input inputMode="numeric" value={val} onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ""))} onBlur={() => commit(dim, val)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <span>cm</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="sheet-head">
        <div>
          <div className="sheet-title">{name} <span className="item-card-i">ⓘ</span></div>
          <div className="fe-sub">Karkas blok</div>
          <div className="fe-dim">{cmOf(dims.w)}×{cmOf(dims.h)}cm</div>
        </div>
        <button className="sheet-x" onClick={onClose} type="button" aria-label={t.fe.close}>✕</button>
      </div>

      <div className="cfg-sheet-body">
        {dimField(t.fe.width, wStr, setWStr, "w")}
        {dimField(t.fe.height, hStr, setHStr, "h")}
        {dimField("Chuqurlik", dStr, setDStr, "d")}

        <div className="fe-actions">
          <button className="fe-action" onClick={onOpenKarkas} type="button">
            <span className="fe-action-ic">⊞</span> {t.fe.fill}
          </button>
          <button className="fe-action fe-action-2" onClick={onDuplicate} type="button">
            <span className="fe-action-ic">⧉</span> {t.config.duplicate}
          </button>
          <button className="fe-action" onClick={onSaveToLibrary} type="button">
            <span className="fe-action-ic">▤</span> {t.fe.saveToLibrary}
          </button>
          <button className="fe-action" onClick={onOpenKarkas} type="button">
            <span className="fe-action-ic">🔧</span> Karkas
          </button>
          {/* «Ichini ko'rish» — fade the fronts so the interior (shelves / drawer boxes) shows, like
              imos's transparent Article-Designer view */}
          <button className="fe-action" onClick={onToggleInside} type="button" style={insideView ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}>
            <span className="fe-action-ic">👁</span> {insideView ? "Ichi ✓" : "Ichini ko'rish"}
          </button>
        </div>

        {components.length > 0 && (
          <>
            <div className="fe-list-title">{t.fe.changeSome}</div>
            {components.map((c) => (
              <div className="part-card" key={c.id}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: swatch(c), border: "1px solid var(--line)", flex: "0 0 auto" }} />
                <div className="part-body">
                  <div className="part-name">{c.name} <span className="item-card-i">ⓘ</span></div>
                  <div className="part-sub">{matName(c)}</div>
                  <div className="part-actions">
                    {/* inline material change — the same pure engine op the karkas editor uses (the
                        board also carries its thickness). Deeper edits open the karkas editor. */}
                    <select value={effMaterial(c)} onChange={(e) => onSetMaterial(c.id, e.target.value)} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink)", maxWidth: 150 }}>
                      {BOARDS.map((bd) => <option key={bd.id} value={bd.id}>{bd.name}</option>)}
                    </select>
                    <button className="part-btn" onClick={onOpenKarkas} type="button">{t.fe.edit}</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
