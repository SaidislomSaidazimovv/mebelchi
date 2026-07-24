// M9U.7 — a template's legs taper by default. This is not only a looks change: a turned/tapered leg is
// NOT sawn from a sheet, so by the M4.2 rule it leaves the panel cut list, the m² price and the SWJ008
// file and is listed under «Boshqa qismlar» — which is what the usta actually sources or turns. Passing
// `legShape: "box"` brings the square post (and its sheet cut) back, byte-identical to pre-M9U.7.
import { describe, it, expect } from "vitest";

import { buildTable, buildStool, buildBench, buildChair, buildCoffeeTable, buildBedFrame } from "../engine/structure/demoModel.js";
import { solveStructure } from "../engine/structure/solve.js";
import { exportModelToSWJ008 } from "../engine/cnc.js";
import { estimate } from "../apps/app/src/three/estimate.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";

const tk = planThickness(DEFAULT_PLAN);
const LEGS = ["leg_fl", "leg_fr", "leg_bl", "leg_br"];
const legPartIds = (blockId: string) => LEGS.map((l) => `${blockId}__free_${l}`);
const legsOf = (m: ReturnType<typeof buildTable>) => m.blocks[0]!.freeParts!.filter((f) => f.role === "leg");

describe("M9U.7 — template legs taper by default", () => {
  it("a table's four legs carry the cone shape", () => {
    const legs = legsOf(buildTable(1200, 750, 700));
    expect(legs).toHaveLength(4);
    expect(legs.every((l) => l.shape === "cone")).toBe(true);
  });

  it("every four-leg template tapers — stool, bench, chair, coffee table", () => {
    for (const m of [buildStool(), buildBench(), buildChair(), buildCoffeeTable()]) {
      const legs = legsOf(m);
      expect(legs.length, m.id).toBe(4);
      expect(legs.every((l) => l.shape === "cone"), m.id).toBe(true);
    }
  });

  it("a turned leg leaves the cut list, the m² price and the CNC file — the top does not", () => {
    const m = buildTable(1200, 750, 700);
    const est = estimate(solveStructure(m, tk), DEFAULT_PLAN);
    const cnc = exportModelToSWJ008(m);
    for (const id of legPartIds("tbl")) {
      expect(est.parts.some((p) => p.id === id), `${id} must not be a sawn panel`).toBe(false);
      expect(est.others.some((p) => p.id === id), `${id} belongs under «Boshqa qismlar»`).toBe(true);
      expect(cnc).not.toContain(id); // never reaches the router
    }
    expect(est.parts.some((p) => p.id === "tbl__free_top")).toBe(true); // the top IS still sawn
    for (const o of est.others) { expect(o.areaM2).toBe(0); expect(o.priceUzs).toBe(0); }
  });

  it("legShape:\"box\" restores the square post — the pre-M9U.7 cut list", () => {
    const cone = buildTable(1200, 750, 700);
    const box = buildTable(1200, 750, 700, { legShape: "box" });
    expect(legsOf(box).every((l) => l.shape === undefined)).toBe(true);

    const estBox = estimate(solveStructure(box, tk), DEFAULT_PLAN);
    const estCone = estimate(solveStructure(cone, tk), DEFAULT_PLAN);
    expect(estBox.count).toBe(estCone.count + 4); // the four legs are panels again
    expect(estBox.priceUzs).toBeGreaterThan(estCone.priceUzs); // …and they cost sheet material
    const cnc = exportModelToSWJ008(box);
    for (const id of legPartIds("tbl")) expect(cnc).toContain(id); // back in the router file
  });

  it("the leg BOX is untouched by the shape — only how it is drawn and sourced changes", () => {
    const cone = legsOf(buildTable(1200, 750, 700));
    const box = legsOf(buildTable(1200, 750, 700, { legShape: "box" }));
    expect(cone.map((l) => l.box)).toEqual(box.map((l) => l.box));
  });

  it("a BED's posts stay square — a bed post is squared timber, not a turned leg", () => {
    const posts = buildBedFrame().blocks[0]!.freeParts!.filter((f) => f.role === "leg");
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.shape === undefined)).toBe(true);
  });
});
