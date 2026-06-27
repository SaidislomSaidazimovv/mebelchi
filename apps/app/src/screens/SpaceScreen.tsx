// Phase A.2a — room type only (Figma "5"). Just the shape choice; the room is
// then designed in the live 3D scene (RoomScene).
import { useStore } from "../store";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";

export function SpaceScreen() {
  const shape = useStore((s) => s.shape);
  const setShape = useStore((s) => s.setShape);

  return (
    <section className="screen">
      <div className="qblock">
        <h1 className="h1">Опишите комнату</h1>
        <div className="flabel">Форма помещения</div>
        <div className="cards">
          <OptionCard square selected={shape === "i"} onClick={() => setShape("i")} title="Прямая">
            <Illustration kind="shape_i" />
          </OptionCard>
          <OptionCard square selected={shape === "l"} onClick={() => setShape("l")} title="Угловая">
            <Illustration kind="shape_l" />
          </OptionCard>
        </div>
      </div>
    </section>
  );
}
