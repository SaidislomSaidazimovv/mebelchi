import { useMemo } from "react";
import { readyBlock, solveBlockPanels } from "../engine/block";
import { solveCutList } from "../engine/cutlist";
import { Stage3D } from "../three/Stage3D";
import { CutList } from "./CutList";

export function BuildStudio() {
  const panels = useMemo(() => solveBlockPanels(readyBlock()), []);
  const pieces = useMemo(() => solveCutList(panels), [panels]);
  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="studio-brand">Mebelchi</span>
        <span className="studio-mode">Build</span>
      </header>
      <main className="studio-stage">
        <Stage3D panels={panels} />
        <CutList pieces={pieces} />
      </main>
    </div>
  );
}
