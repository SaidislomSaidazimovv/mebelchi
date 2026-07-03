// Phase Г — "Инженерия": the engineering spec, between the constructor and the quote.
// Real construction options (усиление + класс фурнитуры) wired into state, plus a
// "узлы" summary derived from the SAME drilling solver that drives the machine file.

import { useMemo } from "react";
import { useStore, type HwGrade } from "../store";
import { useT } from "../i18n/useT";
import { machiningReport, type Part } from "../model/machining";
import { production } from "../model/cncExport";

/** Count fittings from the solved drill operations (by diameter, in mm10). */
function joints(parts: Part[]) {
  let cam = 0, dowel = 0, pin = 0, hinge = 0;
  for (const p of parts) {
    for (const op of p.operations) {
      if (op.op !== "drill") continue;
      if (op.diameter_mm10 === 150) cam++;
      else if (op.diameter_mm10 === 80) dowel++;
      else if (op.diameter_mm10 === 50) pin++;
      else if (op.diameter_mm10 === 350) hinge++;
    }
  }
  return { cam, dowel, pin, hinge };
}

export function EngineeringScreen() {
  const t = useT();
  const cabs = useStore((s) => s.cabs);
  const hardened = useStore((s) => s.hardened);
  const setHardened = useStore((s) => s.setHardened);
  const hwGrade = useStore((s) => s.hwGrade);
  const setHwGrade = useStore((s) => s.setHwGrade);

  const report = useMemo(() => machiningReport(cabs), [cabs]);
  const prod = useMemo(() => production(cabs), [cabs]);

  const GRADES: { id: HwGrade; name: string; note: string }[] = [
    { id: "eco", name: t.eng.gradeEco, note: t.eng.gradeEcoNote },
    { id: "std", name: t.eng.gradeStd, note: t.eng.gradeStdNote },
    { id: "premium", name: t.eng.gradePremium, note: t.eng.gradePremiumNote },
  ];

  if (!report || !prod) {
    return (
      <section className="screen">
        <div className="qnum">{t.eng.num}</div>
        <h1 className="h1">{t.eng.title}</h1>
        <p className="sub" style={{ marginTop: 12 }}>{t.eng.emptySub}</p>
      </section>
    );
  }

  const j = joints(report.parts);

  return (
    <section className="screen eng-screen">
      <div className="qnum">{t.eng.num}</div>
      <h1 className="h1">{t.eng.title}</h1>

      <div className="cost-sec-title">{t.eng.reinforce}</div>
      <button className={`eng-toggle ${hardened ? "on" : ""}`} onClick={() => setHardened(!hardened)} type="button" aria-pressed={hardened}>
        <span className="eng-toggle-txt">
          <span className="eng-toggle-name">{t.eng.reinforceName}</span>
          <span className="eng-toggle-note">{t.eng.reinforceNote}</span>
        </span>
        <span className="eng-switch" aria-hidden="true" />
      </button>

      <div className="cost-sec-title">{t.eng.hwClass}</div>
      <div className="eng-grades">
        {GRADES.map((g) => (
          <button key={g.id} className={`eng-grade ${hwGrade === g.id ? "on" : ""}`} onClick={() => setHwGrade(g.id)} type="button">
            <span className="eng-grade-name">{g.name}</span>
            <span className="eng-grade-note">{g.note}</span>
          </button>
        ))}
      </div>

      <div className="cost-sec-title">{t.eng.joints}</div>
      <div className="ho-stats">
        <div className="ho-stat"><span className="ho-stat-n">{j.cam}</span><span className="ho-stat-l">{t.eng.cams}</span></div>
        <div className="ho-stat"><span className="ho-stat-n">{j.dowel}</span><span className="ho-stat-l">{t.eng.dowels}</span></div>
        <div className="ho-stat"><span className="ho-stat-n">{j.pin}</span><span className="ho-stat-l">{t.eng.pins}</span></div>
        <div className="ho-stat"><span className="ho-stat-n">{j.hinge}</span><span className="ho-stat-l">{t.eng.hinges}</span></div>
      </div>
      <div className="eng-summary">
        <div className="eng-row"><span>{t.eng.joint}</span><span>{t.eng.jointVal}</span></div>
        <div className="eng-row"><span>{t.eng.holes}</span><span>{report.holeCount}</span></div>
        <div className="eng-row"><span>{t.eng.parts}</span><span>{report.partCount}</span></div>
        <div className="eng-row"><span>{t.eng.board}</span><span>{prod.boardM2} {t.labels.m2}</span></div>
        <div className="eng-row"><span>{t.eng.check}</span><span className={report.ok ? "eng-ok" : "eng-bad"}>{report.ok ? t.eng.passed : t.eng.errors}</span></div>
      </div>

      <p className="cost-note">{t.eng.note}</p>
    </section>
  );
}
