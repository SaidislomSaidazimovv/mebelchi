// Phase 1.3a — handle / dastak: an optional `Component.handle` counted + priced as hardware, like a
// hinge. Additive: a handle-less door is byte-identical (no handle line, no cost). Counted per instance
// (three identical handled doors = three handles), mirroring how hinges are counted.

import { describe, it, expect } from "vitest";

import { hardwareCounts, hardwareEstimate } from "../apps/app/src/three/estimate.js";
import { HARDWARE } from "../apps/app/src/three/materials.js";
import type { Block, Component, Instance, StructuralModel, HandleType } from "../apps/app/src/three/../../../../engine/contracts/structure.js";

const box = { x: 0, y: 0, z: 0, w: 6000, h: 7200, d: 5600 };

/** A block with N instances of one facade/drawer component, optionally handled. */
function model(opts: { role: "facade"; drawer?: boolean; handle?: HandleType; n?: number }): StructuralModel {
  const n = opts.n ?? 1;
  const comp: Component = {
    id: "c", name: "Дверь", partIds: ["p"], role: opts.role,
    ...(opts.drawer ? { drawer: true } : {}),
    ...(opts.handle ? { handle: opts.handle } : {}),
  };
  const instances: Instance[] = Array.from({ length: n }, (_, i) => ({
    id: `i${i}`, componentId: "c", sectionId: "sec", anchor: { x: 0, y: 1000, z: 0 }, link: "linked" as const,
  }));
  const block: Block = {
    id: "blk", name: "B", box,
    zones: [{ id: "z", name: "Z", rule: "manual", root: { id: "sec", box, dividers: [], children: [], instanceIds: instances.map((i) => i.id), purpose: null } }],
    components: [comp], instances, lines: [], rows: [],
  };
  return { id: "t", name: "handle", blocks: [block], parts: [] };
}

describe("Phase 1.3a — handle count", () => {
  it("a handle-less door counts NO handle (byte-identical hardware)", () => {
    expect(hardwareCounts(model({ role: "facade" })).handles).toBe(0);
  });

  it("a door with a bow handle counts one handle", () => {
    expect(hardwareCounts(model({ role: "facade", handle: "bow" })).handles).toBe(1);
  });

  it("a knob and a gola profile each count as one handle too", () => {
    expect(hardwareCounts(model({ role: "facade", handle: "knob" })).handles).toBe(1);
    expect(hardwareCounts(model({ role: "facade", handle: "profile" })).handles).toBe(1);
  });

  it("a drawer with a handle is counted (a drawer takes a handle too)", () => {
    const m = model({ role: "facade", drawer: true, handle: "bow" });
    expect(hardwareCounts(m).handles).toBe(1);
    expect(hardwareCounts(m).slides).toBe(1); // still a drawer — its runner set is unaffected
  });

  it("counts PER INSTANCE — three identical handled doors are three handles (like hinges)", () => {
    expect(hardwareCounts(model({ role: "facade", handle: "bow", n: 3 })).handles).toBe(3);
  });

  it("leaves the other hardware counts untouched", () => {
    const bare = hardwareCounts(model({ role: "facade" }));
    const withH = hardwareCounts(model({ role: "facade", handle: "bow" }));
    expect({ ...withH, handles: 0 }).toEqual(bare); // only `handles` changed
  });
});

describe("Phase 1.3a — handle price", () => {
  it("a handled door adds a handle line at the mock price", () => {
    const est = hardwareEstimate(model({ role: "facade", handle: "bow" }));
    const line = est.lines.find((l) => l.name === HARDWARE.handle.name);
    expect(line).toBeDefined();
    expect(line!.qty).toBe(1);
    expect(line!.priceUzs).toBe(HARDWARE.handle.priceUzs);
  });

  it("a handle-less door has NO handle line and the same total as before", () => {
    const bare = hardwareEstimate(model({ role: "facade" }));
    expect(bare.lines.some((l) => l.name === HARDWARE.handle.name)).toBe(false);
    const withH = hardwareEstimate(model({ role: "facade", handle: "bow" }));
    expect(withH.priceUzs - bare.priceUzs).toBe(HARDWARE.handle.priceUzs);
  });

  it("three handles cost three units", () => {
    const est = hardwareEstimate(model({ role: "facade", handle: "bow", n: 3 }));
    expect(est.lines.find((l) => l.name === HARDWARE.handle.name)!.priceUzs).toBe(3 * HARDWARE.handle.priceUzs);
  });
});
