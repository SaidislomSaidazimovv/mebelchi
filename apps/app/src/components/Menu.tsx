// The navbar hamburger drawer: shows the journey PROGRESS (tap a visited step to
// jump back) plus app navigation. Main-menu / projects / settings screens don't
// exist yet, so those items flash a "скоро" toast for now.
import { useStore, type Screen } from "../store";

const PHASES: { label: string; target: Screen; members: Screen[] }[] = [
  { label: "Параметры", target: "quiz", members: ["quiz", "summary"] },
  { label: "Комната", target: "space", members: ["space", "details"] },
  { label: "Раскладка", target: "variants", members: ["variants"] },
  { label: "Конструктор", target: "configure", members: ["configure"] },
  { label: "Инженерия", target: "engineering", members: ["engineering"] },
  { label: "Смета", target: "cost", members: ["cost"] },
  { label: "Готово", target: "handoff", members: ["handoff"] },
];

export function Menu() {
  const open = useStore((s) => s.menuOpen);
  const screen = useStore((s) => s.screen);
  const closeMenu = useStore((s) => s.closeMenu);
  const goTo = useStore((s) => s.goTo);
  const flash = useStore((s) => s.flash);

  if (!open) return null;

  const cur = Math.max(0, PHASES.findIndex((p) => p.members.includes(screen)));
  const jump = (i: number) => {
    if (i > cur) return; // can't jump ahead of where you are
    goTo(PHASES[i].target);
    closeMenu();
  };
  const nav = (to: () => void) => {
    to();
    closeMenu();
  };
  const ITEMS: { label: string; onClick: () => void }[] = [
    { label: "На главную", onClick: () => nav(() => goTo("home")) },
    { label: "Мои проекты", onClick: () => nav(() => goTo("projects")) },
    { label: "Настройки", onClick: () => nav(() => flash("Скоро")) },
  ];

  return (
    <>
      <div className="menu-backdrop" onClick={closeMenu} />
      <aside className="menu-drawer">
        <div className="menu-head">
          <div className="brand">Mebelchi</div>
          <button className="menu-x" onClick={closeMenu} aria-label="Закрыть" type="button">
            ✕
          </button>
        </div>

        <div className="menu-sec-title">Прогресс</div>
        <div className="menu-steps">
          {PHASES.map((p, i) => {
            const state = i < cur ? "done" : i === cur ? "current" : "locked";
            return (
              <button key={p.target} className={`menu-step ${state}`} disabled={i > cur} onClick={() => jump(i)} type="button">
                <span className="menu-step-dot">{i < cur ? "✓" : i + 1}</span>
                <span className="menu-step-lbl">{p.label}</span>
              </button>
            );
          })}
        </div>

        <div className="menu-sec-title">Меню</div>
        <div className="menu-items">
          {ITEMS.map((it) => (
            <button key={it.label} className="menu-item" onClick={it.onClick} type="button">
              {it.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
