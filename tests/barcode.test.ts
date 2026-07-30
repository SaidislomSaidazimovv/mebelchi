import { describe, it, expect } from "vitest";
import { code128 } from "../apps/app/src/model/barcode";

const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function decode(text: string): string {
  const { modules, bars } = code128(text);
  const bits = new Array<boolean>(modules).fill(false);
  for (const b of bars) for (let i = 0; i < b.w; i++) bits[b.x + i] = true;

  const runsAt = (start: number, len: number): string => {
    let out = "";
    let i = start;
    const end = start + len;
    while (i < end) {
      const v = bits[i];
      let w = 0;
      while (i < end && bits[i] === v) {
        w++;
        i++;
      }
      out += String(w);
    }
    return out;
  };

  const symbols = (modules - 2) / 11;
  const codes: number[] = [];
  for (let s = 0; s < symbols; s++) {
    const len = s === symbols - 1 ? 13 : 11;
    codes.push(C128.indexOf(runsAt(s * 11, len)));
  }

  expect(codes[0]).toBe(104);
  expect(codes[codes.length - 1]).toBe(106);

  let sum = 104;
  for (let i = 1; i < codes.length - 2; i++) sum += (codes[i] ?? 0) * i;
  expect(sum % 103).toBe(codes[codes.length - 2]);

  let out = "";
  for (let i = 1; i < codes.length - 2; i++) out += String.fromCharCode((codes[i] ?? 0) + 32);
  return out;
}

describe("code128", () => {
  it("encodes MEBELCHI-01 with the standard module width", () => {
    expect(code128("MEBELCHI-01").modules).toBe(11 * 14 + 2);
  });

  it("round-trips through an independent decoder", () => {
    for (const v of ["MEBELCHI-01", "MEBELCHI-04", "MEBELCHI-99", "A", "0123456789"]) {
      expect(decode(v)).toBe(v);
    }
  });

  it("keeps every bar width in the legal 1..4 module range", () => {
    const { bars } = code128("MEBELCHI-42");
    for (const b of bars) expect(b.w >= 1 && b.w <= 4).toBe(true);
  });
});
