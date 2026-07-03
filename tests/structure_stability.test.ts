// E7 — L5 stability / load-bearing check (blocker #9). A load-bearing shelf whose unsupported span
// exceeds the grounded 16mm limit (580mm) raises a NON-BLOCKING ⚠; severity escalates to "risk"
// once the estimated deflection passes 3mm. Grounded in 16_JOINT_INTELLIGENCE.md:64 +
// Researches/-r4 UI Further.md §1.1–1.4 (see stability.ts header). NOT part of the export gate.

import { describe, expect, it } from "vitest";

import { checkStability, SPAN_LIMIT_16MM_MM10 } from "../engine/structure/stability.js";
import { setLoadBearing } from "../engine/structure/operations.js";
import type { PanelRole, StructuralModel } from "../engine/contracts/structure.js";

/** One block whose single section is `sectionW` wide, holding one instance of the given role. */
function shelfModel(sectionW: number, role: PanelRole | null = "internal_shelf"): StructuralModel {
  const box = { x: 0, y: 0, z: 0, w: sectionW, h: 7200, d: 5600 };
  return {
    id: "t",
    name: "stab",
    blocks: [
      {
        id: "blk",
        name: "B",
        box,
        zones: [
          {
            id: "z",
            name: "Z",
            rule: "manual",
            root: { id: "sec", box, dividers: [], children: [], instanceIds: ["i1"], purpose: null },
          },
        ],
        components: [{ id: "c", name: "Полка", partIds: [], role }],
        instances: [{ id: "i1", componentId: "c", sectionId: "sec", anchor: { x: 0, y: 3600, z: 0 }, link: "linked" }],
        lines: [],
        rows: [],
      },
    ],
    parts: [],
  };
}

describe("E7 — stability check (blocker #9, L5 non-blocking)", () => {
  it("flags a load-bearing shelf whose span exceeds the 16mm limit (580mm)", () => {
    const f = checkStability(shelfModel(7000)); // 700mm span
    expect(f).toHaveLength(1);
    expect(f[0]!.span_mm10).toBe(7000);
    expect(f[0]!.limit_mm10).toBe(SPAN_LIMIT_16MM_MM10);
    expect(f[0]!.level).toBe("warn"); // δ ≈ 1.5mm at 700mm → warn, not risk
    expect(f[0]!.deflection_mm).toBeGreaterThan(0);
    expect(f[0]!.message_ru).toContain("700"); // span in mm surfaced to the user
  });

  it("does NOT flag a shelf within the safe span", () => {
    expect(checkStability(shelfModel(5000))).toHaveLength(0); // 500mm < 580mm
  });

  it("escalates to risk on a very long span (deflection past 3mm)", () => {
    const f = checkStability(shelfModel(12000)); // 1200mm span
    expect(f).toHaveLength(1);
    expect(f[0]!.level).toBe("risk");
    expect(f[0]!.deflection_mm).toBeGreaterThan(3);
  });

  it("ignores non-load-bearing panels (a facade over the same span)", () => {
    expect(checkStability(shelfModel(9000, "facade"))).toHaveLength(0);
  });

  it("exactly at the limit does not flag (strictly greater fires)", () => {
    expect(checkStability(shelfModel(SPAN_LIMIT_16MM_MM10))).toHaveLength(0);
  });

  it("flags a DECLARED load-bearing panel over span even when its role is not a shelf (L5)", () => {
    const base = shelfModel(9000, "facade"); // a facade over 900mm — normally ignored (test above)
    const f = checkStability(setLoadBearing(base, "c", true));
    expect(f).toHaveLength(1);
    expect(f[0]!.span_mm10).toBe(9000);
  });

  it("a declared load-bearing panel within the safe span is not flagged", () => {
    expect(checkStability(setLoadBearing(shelfModel(5000, "facade"), "c", true))).toHaveLength(0);
  });

  it("clearing the declaration restores the non-flagged state", () => {
    const declared = setLoadBearing(shelfModel(9000, "facade"), "c", true);
    expect(checkStability(setLoadBearing(declared, "c", false))).toHaveLength(0);
  });
});
