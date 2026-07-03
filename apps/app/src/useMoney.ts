// A reactive money formatter bound to the user's currency + USD-rate settings.
// Use in components instead of `fmtSum` so prices re-format the instant the user
// switches currency (or edits the rate) in Настройки. All amounts are UZS base.
import { useStore } from "./store";
import { formatMoney } from "./model/format";

export function useMoney(): (uzs: number) => string {
  const currency = useStore((s) => s.settings.currency);
  const usdRate = useStore((s) => s.settings.usdRate);
  return (uzs: number) => formatMoney(uzs, currency, usdRate);
}
