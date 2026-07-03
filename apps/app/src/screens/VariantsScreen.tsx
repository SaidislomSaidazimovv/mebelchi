// Phase B — "Выберите вариант". On entering the screen we generate four realistic kitchen
// layouts straight away (no intro/CTA screen — that was friction): a short loading screen
// while the solver runs, then one big 3D preview + a 1·2·3·4 stepper to flip between the
// four layouts. "↻ Заново" regenerates. The footer's "Открыть в конструкторе" commits it.

import { useEffect, useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { priceCabs } from "../model/toProject";
import { useMoney } from "../useMoney";
import { VariantScene } from "../three/VariantScene";
import { FLOOR_COVERINGS } from "../model/floors";

export function VariantsScreen() {
  const t = useT();
  const money = useMoney();
  const genVariants = useStore((s) => s.genVariants);
  const variant = useStore((s) => s.variant);
  const points = useStore((s) => s.roomPoints);
  const ceiling = useStore((s) => s.ceiling);
  const openings = useStore((s) => s.openings);
  const interiorWalls = useStore((s) => s.interiorWalls);
  const fittings = useStore((s) => s.fittings);
  const wallSurfaces = useStore((s) => s.wallSurfaces);
  const floorCovering = useStore((s) => s.floorCovering);
  const waterWall = useStore((s) => s.waterWall);
  const generateVariants = useStore((s) => s.generateVariants);
  const selectVariant = useStore((s) => s.selectVariant);
  const requestWater = useStore((s) => s.requestWater);

  const [loading, setLoading] = useState(false);
  // ask about water ONCE on entry if none was placed (non-blocking — you can continue)
  const [warn, setWarn] = useState(() => genVariants.length === 0 && waterWall == null);

  const coveringColor = FLOOR_COVERINGS[floorCovering]?.color ?? "#ecd9b4";
  const floorId = FLOOR_COVERINGS[floorCovering]?.id;

  const run = () => {
    setLoading(true);
    window.setTimeout(() => {
      generateVariants();
      setLoading(false);
    }, 900);
  };

  // on entry: auto-generate if water is set; otherwise the water prompt (above) handles it
  useEffect(() => {
    if (genVariants.length === 0 && waterWall != null) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || genVariants.length === 0) {
    return (
      <section className="screen var-screen">
        {warn ? (
          <WaterWarn onAdd={requestWater} onContinue={() => { setWarn(false); run(); }} />
        ) : (
          <div className="loader-wrap">
            <div className="spinner" />
            <div className="loader-title">{t.variants.loadingTitle}</div>
            <div className="loader-sub">{t.variants.loadingSub}</div>
          </div>
        )}
      </section>
    );
  }

  const cur = genVariants[variant] ?? genVariants[0];

  return (
    <section className="var-screen-3d">
      <div className="var-bar">
        <div className="var-bar-head">
          <span className="var-name">{cur.name}</span>
          <span className="var-price">{money(priceCabs(cur.cabs))}</span>
        </div>
        <button className="gen-btn" onClick={run} type="button">
          {t.variants.again}
        </button>
      </div>

      <div className="var-stage">
        <VariantScene
          points={points}
          ceiling={ceiling}
          openings={openings}
          coveringColor={coveringColor}
          floorId={floorId}
          interiorWalls={interiorWalls}
          fittings={fittings}
          wallSurfaces={wallSurfaces}
          waterWall={waterWall}
          layout={cur.layout}
          style={cur.style}
          cabs={cur.cabs}
        />
        <span className="var-hint">{t.variants.rotate}</span>
      </div>

      <div className="var-blurb">{cur.blurb}</div>

      <div className="var-steps">
        {genVariants.map((v, i) => (
          <button
            key={v.id}
            className={`var-step${i === variant ? " on" : ""}`}
            onClick={() => selectVariant(i)}
            type="button"
            aria-label={v.name}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </section>
  );
}

// no water supply placed → offer to add it (opens the room's water picker) or continue.
// Non-blocking: "Не важно" generates anyway (the sink defaults to a sensible wall).
function WaterWarn({ onAdd, onContinue }: { onAdd: () => void; onContinue: () => void }) {
  const t = useT();
  return (
    <div className="confirm-overlay">
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">{t.variants.waterTitle}</div>
        <div className="confirm-body">{t.variants.waterBody}</div>
        <div className="confirm-actions">
          <button className="btn btn-back" onClick={onContinue} type="button">{t.variants.waterSkip}</button>
          <button className="btn btn-next" onClick={onAdd} type="button">{t.variants.waterAdd}</button>
        </div>
      </div>
    </div>
  );
}
