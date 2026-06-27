// Phase A.1 quiz data (ported from v7-journey.html). `pic` keys the illustration
// in quiz/Illustration.tsx. The `layout` answer also sets the room shape.

export interface QuizOption {
  v: string;
  t: string;
  d: string;
  pic: string;
}
export interface QuizQuestion {
  id: string;
  t: string;
  s: string;
  /** short category name for the summary screen */
  label: string;
  /** allow picking several options — the variants then explore each choice */
  multi?: boolean;
  opts: QuizOption[];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: "oven",
    t: "Где разместить духовку?",
    s: "Можно выбрать оба — покажем разные варианты",
    label: "Размещение духовки",
    multi: true,
    opts: [
      { v: "under", t: "Под столешницей", d: "Классика, удобно в малой кухне", pic: "oven_under" },
      { v: "tall", t: "В пенале", d: "На уровне глаз", pic: "oven_tall" },
    ],
  },
  {
    id: "hood",
    t: "Какая вытяжка?",
    s: "Можно выбрать несколько",
    label: "Вытяжка",
    multi: true,
    opts: [
      { v: "integ", t: "Встроенная", d: "Скрыта в шкафу", pic: "hood_integ" },
      { v: "dome", t: "Купольная", d: "Без верхних шкафов", pic: "hood_dome" },
    ],
  },
  {
    id: "fridge",
    t: "Холодильник?",
    s: "Можно выбрать несколько",
    label: "Холодильник",
    multi: true,
    opts: [
      { v: "integ", t: "Встроенный", d: "Сливается с фасадами", pic: "fridge_integ" },
      { v: "free", t: "Отдельный", d: "Проще двигать", pic: "fridge_free" },
    ],
  },
  {
    id: "layout",
    t: "Форма раскладки?",
    s: "Можно выбрать несколько — покажем разные раскладки",
    label: "Раскладки",
    multi: true,
    opts: [
      { v: "i", t: "Прямая (I)", d: "Один ряд у стены", pic: "lay_i" },
      { v: "galley", t: "Параллельная", d: "Два ряда напротив", pic: "lay_galley" },
      { v: "l", t: "Угловая (Г)", d: "Две стены углом", pic: "lay_l" },
      { v: "u", t: "П-образная", d: "Три стены", pic: "lay_u" },
      { v: "peninsula", t: "С полуостровом", d: "Ряд + барная стойка", pic: "lay_peninsula" },
    ],
  },
];
