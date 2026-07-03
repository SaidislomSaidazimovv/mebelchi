import { useStore, type Screen } from "../store";
import { useT } from "../i18n/useT";
import { QUIZ } from "../quiz/questions";

interface Cta {
  label: string;
  disabled: boolean;
}

type FooterT = ReturnType<typeof useT>["footer"];

function ctaFor(f: FooterT, screen: Screen, quiz: Record<string, string[]>, exported: boolean, hasVariant: boolean): Cta {
  switch (screen) {
    case "quiz":
      // all questions on one screen → enabled once every one is answered
      return { label: f.next, disabled: QUIZ.some((q) => !quiz[q.id]?.length) };
    case "space":
      return { label: f.next, disabled: false };
    case "details":
      return { label: f.next, disabled: false };
    case "variants":
      // can't proceed until a layout has been generated and selected
      return { label: f.toConstructor, disabled: !hasVariant };
    case "configure":
      return { label: f.toEngineering, disabled: false };
    case "engineering":
      return { label: f.toCost, disabled: false };
    case "cost":
      return { label: f.toHandoff, disabled: false };
    case "handoff":
      return { label: exported ? f.done : f.exportCnc, disabled: false };
    default:
      // home / projects render no journey footer; this is just for exhaustiveness
      return { label: f.next, disabled: false };
  }
}

export function Footer() {
  const t = useT();
  const screen = useStore((s) => s.screen);
  const quiz = useStore((s) => s.quiz);
  const exported = useStore((s) => s.exported);
  const hasVariant = useStore((s) => s.genVariants.length > 0);
  const next = useStore((s) => s.next);
  const back = useStore((s) => s.back);

  // the quiz is the first journey screen → single forward button; the rest pair Back + Next
  const showBack = screen !== "quiz";
  const cta = ctaFor(t.footer, screen, quiz, exported, hasVariant);

  return (
    <footer className="footer">
      <div className="footrow">
        {showBack && (
          <button className="btn btn-back" onClick={back} type="button">
            {t.footer.back}
          </button>
        )}
        <button className="btn btn-next" disabled={cta.disabled} onClick={next} type="button">
          {cta.label}
        </button>
      </div>
    </footer>
  );
}
