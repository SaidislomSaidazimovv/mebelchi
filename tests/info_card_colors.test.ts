// Step 3.1 — the info card's multi-segment material colour bar (CONSTRUCTION_FRAME_v4 §5, fixture
// 03-info-card): one colour segment per distinct material in the selection. Pure helper.
import { describe, it, expect } from "vitest";
import { selectionColors, DEFAULT_PLAN } from "../apps/app/src/three/materials";

describe("Step 3.1 — selectionColors (info-card material bar)", () => {
  it("a single-material selection → one colour segment", () => {
    const c = selectionColors([{ materialId: "ldsp_white" }, { materialId: "ldsp_white" }], DEFAULT_PLAN);
    expect(c).toEqual(["#f4f2ec"]);
  });

  it("a multi-material selection → one segment PER distinct material, in first-seen order", () => {
    const c = selectionColors([{ materialId: "ldsp_white" }, { materialId: "ldsp_wenge" }, { materialId: "ldsp_white" }], DEFAULT_PLAN);
    expect(c).toEqual(["#f4f2ec", "#4b3a2f"]); // white then wenge, deduped
  });

  it("glass parts take the glass tint, not a board colour", () => {
    const c = selectionColors([{ role: "glass" }], DEFAULT_PLAN);
    expect(c).toEqual(["#bfe4f0"]);
  });

  it("an empty selection falls back to a single neutral segment (never renders nothing)", () => {
    expect(selectionColors([], DEFAULT_PLAN)).toEqual(["#e7ddc9"]);
  });
});
