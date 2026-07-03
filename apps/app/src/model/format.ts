// Money formatting for the ticker. Intl ru-RU groups thousands with a
// non-breaking space (U+00A0) or narrow NBSP (U+202F); normalise both to a
// plain space so the ticker renders consistently across platforms.
export const fmtSum = (n: number): string =>
  n.toLocaleString("ru-RU").replace(/[  ]/g, " ") + " сум";

/** Format a UZS base amount in the user's chosen currency. USD divides by the manual
 *  exchange rate (whole dollars for ≥ $1000, else 2 decimals) since every price is
 *  computed in UZS. Prefer the reactive `useMoney()` hook in components. */
export function formatMoney(uzs: number, currency: "UZS" | "USD", usdRate: number): string {
  if (currency === "USD") {
    const usd = usdRate > 0 ? uzs / usdRate : 0;
    const val = usd >= 1000 ? Math.round(usd) : Math.round(usd * 100) / 100;
    return "$" + val.toLocaleString("en-US");
  }
  return fmtSum(uzs);
}
