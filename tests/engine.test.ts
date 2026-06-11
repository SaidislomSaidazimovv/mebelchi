// The Golden Cabinet Suite (14_RUNTIME_AND_BUILD.md Part 3).
// Four fixtures, each diffed against the real factory SWJ008 on every commit.
// Comparison is SEMANTIC: parse export -> canonical form -> deep-equal the canonical
// of the real file. Byte-for-byte is used only once, as the Fixture 0 format spike.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canonicalizeParts,
  exportSWJ008,
  parseSWJ008,
  solveFull,
  solvePreview,
  solveAndExportSWJ008,
  type Project,
} from "../engine/index.js";

import { fixture0 } from "./fixtures/fixture0.polka.js";
import { fixture1 } from "./fixtures/fixture1.yonbak1.js";
import { fixture2 } from "./fixtures/fixture2.pol.js";
import { fixture3 } from "./fixtures/fixture3.ortabak.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const xml = (file: string) => readFileSync(join(HERE, "golden", "xml", file), "utf8");

interface Fixture {
  label: string;
  project: Project;
  goldenXmlFile: string;
}

const SUITE: Fixture[] = [
  { label: "Fixture 0 — POLKA (shelf, Face-A only)", project: fixture0, goldenXmlFile: "POLKA-1_7_1.XML" },
  { label: "Fixture 1 — YON BAK-1 (left side, edge + face)", project: fixture1, goldenXmlFile: "YON_BAK-1_4_1.XML" },
  { label: "Fixture 2 — POL (bottom, multi-edge through-drills)", project: fixture2, goldenXmlFile: "POL_3_1.XML" },
  { label: "Fixture 3 — ORTA BAK (middle, double-sided A/B)", project: fixture3, goldenXmlFile: "ORTA_BAK_6_1.XML" },
];

describe("Golden Cabinet Suite — semantic SWJ008 comparison", () => {
  for (const { label, project, goldenXmlFile } of SUITE) {
    it(`${label} matches the factory golden`, async () => {
      const golden = canonicalizeParts(parseSWJ008(xml(goldenXmlFile)));

      // Run the real engine boundary, then re-parse its export into canonical form.
      const exported = await solveAndExportSWJ008(project);
      const produced = canonicalizeParts(parseSWJ008(exported));

      expect(produced).toEqual(golden);
    });
  }
});

describe("Fixture 0 — byte-exact format spike (allowed once, against POLKA)", () => {
  it("exportSWJ008(fixture0) reproduces the factory file byte-for-byte", () => {
    expect(exportSWJ008(fixture0)).toBe(xml("POLKA-1_7_1.XML"));
  });
});

describe("solveFull — the safety gate", () => {
  it("passes clean fixtures with no findings", async () => {
    for (const { project } of SUITE) {
      const { validation } = await solveFull(project);
      expect(validation.ok).toBe(true);
      expect(validation.findings).toHaveLength(0);
    }
  });

  it("rejects an operation drilled outside the panel bounds", async () => {
    const bad: Project = structuredClone(fixture0);
    bad.parts[0]!.operations[0]!.x_mm10 = 999_999; // far past Length
    const { validation } = await solveFull(bad);
    expect(validation.ok).toBe(false);
    expect(validation.findings[0]!.code).toBe("MACHINING_OP_OUT_OF_BOUNDS");
    await expect(solveAndExportSWJ008(bad)).rejects.toThrow(/MACHINING_VALIDATION_FAILED/);
  });
});

describe("solvePreview — bounded, no operation coordinates leak", () => {
  it("returns per-face drill zones with counts but no coordinates", () => {
    const preview = solvePreview(fixture3);
    expect(preview.parts).toHaveLength(1);
    const p = preview.parts[0]!;

    // bbox uses Length as width (X extent) and Width as height (Y extent).
    expect(p.bbox.w).toBe(5380);
    expect(p.bbox.h).toBe(5030);

    // Total counts across zones equal the operation count, split by face.
    const total = p.drillZones.reduce((n, z) => n + z.count, 0);
    expect(total).toBe(fixture3.parts[0]!.operations.length);

    // LOD only: a zone exposes a count + a face-sized region, never an (x,y) op.
    for (const zone of p.drillZones) {
      expect(zone).not.toHaveProperty("operations");
      expect(zone.region).toMatchObject({ x: 0, y: 0 });
    }
  });
});
