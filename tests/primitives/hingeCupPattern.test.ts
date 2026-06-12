// Proof: hingeCupPattern vs the real factory door SHKOF ORTA CHAP ESHIK_7_1
// (golden fixture from the 2026-06-12 dump). Ground truth at last — this was the
// missing doc-15 verification; the spec is verified, so the proof is a hard gate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseSWJ008 } from "../../engine/index.js";
import { hingeCupPattern } from "../../engine/primitives/hingeCupPattern.js";
import { loadHardwareSpec } from "../../engine/catalogs/hardwareSpec.js";
import type { Panel } from "../../engine/primitives/types.js";
import { canonOps, proof } from "./_helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(HERE, "..", "golden", "xml", "SHKOF_ORTA_CHAP_ESHIK_7_1.XML"), "utf8");
const realPanel = parseSWJ008(xml)[0]!;

const spec = loadHardwareSpec();
const hinge = spec.hinges.DUMMY_CUP_110!;

const door: Panel = {
  id: realPanel.id,
  width_mm10: realPanel.width_mm10,
  length_mm10: realPanel.length_mm10,
  thickness_mm10: realPanel.thickness_mm10,
};

// Ground-truth subset: the hinge pattern = Ø35 cups + Ø3 marking pricks.
// (The door also carries 3× Ø7×17 confirmat bores — a different joint.)
const realCups = realPanel.operations.filter(
  (o) => o.op === "drill" && o.diameter_mm10 === 350,
);
const realHingeOps = canonOps(
  realPanel.operations.filter(
    (o) => o.op === "drill" && (o.diameter_mm10 === 350 || o.diameter_mm10 === 30),
  ),
);

// Hinge positions are an INPUT (the spacing rule is Layer-2): read cup X's from
// the real file. The hinge edge follows from cup Y (21.5 → the Y=0 edge).
const positionsX = realCups.map((o) => (o.op === "drill" ? o.x_mm10 : 0)).sort((a, b) => a - b);

const generated = canonOps(hingeCupPattern(door, "y0", positionsX, hinge));

describe("hingeCupPattern — proven against the factory door", () => {
  it("the spec is verified by a real export (doc-15 flow complete for the hinge)", () => {
    expect(hinge.verified).toBe(true);
    expect(hinge.grade).toBe("manufacturing");
    expect(hinge.source).toContain("SHKOF ORTA CHAP ESHIK_7_1");
  });

  proof("generated cup+mark pattern matches the real door exactly", hinge.verified, () => {
    expect(generated).toEqual(realHingeOps);
  });

  it("emits 1 cup + 2 marks per hinge, all on Face A (Face 5 in the file)", () => {
    expect(realCups).toHaveLength(4);
    expect(generated).toHaveLength(4 * (1 + hinge.satelliteMarks.count));
    expect(generated.every((o) => o.face === "A")).toBe(true);
  });

  it("proven numbers: cup Ø35×13 at 21.5mm; marks Ø3×1 at ±26 along, +5.5 beyond", () => {
    const cup = generated.find((o) => o.dia === 350)!;
    expect(cup.depth).toBe(130);
    expect(cup.y).toBe(215);
    const marks = generated.filter((o) => o.dia === 30);
    expect(marks.every((m) => m.y === 215 + 55)).toBe(true);
    expect(marks.every((m) => m.depth === 10)).toBe(true);
    const first = positionsX[0]!;
    expect(marks.some((m) => m.x === first - 260)).toBe(true);
    expect(marks.some((m) => m.x === first + 260)).toBe(true);
  });

  it("yMax edge mirrors the pattern (cups at Width − 21.5, marks toward interior)", () => {
    const mirrored = hingeCupPattern(door, "yMax", [positionsX[0]!], hinge);
    const cup = mirrored.find((o) => o.diameter_mm10 === 350)!;
    const mark = mirrored.find((o) => o.diameter_mm10 === 30)!;
    expect(cup.y_mm10).toBe(door.width_mm10 - 215);
    expect(mark.y_mm10).toBe(door.width_mm10 - 215 - 55);
  });

  // Open question from the dump: the 4 prop-0 SHK ESHIK doors carry cups with NO
  // satellite marks (16 cups, zero Ø3). Different SKU or operator setting? Ask
  // the constructor before generalizing the mark emission.
  it.todo("no-marks door variant (prop-0 SHK ESHIK) — clarify SKU/setting with constructor");
});
