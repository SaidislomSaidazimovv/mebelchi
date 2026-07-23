// M8.3 — the cut list as a spreadsheet. Third audience after the machine (CNC) and the bench (A4): the
// board supplier, the client's written quote, the books.
//
// A spreadsheet that silently loses a part is worse than no spreadsheet, so these tests are about the
// bytes: every row present, every quantity right, the totals equal to the list, and the three format
// choices that decide whether Excel on a Russian/Uzbek Windows opens it as a table or as one grey column
// of mojibake — BOM, semicolons, comma decimals.

import { describe, it, expect } from "vitest";

import { solveStructure } from "../engine/structure/solve.js";
import { buildBookshelf } from "../engine/structure/demoModel.js";
import { estimate, groupSpecs, type GroupedSpec } from "../apps/app/src/three/estimate.js";
import { specsToCsv, bandsLabel } from "../apps/app/src/three/specCsv.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

const tk = planThickness(DEFAULT_PLAN);
const realRows = () => groupSpecs(estimate(solveStructure(buildBookshelf(), tk), DEFAULT_PLAN).parts);

const row = (o: Partial<GroupedSpec> = {}): GroupedSpec => ({
  id: "p1", ids: ["p1"], qty: 1, name: "Polka", w_mm: 300, l_mm: 560, t_mm: 16,
  areaM2: 0.168, edgeM: 0.56, bands: [true, false, false, false],
  materialName: "ЛДСП Белый", priceUzs: 25200, ...o,
});
const lines = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

describe("M8.3 — the file Excel can actually open", () => {
  it("starts with a UTF-8 BOM, or Cyrillic decor names arrive as mojibake", () => {
    expect(specsToCsv([row()]).startsWith("﻿")).toBe(true);
  });

  it("separates with semicolons and ends lines with CRLF", () => {
    const csv = specsToCsv([row()]);
    expect(csv).toContain(";");
    expect(csv.includes("\r\n")).toBe(true);
  });

  it("writes decimals with a COMMA — the same reason the separator is not one", () => {
    expect(lines(specsToCsv([row({ areaM2: 1.25 })]))[1]).toContain("1,250");
  });

  it("quotes a field that contains the separator, doubling any quote inside", () => {
    const csv = specsToCsv([row({ name: 'Polka; "katta"' })]);
    expect(lines(csv)[1]).toContain('"Polka; ""katta"""');
  });
});

describe("M8.3 — nothing is lost between the list and the file", () => {
  it("one line per row, plus the header and the total", () => {
    const rows = realRows();
    expect(lines(specsToCsv(rows)).length).toBe(rows.length + 2);
  });

  it("the header names the columns the workshop needs, in order", () => {
    expect(lines(specsToCsv([row()]))[0]).toBe("Detal;Soni;Uzunlik (mm);Eni (mm);Qalinlik (mm);Material;Kromka;Yuza (m²);Narx;Izoh");
  });

  it("a row carries its quantity, size, decor and price", () => {
    const cells = lines(specsToCsv([row({ qty: 4, priceUzs: 100800 })]))[1]!.split(";");
    expect(cells[0]).toBe("Polka");
    expect(cells[1]).toBe("4");
    expect(cells[2]).toBe("560");
    expect(cells[3]).toBe("300");
    expect(cells[5]).toBe("ЛДСП Белый");
    expect(cells[8]).toBe("100800");
  });

  it("the usta's note travels with the part", () => {
    expect(lines(specsToCsv([row({ note: "kromka faqat oldi" })]))[1]).toContain("kromka faqat oldi");
  });

  it("the TOTAL line equals the list — the number the usta buys against", () => {
    const rows = realRows();
    const total = lines(specsToCsv(rows)).at(-1)!.split(";");
    expect(total[0]).toBe("JAMI");
    expect(Number(total[1])).toBe(rows.reduce((n, r) => n + r.qty, 0));
    expect(Number(total[8])).toBe(Math.round(rows.reduce((n, r) => n + r.priceUzs, 0)));
  });

  it("an empty list still produces a valid file (header + zero total), never a crash", () => {
    const l = lines(specsToCsv([]));
    expect(l.length).toBe(2);
    expect(l[1]!.startsWith("JAMI;0")).toBe(true);
  });
});

describe("M8.3 — the banding column says what the edge-bander must do", () => {
  it("names the banded edges", () => {
    expect(bandsLabel([true, false, false, false])).toBe("ust");
    expect(bandsLabel([true, true, false, false])).toBe("ust+tag");
  });

  it("says «hammasi» for all four and «yo'q» for none — a bander reads words, not dots", () => {
    expect(bandsLabel([true, true, true, true])).toBe("hammasi");
    expect(bandsLabel([false, false, false, false])).toBe("yo'q");
  });
});
