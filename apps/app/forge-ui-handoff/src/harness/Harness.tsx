import { useMemo, useState } from "react";
import { Stage3D } from "../ui/Stage3D";
import type { Panel } from "../contract/types";
import { mm10ToMm } from "../contract/types";

const ENVELOPE = { w_mm10: 6000, h_mm10: 7200, d_mm10: 5600 };
const NO_HOLES: never[] = [];
const LOCK_ALL = ["width", "height", "depth"] as const;

const START: Panel[] = [
{
  id: "P1", name: "P1 · бок", role: "side",
  x: 0, y: 0, z: 0, width: 160, height: 7200, depth: 5600,
  material: "ldsp", bands: [10, 10, 0, 0],
  orientation: { xAxis: "height", yAxis: "depth" }
},
{
  id: "P2", name: "P2 · маленькая", role: "filler",
  x: 2000, y: 0, z: 2000, width: 1200, height: 900, depth: 160,
  material: "ldsp", bands: [10, 0, 10, 0],
  orientation: { xAxis: "width", yAxis: "height" }
},
{
  id: "P3", name: "P3 · щит (фасад)", role: "other",
  x: 500, y: 250, z: 2710, width: 5000, height: 3500, depth: 180,
  material: "ldsp", bands: [10, 10, 10, 10],
  orientation: { xAxis: "width", yAxis: "height" }
}];

export function Harness() {
  const [panels, setPanels] = useState<Panel[]>(START);
  const [selectedId, setSelectedId] = useState<string | null>("P1");
  const [selectedSide, setSelectedSide] = useState<string | null>(null);
  const [mode, setMode] = useState<"translate" | "resize" | "rotate" | "modifier">("translate");
  const [log, setLog] = useState<string[]>([]);

  const [rounds, setRounds] = useState<Record<string, Record<string, number>>>({});

  const [chamfers, setChamfers] = useState<Record<string, Record<string, {width: number;depth: number;}>>>({});

  const [notches, setNotches] = useState<Record<string, Record<string, {width: number;depth: number;radius: number;pos: number;lockL: boolean;lockR: boolean;}>>>({});

  const [windows, setWindows] = useState<Record<string, {w: number;h: number;radius: number;cx: number;cy: number;lockT: boolean;lockR: boolean;lockB: boolean;lockL: boolean;}>>({});

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 14));
  const selected = panels.find((p) => p.id === selectedId) ?? null;

  const handles = useMemo(() => {
    if (!selected) return [];
    const c = {
      x: selected.x + selected.width / 2,
      y: selected.y + selected.height / 2,
      z: selected.z + selected.depth / 2
    };
    return [
    { id: "xMin", x: selected.x, y: c.y, z: c.z, axis: "x" as const },
    { id: "xMax", x: selected.x + selected.width, y: c.y, z: c.z, axis: "x" as const },
    { id: "yMin", x: c.x, y: selected.y, z: c.z, axis: "y" as const },
    { id: "yMax", x: c.x, y: selected.y + selected.height, z: c.z, axis: "y" as const }];

  }, [selected]);

  const appliedRounds = useMemo(
    () => Object.entries(rounds[selectedId ?? ""] ?? {}).map(([cornerId, radius]) => ({ cornerId, radius })),
    [rounds, selectedId]
  );
  const appliedChamfers = useMemo(
    () => Object.entries(chamfers[selectedId ?? ""] ?? {}).map(([edgeId, v]) => ({ edgeId, width: v.width, depth: v.depth })),
    [chamfers, selectedId]
  );
  const appliedNotches = useMemo(
    () => Object.entries(notches[selectedId ?? ""] ?? {}).map(([edgeId, v]) => ({ edgeId, width: v.width, depth: v.depth, radius: v.radius, pos: v.pos, lockL: v.lockL, lockR: v.lockR })),
    [notches, selectedId]
  );
  const appliedWindow = useMemo(() => windows[selectedId ?? ""] ?? null, [windows, selectedId]);

  const panelCuts = useMemo(() => {
    const out: Record<string, {window: {w: number;h: number;radius: number;cx: number;cy: number;} | null;rounds: {cornerId: string;radius: number;}[];notches: {edgeId: string;width: number;depth: number;radius: number;pos: number;}[];chamfers: {edgeId: string;width: number;depth: number;}[];}> = {};
    for (const p of panels) {
      out[p.id] = {
        window: windows[p.id] ?? null,
        rounds: Object.entries(rounds[p.id] ?? {}).map(([cornerId, radius]) => ({ cornerId, radius })),
        notches: Object.entries(notches[p.id] ?? {}).map(([edgeId, v]) => ({ edgeId, width: v.width, depth: v.depth, radius: v.radius, pos: v.pos })),
        chamfers: Object.entries(chamfers[p.id] ?? {}).map(([edgeId, v]) => ({ edgeId, width: v.width, depth: v.depth }))
      };
    }
    return out;
  }, [panels, rounds, notches, chamfers, windows]);

  const move = (id: string, x: number, y: number, z: number) => {
    setPanels((ps) => ps.map((p) => p.id === id ? { ...p, x, y, z } : p));
  };

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
          onSelectPanel={(id) => {setSelectedId(id);setSelectedSide(null);say(`select ${id ?? "—"}`);}}
          onDragPanel={(id, x, y, z, rx, ry, rz) => {
            setPanels((ps) => ps.map((p) => p.id === id ? { ...p, x, y, z, rx, ry, rz } : p));
            const rot = ([["rx", rx], ["ry", ry], ["rz", rz]] as const).
            filter(([, v]) => v).map(([k, v]) => `${k}=${Math.round((v as number) * 180 / Math.PI)}°`).join(" ");
            say(`drop ${id} → ${mm10ToMm(x)},${mm10ToMm(y)},${mm10ToMm(z)}мм${rot ? " · " + rot : ""}`);
          }}
          onLiveDragPanel={(id, x, y, z) => {move(id, x, y, z);say(`live ${id} → ${mm10ToMm(x)}мм`);}}
          onUpdateDim={() => {}}
          transformMode={mode === "rotate" ? "rotate" : "translate"}
          showTargets={mode === "modifier"}
          showGizmo={mode !== "resize"}
          onPickTarget={(c) => say(`target ${c}`)}
          onApplyRound={(corners, r) => {
            const pid = selectedId ?? "";
            setRounds((prev) => {
              const cur = { ...(prev[pid] ?? {}) };
              for (const c of corners) {if (r > 0) cur[c] = r;else delete cur[c];}
              return { ...prev, [pid]: cur };
            });
            say(`round ${corners.join(",")} r=${mm10ToMm(r)}мм`);
          }}
          appliedRounds={appliedRounds}
          onApplyChamfer={(edgeIds, w, d) => {
            const pid = selectedId ?? "";
            setChamfers((prev) => {
              const cur = { ...(prev[pid] ?? {}) };
              for (const e of edgeIds) {if (w > 0) cur[e] = { width: w, depth: d };else delete cur[e];}
              return { ...prev, [pid]: cur };
            });
            say(`chamfer ${edgeIds.join(",")} w=${mm10ToMm(w)} d=${mm10ToMm(d)}мм`);
          }}
          appliedChamfers={appliedChamfers}
          onApplyNotch={(edgeId, w, d, r, pos, lockL, lockR) => {
            const pid = selectedId ?? "";
            setNotches((prev) => {
              const cur = { ...(prev[pid] ?? {}) };
              if (w > 0) cur[edgeId] = { width: w, depth: d, radius: r, pos, lockL, lockR };else delete cur[edgeId];
              return { ...prev, [pid]: cur };
            });
            say(`notch ${edgeId} w=${mm10ToMm(w)} d=${mm10ToMm(d)} r=${mm10ToMm(r)}мм${lockL ? " L🔒" : ""}${lockR ? " R🔒" : ""}`);
          }}
          appliedNotches={appliedNotches}
          onApplyWindow={(w, h, radius, cx, cy, lockT, lockR, lockB, lockL) => {
            const pid = selectedId ?? "";
            setWindows((prev) => {
              const cur = { ...prev };
              if (w > 0) cur[pid] = { w, h, radius, cx, cy, lockT, lockR, lockB, lockL };else delete cur[pid];
              return cur;
            });
            say(`window ${mm10ToMm(w)}×${mm10ToMm(h)} r=${mm10ToMm(radius)}мм${lockT || lockR || lockB || lockL ? " 🔒" : ""}`);
          }}
          appliedWindow={appliedWindow}
          panelCuts={panelCuts}
          envelope={ENVELOPE}
          lockedDims={LOCK_ALL}
          handles={mode === "resize" ? handles : []}
          selectedHandleId={selectedSide}
          onSelectHandle={(id) => {setSelectedSide(id);say(`side ${id ?? "—"}`);}}
          onDragHandle={(id, coord) => {resizeSide(id, coord);say(`resize ${id} → ${mm10ToMm(coord)}мм`);}} />

        <aside className="controls-card">
          <div className="controls-section">
            <div className="controls-head"><span className="controls-title">Панели</span></div>
            <div className="forge-panel-list">
              {panels.map((p) =>
              <button key={p.id}
              className={`forge-chip ${p.id === selectedId ? "on" : ""}`}
              onClick={() => {setSelectedId(p.id);setSelectedSide(null);}}>
                  {p.name}
                </button>
              )}
            </div>
            <div className="forge-panel-list" style={{ marginTop: 8 }}>
              <button className={`forge-chip ${mode === "translate" ? "on" : ""}`}
              onClick={() => {setMode("translate");setSelectedSide(null);}}>↔ Двигать</button>
              <button className={`forge-chip ${mode === "resize" ? "on" : ""}`}
              onClick={() => setMode("resize")}>⇲ Размер</button>
              <button className={`forge-chip ${mode === "rotate" ? "on" : ""}`}
              onClick={() => {setMode("rotate");setSelectedSide(null);}}>⟳ Поворот</button>
              <button className={`forge-chip ${mode === "modifier" ? "on" : ""}`}
              onClick={() => {setMode("modifier");setSelectedSide(null);}}>⬡ Модификатор</button>
            </div>
            <div className="forge-note">
              «маленькая» — специально мелкая: именно на таких кубики граней и стрелки
              перемещения конфликтуют. Проверяйте жесты на ней.
            </div>
          </div>

          <div className="controls-section separator">
            <div className="controls-head"><span className="controls-title">События</span></div>
            <div className="harness-log">
              {log.length === 0 ? <div className="forge-note">— пока пусто —</div> :
              log.map((l, i) => <div className="harness-log-row" key={i}>{l}</div>)}
            </div>
          </div>
        </aside>
      </main>
    </div>);

}
