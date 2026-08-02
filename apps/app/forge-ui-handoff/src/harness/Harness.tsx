import { useMemo, useState } from "react";
import { Stage3D } from "../ui/Stage3D";
import type { Panel } from "../contract/types";
import { mm10ToMm } from "../contract/types";
import { snapBox, type SnapBox } from "./snap";

const ENVELOPE = { w_mm10: 6000, h_mm10: 7200, d_mm10: 5600 };
const NO_HOLES: never[] = [];
const LOCK_ALL = ["width", "height", "depth"] as const;
const SNAP_THRESHOLD = 120;
const toSnapBox = (p: {x: number;y: number;z: number;width: number;height: number;depth: number;}): SnapBox => (
  { x: p.x, y: p.y, z: p.z, w: p.width, h: p.height, d: p.depth });

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
  const [mode, setMode] = useState<"translate" | "resize" | "rotate" | "modifier" | "measure">("translate");
  const [panelOpen, setPanelOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [snapHint, setSnapHint] = useState<{box: {x: number;y: number;z: number;w: number;h: number;d: number;};axes: {x: boolean;y: boolean;z: boolean;};gap: number;contact: {x: number;y: number;z: number;};} | null>(null);

  const [rounds, setRounds] = useState<Record<string, Record<string, number>>>({});

  const [chamfers, setChamfers] = useState<Record<string, Record<string, {width: number;depth: number;}>>>({});

  const [notches, setNotches] = useState<Record<string, Record<string, {width: number;depth: number;radius: number;pos: number;lockL: boolean;lockR: boolean;}>>>({});

  const [windows, setWindows] = useState<Record<string, {w: number;h: number;radius: number;cx: number;cy: number;lockT: boolean;lockR: boolean;lockB: boolean;lockL: boolean;}[]>>({});

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 6));
  const selected = panels.find((p) => p.id === selectedId) ?? null;

  const handles = useMemo(() => {
    if (!selected) return [];
    const c = {
      x: selected.x + selected.width / 2,
      y: selected.y + selected.height / 2,
      z: selected.z + selected.depth / 2
    };
    const AX = { width: "x", height: "y", depth: "z" } as const;
    const faceAxes: ("width" | "height" | "depth")[] = selected.orientation ?
    [selected.orientation.xAxis, selected.orientation.yAxis] :
    (() => {
      const dims = [["width", selected.width], ["height", selected.height], ["depth", selected.depth]] as const;
      const thin = dims.reduce((a, b) => b[1] < a[1] ? b : a)[0];
      return (["width", "height", "depth"] as const).filter((d) => d !== thin);
    })();
    const out: {id: string;x: number;y: number;z: number;axis: "x" | "y" | "z";}[] = [];
    for (const fa of faceAxes) {
      const axis = AX[fa];
      const lo = { ...c };
      const hi = { ...c };
      if (fa === "width") {lo.x = selected.x;hi.x = selected.x + selected.width;} else
      if (fa === "height") {lo.y = selected.y;hi.y = selected.y + selected.height;} else
      {lo.z = selected.z;hi.z = selected.z + selected.depth;}
      out.push({ id: `${axis}Min`, x: lo.x, y: lo.y, z: lo.z, axis });
      out.push({ id: `${axis}Max`, x: hi.x, y: hi.y, z: hi.z, axis });
    }
    return out;
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
  const appliedWindows = useMemo(() => windows[selectedId ?? ""] ?? [], [windows, selectedId]);

  const panelCuts = useMemo(() => {
    const out: Record<string, {windows: {w: number;h: number;radius: number;cx: number;cy: number;}[];rounds: {cornerId: string;radius: number;}[];notches: {edgeId: string;width: number;depth: number;radius: number;pos: number;}[];chamfers: {edgeId: string;width: number;depth: number;}[];}> = {};
    for (const p of panels) {
      out[p.id] = {
        windows: windows[p.id] ?? [],
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

  const computeSnap = (id: string, x: number, y: number, z: number) => {
    const p = panels.find((pp) => pp.id === id);
    if (!p) return null;
    const dragged: SnapBox = { x, y, z, w: p.width, h: p.height, d: p.depth };
    const others = panels.filter((pp) => pp.id !== id).map(toSnapBox);
    if (!others.length) return null;
    const r = snapBox(dragged, others, SNAP_THRESHOLD);
    if (!r.snapped.x && !r.snapped.y && !r.snapped.z) return null;
    const gap = Math.round(Math.max(
      r.snapped.x ? Math.abs(r.x - x) : 0,
      r.snapped.y ? Math.abs(r.y - y) : 0,
      r.snapped.z ? Math.abs(r.z - z) : 0
    ));
    return {
      pos: { x: r.x, y: r.y, z: r.z },
      hint: {
        box: { x: r.x, y: r.y, z: r.z, w: p.width, h: p.height, d: p.depth },
        axes: r.snapped,
        gap,
        contact: { x: r.x + p.width / 2, y: r.y + p.height / 2, z: r.z + p.depth / 2 }
      }
    };
  };

  const resizeSide = (patch: {x: number;y: number;z: number;width?: number;height?: number;depth?: number;}) => {
    setPanels((ps) => ps.map((p) => {
      if (p.id !== selectedId) return p;
      const faceAxes: ("width" | "height" | "depth")[] = p.orientation ?
      [p.orientation.xAxis, p.orientation.yAxis] :
      (() => {
        const dims = [["width", p.width], ["height", p.height], ["depth", p.depth]] as const;
        const thin = dims.reduce((a, b) => b[1] < a[1] ? b : a)[0];
        return (["width", "height", "depth"] as const).filter((d) => d !== thin);
      })();
      const next = { ...p, x: patch.x, y: patch.y, z: patch.z };
      for (const fa of ["width", "height", "depth"] as const) {
        if (patch[fa] !== undefined && faceAxes.includes(fa)) next[fa] = Math.max(50, patch[fa] as number);
      }
      return next;
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
          onSelectPanel={(id) => {setSelectedId(id);setSelectedSide(null);setMode((m) => m === "resize" ? "translate" : m);say(`select ${id ?? "—"}`);}}
          onDragPanel={(id, x, y, z, rx, ry, rz) => {
            const s = rx || ry || rz ? null : computeSnap(id, x, y, z);
            const fx = s ? s.pos.x : x,fy = s ? s.pos.y : y,fz = s ? s.pos.z : z;
            setPanels((ps) => ps.map((p) => p.id === id ? { ...p, x: fx, y: fy, z: fz, rx, ry, rz } : p));
            setSnapHint(null);
            const rot = ([["rx", rx], ["ry", ry], ["rz", rz]] as const).
            filter(([, v]) => v).map(([k, v]) => `${k}=${Math.round((v as number) * 180 / Math.PI)}°`).join(" ");
            say(`drop ${id} → ${mm10ToMm(fx)},${mm10ToMm(fy)},${mm10ToMm(fz)}мм${s ? " 🧲" : ""}${rot ? " · " + rot : ""}`);
          }}
          onLiveDragPanel={(id, x, y, z) => {
            move(id, x, y, z);
            const s = mode === "rotate" ? null : computeSnap(id, x, y, z);
            setSnapHint(s ? s.hint : null);
          }}
          snapHint={snapHint}
          onUpdateDim={() => {}}
          transformMode={mode === "rotate" ? "rotate" : "translate"}
          showTargets={mode === "modifier"}
          showGizmo={mode === "translate" || mode === "rotate"}
          showMeasure={mode === "measure"}
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
          onApplyWindow={(idx, w, h, radius, cx, cy, lockT, lockR, lockB, lockL) => {
            const pid = selectedId ?? "";
            setWindows((prev) => {
              const arr = [...(prev[pid] ?? [])];
              if (w <= 0) {if (idx >= 0 && idx < arr.length) arr.splice(idx, 1);} else
              if (idx < 0 || idx >= arr.length) arr.push({ w, h, radius, cx, cy, lockT, lockR, lockB, lockL });else
              arr[idx] = { w, h, radius, cx, cy, lockT, lockR, lockB, lockL };
              const cur = { ...prev };
              if (arr.length) cur[pid] = arr;else delete cur[pid];
              return cur;
            });
            say(`window[${idx}] ${mm10ToMm(w)}×${mm10ToMm(h)} r=${mm10ToMm(radius)}мм${lockT || lockR || lockB || lockL ? " 🔒" : ""}`);
          }}
          appliedWindows={appliedWindows}
          panelCuts={panelCuts}
          envelope={ENVELOPE}
          lockedDims={LOCK_ALL}
          handles={mode === "resize" ? handles : []}
          showResizeGrips={mode === "translate" && !!selectedId}
          onEnterResize={() => setMode("resize")}
          selectedHandleId={selectedSide}
          onSelectHandle={(id) => {setSelectedSide(id);say(`side ${id ?? "—"}`);}}
          onDragHandle={(id, patch) => {
            resizeSide(patch);
            const v = patch.width ?? patch.height ?? patch.depth;
            say(`resize ${id}${v !== undefined ? ` → ${mm10ToMm(v)}мм` : ""}`);
          }} />

        <button className="panel-toggle" onClick={() => setPanelOpen((o) => !o)} title="Тест-панель">{panelOpen ? "✕" : "☰"}</button>
        <aside className={`controls-card${panelOpen ? " open" : ""}`}>
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
              <button className={`forge-chip ${mode === "translate" || mode === "resize" ? "on" : ""}`}
              onClick={() => {setMode("translate");setSelectedSide(null);}}>↔ Двигать</button>
              <button className={`forge-chip ${mode === "rotate" ? "on" : ""}`}
              onClick={() => {setMode("rotate");setSelectedSide(null);}}>⟳ Поворот</button>
              <button className={`forge-chip ${mode === "modifier" ? "on" : ""}`}
              onClick={() => {setMode("modifier");setSelectedSide(null);}}>⬡ Модификатор</button>
              <button className={`forge-chip ${mode === "measure" ? "on" : ""}`}
              onClick={() => {setMode("measure");setSelectedSide(null);}}>⇥ Измерить</button>
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
