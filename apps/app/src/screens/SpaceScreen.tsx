// Phase A.2a — room type only (Figma "5"). Just the shape choice; the room is
// then designed in the live 3D scene (RoomScene).
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";

export function SpaceScreen() {
  const t = useT();
  const shape = useStore((s) => s.shape);
  const setShape = useStore((s) => s.setShape);

  return (
    <section className="screen">
      <div className="qblock">
        <h1 className="h1">{t.space.title}</h1>
        <div className="flabel">{t.space.shape}</div>
        <div className="cards">
          <OptionCard square selected={shape === "i"} onClick={() => setShape("i")} title={t.space.straight}>
            <Illustration kind="shape_i" />
          </OptionCard>
          <OptionCard square selected={shape === "l"} onClick={() => setShape("l")} title={t.space.corner}>
            <Illustration kind="shape_l" />
          </OptionCard>
        </div>
      </div>
    </section>
  );
}
