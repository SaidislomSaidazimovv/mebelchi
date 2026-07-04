// W1 — Cell Cabinet → karkas StructuralModel converter (built up test-first, C.1 …).
import { describe, it, expect } from "vitest";
import { cellToStructural, cabDepthMm, cellPlan, cellToKarkasBlock } from "../apps/app/src/three/cellToKarkas.js";
import { mk } from "../apps/app/src/model/cabinet.js";
import { DEFAULT_PLAN, planThickness } from "../apps/app/src/three/materials.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008, solveModelToParts } from "../engine/cnc.js";

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

describe("C.8 — material plan from finish colours", () => {
  it("maps facade/carcass finish colours to the nearest board decors by role", () => {
    const graphite = 0x4a4d52; // exactly ЛДСП Графит
    const white = 0xf4f2ec; // exactly ЛДСП Белый
    const plan = cellPlan(mk({ finish: { carcass: graphite, facade: white } }));
    expect(plan.carcass).toBe("ldsp_graphite");
    expect(plan.facade).toBe("ldsp_white");
    expect(plan.shelf).toBe("ldsp_graphite"); // shelf follows carcass
    expect(plan.back).toBe(DEFAULT_PLAN.back); // back keeps default
  });

  it("no finish → the default plan", () => {
    const plan = cellPlan(mk({}));
    expect(plan.facade).toBe(DEFAULT_PLAN.facade);
  });

  it("cellToKarkasBlock returns model + plan together", () => {
    const { model, plan } = cellToKarkasBlock(mk({ fill: "shelves", count: 1, finish: { carcass: 0x4a4d52 } }));
    expect(model.blocks.length).toBe(1);
    expect(plan.carcass).toBe("ldsp_graphite");
  });
});

describe("C.7 / C.9a — edge cases convert without crashing (base preserved)", () => {
  it("combinedDoors + corner + appliance produce a valid model", () => {
    expect(() => solveStructure(cellToStructural(mk({ combinedDoors: [{ fx0: 0, fy0: 0, fx1: 1, fy1: 1 }] })))).not.toThrow();
    expect(() => solveStructure(cellToStructural(mk({ corner: true })))).not.toThrow();
    expect(() => solveStructure(cellToStructural(mk({ appliance: "fridge" })))).not.toThrow();
    // a corner still yields a sized carcass box
    expect(cellToStructural(mk({ corner: true, w: 900, h: 720 })).blocks[0]!.box.w).toBe(9000);
  });
});

describe("C.9b — load a converted module into the editor", () => {
  it("openWith(model, plan) shows the converted interior, not a blank box", async () => {
    const { useKarkas } = await import("../apps/app/src/three/karkasStore.js");
    const { model, plan } = cellToKarkasBlock(mk({ fill: "drawers", count: 3, finish: { carcass: 0x4a4d52 } }));
    useKarkas.getState().openWith(model, plan);
    const s = useKarkas.getState();
    expect(s.parts.filter((p) => p.name.startsWith("Ящик · фасад")).length).toBe(3); // real interior
    expect(s.plan.carcass).toBe("ldsp_graphite"); // converted plan applied
    expect(s.open).toBe(true);
  });
});

describe("audit B1 — row (y-axis) dividers are horizontal, not full-height verticals", () => {
  it("a 3-drawer stack → 2 dividers sized by WIDTH (5680), not HEIGHT (6880)", () => {
    // convertNode emits y-lines for a drawer stack; the engine used to render/machine every
    // Line as a vertical (x) divider → full-height panels cutting through the drawers. Regression
    // lock for the axis-aware fix in layout.dividerPlacement + solve.dividerPart.
    const divs = solveStructure(cellToStructural(mk({ fill: "drawers", count: 3, w: 600, h: 720 }))).filter((p) => p.name === "Перегородка");
    expect(divs.length).toBe(2);
    for (const d of divs) {
      expect(d.length_mm10).toBe(5680); // interior width 600 − 2·16, NOT the 6880 full height
    }
  });

  it("an open 2-shelf unit → horizontal dividers too (no phantom vertical panels)", () => {
    const divs = solveStructure(cellToStructural(mk({ fill: "open", count: 2, w: 800, h: 720 }))).filter((p) => p.name === "Перегородка");
    expect(divs.length).toBe(2);
    for (const d of divs) expect(d.length_mm10).toBe(7680); // 800 − 2·16, spanning the width
  });
});

describe("audit B — door hinge side reaches the drilling (right-hung ≠ left-hung)", () => {
  const facadeDrillYs = (opening: "left" | "right") => {
    const parts = solveModelToParts(cellToStructural(mk({ fill: "shelves", count: 1, door: 0, opening, w: 600, h: 720 })));
    const f = parts.find((p) => p.role === "facade")!;
    return [...new Set(f.operations.filter((o) => o.op === "drill").map((o) => o.y_mm10))].sort((a, b) => a - b);
  };
  it("opening:left drills hinge cups on the y0 edge; opening:right mirrors to yMax", () => {
    const left = facadeDrillYs("left");
    const right = facadeDrillYs("right");
    expect(Math.min(...left)).toBeLessThan(1000); // left cups hug y0 (≈215)
    expect(Math.max(...right)).toBeGreaterThan(5000); // right cups hug yMax (width 6000 → ≈5785)
    expect(left).not.toEqual(right); // the two doors are genuinely drilled differently
  });
});

describe("W4 — full chain: convert an existing module → edit → CNC export", () => {
  it("a kitchen module converts, edits in the store, and exports a valid SWJ008", async () => {
    const { useKarkas } = await import("../apps/app/src/three/karkasStore.js");
    // an existing kitchen module: door + 2 shelves, graphite carcass
    const { model, plan } = cellToKarkasBlock(mk({ fill: "shelves", count: 2, finish: { carcass: 0x4a4d52 } }));
    useKarkas.getState().openWith(model, plan);
    expect(useKarkas.getState().parts.filter((p) => p.role === "internal_shelf").length).toBe(2);
    // usta edits: add one more shelf into the (only) section
    const secId = useKarkas.getState().sections.at(-1)!.id;
    useKarkas.getState().setTarget(secId);
    useKarkas.getState().add("shelf");
    expect(useKarkas.getState().parts.filter((p) => p.role === "internal_shelf").length).toBe(3);
    // the edited model still exports clean CNC (SWJ008 with part rows)
    const xml = exportModelToSWJ008(useKarkas.getState().model, planThickness(plan));
    expect(xml).toContain("SWJ008");
    expect(xml.match(/<Panel\b/g)?.length ?? 0).toBeGreaterThan(5); // carcass + shelves + door
  });
});
