import React from 'react';
import type { DesignNode } from '../../engine/contracts/design';

interface NodeTreeEditorProps {
  node: DesignNode;
  onUpdate: (node: DesignNode) => void;
}

export function NodeTreeEditor({ node, onUpdate }: NodeTreeEditorProps) {
  const handleAddShelf = () => {
    const updated = { ...node, children: [...(node.children || [])] };
    const id = "shelf_" + (updated.children.length + 1) + "_" + Math.floor(Math.random() * 1000);
    updated.children.push({ nodeId: id, kind: "shelf" });
    onUpdate(updated);
  };

  const handleAddDivider = () => {
    const updated = { ...node, children: [...(node.children || [])] };
    const id = "divider_" + (updated.children.length + 1) + "_" + Math.floor(Math.random() * 1000);
    updated.children.push({ nodeId: id, kind: "divider" });
    onUpdate(updated);
  };

  const handleDeleteChild = (id: string) => {
    const updated = { ...node, children: node.children?.filter(c => c.nodeId !== id) || [] };
    onUpdate(updated);
  };

  return (
    <div className="controls-section separator">
      <div className="controls-head">
        <span className="controls-title">2. Ichki Dizayn (Bolalar)</span>
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
          {node.children?.map(c => (
            <div key={c.nodeId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f6f8", padding: "6px 10px", borderRadius: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: 500 }}>
                {c.kind === "shelf" ? "Polka" : c.kind === "divider" ? "Bo'lgich (Stoyka)" : c.kind}
              </span>
              <button onClick={() => handleDeleteChild(c.nodeId)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: "bold" }}>
                ✕
              </button>
            </div>
          ))}
          {(!node.children || node.children.length === 0) && (
            <div style={{ fontSize: "12px", color: "#888", textAlign: "center", padding: "10px" }}>Ichki qismlar yo'q</div>
          )}
        </div>
      </div>
    </div>
  );
}
