// Rigorous containment guard: an inclined display shelf (angle + front lip) must stay ENTIRELY inside
// the carcass — no part poking out the front, bottom, sides or back. Measures the REAL rendered mesh
// world-AABBs (buildStructureGroup runs three's matrix math in node) and asserts every shelf/lip box
// sits within the carcass envelope. This is what caught (and now locks) the front-top-corner poke.
import { describe, it, expect } from "vitest";
import { buildDemoModel } from "../engine/structure/demoModel.js";
import { solveLayout } from "../engine/structure/layout.js";
import { addInstance, setComponentAngle, setComponentLip, resizeBlockWidth, resizeBlockHeight, resizeBlockDepth } from "../engine/structure/operations.js";
import { leafSections } from "../engine/contracts/structure.js";
import { layoutToScene } from "../apps/app/src/three/structureScene.js";
import { buildStructureGroup } from "../apps/app/src/three/structureRenderer.js";

// world AABB (mm) of a rendered box mesh. M9U.2 rounded the plain-box geometry, which drops the
// `geometry.parameters.{width,height,depth}` BoxGeometry used to expose — so measure the geometry's OWN
// bounding box (works for a rounded box, a sharp box or an extruded panel alike) and transform its 8
// corners by the mesh's world matrix. A rounded box's bounds are ≤ a sharp one's, so containment is if
// anything stricter — this only makes the measurement geometry-agnostic.
function meshAABB(mesh: any): { min: number[]; max: number[] } {
  const e = mesh.matrixWorld.elements as number[];
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox as { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const sx of [bb.min.x, bb.max.x]) for (const sy of [bb.min.y, bb.max.y]) for (const sz of [bb.min.z, bb.max.z]) {
    const w = [e[0]! * sx + e[4]! * sy + e[8]! * sz + e[12]!, e[1]! * sx + e[5]! * sy + e[9]! * sz + e[13]!, e[2]! * sx + e[6]! * sy + e[10]! * sz + e[14]!];
    for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, w[a]! * 1000); max[a] = Math.max(max[a]!, w[a]! * 1000); }
  }
  return { min, max };
}

function measure(m: ReturnType<typeof buildDemoModel>) {
  const group = buildStructureGroup(layoutToScene(solveLayout(m)));
  group.updateMatrixWorld(true);
  const bounds: Record<string, { min: number[]; max: number[] }> = {};
  for (const child of group.children) bounds[(child as any).userData.partId] = meshAABB(child);
  const cMin = [Infinity, Infinity, Infinity], cMax = [-Infinity, -Infinity, -Infinity];
  for (const [id, b] of Object.entries(bounds)) {
    if (!/__(side_l|side_r|top|bottom|back)$/.test(id)) continue;
    for (let a = 0; a < 3; a++) { cMin[a] = Math.min(cMin[a]!, b.min[a]!); cMax[a] = Math.max(cMax[a]!, b.max[a]!); }
  }
  return { bounds, cMin, cMax };
}

describe("inclined display shelf stays inside the carcass", () => {
  it("no shelf or lip pokes out — deep cabinet, steep angle, tall lip", () => {
    let m = buildDemoModel();
    const id = m.blocks[0]!.id;
    m = resizeBlockDepth(resizeBlockHeight(resizeBlockWidth(m, id, 6000), id, 7200), id, 5600);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(addInstance(m, leaf, "shelf"), leaf, "shelf"); // two shelves in one bay
    for (const inst of m.blocks[0]!.instances) {
      m = setComponentAngle(m, inst.componentId, 40); // ask steep — engine clamps to fit
      m = setComponentLip(m, inst.componentId, 800); // 80mm lip
    }
    const { bounds, cMin, cMax } = measure(m);
    const tol = 1; // 0.1mm
    const parts = Object.entries(bounds).filter(([k]) => k.includes("__inst_"));
    expect(parts.length).toBeGreaterThan(0);
    for (const [pid, b] of parts) {
      for (let a = 0; a < 3; a++) {
        expect(b.min[a]!, `${pid} axis ${"xyz"[a]} min pokes out`).toBeGreaterThanOrEqual(cMin[a]! - tol);
        expect(b.max[a]!, `${pid} axis ${"xyz"[a]} max pokes out`).toBeLessThanOrEqual(cMax[a]! + tol);
      }
    }
  });

  it("a tilted shelf's FRONT stays flush in the front plane (no front-corner poke)", () => {
    let m = buildDemoModel();
    const id = m.blocks[0]!.id;
    m = resizeBlockDepth(m, id, 5600);
    const leaf = leafSections(m.blocks[0]!.zones[0]!.root)[0]!.id;
    m = addInstance(m, leaf, "shelf");
    const inst = m.blocks[0]!.instances.find((i) => i.sectionId === leaf)!;
    const flat = measure(m).bounds[`${id}__inst_${inst.id}`]!;
    m = setComponentAngle(m, inst.componentId, 30);
    const tilted = measure(m).bounds[`${id}__inst_${inst.id}`]!;
    // the tilted board's frontmost point must not move forward of the flat shelf's front
    expect(tilted.min[2]!).toBeGreaterThanOrEqual(flat.min[2]! - 1);
  });
});
