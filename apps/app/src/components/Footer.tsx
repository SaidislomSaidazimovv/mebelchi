import { useStore, type Screen } from "../store";
import { QUIZ } from "../quiz/questions";

interface Cta {
  label: string;
  disabled: boolean;
}

function ctaFor(screen: Screen, qi: number, quiz: Record<string, string[]>, exported: boolean, hasVariant: boolean): Cta {
  switch (screen) {
    case "quiz":
      return { label: "Дальше →", disabled: !quiz[QUIZ[qi].id]?.length };
    case "summary":
      return { label: "Определите своё пространство →", disabled: false };
    case "space":
      return { label: "Дальше →", disabled: false };
    case "details":
      return { label: "Дальше →", disabled: false };
    case "variants":
      // can't proceed until a layout has been generated and selected
      return { label: "Конструктор →", disabled: !hasVariant };
    case "configure":
      return { label: "В инженерию →", disabled: false };
    case "engineering":
      return { label: "В смету →", disabled: false };
    case "cost":
      return { label: "В передачу →", disabled: false };
    case "handoff":
      return { label: exported ? "✓ Готово · поделиться" : "Экспорт на ЧПУ →", disabled: false };
    default:
      // home / projects render no journey footer; this is just for exhaustiveness
      return { label: "Дальше →", disabled: false };
  }
}

export function Footer() {
  const screen = useStore((s) => s.screen);
  const qi = useStore((s) => s.qi);
  const quiz = useStore((s) => s.quiz);
  const exported = useStore((s) => s.exported);
  const editing = useStore((s) => s.editing);
  const hasVariant = useStore((s) => s.genVariants.length > 0);
  const next = useStore((s) => s.next);
  const back = useStore((s) => s.back);
  const finishEdit = useStore((s) => s.finishEdit);

  // editing a single answer from the summary → one button back to the summary
  if (editing) {
    return (
      <footer className="footer">
        <div className="footrow">
          <button className="btn btn-next" onClick={finishEdit} type="button">
            К краткому содержанию →
          </button>
        </div>
      </footer>
    );
  }

  // first screen and the summary show a single forward button; the rest pair Back + Next
  const showBack = !(screen === "quiz" && qi === 0) && screen !== "summary";
  const cta = ctaFor(screen, qi, quiz, exported, hasVariant);

  return (
    <footer className="footer">
      <div className="footrow">
        {showBack && (
          <button className="btn btn-back" onClick={back} type="button">
            ← Назад
          </button>
        )}
        <button className="btn btn-next" disabled={cta.disabled} onClick={next} type="button">
          {cta.label}
        </button>
      </div>
    </footer>
  );
}
