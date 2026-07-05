// 3D-layer coverage — the room karkas layer (buildProjectBlocksGroup) positions each block at its
// logical room x/z, tags it for pick + drag (D2/D3b userData), and SKIPS a malformed block instead
// of tanking the shared room scene (the audit try/catch guard). three's math runs in node (no WebGL
// needed for Group/Box3/geometry bounds), so this exercises the real render-prep path in vitest.
import { describe, it, expect } from "vitest";
import { buildProjectBlocksGroup } from "../apps/app/src/three/karkasLayer.js";
import { cellToKarkasBlock } from "../apps/app/src/three/cellToKarkas.js";
import { mk } from "../apps/app/src/model/cabinet.js";

const blockJson = (cab: Parameters<typeof cellToKarkasBlock>[0]): string => {
  const { model, plan } = cellToKarkasBlock(cab);
  return JSON.stringify({ version: 1, model, plan });
};

describe("buildProjectBlocksGroup — placement + pick/drag tags", () => {
  it("positions a block at its logical room x/z and tags it for pick + drag", () => {
    const g = buildProjectBlocksGroup([{ karkasJson: blockJson(mk({ fill: "shelves", count: 1 })), x: 1200, z: 300, id: "blk-1" }]);
    expect(g.children.length).toBe(1);
    const c = g.children[0]!;
    // D3b — the pick id + logical coords the drag reads back
    expect(c.userData.karkasBlockId).toBe("blk-1");
    expect(c.userData.karkasX).toBe(1200);
    expect(c.userData.karkasZ).toBe(300);
    // D3b.4 — position = logical(m) − bbox centre, so position + centre recovers the logical point
    expect(c.position.x + (c.userData.blockCenterX as number)).toBeCloseTo(1.2, 3);
    expect(c.position.z + (c.userData.blockCenterZ as number)).toBeCloseTo(0.3, 3);
    expect(c.position.y).toBeCloseTo(0, 3); // floored: base sits on y=0
  });

  it("auto-rows blocks with no explicit x (each gets a distinct position)", () => {
    const json = blockJson(mk({ fill: "shelves", count: 1 }));
    const g = buildProjectBlocksGroup([{ karkasJson: json, id: "a" }, { karkasJson: json, id: "b" }]);
    expect(g.children.length).toBe(2);
    expect(g.children[0]!.userData.karkasX).not.toBe(g.children[1]!.userData.karkasX);
  });

  it("SKIPS a malformed block instead of throwing (guard keeps the shared scene alive)", () => {
    const good = { karkasJson: blockJson(mk({ fill: "shelves", count: 1 })), id: "ok" };
    // parseable JSON + non-empty blocks (passes parseBlock) but no zones → solve throws
    const bad = { karkasJson: JSON.stringify({ model: { blocks: [{ id: "x", box: { x: 0, y: 0, z: 0, w: 1000, h: 1000, d: 1000 } }] } }), id: "bad" };
    let g!: ReturnType<typeof buildProjectBlocksGroup>;
    expect(() => { g = buildProjectBlocksGroup([bad, good]); }).not.toThrow();
    expect(g.children.length).toBe(1); // bad dropped, good survives
    expect(g.children[0]!.userData.karkasBlockId).toBe("ok");
  });

  it("returns an empty group when there are no blocks", () => {
    expect(buildProjectBlocksGroup([]).children.length).toBe(0);
  });

  // 1:1-with-a-cabinet: a placed block carries a floor rotation (gizmo rotate) applied about its
  // centre via the pivot group, and half-extents for the shared collision/snap Foot.
  it("applies a block's floor rotation to the pivot (about its centre) + tags half-extents", () => {
    const json = blockJson(mk({ fill: "shelves", count: 1, w: 800, h: 2000 }));
    const g = buildProjectBlocksGroup([{ karkasJson: json, x: 0, z: 0, id: "r", rot: 90 }]);
    const c = g.children[0]!;
    expect(c.userData.karkasRot).toBe(90);
    expect(c.rotation.y).toBeCloseTo(-Math.PI / 2, 4); // room convention: rotation.y = -rot
    expect(c.userData.blockCenterX).toBe(0); // pivot is centred on the block → no bbox offset
    expect(c.userData.blockHalfX as number).toBeGreaterThan(0);
    expect(c.userData.blockHalfZ as number).toBeGreaterThan(0);
  });
});

describe("blockDimsMm — footprint of a solved block (for the room Foot)", () => {
  it("reports the block's w × depth × h in mm", async () => {
    const { blockDimsMm } = await import("../apps/app/src/three/karkasLayer.js");
    const dims = blockDimsMm(blockJson(mk({ fill: "shelves", count: 1, w: 800, h: 2000, depth: 560 })));
    expect(dims).not.toBeNull();
    expect(dims!.w).toBe(800);
    expect(dims!.h).toBe(2000);
    expect(dims!.depth).toBe(560);
  });

  it("returns null for a malformed block", async () => {
    const { blockDimsMm } = await import("../apps/app/src/three/karkasLayer.js");
    expect(blockDimsMm("not json")).toBeNull();
  });
});
