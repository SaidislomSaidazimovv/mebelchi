// "Настройки" — the B2B designer's profile, company (shown on the client quote +
// factory handoff), and app preferences (incl. the language switcher). Fields auto-save
// to localStorage on change (model/settings.ts) + push to Supabase when signed in.

import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n/useT";
import { DEFAULT_USD_RATE, type Settings } from "../model/settings";

/** The free-text (string) settings fields the form edits. */
type TextKey = "name" | "phone" | "email" | "company" | "companyPhone" | "companyAddress";

export function SettingsScreen() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const authUser = useStore((s) => s.authUser);
  const signOut = useStore((s) => s.signOut);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  const runDelete = async () => {
    setDelBusy(true);
    setDelError(null);
    const r = await deleteAccount();
    setDelBusy(false);
    if (r.error) setDelError(r.error);
    // success → the auth listener signs out and App shows the login screen
  };

  const field = (key: TextKey, label: string, type = "text", placeholder = "") => (
    <label className="set-field">
      <span className="set-label">{label}</span>
      <input
        className="set-input"
        value={settings[key]}
        type={type}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value } as Partial<Settings>)}
      />
    </label>
  );

  return (
    <section className="screen set-screen">
      <div className="qnum">Mebelchi</div>
      <h1 className="h1">{t.settings.title}</h1>
      <p className="sub">{t.settings.sub}</p>

      <div className="menu-sec-title">{t.settings.profile}</div>
      <div className="set-group">
        {field("name", t.settings.name, "text", t.settings.phName)}
        {field("phone", t.settings.phone, "tel", t.settings.phPhone)}
        {field("email", t.settings.email, "email", t.settings.phEmail)}
      </div>

      <div className="menu-sec-title">{t.settings.company}</div>
      <div className="set-group">
        {field("company", t.settings.companyName, "text", t.settings.phCompany)}
        {field("companyPhone", t.settings.companyPhone, "tel", t.settings.phCompanyPhone)}
        {field("companyAddress", t.settings.companyAddress, "text", t.settings.phAddress)}
      </div>

      <div className="menu-sec-title">{t.settings.prefs}</div>
      <div className="set-group">
        <div className="set-pref">
          <span className="set-label">{t.settings.language}</span>
          <div className="set-lang">
            <button
              className={`set-lang-btn ${settings.language === "ru" ? "on" : ""}`}
              onClick={() => update({ language: "ru" })}
              type="button"
            >
              {t.settings.ru}
            </button>
            <button
              className={`set-lang-btn ${settings.language === "uz" ? "on" : ""}`}
              onClick={() => update({ language: "uz" })}
              type="button"
            >
              {t.settings.uz}
            </button>
          </div>
        </div>
        <div className="set-pref">
          <span className="set-label">{t.settings.currency}</span>
          <div className="set-lang">
            <button
              className={`set-lang-btn ${settings.currency === "UZS" ? "on" : ""}`}
              onClick={() => update({ currency: "UZS" })}
              type="button"
            >
              {t.settings.uzs}
            </button>
            <button
              className={`set-lang-btn ${settings.currency === "USD" ? "on" : ""}`}
              onClick={() => update({ currency: "USD" })}
              type="button"
            >
              {t.settings.usd}
            </button>
          </div>
        </div>
        {settings.currency === "USD" && (
          <label className="set-field">
            <span className="set-label">{t.settings.usdRate}</span>
            <input
              className="set-input"
              inputMode="numeric"
              value={settings.usdRate ? String(settings.usdRate) : ""}
              placeholder={String(DEFAULT_USD_RATE)}
              onChange={(e) => update({ usdRate: parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0 })}
              onBlur={() => { if (!settings.usdRate) update({ usdRate: DEFAULT_USD_RATE }); }}
            />
            <span className="set-hint">{t.settings.usdRateHint}</span>
          </label>
        )}
      </div>

      {authUser && (
        <>
          <div className="menu-sec-title">{t.settings.account}</div>
          <div className="set-group">
            <div className="set-pref">
              <span className="set-label">{t.settings.loggedInAs}</span>
              <span className="set-pref-val set-email">{authUser.email}</span>
            </div>
          </div>
          <button className="ho-download ho-download-2 set-signout" onClick={() => void signOut()} type="button">
            {t.common.signOut}
          </button>

          <div className="menu-sec-title">{t.settings.danger}</div>
          {!confirmDel ? (
            <button className="set-danger" onClick={() => { setConfirmDel(true); setDelError(null); }} type="button">
              {t.settings.deleteAccount}
            </button>
          ) : (
            <div className="set-danger-box">
              <p className="set-danger-txt">{t.settings.deleteWarn}</p>
              {delError && <div className="auth-error">{delError}</div>}
              <div className="proj-confirm">
                <button className="proj-confirm-yes" disabled={delBusy} onClick={() => void runDelete()} type="button">
                  {delBusy ? t.settings.deleting : t.settings.deleteForever}
                </button>
                <button className="proj-confirm-no" onClick={() => setConfirmDel(false)} type="button">
                  {t.common.cancel}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <a className="set-legal" href="/privacy.html" target="_blank" rel="noopener noreferrer">
        {t.settings.privacy}
      </a>

      <p className="cost-note">{authUser ? t.settings.noteCloud : t.settings.noteLocal}</p>
    </section>
  );
}
