// Proof: shelfPinPattern vs the real ORTA_BAK Ø5 face holes (ground truth).
// 15_PRIMITIVES_STEP2.md — the leap from fidelity to generation.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseSWJ008 } from "../../engine/index.js";
import { shelfPinPattern } from "../../engine/primitives/shelfPinPattern.js";
import { loadHardwareSpec } from "../../engine/catalogs/hardwareSpec.js";
import type { Panel } from "../../engine/primitives/types.js";
import { canonOps, fieldDiffs, proof } from "./_helpers.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(HERE, "..", "golden", "xml", "ORTA_BAK_6_1.XML"), "utf8");
const realPanel = parseSWJ008(xml)[0]!;

const spec = loadHardwareSpec();
const pin = spec.shelfPins.DUMMY_PIN_5!;
const verified = pin.verified && spec.system32.verified;

const panel: Panel = {
  id: realPanel.id,
  width_mm10: realPanel.width_mm10,
  length_mm10: realPanel.length_mm10,
  thickness_mm10: realPanel.thickness_mm10,
};

// Ground-truth subset: Ø5 (=50 mm10) holes on Face A.
const realPins = canonOps(
  realPanel.operations.filter(
    (o) => o.op === "drill" && o.face === "A" && o.diameter_mm10 === 50,
  ),
);
// Shelf X positions are an INPUT (the designer's choice); read them from the real panel.
const shelfPositionsX = [...new Set(realPins.map((o) => o.x))];

const generated = canonOps(
  shelfPinPattern(panel, shelfPositionsX, { pin, system32: spec.system32 }),
);

describe("shelfPinPattern", () => {
  it("uses factory-confirmed diameter (Ø5) and depth (11mm) from spec — no literals", () => {
    // These two fields are already confirmed against the factory files.
    for (const op of generated) {
      expect(op.dia).toBe(50);
      expect(op.depth).toBe(110);
    }
  });

  it("emits a front + back row per shelf position on Face A", () => {
    expect(generated).toHaveLength(shelfPositionsX.length * 2);
    expect(generated.every((o) => o.face === "A")).toBe(true);
  });

  // UNVERIFIED SPEC: system32 front/back row setbacks (dummy 37mm vs factory ~91.5mm).
  proof("generated Ø5 pattern matches real ORTA_BAK", verified, () => {
    expect(generated).toEqual(realPins);
  });

  it("[checklist] reports the unverified field diffs", () => {
    if (!verified) {
      // eslint-disable-next-line no-console
      console.log("shelfPinPattern UNVERIFIED diffs:\n  " + fieldDiffs(generated, realPins).join("\n  "));
    }
    expect(true).toBe(true);
  });
});
