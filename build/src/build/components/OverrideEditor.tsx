import React from 'react';
import type { ConstructionOverride } from '../../engine/contracts/design';

interface OverrideEditorProps {
  nodeId: string;
  overrides: ConstructionOverride[];
  onUpdate: (overrides: ConstructionOverride[]) => void;
}

export function OverrideEditor({ nodeId, overrides, onUpdate }: OverrideEditorProps) {
  const currentTopStyle = overrides.find(o => o.nodeId === nodeId && o.field === "topStyle")?.value || "auto";
  const currentBottomPlacement = overrides.find(o => o.nodeId === nodeId && o.field === "bottomPlacement")?.value || "auto";

  const handleOverride = (field: "topStyle" | "bottomPlacement", value: string) => {
    let newOverrides = [...overrides];
    const idx = newOverrides.findIndex(o => o.nodeId === nodeId && o.field === field);
    
    if (value === "auto") {
      if (idx > -1) newOverrides.splice(idx, 1);
    } else {
      if (idx > -1) {
        newOverrides[idx].value = value;
      } else {
        newOverrides.push({ nodeId, field, value });
      }
    }
    onUpdate(newOverrides);
  };

  return (
    <div className="controls-section separator">
      <div className="controls-head">
        <span className="controls-title">3. Ustaxona Qoidalari (Overrides)</span>
      </div>
      <div className="panel-edit-area">
        <div className="panel-edit-row">
          <span className="row-title">Tepa qismi (topStyle):</span>
          <select
            value={currentTopStyle as string}
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
            value={currentBottomPlacement as string}
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
  );
}
