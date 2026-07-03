// A soft, one-time "sign in to sync" card shown after a guest saves their first project.
// Dismissible (Позже) — never a wall. Driven by store `loginNudge` (set once, guarded by a
// localStorage flag); "Войти" opens the auth screen, "Позже" just closes it.

import { useStore } from "../store";
import { useT } from "../i18n/useT";

export function LoginNudge() {
  const t = useT();
  const show = useStore((s) => s.loginNudge);
  const openAuth = useStore((s) => s.openAuth);
  const dismiss = useStore((s) => s.dismissNudge);
  if (!show) return null;
  return (
    <div className="nudge-wrap" onClick={dismiss}>
      <div className="nudge-card" onClick={(e) => e.stopPropagation()}>
        <div className="nudge-ico" aria-hidden>☁</div>
        <div className="nudge-title">{t.nudge.title}</div>
        <div className="nudge-body">{t.nudge.body}</div>
        <div className="nudge-actions">
          <button className="nudge-later" onClick={dismiss} type="button">{t.nudge.later}</button>
          <button className="nudge-signin" onClick={openAuth} type="button">{t.nudge.signin}</button>
        </div>
      </div>
    </div>
  );
}
