// Phase A.1 — the quiz (screenshots 1–4). Four two-card questions; the CTA in
// the footer advances (disabled until answered), "без разницы" auto-decides.
import { useStore } from "../store";
import { QUIZ } from "../quiz/questions";
import { OptionCard } from "../components/OptionCard";
import { Illustration } from "../quiz/Illustration";

export function QuizScreen() {
  const qi = useStore((s) => s.qi);
  const quiz = useStore((s) => s.quiz);
  const pickQuiz = useStore((s) => s.pickQuiz);

  const q = QUIZ[qi];

  return (
    <section className="screen">
      <div className="qblock">
        <div className="qnum">
          Вопрос {qi + 1} из {QUIZ.length}
        </div>
        <h1 className="h1">{q.t}</h1>
        {q.s && <p className="sub">{q.s}</p>}

        <div className={`cards${q.opts.length > 2 ? " cards-grid" : ""}`}>
          {q.opts.map((o) => (
            <OptionCard
              key={o.v}
              selected={(quiz[q.id] ?? []).includes(o.v)}
              onClick={() => pickQuiz(q.id, o.v)}
              title={o.t}
              desc={o.d}
            >
              <Illustration kind={o.pic} />
            </OptionCard>
          ))}
        </div>
      </div>
    </section>
  );
}
