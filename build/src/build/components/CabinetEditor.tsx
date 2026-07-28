import React from 'react';
import type { DesignNode } from '../../engine/contracts/design';
import { mm10ToMm, mm } from '../../engine/units';

interface CabinetEditorProps {
  node: DesignNode;
  onUpdate: (node: DesignNode) => void;
}

export function CabinetEditor({ node, onUpdate }: CabinetEditorProps) {
  if (node.kind !== "cabinet") return null;

  const handleUpdateDim = (axis: "width" | "height" | "depth", value: number) => {
    const updated = { ...node, size: { ...node.size } };
    if (axis === "width") updated.size.w_mm10 = mm(value);
    if (axis === "height") updated.size.h_mm10 = mm(value);
    if (axis === "depth") updated.size.d_mm10 = mm(value);
    onUpdate(updated);
  };

  return (
    <div className="controls-section">
      <div className="controls-head">
        <span className="controls-title">1. Asosiy Shkaf ({node.nodeId})</span>
      </div>
      <div className="panel-edit-area">
        <div className="panel-edit-row">
          <span className="row-title">Gabarit O'lchamlar (mm):</span>
          <div className="dim-pos-grid">
            <div className="grid-field">
              <span>Eni (W)</span>
              <input
                type="number"
                value={Math.round(mm10ToMm(node.size?.w_mm10 ?? 0))}
                onChange={(e) => handleUpdateDim("width", Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid-field">
              <span>Balandlik (H)</span>
              <input
                type="number"
                value={Math.round(mm10ToMm(node.size?.h_mm10 ?? 0))}
                onChange={(e) => handleUpdateDim("height", Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid-field">
              <span>Chuqurlik (D)</span>
              <input
                type="number"
                value={Math.round(mm10ToMm(node.size?.d_mm10 ?? 0))}
                onChange={(e) => handleUpdateDim("depth", Number(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
