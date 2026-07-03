// useT() — the translation hook. Reads the current language from the store (settings)
// and returns the matching dictionary; components re-render when the language changes.
// For non-component code (store actions), import `dict` from ./dicts directly.

import { useStore } from "../store";
import { dict } from "./dicts";

export function useT() {
  return dict(useStore((s) => s.settings.language));
}
