// Phase 5.r2 — snapping a run to a room wall. A wall-assigned run tiles its members along that wall's segment,
// backs on the wall line, fronts (rotY_deg) facing the room interior. Placement-only: the cut list is unchanged.
// A free run (no wallId) is byte-identical to today. Set-up uses the store's multi-block builder (2 blocks +
// group + room), then the engine op is tested directly.

import { describe, it, expect } from "vitest";

import { snapRunToWall } from "../engine/structure/operations.js";
import { solveStructure } from "../engine/structure/solve.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const tk = planThickness(DEFAULT_PLAN);

/** A model with two 600×720×560 carcasses grouped into a run, in an L room (walls 4 m + 3 m). */
function twoBlockRoomRun(): StructuralModel {
  const s = useKarkas.getState();
  s.setModel(buildCarcassModel(600, 720, 560));
  s.addBlock(); // a 2nd cabinet beside the first
  s.groupAllBlocks(); // → one Run
  s.setRoom("L", [4000, 3000]); // walls: 40000 + 30000 mm10
  return useKarkas.getState().model;
}
const memberBlocks = (m: StructuralModel, runId: string) => {
  const ids = m.runs!.find((r) => r.id === runId)!.members.map((x) => x.blockId);
  return ids.map((id) => m.blocks.find((b) => b.id === id)!);
};
const cutIds = (m: StructuralModel) => solveStructure(m, tk).map((p) => `${p.id}:${p.length_mm10}x${p.width_mm10}`).sort();

describe("Phase 5.r2 — snap a run to wall 0 (+X)", () => {
  it("tiles along X with backs on the wall (z=0) + fronts facing the interior (rotY 180)", () => {
    const m = twoBlockRoomRun();
    const runId = m.runs![0]!.id;
    const snapped = snapRunToWall(m, runId, "wall_0");
    expect(snapped.runs!.find((r) => r.id === runId)!.wallId).toBe("wall_0");
    const blocks = memberBlocks(snapped, runId);
    for (const b of blocks) {
      expect(b.rotY_deg).toBe(180); // front (−Z) turned to +Z (into the room)
      expect(b.box.z).toBe(0); // back sits on the wall line (oz = 0)
    }
    // tiled end-to-end along X from the wall origin: the two left edges are 0 and the first block's width
    expect(blocks.map((b) => b.box.x).sort((a, b) => a - b)).toEqual([0, blocks[0]!.box.w]);
  });

  it("snapping is PLACEMENT-only — the cut list is unchanged", () => {
    const m = twoBlockRoomRun();
    const snapped = snapRunToWall(m, m.runs![0]!.id, "wall_0");
    expect(cutIds(snapped)).toEqual(cutIds(m));
  });
});

describe("Phase 5.r2 — snap to the L's second wall (+Z)", () => {
  it("a run on wall 1 turns 90° (front faces −X into the room)", () => {
    const m = twoBlockRoomRun();
    const snapped = snapRunToWall(m, m.runs![0]!.id, "wall_1");
    for (const b of memberBlocks(snapped, m.runs![0]!.id)) {
      expect(b.rotY_deg).toBe(90); // −Z → −X
    }
  });
});

describe("Phase 5.r2 — no-ops (byte-identical)", () => {
  it("freeing an already-free run / unknown run / unknown wall are all same-ref", () => {
    const m = twoBlockRoomRun();
    const runId = m.runs![0]!.id;
    expect(snapRunToWall(m, runId, null)).toBe(m); // already free
    expect(snapRunToWall(m, "nope", "wall_0")).toBe(m); // unknown run
    expect(snapRunToWall(m, runId, "wall_9")).toBe(m); // no such wall
  });

  it("snap then free clears the wall + rotY and re-lays along X", () => {
    const m = twoBlockRoomRun();
    const runId = m.runs![0]!.id;
    const freed = snapRunToWall(snapRunToWall(m, runId, "wall_0"), runId, null);
    expect(freed.runs!.find((r) => r.id === runId)!.wallId).toBeUndefined();
    for (const b of memberBlocks(freed, runId)) expect(b.rotY_deg).toBeUndefined();
  });
});
