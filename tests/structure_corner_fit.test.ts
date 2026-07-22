// Phase 5.r3 — corner-fit. An L-corner block auto-placed at the L room's inside corner: its rotated bounding
// box tucks flush against BOTH walls (backs on the wall lines), openings into the room. The wall-1 run insets
// to clear it. Placement-only (a normal L-corner cut list). turn "left" (default) + "right" both fit.

import { describe, it, expect } from "vitest";

import { fitCorner, snapRunToWall } from "../engine/structure/operations.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import type { Block, StructuralModel } from "../engine/contracts/structure.js";

/** The rotated (rendered) world AABB of a block, honouring an axis-aligned rotY_deg (90/270 swap w↔d). */
function rotatedAABB(b: Block) {
  const { x, z, w, d } = b.box;
  const cx = x + w / 2, cz = z + d / 2;
  const swap = b.rotY_deg === 90 || b.rotY_deg === 270;
  const xExt = swap ? d : w, zExt = swap ? w : d;
  return { minX: cx - xExt / 2, maxX: cx + xExt / 2, minZ: cz - zExt / 2, maxZ: cz + zExt / 2 };
}
const cornerBlock = (m: StructuralModel) => m.blocks.find((b) => b.name === "Burchak shkaf")!;

/** An L room (4 m + 3 m) with an auto-fitted corner block. */
function cornerModel(turn: "left" | "right"): StructuralModel {
  const s = useKarkas.getState();
  s.setModel(buildCarcassModel(600, 720, 560));
  s.setRoom("L", [4000, 3000], turn);
  s.fitCorner();
  return useKarkas.getState().model;
}

describe("Phase 5.r3 — corner block tucks into the corner", () => {
  it("turn 'left': rotY 90, backs flush on wall 1 (x = 40000) + wall 0 (z = 0), openings into the room", () => {
    const cb = cornerBlock(cornerModel("left"));
    expect(cb.footprint).toBeDefined(); // it's an L-corner block
    expect(cb.footprint!.hand).toBe("left"); // hand = room.turn
    expect(cb.rotY_deg).toBe(90);
    const bb = rotatedAABB(cb);
    expect(bb.maxX).toBe(40000); // wall 1 line (x = W0)
    expect(bb.minZ).toBe(0); // wall 0 line — the room is on the +Z side (interior)
  });

  it("turn 'right': rotY 0, backs flush on wall 1 (x = 40000) + wall 0 (z = 0), block in the −Z room", () => {
    const cb = cornerBlock(cornerModel("right"));
    expect(cb.footprint!.hand).toBe("right");
    expect(cb.rotY_deg).toBe(0);
    const bb = rotatedAABB(cb);
    expect(bb.maxX).toBe(40000); // wall 1 line
    expect(bb.maxZ).toBe(0); // wall 0 line — the room is on the −Z side
  });

  it("the corner block's legs are sized to the run depth (flush): legDepth = 560 mm", () => {
    const cb = cornerBlock(cornerModel("left"));
    expect(cb.footprint!.legA.depth_mm10).toBe(5600); // = the run cabinets' depth
    expect(cb.footprint!.legB.depth_mm10).toBe(5600);
  });
});

describe("Phase 5.r3 — the wall-1 run insets to clear the corner", () => {
  it("a run on wall 1 gets a cornerInset so it tiles after the corner block", () => {
    const s = useKarkas.getState();
    s.setModel(buildCarcassModel(600, 720, 560));
    s.addBlock();
    s.groupAllBlocks();
    s.setRoom("L", [4000, 3000], "left");
    const rid = useKarkas.getState().model.runs![0]!.id;
    s.snapRunToWall(rid, "wall_1"); // run hugs wall 1
    s.fitCorner();
    const run = useKarkas.getState().model.runs!.find((r) => r.id === rid)!;
    expect(run.cornerInset_mm10).toBeGreaterThan(0); // starts after the corner block
  });
});

describe("Phase 5.r3 — guards", () => {
  it("fitCorner is a no-op without a ≥2-wall room or a non-L block", () => {
    const m = buildCarcassModel(600, 720, 560); // no room, plain block
    expect(fitCorner(m, m.blocks[0]!.id)).toBe(m); // no room → same ref
    const withRoom: StructuralModel = { ...m, room: { id: "r", walls: [{ id: "wall_0", length_mm10: 40000 }] } };
    expect(fitCorner(withRoom, m.blocks[0]!.id)).toBe(withRoom); // 1 wall → no corner → same ref
  });
});
