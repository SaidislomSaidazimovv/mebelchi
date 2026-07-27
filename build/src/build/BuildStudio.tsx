import { useState, useMemo } from "react";
import { readyCabinetPanels, solveBlockHoles, type Panel } from "../engine/block";
import { solveCutList } from "../engine/cutlist";
import { mm10ToMm } from "../engine/units";
import { Stage3D } from "../three/Stage3D";

export function BuildStudio() {
  const [blocks, setBlocks] = useState<Panel[]>(() => readyCabinetPanels());
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");

  const holes = useMemo(() => solveBlockHoles(blocks), [blocks]);
  const pieces = useMemo(() => solveCutList(blocks), [blocks]);

  const selectedPanel = useMemo(() => {
    return blocks.find((b) => b.id === selectedPanelId) || null;
  }, [blocks, selectedPanelId]);

  const handleDragPanel = (id: string, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => {
    setBlocks((prev) => prev.map((p) => (p.id === id ? { ...p, x, y, z, rx, ry, rz } : p)));
  };

  const handleAddBlock = () => {
    const id = "block_" + Date.now();
    const newPanel: Panel = {
      id,
      name: `Blok ${blocks.length + 1}`,
      role: "shelf",
      x: 1000,
      y: 1000,
      z: 1000,
      width: 160,
      height: 6000,
      depth: 5600,
      material: "ldsp",
      bands: [10, 0, 0, 0],
    };
    setBlocks((prev) => [...prev, newPanel]);
    setSelectedPanelId(id);
  };

  const handleUpdateDim = (dim: "width" | "height" | "depth", val: number) => {
    setBlocks((prev) =>
      prev.map((p) => (p.id === selectedPanelId ? { ...p, [dim]: val * 10 } : p)),
    );
  };

  const handleUpdatePos = (pos: "x" | "y" | "z", val: number) => {
    setBlocks((prev) =>
      prev.map((p) => (p.id === selectedPanelId ? { ...p, [pos]: val * 10 } : p)),
    );
  };

  const handleBandToggle = (idx: number, checked: boolean) => {
    if (!selectedPanel) return;
    const currentBands = selectedPanel.bands ?? [10, 0, 0, 0];
    const next = [...currentBands] as [number, number, number, number];
    next[idx] = checked ? 10 : 0;
    setBlocks((prev) =>
      prev.map((p) => (p.id === selectedPanelId ? { ...p, bands: next } : p)),
    );
  };

  const handleDeleteBlock = () => {
    if (!selectedPanelId) return;
    setBlocks((prev) => prev.filter((p) => p.id !== selectedPanelId));
    setSelectedPanelId(null);
  };

  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="studio-brand">Mebelchi</span>
        <span className="studio-mode">Build</span>
        <button onClick={handleAddBlock} className="add-block-btn">
          + Yangi Blok Qo'shish
        </button>
      </header>
      <main className="studio-stage">
        <Stage3D
          panels={blocks}
          holes={[]}
          selectedPanelId={selectedPanelId}
          onSelectPanel={setSelectedPanelId}
          onDragPanel={handleDragPanel}
          onUpdateDim={handleUpdateDim}
          transformMode={transformMode}
        />
        <aside className="controls-card">
          <div className="controls-section">
            <div className="controls-head">
              <span className="controls-title">Tanlash</span>
            </div>
            <div className="control-group">
              <select
                value={selectedPanelId ?? ""}
                onChange={(e) => setSelectedPanelId(e.target.value || null)}
                className="panel-select"
              >
                <option value="">-- Blok tanlang (yoki 3D modelni bosing) --</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.role === "side" ? "Yon" : b.role === "top" ? "Tepa" : b.role === "bottom" ? "Tag" : b.role === "back" ? "Orqa" : b.role === "shelf" ? "Polka" : "Boshqa"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedPanel && (
            <div className="controls-section separator">
              <div className="controls-head">
                <span className="controls-title">Blok Tahriri</span>
              </div>
              <div className="panel-edit-area">
                <div className="panel-edit-row">
                  <span className="row-title">Asbob Rejimi:</span>
                  <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                    <button
                      type="button"
                      onClick={() => setTransformMode("translate")}
                      className={`mode-btn ${transformMode === "translate" ? "active" : ""}`}
                      style={{
                        flex: 1,
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        backgroundColor: transformMode === "translate" ? "#3b82f6" : "#fff",
                        color: transformMode === "translate" ? "#fff" : "#333",
                        fontWeight: "bold",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      Ko'chirish
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransformMode("rotate")}
                      className={`mode-btn ${transformMode === "rotate" ? "active" : ""}`}
                      style={{
                        flex: 1,
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #ddd",
                        backgroundColor: transformMode === "rotate" ? "#3b82f6" : "#fff",
                        color: transformMode === "rotate" ? "#fff" : "#333",
                        fontWeight: "bold",
                        cursor: "pointer",
                        transition: "all 0.2s"
                      }}
                    >
                      Aylantirish
                    </button>
                  </div>
                </div>

                <div className="panel-edit-row">
                  <span className="row-title">Nomi:</span>
                  <input
                    type="text"
                    value={selectedPanel.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBlocks((prev) =>
                        prev.map((p) => (p.id === selectedPanelId ? { ...p, name: val } : p)),
                      );
                    }}
                    className="panel-name-input"
                  />
                </div>

                <div className="panel-edit-row">
                  <span className="row-title">Roli (Turi):</span>
                  <select
                    value={selectedPanel.role}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setBlocks((prev) =>
                        prev.map((p) => (p.id === selectedPanelId ? { ...p, role: val } : p)),
                      );
                    }}
                    className="thickness-select"
                  >
                    <option value="side">Yon devor</option>
                    <option value="top">Tepa panel</option>
                    <option value="bottom">Tag panel</option>
                    <option value="back">Orqa panel</option>
                    <option value="shelf">Polka</option>
                    <option value="other">Boshqa</option>
                  </select>
                </div>

                <div className="panel-edit-row">
                  <span className="row-title">O'lchamlari (mm):</span>
                  <div className="dim-pos-grid">
                    <div className="grid-field">
                      <span>Eni</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.width))}
                        onChange={(e) => handleUpdateDim("width", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="grid-field">
                      <span>Balandlik</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.height))}
                        onChange={(e) => handleUpdateDim("height", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="grid-field">
                      <span>Chuqurlik</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.depth))}
                        onChange={(e) => handleUpdateDim("depth", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <div className="panel-edit-row">
                  <span className="row-title">Koordinatalari (X, Y, Z mm):</span>
                  <div className="dim-pos-grid">
                    <div className="grid-field">
                      <span>X</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.x))}
                        onChange={(e) => handleUpdatePos("x", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="grid-field">
                      <span>Y</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.y))}
                        onChange={(e) => handleUpdatePos("y", Number(e.target.value) || 0)}
                      />
                    </div>
                    <div className="grid-field">
                      <span>Z</span>
                      <input
                        type="number"
                        value={Math.round(mm10ToMm(selectedPanel.z))}
                        onChange={(e) => handleUpdatePos("z", Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>

                <button onClick={handleDeleteBlock} className="delete-block-btn">
                  Blokni O'chirish
                </button>
              </div>
            </div>
          )}

          {/* <div className="holes-summary">
            <div className="holes-summary-title">Birikmalar (Teshiklar)</div>
            <div className="holes-summary-item">
              <span>Konfirmat teshigi (Ø8 mm):</span>
              <span>{holes.filter((h) => h.id.includes("conf") || h.id.includes("_c")).length} ta</span>
            </div>
            <div className="holes-summary-item">
              <span>Shkant teshigi (Ø8 mm):</span>
              <span>{holes.filter((h) => h.id.includes("_d")).length} ta</span>
            </div>
            <div className="holes-summary-note">Teshiklar 3D modelda ko'rsatilgan</div>
          </div> */}
        </aside>
      </main>
    </div>
  );
}
