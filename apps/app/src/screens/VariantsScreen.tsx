// Phase B — "Выберите вариант". Generate four realistic kitchen layouts from the
// room the user designed, each priced, previewed in 3D like IKEA's planner:
//   1. tap "Сгенерировать раскладки"
//   2. WATER GATE — if no water supply was placed, warn first (the sink needs it);
//      skip the warning when it's already set
//   3. a short loading screen while the solver runs
//   4. one big 3D preview + a 1·2·3·4 stepper to flip between the four layouts
// The footer's "Открыть в конструкторе" commits the selected layout to the run.

import { useState } from "react";
import { useStore } from "../store";
import { priceCabs } from "../model/toProject";
import { fmtSum } from "../model/format";
import { VariantScene } from "../three/VariantScene";

export function VariantsScreen() {
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
  const goTo = useStore((s) => s.goTo);

  const [loading, setLoading] = useState(false);
  const [warn, setWarn] = useState(false);

  const coveringColor = FLOOR_COLORS[floorCovering] ?? "#ecd9b4";

  const run = () => {
    setLoading(true);
    window.setTimeout(() => {
      generateVariants();
      setLoading(false);
    }, 900);
  };

  const onGenerate = () => {
    if (waterWall == null) {
      setWarn(true); // water gate — must place a supply before we can site the sink
      return;
    }
    run();
  };

  if (loading) {
    return (
      <section className="screen var-screen">
        <div className="loader-wrap">
          <div className="spinner" />
          <div className="loader-title">Генерируем раскладки…</div>
          <div className="loader-sub">Подбираем модули под вашу комнату и водоснабжение</div>
        </div>
      </section>
    );
  }

  if (genVariants.length === 0) {
    return (
      <section className="screen var-screen">
        <div className="qblock">
          <div className="qnum">Фаза Б · Раскладка</div>
          <h1 className="h1">Раскладка мебели</h1>
          <p className="sub">
            Сгенерируем 4 варианта расстановки кухни под размеры вашей комнаты — в 3D, прямо в вашем
            помещении. Раковина встанет у водоснабжения, плита — на безопасном расстоянии,
            холодильник — с краю.
          </p>
          <button className="gen-btn gen-btn-lg" onClick={onGenerate} type="button">
            ↻ Сгенерировать раскладки
          </button>
        </div>
        {warn && <WaterWarn onClose={() => setWarn(false)} onGoRoom={() => goTo("details")} />}
      </section>
    );
  }

  const cur = genVariants[variant] ?? genVariants[0];

  return (
    <section className="var-screen-3d">
      <div className="var-bar">
        <div className="var-bar-head">
          <span className="var-name">{cur.name}</span>
          <span className="var-price">{fmtSum(priceCabs(cur.cabs))}</span>
        </div>
        <button className="gen-btn" onClick={onGenerate} type="button">
          ↻ Заново
        </button>
      </div>

      <div className="var-stage">
        <VariantScene
          points={points}
          ceiling={ceiling}
          openings={openings}
          coveringColor={coveringColor}
          interiorWalls={interiorWalls}
          fittings={fittings}
          wallSurfaces={wallSurfaces}
          waterWall={waterWall}
          layout={cur.layout}
          style={cur.style}
          cabs={cur.cabs}
        />
        <span className="var-hint">Поверните, чтобы осмотреть</span>
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

      {warn && <WaterWarn onClose={() => setWarn(false)} onGoRoom={() => goTo("details")} />}
    </section>
  );
}

// floor-covering colours (mirror of model/floors.ts FLOOR_COVERINGS order)
const FLOOR_COLORS = ["#ecd9b4", "#f1e3c6", "#e7d3ab", "#cda877", "#d9b48f", "#d2cabd"];

function WaterWarn({ onClose, onGoRoom }: { onClose: () => void; onGoRoom: () => void }) {
  return (
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">Сначала добавьте водоснабжение</div>
        <div className="confirm-body">
          Чтобы расставить раковину и посудомойку, укажите на стене точку подвода воды. Вернитесь
          к комнате и выберите стену, к которой подходит вода.
        </div>
        <div className="confirm-actions">
          <button className="btn btn-back" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="btn btn-next" onClick={onGoRoom} type="button">
            К комнате →
          </button>
        </div>
      </div>
    </div>
  );
}
