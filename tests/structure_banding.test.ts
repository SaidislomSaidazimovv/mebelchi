// S3-E5 — edge-banding (front edge). Slice 1 (corrected).
//
// GROUNDING: factory golden files band a visible edge at Thickness="1.000" (e.g. POLKA-1), and
// the SWJ008 face map — derived from real edge-drill coordinates (Face1 drills at Y=Width, e.g.
// POL_3_1.XML) — is Face1=top(Y-max) / Face2=bottom(Y=0) / Face3=right(X-max) / Face4=left(X=0).
// Every panel solveStructure emits has Width = depth, so its room-facing FRONT edge is Face 1
// (= edges[0]). Value 1.0mm = the field-confirmed visible default (Researches/-R7F_3). Back
// panels are hidden → not banded. L8: the band must be EMITTED in the cut output, not implied.

import { describe, expect, it } from "vitest";

import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveStructure, EDGE_BAND_MM10 } from "../engine/structure/solve.js";
import { exportSWJ008 } from "../engine/index.js";

describe("S3-E5 edge-banding (front edge = Face 1)", () => {
  it("bands the front edge (Face 1 = edges[0]) at 1.0mm on every visible panel", () => {
    const visible = solveStructure(buildDemoModel()).filter((p) => !p.id.endsWith("__back"));
    expect(visible.length).toBeGreaterThan(0);
    for (const p of visible) {
      expect(p.edges).toEqual([EDGE_BAND_MM10, 0, 0, 0]);
    }
  });

  it("leaves the back panel bare (hidden — not banded)", () => {
    const backs = solveStructure(buildDemoModel()).filter((p) => p.id.endsWith("__back"));
    expect(backs.length).toBeGreaterThan(0);
    for (const b of backs) {
      expect(b.edges).toEqual([0, 0, 0, 0]);
    }
  });

  it("emits the band into SWJ008 on Face 1 (L8 — present in the cut output, not implied)", () => {
    const parts = solveStructure(buildDemoModel());
    const xml = exportSWJ008({ id: "demo", name: "demo", parts });
    expect(xml).toContain('<Edge Face="1" Thickness="1.000" />');
  });
});
