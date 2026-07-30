import { describe, it, expect } from "vitest";
import { nest, DEFAULT_NEST, type NestPart, type PlacedPart } from "../apps/app/src/three/nesting";

const mk = (id: string, l: number, w: number, material = "ЛДСП 16", grainLock = false): NestPart => ({ id, label: `${l}×${w}`, l_mm: l, w_mm: w, material, grainLock });

function overlaps(a: PlacedPart, b: PlacedPart): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

const carcass = (): NestPart[] => [
  mk("s1", 720, 560), mk("s2", 720, 560), mk("top", 568, 560), mk("bot", 568, 560),
  mk("back", 600, 720, "ХДФ 3"), mk("door", 720, 600, "МДФ 18"), mk("sh1", 568, 560), mk("sh2", 568, 560),
];

describe("nest", () => {
  it("places every part that fits the sheet", () => {
    const parts = carcass();
    const r = nest(parts);
    expect(r.totals.parts).toBe(parts.length);
  });

  it("never overlaps two parts on the same sheet", () => {
    const r = nest([...carcass(), ...carcass(), ...carcass()]);
    for (const m of r.perMaterial) {
      for (const s of m.sheets) {
        for (let i = 0; i < s.parts.length; i++) {
          for (let j = i + 1; j < s.parts.length; j++) {
            const a = s.parts[i];
            const b = s.parts[j];
            if (a && b) expect(overlaps(a, b)).toBe(false);
          }
        }
      }
    }
  });

  it("keeps every part inside the trimmed sheet bounds", () => {
    const c = DEFAULT_NEST;
    const r = nest([...carcass(), ...carcass()]);
    for (const m of r.perMaterial) {
      for (const s of m.sheets) {
        for (const p of s.parts) {
          expect(p.x >= c.trim - 0.001).toBe(true);
          expect(p.y >= c.trim - 0.001).toBe(true);
          expect(p.x + p.w <= c.sheetL - c.trim + 0.001).toBe(true);
          expect(p.y + p.h <= c.sheetW - c.trim + 0.001).toBe(true);
        }
      }
    }
  });

  it("groups by material — one MaterialNest per distinct material", () => {
    const r = nest(carcass());
    expect(new Set(r.perMaterial.map((m) => m.material)).size).toBe(3);
  });

  it("never rotates a grain-locked part; rotates a free part whose width exceeds its length", () => {
    const r = nest([mk("g", 400, 600, "ЛДСП 16", true), mk("f", 400, 600, "ЛДСП 16", false)]);
    const all = r.perMaterial.flatMap((m) => m.sheets.flatMap((s) => s.parts));
    expect(all.find((p) => p.id === "g")?.rot).toBe(false);
    expect(all.find((p) => p.id === "f")?.rot).toBe(true);
  });

  it("is deterministic", () => {
    const parts = [...carcass(), ...carcass()];
    expect(JSON.stringify(nest(parts))).toBe(JSON.stringify(nest(parts)));
  });

  it("reports waste between 0 and 100 percent and a positive cut length", () => {
    const r = nest([...carcass(), ...carcass()]);
    expect(r.totals.wastePct >= 0 && r.totals.wastePct <= 100).toBe(true);
    expect(r.totals.cutLenM > 0).toBe(true);
  });

  it("fits a handful of small parts on a single sheet per material", () => {
    const r = nest([mk("a", 300, 200), mk("b", 300, 200), mk("c", 300, 200)]);
    expect(r.totals.sheets).toBe(1);
  });

  it("uses more than one sheet when parts exceed one sheet area", () => {
    const big = Array.from({ length: 12 }, (_, i) => mk(`b${i}`, 2600, 850));
    const r = nest(big);
    expect(r.totals.sheets).toBeGreaterThan(1);
  });
});
