// M4.1 — non-box primitives: a free part can be drawn as a cylinder (a round leg, or the hanging RAIL
// every wardrobe needs), a sphere, a tube or a wedge. The shape is RENDER-ONLY, exactly like rotY_deg:
// it rides FreePart → PanelPlacement → (app) Board → geometry, and never changes the box, so anchors,
// moving and resizing are untouched. Absent (or an explicit "box") = the flat board of before.

import { describe, it, expect } from "vitest";

import { solveLayout } from "../engine/structure/layout.js";
import { solveStructure } from "../engine/structure/solve.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { FreePart, PrimitiveShape, StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);
const envelope = { x: 0, y: 0, z: 0, w: 20000, h: 20000, d: 20000 };

/** A bare block whose whole body is one free part — the M4 primitive under test. */
function model(shape?: PrimitiveShape): StructuralModel {
  const fp: FreePart = {
    id: "p", name: "Qism", role: "leg", thicknessAxis: "x",
    box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 },
    ...(shape ? { shape } : {}),
  };
  return {
    id: "t", name: "nonbox",
    blocks: [{
      id: "b", name: "B", box: envelope, bare: true,
      zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box: { ...envelope }, dividers: [], children: [], instanceIds: [], purpose: null } }],
      components: [], instances: [], lines: [], rows: [], freeParts: [fp],
    }],
    parts: [],
  };
}
const placement = (shape?: PrimitiveShape) => solveLayout(model(shape), tk).find((p) => p.id.endsWith("__free_p"))!;

describe("M4.1 — the shape rides through to the placement", () => {
  it("every primitive reaches the placement unchanged", () => {
    for (const s of ["cylinder", "sphere", "tube", "wedge"] as const) {
      expect(placement(s).shape, s).toBe(s);
    }
  });

  it("the placement BOX is identical whatever the shape (render-only)", () => {
    const box = (p: { x_mm10: number; y_mm10: number; z_mm10: number; w_mm10: number; h_mm10: number; d_mm10: number }) =>
      [p.x_mm10, p.y_mm10, p.z_mm10, p.w_mm10, p.h_mm10, p.d_mm10];
    const flat = box(placement());
    for (const s of ["cylinder", "sphere", "tube", "wedge"] as const) expect(box(placement(s)), s).toEqual(flat);
  });
});

describe("M4.1 — absent / box shape is byte-identical", () => {
  it("no shape → the placement carries no shape marker", () => {
    expect(placement().shape).toBeUndefined();
  });

  it("an explicit \"box\" also carries no marker (a flat board, as before)", () => {
    expect(placement("box").shape).toBeUndefined();
  });

  it("the whole placement is identical between absent and \"box\"", () => {
    expect(placement("box")).toEqual(placement());
  });
});

// ── M4.2 — a non-box part is NOT a sheet panel: out of the cut list, the CNC file and the m² price ──

/** A normal 600×720×560 cabinet PLUS one cylinder free part (a round leg / hanging rail). */
function cabinetWithCylinder(shape?: PrimitiveShape): StructuralModel {
  const m = buildCarcassModel(600, 720, 560);
  const b = m.blocks[0]!;
  const leg: FreePart = {
    id: "leg", name: "Yumaloq oyoq", role: "leg", thicknessAxis: "x",
    box: { x: 0, y: 0, z: 0, w: 500, h: 7000, d: 500 },
    ...(shape ? { shape } : {}),
  };
  return { ...m, blocks: [{ ...b, freeParts: [leg] }] };
}
const CYL_ID = "blk_main__free_leg";

describe("M4.2 — the cut list, the CNC file and the price leave a non-box part out", () => {
  it("the solved part carries the shape tag (so every consumer can filter on it)", () => {
    const p = solveStructure(cabinetWithCylinder("cylinder"), tk).find((x) => x.id === CYL_ID)!;
    expect(p).toBeDefined();
    expect(p.shape).toBe("cylinder");
    // a BOX free part carries no tag at all — byte-identical to before M4
    expect(solveStructure(cabinetWithCylinder(), tk).find((x) => x.id === CYL_ID)!.shape).toBeUndefined();
  });

  it("estimate: the cylinder is in `others`, never in `parts` — and adds no area / edge / price", () => {
    const flat = estimate(solveStructure(cabinetWithCylinder(), tk), DEFAULT_PLAN);
    const round = estimate(solveStructure(cabinetWithCylinder("cylinder"), tk), DEFAULT_PLAN);
    expect(round.parts.some((s) => s.id === CYL_ID)).toBe(false); // out of the panel cut list
    expect(round.others.map((s) => s.id)).toEqual([CYL_ID]); // listed for the usta instead
    expect(round.count).toBe(flat.count - 1); // the panel count drops by exactly that one part
    // the money + sheet totals are the cabinet's alone — the cylinder never inflates them
    expect(round.priceUzs).toBe(estimate(solveStructure(buildCarcassModel(600, 720, 560), tk), DEFAULT_PLAN).priceUzs);
    expect(round.others[0]!.areaM2).toBe(0);
    expect(round.others[0]!.edgeM).toBe(0);
    expect(round.others[0]!.priceUzs).toBe(0);
  });

  it("the panels themselves are NEVER lost by the filter (the dangerous failure mode)", () => {
    const round = estimate(solveStructure(cabinetWithCylinder("cylinder"), tk), DEFAULT_PLAN);
    const cabinetOnly = estimate(solveStructure(buildCarcassModel(600, 720, 560), tk), DEFAULT_PLAN);
    expect(round.parts.map((s) => s.id).sort()).toEqual(cabinetOnly.parts.map((s) => s.id).sort()); // all 5 carcass panels survive
  });

  it("the CNC file (SWJ008) contains the carcass panels but not the cylinder", () => {
    const text = exportModelToSWJ008(cabinetWithCylinder("cylinder"));
    expect(text).toContain("blk_main__side_l"); // a real panel is still exported
    expect(text).not.toContain(CYL_ID); // the cylinder never reaches the router
    // …and a BOX free part IS exported, as before
    expect(exportModelToSWJ008(cabinetWithCylinder())).toContain(CYL_ID);
  });

  it("drilling: a non-box part gets no holes at all", () => {
    const p = solveModelToParts(cabinetWithCylinder("cylinder")).find((x) => x.id === CYL_ID)!;
    expect(p.operations).toEqual([]);
  });
});

// ── M4.3 — the palette + the shape switch ──────────────────────────────────────────────────────────

const lastFree = () => useKarkas.getState().model.blocks[0]!.freeParts!.at(-1)!;

describe("M4.3 — adding a primitive from the palette", () => {
  it("the hanging RAIL comes out as a cylinder lying along the opening", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().addFreeBoard("rail");
    const f = lastFree();
    expect(f.shape).toBe("cylinder");
    expect(f.box.w).toBeGreaterThan(f.box.h); // long in X → the renderer lays the cylinder down
    expect(f.box.w).toBeGreaterThan(f.box.d);
    expect(f.edgeBands).toEqual([0, 0, 0, 0]); // a round bar takes no edge banding
  });

  it("a round LEG comes out as a standing cylinder", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().addFreeBoard("cylinder");
    const f = lastFree();
    expect(f.shape).toBe("cylinder");
    expect(f.box.h).toBeGreaterThan(f.box.w); // tall → the cylinder stands up
  });

  it("sphere / tube / wedge each carry their own shape", () => {
    for (const [kind, shape] of [["sphere", "sphere"], ["tube", "tube"], ["wedge", "wedge"]] as const) {
      useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
      useKarkas.getState().addFreeBoard(kind);
      expect(lastFree().shape, kind).toBe(shape);
    }
  });

  it("the plain board / panel / post / box primitives stay flat (no shape)", () => {
    for (const kind of ["board", "panel", "post", "box"] as const) {
      useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
      useKarkas.getState().addFreeBoard(kind);
      expect(lastFree().shape, kind).toBeUndefined();
    }
  });
});

describe("M4.3 — setFreeBoardShape", () => {
  it("switches a flat board into a primitive, and back to a cuttable panel", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().addFreeBoard("post");
    const id = lastFree().id;
    const partId = `blk_main__free_${id}`;

    useKarkas.getState().setFreeBoardShape(id, "cylinder");
    expect(lastFree().shape).toBe("cylinder");
    // …and it leaves the panel cut list for «Boshqa qismlar»
    let e = estimate(useKarkas.getState().parts, DEFAULT_PLAN);
    expect(e.parts.some((s) => s.id === partId)).toBe(false);
    expect(e.others.some((s) => s.id === partId)).toBe(true);

    useKarkas.getState().setFreeBoardShape(id, "box");
    expect(lastFree().shape).toBeUndefined(); // the field is dropped entirely — byte-identical again
    e = estimate(useKarkas.getState().parts, DEFAULT_PLAN);
    expect(e.parts.some((s) => s.id === partId)).toBe(true); // back in the cut list
    expect(e.others).toEqual([]);
  });

  it("is undoable", () => {
    useKarkas.getState().setModel(buildCarcassModel(600, 720, 560));
    useKarkas.getState().addFreeBoard("post");
    const id = lastFree().id;
    useKarkas.getState().setFreeBoardShape(id, "sphere");
    expect(lastFree().shape).toBe("sphere");
    useKarkas.getState().undo();
    expect(lastFree().shape).toBeUndefined();
  });
});
