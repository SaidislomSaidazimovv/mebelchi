// B3 — instance ids must never collide with a LIVE instance after a remove. The old counter used
// `block.instances.length + 1`, which reused a number once any instance was deleted (and even let a
// door removal shift shelf numbering, since length counts every family). The fix mints per-family
// `max(live suffix) + 1`, so a fresh id is always strictly greater than every live one in its family.
import { describe, it, expect } from "vitest";
import { buildCarcassModel } from "../engine/structure/demoModel.js";
import { addInstance, removeInstance } from "../engine/structure/operations.js";

const ids = (m: ReturnType<typeof buildCarcassModel>) => m.blocks[0]!.instances.map((i) => i.id);

describe("instance id minting is collision-free after remove (B3)", () => {
  it("removing a MIDDLE shelf then adding does not reuse the id", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = m.blocks[0]!.zones[0]!.root.id;
    for (let i = 0; i < 3; i++) m = addInstance(m, leaf, "shelf"); // shelf_1, shelf_2, shelf_3
    expect(ids(m)).toEqual(["shelf_1", "shelf_2", "shelf_3"]);
    m = removeInstance(m, "shelf_2"); // {shelf_1, shelf_3}
    m = addInstance(m, leaf, "shelf"); // must be shelf_4, NOT shelf_3
    const after = ids(m);
    expect(new Set(after).size).toBe(after.length); // all unique — no live collision
    expect(after).toContain("shelf_4");
    expect(after.filter((x) => x === "shelf_3").length).toBe(1); // the surviving shelf_3, not a duplicate
  });

  it("a DOOR removal does not shift shelf numbering into a collision", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = m.blocks[0]!.zones[0]!.root.id;
    m = addInstance(m, leaf, "shelf"); // shelf_1
    m = addInstance(m, leaf, "door"); // door_1 (per-family, not door_2)
    m = addInstance(m, leaf, "shelf"); // shelf_2
    m = removeInstance(m, "door_1");
    m = addInstance(m, leaf, "shelf"); // shelf_3, must not collide with any live id
    const after = ids(m);
    expect(new Set(after).size).toBe(after.length);
    expect(after).toEqual(["shelf_1", "shelf_2", "shelf_3"]);
  });

  it("families are numbered independently (shelf_1 and door_1 coexist — distinct strings)", () => {
    let m = buildCarcassModel(600, 720, 560);
    const leaf = m.blocks[0]!.zones[0]!.root.id;
    m = addInstance(m, leaf, "shelf");
    m = addInstance(m, leaf, "door");
    m = addInstance(m, leaf, "drawer");
    expect(ids(m)).toEqual(["shelf_1", "door_1", "drawer_1"]);
  });
});
