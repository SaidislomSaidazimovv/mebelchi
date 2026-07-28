import React from 'react';

interface AssemblyControllerProps {
  step: number;
  maxSteps: number;
  onNext: () => void;
  onReset: () => void;
}

export function AssemblyController({ step, maxSteps, onNext, onReset }: AssemblyControllerProps) {
  const getStepName = (s: number) => {
    switch(s) {
      case 0: return "Bo'sh karkas";
      case 1: return "Tag qismi (Bottom)";
      case 2: return "Chap devor (Left Side)";
      case 3: return "O'ng devor (Right Side)";
      case 4: return "Orqa devor (Back)";
      case 5: return "Tepa qismi (Top)";
      case 6: return "Ichki jihozlar (Polka/Stoyka)";
      default: return "To'liq Yig'ilgan";
    }
  };

  return (
    <div className="controls-section separator" style={{ background: "#" }}>
      <div className="controls-head">
        <span className="controls-title" style={{ color: "#" }}>Karkas Yig'ish</span>
      </div>
      <div className="panel-edit-area">
        <div style={{ marginBottom: "10px", fontSize: "14px", fontWeight: "bold", color: "#1e40af" }}>
          Qadam: {step} / {maxSteps} - {getStepName(step)}
        </div>
        
        <div style={{ display: "flex", gap: "8px" }}>
          {step < maxSteps ? (
            <button 
              onClick={onNext} 
              className="add-block-btn" 
              style={{ flex: 2, background: "#3b82f6", color: "white", padding: "8px", fontWeight: "bold" }}
            >
              + Qismni Qo'shish
            </button>
          ) : (
            <button 
              onClick={onReset} 
              className="add-block-btn" 
              style={{ flex: 2, background: "#10b981", color: "white", padding: "8px", fontWeight: "bold" }}
            >
              Tayyor! 0 dan boshlash
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
