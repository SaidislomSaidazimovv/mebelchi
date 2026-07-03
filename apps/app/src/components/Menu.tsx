// The navbar hamburger drawer: shows the journey PROGRESS (tap a visited step to
// jump back) plus app navigation to the home / projects / settings screens.
import { useStore, type Screen } from "../store";
import { useT } from "../i18n/useT";
import { AI_RENDER } from "../config";
import { isSupabaseConfigured } from "../lib/supabase";

// phase → its label key in t.menu.phases; label resolved at render (language-aware)
const PHASES: { key: keyof ReturnType<typeof useT>["menu"]["phases"]; target: Screen; members: Screen[] }[] = [
  { key: "quiz", target: "quiz", members: ["quiz"] },
  { key: "space", target: "space", members: ["space", "details"] },
  { key: "variants", target: "variants", members: ["variants"] },
  { key: "configure", target: "configure", members: ["configure"] },
  // Preview (AI render) held for v1 — flip AI_RENDER in config.ts to restore it
  ...(AI_RENDER ? [{ key: "preview" as const, target: "preview" as Screen, members: ["preview" as Screen] }] : []),
  { key: "engineering", target: "engineering", members: ["engineering"] },
  { key: "cost", target: "cost", members: ["cost"] },
  { key: "handoff", target: "handoff", members: ["handoff"] },
];

export function Menu() {
  const t = useT();
  const open = useStore((s) => s.menuOpen);
  const screen = useStore((s) => s.screen);
  const closeMenu = useStore((s) => s.closeMenu);
  const goTo = useStore((s) => s.goTo);
  const authUser = useStore((s) => s.authUser);
  const signOut = useStore((s) => s.signOut);
  const openAuth = useStore((s) => s.openAuth);
  const openSettings = useStore((s) => s.openSettings);

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
    { label: t.menu.home, onClick: () => nav(() => goTo("home")) },
    { label: t.menu.projects, onClick: () => nav(() => goTo("projects")) },
    { label: t.menu.settings, onClick: openSettings },
    ...(isSupabaseConfigured && !authUser ? [{ label: t.menu.signIn, onClick: openAuth }] : []),
    ...(authUser ? [{ label: t.menu.signOut, onClick: () => nav(() => { void signOut(); }) }] : []),
  ];

  return (
    <>
      <div className="menu-backdrop" onClick={closeMenu} />
      <aside className="menu-drawer">
        <div className="menu-head">
          <div className="brand">Mebelchi</div>
          <button className="menu-x" onClick={closeMenu} aria-label={t.menu.close} type="button">
            ✕
          </button>
        </div>

        <div className="menu-sec-title">{t.menu.progress}</div>
        <div className="menu-steps">
          {PHASES.map((p, i) => {
            const state = i < cur ? "done" : i === cur ? "current" : "locked";
            return (
              <button key={p.target} className={`menu-step ${state}`} disabled={i > cur} onClick={() => jump(i)} type="button">
                <span className="menu-step-dot">{i < cur ? "✓" : i + 1}</span>
                <span className="menu-step-lbl">{t.menu.phases[p.key]}</span>
              </button>
            );
          })}
        </div>

        <div className="menu-sec-title">{t.menu.menu}</div>
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
