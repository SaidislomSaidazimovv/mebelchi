// Phase A.1 — the quiz, now ALL on one scrollable screen (was one question per screen).
// Four grouped questions; each is a labelled section of option cards (multi-select). The
// footer CTA is disabled until every question has a pick.
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { QUIZ } from "../quiz/questions";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";

export function QuizScreen() {
  const t = useT();
  const quiz = useStore((s) => s.quiz);
  const pickQuiz = useStore((s) => s.pickQuiz);

  return (
    <section className="screen quiz-all">
      <div className="qblock">
        <h1 className="h1">{t.quiz.allTitle}</h1>
        <p className="sub">{t.quiz.allSub}</p>

        {QUIZ.map((q) => {
          const qd = t.quiz.q[q.id];
          return (
            <div className="quiz-q" key={q.id}>
              <div className="quiz-q-head">
                <span className="quiz-q-title">{qd?.t}</span>
                {qd?.s && <span className="quiz-q-sub">{qd.s}</span>}
              </div>
              <div className={`cards${q.opts.length > 2 ? " cards-grid" : ""}`}>
                {q.opts.map((o) => {
                  const od = qd?.opts[o.v];
                  return (
                    <OptionCard
                      key={o.v}
                      selected={(quiz[q.id] ?? []).includes(o.v)}
                      onClick={() => pickQuiz(q.id, o.v)}
                      title={od?.t ?? o.v}
                      desc={od?.d ?? ""}
                    >
                      <Illustration kind={o.pic} />
                    </OptionCard>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
