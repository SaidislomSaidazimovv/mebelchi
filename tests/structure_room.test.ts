// Phase 5.r1 — the room's wall geometry. roomWallSegments derives each wall's world segment from the ordered
// wall list + turn: wall 0 runs +X, each next turns 90° (CCW "left" / CW "right"). Covers I / L / П. The room
// is optional/additive on the model, so a model without one is byte-identical (tested app-side via the store).

import { describe, it, expect } from "vitest";

import { roomWallSegments, roomFromPreset } from "../engine/structure/room.js";
import { useKarkas } from "../apps/app/src/three/karkasStore.js";
import type { Room } from "../engine/contracts/structure.js";

const room = (walls: number[], turn?: "left" | "right"): Room => ({
  id: "r",
  walls: walls.map((l, i) => ({ id: `w${i}`, length_mm10: l })),
  ...(turn ? { turn } : {}),
});

describe("Phase 5.r1 — roomWallSegments (90° polyline)", () => {
  it("I (1 wall) runs +X from the origin", () => {
    const s = roomWallSegments(room([40000]));
    expect(s[0]!.origin).toEqual([0, 0]);
    expect(s[0]!.dir).toEqual([1, 0]);
    expect(s[0]!.length_mm10).toBe(40000);
  });

  it("L (2 walls) — the 2nd turns +Z (left) from the 1st wall's end", () => {
    const s = roomWallSegments(room([40000, 30000])); // default turn = left
    expect(s[0]!.dir).toEqual([1, 0]);
    expect(s[1]!.origin).toEqual([40000, 0]); // end of wall 0
    expect(s[1]!.dir).toEqual([0, 1]); // +Z (CCW)
    expect(s[1]!.length_mm10).toBe(30000);
  });

  it("L turn:'right' — the 2nd wall turns −Z (mirror)", () => {
    const s = roomWallSegments(room([40000, 30000], "right"));
    expect(s[1]!.origin).toEqual([40000, 0]);
    expect(s[1]!.dir).toEqual([0, -1]); // −Z (CW)
  });

  it("П (3 walls, left) — +X, +Z, −X; the 3rd starts at the 2nd's end", () => {
    const s = roomWallSegments(room([40000, 30000, 40000]));
    expect(s[0]!.dir).toEqual([1, 0]);
    expect(s[1]!.dir).toEqual([0, 1]);
    expect(s[2]!.dir).toEqual([-1, 0]); // back along −X (the far wall of the U)
    expect(s[2]!.origin).toEqual([40000, 30000]); // end of wall 1
  });
});

describe("Phase 5.r1 — roomFromPreset", () => {
  it("maps I/L/U to 1/2/3 walls with the given lengths", () => {
    expect(roomFromPreset("I", [40000]).walls.length).toBe(1);
    expect(roomFromPreset("L", [40000, 30000]).walls.map((w) => w.length_mm10)).toEqual([40000, 30000]);
    expect(roomFromPreset("U", [40000, 30000, 40000]).walls.length).toBe(3);
  });
  it("defaults a missing length to 3000 mm and carries the turn", () => {
    const r = roomFromPreset("L", [40000], "right");
    expect(r.walls[1]!.length_mm10).toBe(30000);
    expect(r.turn).toBe("right");
  });
});

describe("Phase 5.r1 — store setRoom / clearRoom + scene walls", () => {
  it("setRoom builds the room (mm → mm10); the scene gains one wall board per wall", () => {
    useKarkas.getState().setRoom("L", [4000, 3000]); // mm
    const st = useKarkas.getState();
    expect(st.model.room?.walls.map((w) => w.length_mm10)).toEqual([40000, 30000]);
    expect(st.scene.walls?.length ?? 0).toBe(2); // two wall panels rendered
  });

  it("clearRoom drops the room + its walls (byte-identical to no room)", () => {
    useKarkas.getState().setRoom("I", [4000]);
    useKarkas.getState().clearRoom();
    const st = useKarkas.getState();
    expect(st.model.room).toBeUndefined();
    expect(st.scene.walls ?? []).toEqual([]); // no wall boards without a room
  });

  it("a model with no room renders no walls (scene.walls absent)", () => {
    useKarkas.getState().clearRoom();
    expect(useKarkas.getState().scene.walls).toBeUndefined();
  });
});
