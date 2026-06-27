// After the 4th question: a review of every quiz decision. Each card's "Изменить"
// jumps back to that question in edit mode (footer becomes a single "back to
// summary" button). The bottom button moves on to the room screen.
import { useStore } from "../store";
import { QUIZ } from "../quiz/questions";
import { Illustration } from "../quiz/Illustration";

export function SummaryScreen() {
  const quiz = useStore((s) => s.quiz);
  const editQuiz = useStore((s) => s.editQuiz);

  return (
    <section className="screen">
      <div className="qblock">
        <div className="qnum">Почти готово</div>
        <h1 className="h1">Краткое содержание</h1>
        <p className="sub">Выберите вариант, если хотите его изменить.</p>

        <div className="summary-grid">
          {QUIZ.map((q, i) => {
            const picked = quiz[q.id] ?? [];
            const sel = q.opts.find((o) => picked.includes(o.v));
            return (
              <div className="summary-card" key={q.id}>
                <div className="pic">{sel && <Illustration kind={sel.pic} />}</div>
                <div className="meta">
                  <div className="t">{q.label}{picked.length > 1 ? ` · ${picked.length}` : ""}</div>
                  <button className="btn-change" onClick={() => editQuiz(i)} type="button">
                    Изменить
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
