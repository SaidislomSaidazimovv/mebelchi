// Shown when the app opens in a password-recovery session (the user clicked the reset
// link in their email → Supabase fired PASSWORD_RECOVERY → store.recovery = true). They
// set a new password here; on success `recovery` clears and App renders the app.

import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";

export function SetPasswordScreen() {
  const t = useT();
  const updatePassword = useStore((s) => s.updatePassword);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (password.length < 6) { setError(t.setpw.tooShort); return; }
    if (password !== confirm) { setError(t.setpw.mismatch); return; }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.error) setError(res.error);
    // success → store clears `recovery`, App shows the app
  };

  return (
    <section className="screen auth-screen">
      <form className="auth-box" onSubmit={submit}>
        <div className="qnum">Mebelchi</div>
        <h1 className="h1">{t.setpw.title}</h1>
        <p className="sub">{t.setpw.sub}</p>

        <label className="set-field auth-field">
          <span className="set-label">{t.setpw.newPw}</span>
          <input className="set-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
        </label>
        <label className="set-field auth-field">
          <span className="set-label">{t.setpw.repeat}</span>
          <input className="set-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" minLength={6} required />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="gen-btn-lg" type="submit" disabled={busy}>{busy ? t.setpw.saving : t.setpw.save}</button>
      </form>
    </section>
  );
}
