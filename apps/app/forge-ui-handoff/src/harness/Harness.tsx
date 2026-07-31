// The harness — a fake host, so the UI layer runs on its own.
//
// This stands in for Mebelchi's real model. It holds a couple of panels in local
// state and logs every callback the stage fires. That is enough to build and judge
// every gesture without the engine being present.
//
// It is intentionally dumb: no magnets, no rules, no anchors, no persistence. If a
// gesture feels wrong here, it is the UI layer's problem and you can fix it. If it
// needs the model to answer something, that is a host change — write it in the log
// at the bottom of README and send it back with the work.

import { useMemo, useState } from "react";
import { Stage3D } from "../ui/Stage3D";
import type { Panel } from "../contract/types";
import { mm10ToMm } from "../contract/types";

const ENVELOPE = { w_mm10: 6000, h_mm10: 7200, d_mm10: 5600 };
const NO_HOLES: never[] = [];
const LOCK_ALL = ["width", "height", "depth"] as const;

/** Two panels: one big, one deliberately SMALL — small ones are where the side
 *  handles and the move arrows fight, so keep testing against this one. */
const START: Panel[] = [
  {
    id: "P1", name: "P1 · бок", role: "side",
    x: 0, y: 0, z: 0, width: 160, height: 7200, depth: 5600,
    material: "ldsp", bands: [10, 10, 0, 0],
    orientation: { xAxis: "height", yAxis: "depth" },
  },
  {
    id: "P2", name: "P2 · маленькая", role: "filler",
    x: 2000, y: 0, z: 2000, width: 1200, height: 900, depth: 160,
    material: "ldsp", bands: [10, 0, 10, 0],
    orientation: { xAxis: "width", yAxis: "height" },
  },
];

export function Harness() {
  const [panels, setPanels] = useState<Panel[]>(START);
  const [selectedId, setSelectedId] = useState<string | null>("P1");
  const [selectedSide, setSelectedSide] = useState<string | null>(null);
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [log, setLog] = useState<string[]>([]);

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 14));
  const selected = panels.find((p) => p.id === selectedId) ?? null;

  /** Four side handles on the selected panel, at its edge midpoints. */
  const handles = useMemo(() => {
    if (!selected) return [];
    const c = {
      x: selected.x + selected.width / 2,
      y: selected.y + selected.height / 2,
      z: selected.z + selected.depth / 2,
    };
    return [
      { id: "xMin", x: selected.x, y: c.y, z: c.z, axis: "x" as const },
      { id: "xMax", x: selected.x + selected.width, y: c.y, z: c.z, axis: "x" as const },
      { id: "yMin", x: c.x, y: selected.y, z: c.z, axis: "y" as const },
      { id: "yMax", x: c.x, y: selected.y + selected.height, z: c.z, axis: "y" as const },
    ];
  }, [selected]);

  const move = (id: string, x: number, y: number, z: number) => {
    setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, x, y, z } : p)));
  };

  /** Apply a side-handle drag to the selected panel: the dragged face moves, the
   *  opposite one stays put. The real model owns this; the harness fakes it so the
   *  resize is visible and F2 can be judged by eye. */
  const resizeSide = (id: string, coord: number) => {
    setPanels((ps) => ps.map((p) => {
      if (p.id !== selectedId) return p;
      if (id === "xMax") return { ...p, width: Math.max(50, coord - p.x) };
      if (id === "xMin") return { ...p, width: Math.max(50, p.x + p.width - coord), x: coord };
      if (id === "yMax") return { ...p, height: Math.max(50, coord - p.y) };
      if (id === "yMin") return { ...p, height: Math.max(50, p.y + p.height - coord), y: coord };
      return p;
    }));
  };

  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="studio-brand">Forge UI</span>
        <span className="studio-mode">харнесс · без движка</span>
      </header>

      <main className="studio-stage">
        <Stage3D
          panels={panels}
          holes={NO_HOLES}
          selectedPanelId={selectedId}
          onSelectPanel={(id) => { setSelectedId(id); setSelectedSide(null); say(`select ${id ?? "—"}`); }}
          onDragPanel={(id, x, y, z, rx, ry, rz) => {
            setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, x, y, z, rx, ry, rz } : p)));
            const rot = ([["rx", rx], ["ry", ry], ["rz", rz]] as const)
              .filter(([, v]) => v).map(([k, v]) => `${k}=${Math.round(((v as number) * 180) / Math.PI)}°`).join(" ");
            say(`drop ${id} → ${mm10ToMm(x)},${mm10ToMm(y)},${mm10ToMm(z)}мм${rot ? " · " + rot : ""}`);
          }}
          onLiveDragPanel={(id, x, y, z) => { move(id, x, y, z); say(`live ${id} → ${mm10ToMm(x)}мм`); }}
          onUpdateDim={() => {}}
          transformMode={mode}
          envelope={ENVELOPE}
          lockedDims={LOCK_ALL}
          handles={mode === "translate" ? handles : []}
          selectedHandleId={selectedSide}
          onSelectHandle={(id) => { setSelectedSide(id); say(`side ${id ?? "—"}`); }}
          onDragHandle={(id, coord) => { resizeSide(id, coord); say(`resize ${id} → ${mm10ToMm(coord)}мм`); }}
        />

        <aside className="controls-card">
          <div className="controls-section">
            <div className="controls-head"><span className="controls-title">Панели</span></div>
            <div className="forge-panel-list">
              {panels.map((p) => (
                <button key={p.id}
                  className={`forge-chip ${p.id === selectedId ? "on" : ""}`}
                  onClick={() => { setSelectedId(p.id); setSelectedSide(null); }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="forge-panel-list" style={{ marginTop: 8 }}>
              <button className={`forge-chip ${mode === "translate" ? "on" : ""}`}
                onClick={() => setMode("translate")}>↔ Двигать / размер</button>
              <button className={`forge-chip ${mode === "rotate" ? "on" : ""}`}
                onClick={() => { setMode("rotate"); setSelectedSide(null); }}>⟳ Поворот</button>
            </div>
            <div className="forge-note">
              «маленькая» — специально мелкая: именно на таких кубики граней и стрелки
              перемещения конфликтуют. Проверяйте жесты на ней.
            </div>
          </div>

          <div className="controls-section separator">
            <div className="controls-head"><span className="controls-title">События</span></div>
            <div className="harness-log">
              {log.length === 0 ? <div className="forge-note">— пока пусто —</div>
                : log.map((l, i) => <div className="harness-log-row" key={i}>{l}</div>)}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
