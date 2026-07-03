// Phase A.1 quiz — STRUCTURE only (ids, option values, illustration keys). All display
// text (question/option titles + descriptions) lives in i18n/dicts.ts (`quiz.q`), keyed
// by question id + option value, so it's language-aware. `pic` keys quiz/Illustration.tsx;
// the `layout` answer's `v` also sets the room shape.

export type QuizId = "oven" | "hood" | "fridge" | "layout";

export interface QuizOption {
  v: string;
  pic: string;
}
export interface QuizQuestion {
  id: QuizId;
  /** allow picking several options — the variants then explore each choice */
  multi?: boolean;
  opts: QuizOption[];
}

export const QUIZ: QuizQuestion[] = [
  { id: "oven", multi: true, opts: [{ v: "under", pic: "oven_under" }, { v: "tall", pic: "oven_tall" }] },
  { id: "hood", multi: true, opts: [{ v: "integ", pic: "hood_integ" }, { v: "dome", pic: "hood_dome" }] },
  { id: "fridge", multi: true, opts: [{ v: "integ", pic: "fridge_integ" }, { v: "free", pic: "fridge_free" }] },
  {
    id: "layout",
    multi: true,
    opts: [
      { v: "i", pic: "lay_i" },
      { v: "galley", pic: "lay_galley" },
      { v: "l", pic: "lay_l" },
      { v: "u", pic: "lay_u" },
      { v: "peninsula", pic: "lay_peninsula" },
    ],
  },
];
