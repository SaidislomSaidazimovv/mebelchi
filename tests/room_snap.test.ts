// M12.6 — a cabinet stands against the wall when a room appears.
//
// Measured before this: adding an L room to the default model drew the wall across the cabinet's FRONT
// face (z = −280 mm on both), so the piece looked like it was facing the wall rather than backing onto
// it, and the room never read as a room. The existing `snapRunToWall` could not fix it: a Run only comes
// into being once two blocks are grouped, so on the single cabinet a room usually starts from it is a
// silent no-op. `snapBlockToWall` covers that case, with the same geometry `layRunAlongWall` uses.
import { describe, it, expect, beforeEach } from "vitest";

import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { snapBlockToWall } from "../engine/structure/operations.js";
import { roomFromPreset } from "../engine/structure/room.js";
import { solveStructure } from "../engine/structure/solve.js";
import { planThickness, DEFAULT_PLAN } from "../apps/app/src/three/materials.js";
import type { StructuralModel } from "../engine/contracts/structure.js";

const s = () => useKarkas.getState();
const tk = planThickness(DEFAULT_PLAN);
const blk = () => s().model.blocks[0]!;
/** the cut list reduced to what the saw sees — placement must never move a single cut */
const cutSig = (m: StructuralModel) => solveStructure(m, tk).map((p) => `${p.width_mm10}x${p.length_mm10}x${p.thickness_mm10}`).sort().join("|");

beforeEach(() => { s().setModel(buildCarcassModel(600, 720, 560)); });

describe("M12.6 — snapBlockToWall (engine)", () => {
  const withRoom = (): StructuralModel => ({ ...buildCarcassModel(600, 720, 560), room: roomFromPreset("L", [30000, 24000], "left") });

  it("puts the block's BACK on the wall line, not its front", () => {
    const m = withRoom();
    const out = snapBlockToWall(m, m.blocks[0]!.id, m.room!.walls[0]!.id);
    const b = out.blocks[0]!;
    // The wall runs along X at z = 0 with the interior to one side; the cabinet's near face must sit ON
    // that line and its body extend INTO the room, i.e. the whole depth is on one side of z = 0.
    expect(b.box.z === 0 || b.box.z + b.box.d === 0).toBe(true);
  });

  it("centres the block along the wall it stands on", () => {
    const m = withRoom();
    const out = snapBlockToWall(m, m.blocks[0]!.id, m.room!.walls[0]!.id);
    const b = out.blocks[0]!;
    expect(b.box.x + b.box.w / 2).toBe(30000 / 2); // half way along a 3 m wall
  });

  it("does not touch the cut list — placement only", () => {
    const m = withRoom();
    const before = cutSig(m);
    const out = snapBlockToWall(m, m.blocks[0]!.id, m.room!.walls[0]!.id);
    expect(cutSig(out)).toBe(before);
    expect(out.blocks[0]!.box.w).toBe(m.blocks[0]!.box.w);
    expect(out.blocks[0]!.box.h).toBe(m.blocks[0]!.box.h);
    expect(out.blocks[0]!.box.d).toBe(m.blocks[0]!.box.d);
  });

  it("is a no-op without a room, on an unknown wall, and on an unknown block", () => {
    const plain = buildCarcassModel(600, 720, 560);
    expect(snapBlockToWall(plain, plain.blocks[0]!.id, "wall_0")).toBe(plain); // same ref
    const m = withRoom();
    expect(snapBlockToWall(m, m.blocks[0]!.id, "wall_zzz")).toBe(m);
    expect(snapBlockToWall(m, "nope", m.room!.walls[0]!.id)).toBe(m);
  });

  it("leaves a block that belongs to a RUN alone — the run owns its members", () => {
    const m = withRoom();
    const withRun: StructuralModel = { ...m, runs: [{
      id: "run_1", name: "Qator", axis: "x", length_mm10: 6000,
      members: [{ blockId: m.blocks[0]!.id, rule: { kind: "flex" } }],
    }] };
    expect(snapBlockToWall(withRun, m.blocks[0]!.id, m.room!.walls[0]!.id)).toBe(withRun);
  });

  it("running it twice changes nothing the second time", () => {
    const m = withRoom();
    const once = snapBlockToWall(m, m.blocks[0]!.id, m.room!.walls[0]!.id);
    expect(snapBlockToWall(once, m.blocks[0]!.id, m.room!.walls[0]!.id)).toBe(once); // same ref
  });
});

describe("M12.6 — the store snaps on the FIRST room only", () => {
  it("stands the lone cabinet against the wall when a room first appears", () => {
    const was = { x: blk().box.x, z: blk().box.z };
    s().setRoom("L", [3000, 2400]);
    const now = { x: blk().box.x, z: blk().box.z };
    expect(now).not.toEqual(was); // it moved into the room
    expect(blk().box.x + blk().box.w / 2).toBe(15000);
  });

  it("does NOT drag the cabinet back on a later wall-length edit", () => {
    s().setRoom("L", [3000, 2400]);
    // the master then moves the cabinet by hand…
    const moved = { ...s().model, blocks: s().model.blocks.map((b) => ({ ...b, box: { ...b.box, x: 999 } })) };
    s().setModel(moved);
    s().setRoom("L", [4000, 2400]); // …and only edits a wall length
    expect(blk().box.x).toBe(999); // his placement stands
  });

  it("the cut list and the price are untouched by the snap", () => {
    const before = cutSig(s().model);
    s().setRoom("L", [3000, 2400]);
    expect(cutSig(s().model)).toBe(before);
  });

  it("one undo puts the room AND the placement back", () => {
    const was = { x: blk().box.x, z: blk().box.z };
    s().setRoom("L", [3000, 2400]);
    s().undo();
    expect(s().model.room).toBeUndefined();
    expect({ x: blk().box.x, z: blk().box.z }).toEqual(was);
  });
});
