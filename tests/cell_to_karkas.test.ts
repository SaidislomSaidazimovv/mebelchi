// W1 — Cell Cabinet → karkas StructuralModel converter (built up test-first, C.1 …).
import { describe, it, expect } from "vitest";
import { cellToStructural, cabDepthMm } from "../apps/app/src/three/cellToKarkas.js";
import { mk } from "../apps/app/src/model/cabinet.js";
import { solveStructure } from "../engine/structure/solve.js";

describe("C.1 — sized carcass box", () => {
  it("converts w × h × (kind-default depth) to the block box (mm → mm10)", () => {
    const m = cellToStructural(mk({ w: 800, h: 2000, kind: "base" }));
    expect(m.blocks[0]!.box).toMatchObject({ w: 8000, h: 20000, d: 5600 });
  });

  it("an upper module defaults to 350mm depth; an explicit depth wins", () => {
    expect(cabDepthMm({ kind: "upper" })).toBe(350);
    expect(cellToStructural(mk({ kind: "upper", w: 600, h: 720 })).blocks[0]!.box.d).toBe(3500);
    expect(cellToStructural(mk({ kind: "base", w: 600, h: 720, depth: 500 })).blocks[0]!.box.d).toBe(5000);
  });

  it("solves to a bare carcass (5 panels) before the interior is added", () => {
    expect(solveStructure(cellToStructural(mk({ fill: "open", count: 0, w: 600, h: 720 }))).length).toBe(5);
  });
});

describe("C.2/C.4/C.5/C.6 — interior (shelves / drawers / open / recursive layout)", () => {
  const parts = (cab: ReturnType<typeof mk>) => solveStructure(cellToStructural(cab));

  it("fill=shelves + count → N internal shelves + a door", () => {
    const p = parts(mk({ fill: "shelves", count: 2 }));
    expect(p.filter((x) => x.role === "internal_shelf").length).toBe(2);
    expect(p.some((x) => x.role === "facade")).toBe(true);
  });

  it("fill=drawers + count → N drawer boxes", () => {
    const p = parts(mk({ fill: "drawers", count: 3 }));
    expect(p.filter((x) => x.name.startsWith("Ящик · фасад")).length).toBe(3);
  });

  it("fill=open → empty carcass (no fronts / shelves)", () => {
    const p = parts(mk({ fill: "open", count: 0 }));
    expect(p.some((x) => x.role === "facade" || x.role === "internal_shelf")).toBe(false);
  });

  it("recursive layout (cols: door | drawer) → a door column + a drawer column", () => {
    const cab = mk({ layout: { split: "cols", sizes: [0.6, 0.4], children: [{ front: "door" }, { front: "drawer" }] } });
    const p = parts(cab);
    expect(p.some((x) => x.role === "facade")).toBe(true);
    expect(p.some((x) => x.name.startsWith("Ящик · фасад"))).toBe(true);
  });

  it("glass door (cab.door=Стекло=2) → a glazed facade component", () => {
    const m = cellToStructural(mk({ fill: "shelves", count: 1, door: 2 }));
    expect(m.blocks[0]!.components.some((c) => c.role === "facade" && c.glazed === true)).toBe(true);
  });

  it("C.3 — custom shelfYs place shelves at the exact heights (not even)", () => {
    const m = cellToStructural(mk({ fill: "shelves", count: 2, h: 720, shelfYs: [0.25, 0.75] }));
    const b = m.blocks[0]!;
    const ys = b.instances
      .filter((i) => b.components.find((c) => c.id === i.componentId)?.role === "internal_shelf")
      .map((i) => i.anchor.y)
      .sort((a, c) => a - c);
    expect(ys).toEqual([1800, 5400]); // 0.25·7200, 0.75·7200 (mm10)
  });
});
