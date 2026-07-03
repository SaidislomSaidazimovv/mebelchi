// User/app settings for the B2B designer — profile, company (shown on the client
// quote + factory handoff), and preferences. Stored globally in localStorage (NOT
// per-project). This is the layer Supabase will later back: loadSettings/saveSettings
// become the local cache and the same Settings shape maps to a `profiles` row.

const KEY = "mebelchi.settings.v1";

export interface Settings {
  // Профиль (the designer's own contact — used on quotes/orders)
  name: string;
  phone: string;
  email: string;
  // Компания / мастерская (appears on the Смета + Передача documents)
  company: string;
  companyPhone: string;
  companyAddress: string;
  // Предпочтения
  currency: "UZS" | "USD";
  /** UZS per 1 USD — the manual exchange rate used to DISPLAY prices in USD (all amounts
   *  are computed in UZS by the pricing engine). Editable in Настройки. Local-only for now
   *  (no `usd_rate` column in the Supabase `profiles` table yet). */
  usdRate: number;
  language: "ru" | "uz";
}

/** Fallback UZS→USD rate (~mid-2026). The designer edits this in Настройки. */
export const DEFAULT_USD_RATE = 12600;

export const DEFAULT_SETTINGS: Settings = {
  name: "",
  phone: "",
  email: "",
  company: "",
  companyPhone: "",
  companyAddress: "",
  currency: "UZS",
  usdRate: DEFAULT_USD_RATE,
  language: "uz", // Uzbekistan market default; user can switch to Русский in Настройки
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // merge over defaults so new fields added later don't break old saves
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

/** True once the designer has filled the essentials (name/phone) — drives the
 *  "complete your profile" nudge on the home screen. */
export function profileComplete(s: Settings): boolean {
  return s.name.trim().length > 0 && s.phone.trim().length > 0;
}
