// The final "Предпросмотр" step — the emotional close. The user frames the clean
// real-time 3D (orbit/walk), taps "Сгенерировать рендер", and we capture the canvas
// and send it to kie.ai (Nano Banana image-to-image) to photorealize it. The result
// is shown against the 3D in a draggable before/after slider.
import { useCallback, useRef, useState } from "react";
import { useStore } from "../store";
import { VariantScene, type SceneApi } from "../three/VariantScene";
import { FLOOR_COVERINGS } from "../model/floors";
import { renderKitchen, hasRenderKey, type RenderStage } from "../model/render";
import { buildKitchenPrompt } from "../model/renderPrompt";

const STAGE_LABEL: Record<RenderStage, string> = {
  uploading: "Отправка кадра…",
  queued: "В очереди…",
  rendering: "Генерация фотореализма…",
};

// nearest kie.ai aspect_ratio for the captured canvas, so the render frames like the 3D
function pickAspect(w: number, h: number): string {
  const r = w / (h || 1);
  // ratios supported by GPT Image 2 at 2K (5:4 / 4:5 are not allowed at 2K/4K)
  const opts: [number, string][] = [[9 / 16, "9:16"], [1 / 2, "1:2"], [3 / 4, "3:4"], [2 / 3, "2:3"], [1, "1:1"], [3 / 2, "3:2"], [4 / 3, "4:3"], [16 / 9, "16:9"], [2 / 1, "2:1"]];
  return opts.reduce((best, o) => (Math.abs(o[0] - r) < Math.abs(best[0] - r) ? o : best))[1];
}

export function PreviewScreen() {
  const points = useStore((s) => s.roomPoints);
  const ceiling = useStore((s) => s.ceiling);
  const openings = useStore((s) => s.openings);
  const interiorWalls = useStore((s) => s.interiorWalls);
  const fittings = useStore((s) => s.fittings);
  const wallSurfaces = useStore((s) => s.wallSurfaces);
  const waterWall = useStore((s) => s.waterWall);
  const runLayout = useStore((s) => s.runLayout);
  const runStyle = useStore((s) => s.runStyle);
  const cabs = useStore((s) => s.cabs);
  const floorCovering = useStore((s) => s.floorCovering);
  const flash = useStore((s) => s.flash);
  const back = useStore((s) => s.back);
  const next = useStore((s) => s.next);
  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";

  const apiRef = useRef<SceneApi | null>(null);
  const onApi = useCallback((api: SceneApi | null) => { apiRef.current = api; }, []);
  const abortRef = useRef<AbortController | null>(null);

  const [stage, setStage] = useState<RenderStage | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ before: string; after: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pos, setPos] = useState(50); // before/after divider, %

  const generate = async () => {
    const before = apiRef.current?.captureDataUrl();
    if (!before) { flash("Не удалось снять кадр сцены"); return; }
    if (!hasRenderKey()) { setErr("Добавьте ключ kie.ai в .env.local (VITE_KIE_API_KEY)"); return; }
    const r = apiRef.current?.rect();
    const aspect = r ? pickAspect(r.width, r.height) : "3:4";
    // prompt assembled from the real design (materials / floor / appliances / windows)
    const prompt = buildKitchenPrompt({ cabs, style: runStyle, floorId: FLOOR_COVERINGS[floorCovering]?.id ?? "oak", openings, layout: runLayout });
    setErr(null);
    setResult(null);
    setProgress(0);
    setStage("uploading");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const after = await renderKitchen(before, { prompt, aspect, signal: ctrl.signal, onStage: setStage, onProgress: setProgress });
      setResult({ before, after });
      setPos(50);
    } catch (e) {
      if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : "Ошибка рендера");
    } finally {
      setStage(null);
      abortRef.current = null;
    }
  };
  const cancel = () => abortRef.current?.abort();
  const reset = () => { setResult(null); setErr(null); };

  // before/after divider drag
  const baRef = useRef<HTMLDivElement>(null);
  const onDrag = (clientX: number) => {
    const r = baRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  return (
    <div className="roomscene">
      <div className="stepbar cfg-bar">
        <div className="cfg-price preview-title">Фотореалистичный рендер</div>
        <div className="cfg-nav">
          <button className="cfg-back" onClick={back} type="button" aria-label="Назад">←</button>
          <button className="step-next" onClick={next} type="button">Дальше →</button>
        </div>
      </div>

      <div className="scene-area">
        {/* live 3D — used to frame the shot, and as the "before" half of the compare */}
        <VariantScene
          points={points}
          ceiling={ceiling}
          openings={openings}
          coveringColor={coveringColor}
          floorId={FLOOR_COVERINGS[floorCovering]?.id}
          interiorWalls={interiorWalls}
          fittings={fittings}
          wallSurfaces={wallSurfaces}
          waterWall={waterWall}
          layout={runLayout}
          style={runStyle}
          cabs={cabs}
          mode="real"
          nav
          onApi={onApi}
        />

        {/* result: draggable before/after comparison over the scene */}
        {result && (
          <div className="ba" ref={baRef}
            onPointerMove={(e) => e.buttons === 1 && onDrag(e.clientX)}
            onPointerDown={(e) => onDrag(e.clientX)}>
            <img className="ba-img" src={result.after} alt="Рендер" draggable={false} />
            <img className="ba-img" src={result.before} alt="3D" draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
            <div className="ba-divider" style={{ left: `${pos}%` }}><span className="ba-knob">‹ ›</span></div>
            <span className="ba-tag ba-tag-l">3D</span>
            <span className="ba-tag ba-tag-r">Рендер</span>
          </div>
        )}

        {/* loading overlay */}
        {stage && (
          <div className="render-overlay">
            <div className="render-spinner" />
            <div className="render-stage">{STAGE_LABEL[stage]}{stage === "rendering" && progress > 0 ? ` ${Math.round(progress)}%` : ""}</div>
            <div className="render-progress"><span style={{ width: `${stage === "rendering" ? Math.max(8, progress) : 4}%` }} /></div>
            <div className="render-hint">Обычно 15–40 секунд</div>
            <button className="render-cancel" onClick={cancel} type="button">Отменить</button>
          </div>
        )}

        {/* error toast-ish */}
        {err && !stage && (
          <div className="render-error">{err}</div>
        )}
      </div>

      {/* bottom controls */}
      <div className="render-bar">
        {result ? (
          <>
            <button className="render-secondary" onClick={reset} type="button">← К сцене</button>
            <button className="render-secondary" onClick={generate} type="button" disabled={!!stage}>↻ Заново</button>
            <a className="render-primary" href={result.after} target="_blank" rel="noreferrer" download>Скачать ↓</a>
          </>
        ) : (
          <button className="render-primary render-generate" onClick={generate} type="button" disabled={!!stage}>
            ✨ {stage ? "Генерация…" : "Сгенерировать рендер"}
          </button>
        )}
      </div>
    </div>
  );
}
