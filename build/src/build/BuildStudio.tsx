import { Stage3D } from "../three/Stage3D";

export function BuildStudio() {
  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="studio-brand">Mebelchi</span>
        <span className="studio-mode">Build</span>
      </header>
      <main className="studio-stage">
        <Stage3D />
      </main>
    </div>
  );
}
