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
import { CabinetEditor } from "./components/CabinetEditor";
import { NodeTreeEditor } from "./components/NodeTreeEditor";
import { OverrideEditor } from "./components/OverrideEditor";
import { ProfileSelector } from "./components/ProfileSelector";
import { AssemblyController } from "./components/AssemblyController";
import { QORASU_PROFILE, EMAN_PROFILE } from "../engine/catalogs/profiles";

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
      hasWorktop: true,
      children: []
    }
  ]
};

export function BuildStudio() {
  const [project, setProject] = useState<DesignProject>(defaultProject);
  const [profile, setProfile] = useState<ConstructionProfile>(QORASU_PROFILE);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [buildStep, setBuildStep] = useState<number>(0);
  const maxSteps = 6;

  const engineResult = useMemo(() => panelDecomposition(project, profile), [project, profile]);

  // 2-BOSQICH: Dvigatelning fizik qismlarini 3D kordinatalarga aylantirish (Layout Adapter)
  const blocks: Panel[] = useMemo(() => {
    return adaptPartsToPanels(engineResult.parts, project, profile);
  }, [engineResult, project, profile]);

  const holes = useMemo(() => solveBlockHoles(blocks), [blocks]);
  
  // 3-BOSQICH: Kesim ro'yxati (CutList) adapterini ulash
  const pieces = useMemo(() => adaptPartsToCutPieces(engineResult.parts), [engineResult]);

  const visibleBlocks = useMemo(() => {
    return blocks.filter(b => {
      if (buildStep >= 6) return true; // hammasi
      if (buildStep === 0) return false;
      
      if (buildStep === 1) return b.role === "bottom";
      if (buildStep === 2) return b.role === "bottom" || b.id.includes("side_l");
      if (buildStep === 3) return b.role === "bottom" || b.role === "side";
      if (buildStep === 4) return b.role === "bottom" || b.role === "side" || b.role === "back";
      if (buildStep === 5) return ["bottom", "side", "back", "top", "stretcher"].includes(b.role);
      
      return false;
    });
  }, [blocks, buildStep]);

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
        hasWorktop: true,
        children: []
      };
      return { ...prev, nodes: [...prev.nodes, newNode] };
    });
  };

  const handleUpdateNode = (updatedNode: any) => {
    setProject(prev => {
      const p = { ...prev };
      p.nodes = p.nodes.map(n => n.nodeId === updatedNode.nodeId ? updatedNode : n);
      return p;
    });
  };

  const handleUpdateOverrides = (newOverrides: any[]) => {
    setProject(prev => ({ ...prev, overrides: newOverrides }));
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
          panels={visibleBlocks}
          holes={[]}
          selectedPanelId={selectedPanelId}
          onSelectPanel={setSelectedPanelId}
          onDragPanel={handleDragPanel}
          onUpdateDim={() => {}}
          transformMode={transformMode}
        />
        <aside className="controls-card">
          <AssemblyController 
            step={buildStep}
            maxSteps={maxSteps}
            onNext={() => setBuildStep(s => Math.min(s + 1, maxSteps))}
            onReset={() => setBuildStep(0)}
          />
          {buildStep === maxSteps && (
            <>
              <CabinetEditor 
                node={project.nodes[0]} 
                onUpdate={handleUpdateNode} 
              />
              <NodeTreeEditor 
                node={project.nodes[0]} 
                onUpdate={handleUpdateNode} 
              />
              {/* <OverrideEditor 
                nodeId={project.nodes[0].nodeId}
                overrides={project.overrides}
                onUpdate={handleUpdateOverrides}
              /> */}
              {/* <ProfileSelector 
                profile={profile}
                onChange={setProfile}
              /> */}
            </>
          )}
        </aside>
      </main>
      {/* Faqat 3D da ko'rinib turgan detallarni CutList ga uzatamiz */}
      {buildStep === maxSteps && (
        <CutList pieces={pieces.filter(p => visibleBlocks.some(vb => vb.id === p.id))} />
      )}
    </div>
  );
}
