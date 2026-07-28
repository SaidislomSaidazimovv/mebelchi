import { useState, useMemo } from "react";
import { solveBlockHoles, type Panel } from "../engine/block";
import { adaptPartsToCutPieces } from "../engine/cutlist";
import { mm10ToMm } from "../engine/units";
import { Stage3D } from "../three/Stage3D";
import { CutList } from "./CutList";
import { DesignProject } from "../engine/contracts/design";
import { ConstructionProfile } from "../engine/catalogs/profiles";
import { panelDecomposition } from "../engine/solver/panelDecomposition";
import { adaptPartsToPanels } from "../engine/layoutAdapter";

const defaultProfile: ConstructionProfile = {
  profileId: "DEFAULT",
  name: "Asosiy",
  material: { carcass_mm10: 160, back_mm10: 40, front_mm10: 180, worktop_mm10: 380, density_kg_m3: 700 },
  kromka: { slots: { K1: { thickness_mm10: 10 }, K2: { thickness_mm10: 4 } } },
  grain: "L",
  defaults: {
    bottomPlacement: "vkladnoe",
    topStyle: "stretchers",
    stretcherWidth_mm10: 800,
    back: { treatment: "groove", grooveWidth_mm10: 40, grooveDepth_mm10: 60, grooveSetback_mm10: 200 },
    backZone_mm10: 300,
    shelfSetback_mm10: 200,
    plinth: { style: "box", height_mm10: 1000, placement: "under", role: "structural" },
    worktop: { sideOverhang_mm10: 0, frontOverhang_mm10: 200 },
    kromkaByRole: {
      side: { front: "K1", back: "K2", left: null, right: null, top: null, bottom: null },
      bottom: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      top: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      stretcher: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      shelf: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      back: { front: null, back: null, left: null, right: null, top: null, bottom: null },
      worktop: { front: "K1", back: null, left: "K1", right: "K1", top: null, bottom: null },
      door: { front: "K1", back: "K1", left: "K1", right: "K1", top: null, bottom: null },
      divider: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      plinth: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
      filler: { front: "K1", back: null, left: null, right: null, top: null, bottom: null },
    },
    merge: { allowed: true, strategy: "shared_divider", limits: { maxSheetLength_mm10: 27500, maxSheetWidth_mm10: 18300, maxWeightKg: 150 } },
    grainPolicy: { mode: "lock_all", hiddenRoles: [] }
  },
  byType: {}
};

const defaultProject: DesignProject = {
  projectId: "PROJ_1",
  name: "Yangi Loyiha",
  slotBindings: { fasad: "MDF", korpus: "LDSP", orqa: "HDF" },
  overrides: [],
  nodes: [
    {
      nodeId: "CAB_1",
      kind: "cabinet",
      cabinetType: "kitchen_base",
      size: { w_mm10: 6000, h_mm10: 7200, d_mm10: 5600 },
      hasWorktop: false,
      children: []
    }
  ]
};

export function BuildStudio() {
  const [project, setProject] = useState<DesignProject>(defaultProject);
  const [profile, setProfile] = useState<ConstructionProfile>(defaultProfile);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");

  const engineResult = useMemo(() => panelDecomposition(project, profile), [project, profile]);

  // 2-BOSQICH: Dvigatelning fizik qismlarini 3D kordinatalarga aylantirish (Layout Adapter)
  const blocks: Panel[] = useMemo(() => {
    return adaptPartsToPanels(engineResult.parts, project, profile);
  }, [engineResult, project, profile]);

  const holes = useMemo(() => solveBlockHoles(blocks), [blocks]);
  
  // 3-BOSQICH: Kesim ro'yxati (CutList) adapterini ulash
  const pieces = useMemo(() => adaptPartsToCutPieces(engineResult.parts), [engineResult]);

  const selectedPanel = useMemo(() => {
    return blocks.find((b) => b.id === selectedPanelId) || null;
  }, [blocks, selectedPanelId]);

  const handleDragPanel = () => {
    // 1-bosqichda panellarni qolda surish ishlamaydi, chunki ular avtomatik hisoblanadi.
  };

  const handleAddBlock = () => {
    setProject(prev => {
      const newNode = {
        nodeId: "CAB_" + (prev.nodes.length + 1),
        kind: "cabinet" as const,
        cabinetType: "kitchen_base" as const,
        size: { w_mm10: 6000, h_mm10: 7200, d_mm10: 5600 },
        hasWorktop: false,
        children: []
      };
      return { ...prev, nodes: [...prev.nodes, newNode] };
    });
  };

  const handleUpdateDim = (dim: "width" | "height" | "depth", val: number) => {
    // Asosiy qutining (DesignNode) o'lchamini o'zgartiramiz, detalning emas!
    // Kichik raqam yozib yuborilsa engine minusga kirib ketmasligi uchun minimal 100mm (1000) cheklov qoyamiz.
    const safeVal = Math.max(val, 100);
    
    setProject(prev => {
      const p = { ...prev };
      p.nodes = p.nodes.map((n, i) => {
        // Hozircha faqat 1-shkafni (CAB_1) o'zgartiramiz demo rejim uchun
        if (i === 0 && n.kind === "cabinet") {
          return {
            ...n,
            size: {
               ...n.size,
               w_mm10: dim === "width" ? safeVal * 10 : n.size.w_mm10,
               h_mm10: dim === "height" ? safeVal * 10 : n.size.h_mm10,
               d_mm10: dim === "depth" ? safeVal * 10 : n.size.d_mm10
            }
          };
        }
        return n;
      });
      return p;
    });
  };

  const handleAddShelf = () => {
    setProject(prev => {
      const p = { ...prev };
      p.nodes = p.nodes.map(n => {
        if (n.kind === "cabinet") {
          const shelfCount = n.children?.filter(c => c.kind === "shelf").length || 0;
          return {
            ...n,
            children: [...(n.children || []), { nodeId: `shelf_${shelfCount + Date.now()}`, kind: "shelf" }]
          };
        }
        return n;
      });
      return p;
    });
  };

  const handleAddDivider = () => {
    setProject(prev => {
      const p = { ...prev };
      p.nodes = p.nodes.map(n => {
        if (n.kind === "cabinet") {
          const divCount = n.children?.filter(c => c.kind === "divider").length || 0;
          return {
            ...n,
            children: [...(n.children || []), { nodeId: `divider_${divCount + Date.now()}`, kind: "divider" }]
          };
        }
        return n;
      });
      return p;
    });
  };

  const handleDeleteChild = (nodeId: string) => {
    setProject(prev => {
      const p = { ...prev };
      p.nodes = p.nodes.map(n => {
        if (n.kind === "cabinet" && n.children) {
          return {
            ...n,
            children: n.children.filter(c => c.nodeId !== nodeId)
          };
        }
        return n;
      });
      return p;
    });
  };

  const handleOverride = (field: "topStyle" | "bottomPlacement", value: string) => {
    setProject(prev => {
      const p = { ...prev };
      const filtered = p.overrides.filter(o => !(o.nodeId === "CAB_1" && o.field === field));
      if (value !== "auto") {
        filtered.push({ nodeId: "CAB_1", field, value });
      }
      p.overrides = filtered;
      return p;
    });
  };

  const currentTopStyle = project.overrides.find(o => o.nodeId === "CAB_1" && o.field === "topStyle")?.value || "auto";
  const currentBottomPlacement = project.overrides.find(o => o.nodeId === "CAB_1" && o.field === "bottomPlacement")?.value || "auto";

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
          {/* BO'LIM 1: Asosiy Shkaf O'lchamlari */}
          <div className="controls-section">
            <div className="controls-head">
              <span className="controls-title">1. Asosiy Shkaf (CAB_1)</span>
            </div>
            <div className="panel-edit-area">
              <div className="panel-edit-row">
                <span className="row-title">Gabarit O'lchamlar (mm):</span>
                <div className="dim-pos-grid">
                  <div className="grid-field">
                    <span>Eni (W)</span>
                    <input
                      type="number"
                      value={Math.round(mm10ToMm(project.nodes[0].kind === "cabinet" ? project.nodes[0].size?.w_mm10 ?? 0 : 0))}
                      onChange={(e) => handleUpdateDim("width", Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="grid-field">
                    <span>Balandlik (H)</span>
                    <input
                      type="number"
                      value={Math.round(mm10ToMm(project.nodes[0].kind === "cabinet" ? project.nodes[0].size?.h_mm10 ?? 0 : 0))}
                      onChange={(e) => handleUpdateDim("height", Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="grid-field">
                    <span>Chuqurlik (D)</span>
                    <input
                      type="number"
                      value={Math.round(mm10ToMm(project.nodes[0].kind === "cabinet" ? project.nodes[0].size?.d_mm10 ?? 0 : 0))}
                      onChange={(e) => handleUpdateDim("depth", Number(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BO'LIM 2: Ichki Dizayn (Components) */}
          <div className="controls-section separator">
            <div className="controls-head">
              <span className="controls-title">2. Ichki Dizayn</span>
            </div>
            <div className="panel-edit-area">
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button onClick={handleAddShelf} className="add-block-btn" style={{ flex: 1, padding: "6px" }}>
                  + Polka
                </button>
                <button onClick={handleAddDivider} className="add-block-btn" style={{ flex: 1, padding: "6px" }}>
                  + Bo'lgich
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {project.nodes[0].children?.map(c => (
                  <div key={c.nodeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f6f8", padding: "6px 10px", borderRadius: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 500 }}>
                      {c.kind === "shelf" ? "Polka" : c.kind === "divider" ? "Bo'lgich (Stoyka)" : c.kind}
                    </span>
                    <button onClick={() => handleDeleteChild(c.nodeId)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}>
                      ✕
                    </button>
                  </div>
                ))}
                {(!project.nodes[0].children || project.nodes[0].children.length === 0) && (
                  <div style={{ fontSize: "12px", color: "#888", textAlign: "center", padding: "10px" }}>Ichki qismlar yo'q</div>
                )}
              </div>
            </div>
          </div>

          {/* BO'LIM 3: Ustaxona Qoidalari (Overrides) */}
          <div className="controls-section separator">
            <div className="controls-head">
              <span className="controls-title">3. Ustaxona Qoidalari (Overrides)</span>
            </div>
            <div className="panel-edit-area">
              <div className="panel-edit-row">
                <span className="row-title">Tepa qismi (topStyle):</span>
                <select
                  value={currentTopStyle}
                  onChange={(e) => handleOverride("topStyle", e.target.value)}
                  className="thickness-select"
                >
                  <option value="auto">Avtomatik (Profil)</option>
                  <option value="full">To'liq krushka (full)</option>
                  <option value="stretchers">2 ta Tsarga (stretchers)</option>
                </select>
              </div>
              <div className="panel-edit-row">
                <span className="row-title">Tag qismi (bottomPlacement):</span>
                <select
                  value={currentBottomPlacement}
                  onChange={(e) => handleOverride("bottomPlacement", e.target.value)}
                  className="thickness-select"
                >
                  <option value="auto">Avtomatik (Profil)</option>
                  <option value="vkladnoe">Devorlar orasida (vkladnoe)</option>
                  <option value="nakladnoe">Devorlar tagida (nakladnoe)</option>
                </select>
              </div>
            </div>
          </div>
        </aside>
        
        <CutList pieces={pieces} />
      </main>
    </div>
  );
}
