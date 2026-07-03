// Login / registration / password-reset (email + password, Supabase). Shown by App
// when Supabase is configured and no user is signed in. On successful sign-in the auth
// listener in the store flips `authUser` and App renders the app.

import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";

type Mode = "in" | "up" | "reset";

export function AuthScreen() {
  const t = useT();
  const closeAuth = useStore((s) => s.closeAuth);
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);
  const resetPassword = useStore((s) => s.resetPassword);
  const lang = useStore((s) => s.settings.language);
  const update = useStore((s) => s.updateSettings);
  const langToggle = (
    <div className="set-lang auth-lang">
      <button className={`set-lang-btn ${lang === "ru" ? "on" : ""}`} onClick={() => update({ language: "ru" })} type="button">RU</button>
      <button className={`set-lang-btn ${lang === "uz" ? "on" : ""}`} onClick={() => update({ language: "uz" })} type="button">UZ</button>
    </div>
  );
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  const go = (m: Mode) => { setMode(m); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const res =
      mode === "in" ? await signIn(email, password)
      : mode === "up" ? await signUp(email, password)
      : await resetPassword(email);
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    if (mode === "reset") setSent("reset");
    else if (mode === "up" && "needsConfirm" in res && res.needsConfirm) setSent("confirm");
    // sign-in success → the store's auth listener switches the screen
  };

  if (sent) {
    return (
      <section className="screen auth-screen">
        <div className="auth-box">
          <div className="qnum">Mebelchi</div>
          <h1 className="h1">{t.auth.checkMail}</h1>
          <p className="sub">{sent === "confirm" ? t.auth.sentConfirm(email) : t.auth.sentReset(email)}</p>
          <button className="link-btn" onClick={() => { setSent(null); go("in"); }} type="button">
            {t.auth.backToIn}
          </button>
        </div>
      </section>
    );
  }

  const title = mode === "in" ? t.auth.titleIn : mode === "up" ? t.auth.titleUp : t.auth.titleReset;
  const cta = busy ? t.auth.wait : mode === "in" ? t.auth.ctaIn : mode === "up" ? t.auth.ctaUp : t.auth.ctaReset;

  return (
    <section className="screen auth-screen">
      <form className="auth-box" onSubmit={submit}>
        <button className="auth-close" type="button" onClick={closeAuth} aria-label={t.menu.close}>✕</button>
        {langToggle}
        <div className="qnum">Mebelchi</div>
        <h1 className="h1">{title}</h1>
        <p className="sub">
          {mode === "in" ? t.auth.subIn : mode === "up" ? t.auth.subUp : t.auth.subReset}
        </p>

        <label className="set-field auth-field">
          <span className="set-label">{t.auth.email}</span>
          <input
            className="set-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        {mode !== "reset" && (
          <label className="set-field auth-field">
            <span className="set-label">{t.auth.password}</span>
            <input
              className="set-input"
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </label>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button className="gen-btn-lg" type="submit" disabled={busy}>{cta}</button>

        <div className="auth-links">
          {mode === "in" && (
            <>
              <button className="link-btn" type="button" onClick={() => go("reset")}>{t.auth.forgot}</button>
              <button className="link-btn" type="button" onClick={() => go("up")}>{t.auth.toUp}</button>
            </>
          )}
          {mode === "up" && (
            <button className="link-btn auth-switch" type="button" onClick={() => go("in")}>{t.auth.toIn}</button>
          )}
          {mode === "reset" && (
            <button className="link-btn auth-switch" type="button" onClick={() => go("in")}>{t.auth.backToIn}</button>
          )}
        </div>

        <p className="auth-legal">
          {t.auth.consentPre}
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{t.auth.consentLink}</a>.
        </p>
      </form>
    </section>
  );
}
