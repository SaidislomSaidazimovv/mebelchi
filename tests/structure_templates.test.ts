// M1.1 — the free-assembly TEMPLATE LIBRARY (stool / chair / bench / coffee table / console / bookshelf /
// pedestal / bed frame). Each template is a BARE block (no carcass) whose whole body is `freeParts` placed
// by the "table law" (per-axis lo/hi anchors), so it reflows on a block resize just like buildTable. These
// tests pin: (1) each template's shape (bare + free-part count + every board a valid cut panel), (2) the
// reflow (a resize spans the top and holds the legs at the corners), (3) solve == layout (a board is cut
// where it is placed), (4) that adding templates is byte-additive (buildTable + the carcass are untouched).

import { describe, it, expect } from "vitest";

import {
  buildTable,
  buildStool,
  buildBench,
  buildChair,
  buildCoffeeTable,
  buildConsole,
  buildBookshelf,
  buildPedestal,
  buildBedFrame,
  buildCarcassModel,
} from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveLayout } from "../engine/structure/layout.js";
import { resizeBlockWidth, resizeBlockHeight } from "../engine/structure/operations.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const sort3 = (a: number, b: number, c: number) => [a, b, c].sort((x, y) => x - y);

/** Every template + its expected free-part count (top/legs/shelves/rails/slats). */
const TEMPLATES: Array<{ name: string; make: () => StructuralModel; freeParts: number }> = [
  { name: "table", make: () => buildTable(1200, 750, 700), freeParts: 5 },
  { name: "stool", make: () => buildStool(), freeParts: 5 },
  { name: "bench", make: () => buildBench(), freeParts: 5 },
  { name: "chair", make: () => buildChair(), freeParts: 6 },
  { name: "coffee", make: () => buildCoffeeTable(), freeParts: 6 },
  { name: "console", make: () => buildConsole(), freeParts: 5 },
  { name: "bookshelf", make: () => buildBookshelf(), freeParts: 8 }, // 4 shell + 4 shelves (default)
  { name: "pedestal", make: () => buildPedestal(), freeParts: 6 },
  { name: "bed", make: () => buildBedFrame(), freeParts: 16 }, // 4 posts + 4 rails + 8 slats
];

describe("M1.1 — every template is a valid bare free-part model", () => {
  for (const t of TEMPLATES) {
    it(`${t.name}: bare block, ${t.freeParts} free parts, each a valid cut panel`, () => {
      const m = t.make();
      expect(m.blocks.length).toBe(1);
      const b = m.blocks[0]!;
      expect(b.bare).toBe(true); // no carcass shell — the whole body is free parts
      expect((b.freeParts ?? []).length).toBe(t.freeParts);
      // one solved part per free part; each board's thickness is its smallest dimension (orderable stock)
      const parts = solveStructure(m, tk);
      expect(parts.length).toBe(t.freeParts);
      for (const p of parts) {
        expect(p.thickness_mm10).toBeLessThanOrEqual(p.length_mm10);
        expect(p.thickness_mm10).toBeLessThanOrEqual(p.width_mm10);
        expect(p.thickness_mm10).toBeGreaterThan(0);
      }
    });

    it(`${t.name}: solve == layout (each board is cut where it is placed)`, () => {
      const m = t.make();
      const places = new Map(solveLayout(m, tk).map((p) => [p.id, p]));
      for (const part of solveStructure(m, tk)) {
        const pl = places.get(part.id)!;
        expect(pl, `placement for ${part.id}`).toBeDefined();
        expect(sort3(part.length_mm10, part.width_mm10, part.thickness_mm10)).toEqual(sort3(pl.w_mm10, pl.h_mm10, pl.d_mm10));
      }
    });
  }
});

describe("M1.1 — thicknessAxis is authored correctly (Risk B)", () => {
  it("a stool seat is thin-in-Y (a flat board); its legs are thin-in-X (square posts)", () => {
    const b = buildStool().blocks[0]!;
    const seat = b.freeParts!.find((f) => f.id === "top")!;
    expect(seat.thicknessAxis).toBe("y");
    expect(seat.box.h).toBeLessThan(seat.box.w); // flat
    for (const leg of b.freeParts!.filter((f) => f.role === "leg")) expect(leg.thicknessAxis).toBe("x");
  });

  it("a chair backrest is a back panel thin-in-Z on the high-Z face", () => {
    const b = buildChair().blocks[0]!;
    const back = b.freeParts!.find((f) => f.id === "back")!;
    expect(back.role).toBe("back");
    expect(back.thicknessAxis).toBe("z");
    expect(back.box.z + back.box.d).toBe(b.box.d); // its outer face IS the block's back
  });

  it("a console side panel is thin-in-X; its shelves are thin-in-Y", () => {
    const b = buildConsole().blocks[0]!;
    expect(b.freeParts!.find((f) => f.id === "side_l")!.thicknessAxis).toBe("x");
    expect(b.freeParts!.find((f) => f.id === "shelf_mid")!.thicknessAxis).toBe("y");
  });
});

describe("M1.1 — the table law: templates reflow on a block resize", () => {
  it("stool: widening the block spans the seat and holds the legs at the corners", () => {
    const m = buildStool(400, 450, 400);
    const wide = resizeBlockWidth(m, "stl", 8000); // 400 → 800 mm
    const fp = (id: string) => wide.blocks[0]!.freeParts!.find((f) => f.id === id)!;
    expect(fp("top").box.w).toBe(8000); // the seat spans the new width
    const legR = fp("leg_fr"); // front-right leg stays a fixed post pinned to the high-X corner
    expect(legR.box.w).toBe(400); // 40 mm leg, unchanged
    expect(legR.box.x + legR.box.w).toBe(8000); // its outer face is the new right edge
  });

  it("chair: raising the block grows the backrest but not the legs (fixed seat height)", () => {
    const m = buildChair(450, 850, 450);
    const legLenBefore = m.blocks[0]!.freeParts!.find((f) => f.id === "leg_fl")!.box.h;
    const taller = resizeBlockHeight(m, "chr", 11000); // 850 → 1100 mm
    const b = taller.blocks[0]!;
    expect(b.freeParts!.find((f) => f.id === "leg_fl")!.box.h).toBe(legLenBefore); // legs unchanged (seat height fixed)
    const back = b.freeParts!.find((f) => f.id === "back")!;
    expect(back.box.y + back.box.h).toBe(11000); // backrest top follows the block top → it grew
  });
});

describe("M1.1 — adding templates is byte-additive", () => {
  it("buildTable is untouched: still a bare block with a top + 4 legs", () => {
    const b = buildTable(1200, 750, 700).blocks[0]!;
    expect(b.bare).toBe(true);
    expect(b.freeParts!.map((f) => f.id)).toEqual(["top", "leg_fl", "leg_fr", "leg_bl", "leg_br"]);
  });

  it("the carcass protective invariant still holds: a plain cabinet is 5 parts", () => {
    expect(solveStructure(buildCarcassModel(600, 720, 560), tk).length).toBe(5);
  });
});
