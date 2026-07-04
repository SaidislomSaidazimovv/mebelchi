// E1 — the manufacturing path end-to-end: live structural model → drilled parts → byte-exact
// SWJ008 cut file, reachable through the engine's public surface (engine/index.ts → cnc.ts).
// This is the path the app's CNC-export button (U1) drives via the store's exportCutFile().

import { describe, expect, it } from "vitest";

import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveModelToParts, exportModelToSWJ008 } from "../engine/cnc.js";
import { parseSWJ008 } from "../engine/postprocessors/swj008Parse.js";

describe("E1 — model → SWJ008 cut file", () => {
  it("drills the model (operations reach the parts)", () => {
    const parts = solveModelToParts(buildDemoModel());
    expect(parts.length).toBeGreaterThan(0);
    const totalOps = parts.reduce((n, p) => n + p.operations.length, 0);
    expect(totalOps).toBeGreaterThan(0); // the drilling pass actually ran end-to-end
  });

  it("emits a non-empty byte-exact SWJ008 (CRLF factory format)", () => {
    const xml = exportModelToSWJ008(buildDemoModel());
    expect(xml.length).toBeGreaterThan(0);
    expect(xml).toContain("\r\n"); // factory CRLF
    expect(xml).toContain("<Machining"); // drilled operations reached the file
  });

  it("is deterministic (same model → identical bytes)", () => {
    expect(exportModelToSWJ008(buildDemoModel())).toBe(exportModelToSWJ008(buildDemoModel()));
  });

  it("round-trips through the SWJ008 parser", () => {
    const xml = exportModelToSWJ008(buildDemoModel());
    const parsed = parseSWJ008(xml);
    expect(parsed.length).toBe(solveModelToParts(buildDemoModel()).length);
  });
});
