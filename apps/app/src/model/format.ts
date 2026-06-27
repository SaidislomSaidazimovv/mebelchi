// Money formatting for the ticker. Intl ru-RU groups thousands with a
// non-breaking space (U+00A0) or narrow NBSP (U+202F); normalise both to a
// plain space so the ticker renders consistently across platforms.
export const fmtSum = (n: number): string =>
  n.toLocaleString("ru-RU").replace(/[\u00A0\u202F]/g, " ") + " сум";
