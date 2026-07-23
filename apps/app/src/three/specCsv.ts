// three/specCsv.ts — M8.3. The cut list as a spreadsheet file.
//
// The usta already has the CNC file (for the machine) and the A4 sheet (for the bench). This is the
// third audience: the supplier he buys the board from, the client who wants a written quote, and the
// accountant. Moblo exports the same idea with `Part · Quantity · Length · Width · Thickness · Material
// · Color`; ours adds the two things Moblo cannot know — the EDGE BANDING and the PRICE — and the
// usta's own note.
//
// FORMAT CHOICES, both for Excel on a Russian/Uzbek Windows, which is what a workshop actually opens:
//   • SEMICOLON separator — a comma-separated file opens as one column there.
//   • COMMA decimal mark — the same reason, and it is why the separator cannot be a comma.
//   • A UTF-8 BOM, or «ЛДСП Дуб Сонома» arrives as mojibake.
// Google Sheets detects all three by itself, so nothing is lost by favouring Excel.

import type { GroupedSpec } from "./estimate.js";

/** Quote a field only when it needs it, doubling any quote inside — RFC 4180, with our separator. */
function cell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A number with a COMMA decimal mark (see the header note), trimmed to `dp` places. */
function num(n: number, dp = 0): string {
  return n.toFixed(dp).replace(".", ",");
}

/** Which edges carry banding, as the workshop says it: «oldi», «orqa», «chap», «o'ng». */
export function bandsLabel(bands: readonly boolean[]): string {
  const names = ["ust", "tag", "o'ng", "chap"]; // solve.ts edge order: top · bottom · right · left
  const on = names.filter((_, i) => bands[i]);
  return on.length === 0 ? "yo'q" : on.length === 4 ? "hammasi" : on.join("+");
}

export interface SpecCsvOptions {
  /** Printed in the file's first line so the reader knows what job it is. */
  readonly title?: string;
  /** Written as-is next to the total — the app knows the currency, this module does not. */
  readonly totalLabel?: string;
}

/**
 * The grouped cut list as CSV text. Pure: the same rows always produce the same bytes, which is what
 * makes it testable — a spreadsheet that silently loses a part is worse than no spreadsheet.
 */
export function specsToCsv(rows: readonly GroupedSpec[], opts: SpecCsvOptions = {}): string {
  const head = ["Detal", "Soni", "Uzunlik (mm)", "Eni (mm)", "Qalinlik (mm)", "Material", "Kromka", "Yuza (m²)", "Narx", "Izoh"];
  const lines: string[] = [];
  if (opts.title) lines.push(cell(opts.title));
  lines.push(head.map(cell).join(";"));
  for (const r of rows) {
    lines.push([
      cell(r.name),
      String(r.qty),
      num(r.l_mm),
      num(r.w_mm),
      num(r.t_mm, 1),
      cell(r.materialName),
      cell(bandsLabel(r.bands)),
      num(r.areaM2, 3),
      num(Math.round(r.priceUzs)),
      cell(r.note ?? ""),
    ].join(";"));
  }
  // A totals line: this file is read by a person deciding whether to buy, not by another program.
  const qty = rows.reduce((n, r) => n + r.qty, 0);
  const area = rows.reduce((n, r) => n + r.areaM2, 0);
  const price = rows.reduce((n, r) => n + r.priceUzs, 0);
  lines.push(["JAMI", String(qty), "", "", "", "", "", num(area, 3), num(Math.round(price)), cell(opts.totalLabel ?? "")].join(";"));
  return `﻿${lines.join("\r\n")}\r\n`; // BOM + CRLF, the pair Excel expects
}
