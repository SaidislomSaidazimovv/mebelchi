// three/structureRenderer.ts — Scene (from structureScene) → three.js meshes. Plain three.js
// (NOT react-three-fiber): our app renders with three directly, so we build a THREE.Group of box
// meshes here instead of porting karkas's r3f CanvasScene. Each mesh carries its part id in
// userData for raycast selection, mirroring kitchen3d.ts's `userData.cabId` convention.

import * as THREE from "three";
import type { Scene, Board } from "./structureScene";

const WOOD = 0xe7ddc9; // carcass face (matches the kitchen runStyle default)
const EDGE = 0xc9bd9e; // panel edge outline
const SELECTED = 0x2a6df0; // blue emissive tint (same as kitchen selection)
const WIRE_EDGE = 0x334155; // dark outline for wireframe (contrast against the light backdrop)
const SHADED = 0xcfcabd; // uniform clay grey for the "shaded" mode (form without decor colour)

/** 3D visual style (imos Visual Styles). `realistic` = solid decor-coloured (default), `wireframe`
 *  = edges only / see-through, `shaded` = solid but a single uniform matte colour (no decor). */
export type RenderMode = "realistic" | "wireframe" | "shaded" | "xray";

const axisUnit = (a: 0 | 1 | 2): THREE.Vector3 =>
  new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);

/** A centred rounded rectangle (metres) with per-corner radii [tl,tr,br,bl] in mm10. A 0 radius stays a
 *  sharp corner; each rounded corner is a quadratic fillet through the sharp vertex. */
function roundedRectShape(u: number, v: number, corners: readonly [number, number, number, number]): THREE.Shape {
  const hu = u / 2, hv = v / 2;
  const cap = Math.min(hu, hv);
  const [tl, tr, br, bl] = corners.map((r) => Math.min(Math.max(r, 0) / 10000, cap)) as [number, number, number, number];
  const s = new THREE.Shape();
  s.moveTo(-hu + bl, -hv);
  s.lineTo(hu - br, -hv);
  if (br > 0) s.quadraticCurveTo(hu, -hv, hu, -hv + br); // bottom-right
  s.lineTo(hu, hv - tr);
  if (tr > 0) s.quadraticCurveTo(hu, hv, hu - tr, hv); // top-right
  s.lineTo(-hu + tl, hv);
  if (tl > 0) s.quadraticCurveTo(-hu, hv, -hu, hv - tl); // top-left
  s.lineTo(-hu, -hv + bl);
  if (bl > 0) s.quadraticCurveTo(-hu, -hv, -hu + bl, -hv); // bottom-left → closes
  return s;
}

/** Punch a rectangular aperture into `shape` (face coords, metres), positioned from its LOCKED edge so a
 *  locked clearance matches the engine's cut (features.ts). `u`/`v` are the face dims in metres. */
function addCutoutHole(shape: THREE.Shape, cut: NonNullable<Board["cutouts"]>[number], u: number, v: number): void {
  const cw = cut.w_mm10 / 10000, ch = cut.h_mm10 / 10000;
  const left = cut.offset[0] / 10000, top = cut.offset[1] / 10000, right = cut.offset[2] / 10000, bottom = cut.offset[3] / 10000;
  const [lLeft, lTop, lRight, lBottom] = cut.locked;
  const x0 = lRight && !lLeft ? u - right - cw : left;
  const y0 = lTop && !lBottom ? v - top - ch : bottom;
  const x = -u / 2 + x0, y = -v / 2 + y0;
  const hole = new THREE.Path();
  hole.moveTo(x, y);
  hole.lineTo(x + cw, y);
  hole.lineTo(x + cw, y + ch);
  hole.lineTo(x, y + ch);
  hole.lineTo(x, y);
  shape.holes.push(hole);
}

/** Geometry for one board: a plain box, or — when it carries corner rounding / cutouts (Step 4b) — a
 *  rounded-rect (with holes) extruded through the panel's thickness. The thickness axis is the smallest
 *  of the three dims; the other two form the face. `makeBasis` re-orients the XY-extruded shape onto the
 *  board's real axes (kept right-handed so face normals point outward). */
function boardGeometry(b: Board): THREE.BufferGeometry {
  const hasCorners = !!b.corners && b.corners.some((r) => r > 0);
  const hasCutouts = !!b.cutouts && b.cutouts.length > 0;
  if (!hasCorners && !hasCutouts) return new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);

  const [sx, sy, sz] = b.size;
  let tAxis: 0 | 1 | 2 = 0;
  if (sy <= sx && sy <= sz) tAxis = 1;
  else if (sz <= sx && sz <= sy) tAxis = 2;
  const thick = b.size[tAxis];
  const faceAxes = ([0, 1, 2].filter((a) => a !== tAxis)) as [0 | 1 | 2, 0 | 1 | 2];
  const u = b.size[faceAxes[0]], v = b.size[faceAxes[1]];

  const shape = roundedRectShape(u, v, b.corners ?? [0, 0, 0, 0]);
  for (const c of b.cutouts ?? []) addCutoutHole(shape, c, u, v);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 12 });
  geom.translate(0, 0, -thick / 2); // Extrude runs 0..depth → centre it on the thickness axis
  const ex = axisUnit(faceAxes[0]), ey = axisUnit(faceAxes[1]), ez = axisUnit(tAxis);
  const basis = new THREE.Matrix4().makeBasis(ex, ey, ez);
  if (basis.determinant() < 0) basis.makeBasis(ex, ey, ez.negate()); // keep right-handed (normals outward)
  geom.applyMatrix4(basis);
  return geom;
}

/** Build the assembled cabinet as a THREE.Group of box meshes — one per render board. `colorOf`
 *  (Phase F1) maps a part id → its decor colour (int); absent / undefined falls back to WOOD. */
export function buildStructureGroup(scene: Scene, colorOf?: (id: string) => number | undefined): THREE.Group {
  const group = new THREE.Group();
  for (const b of scene.boards) {
    const geom = boardGeometry(b);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: colorOf?.(b.id) ?? WOOD, roughness: 0.82, metalness: 0 }),
    );
    mesh.userData.baseColor = colorOf?.(b.id) ?? WOOD; // remembered so realistic/shaded can restore it
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    // Inclined shelf (imos AS_O_Angle): tilt the board so the FRONT stays LOW at its mount and the
    // BACK rises toward the back panel — exactly as imos does. We pivot about the shelf's FRONT-TOP
    // edge (front = local −z since the back panel sits at the larger z; top = local +y). Pinning the
    // TOP-front (not the bottom-front) keeps the board's FRONTMOST point flush in the front plane:
    // a bottom-front pivot would swing the front-top corner forward by thickness·sin θ (~7mm at 25°),
    // poking out of the carcass. A centred BoxGeometry rotates about its centre, so after rotating we
    // shift the mesh by (e − R·e) to pin that edge. The edge outline is a child, so it follows. (rotX
    // is radians; only set when actually inclined, so flat shelves are untouched.)
    if (b.rotX) {
      const ang = -b.rotX; // negative raises the back edge (front stays low)
      const ey = b.size[1] / 2; // TOP, local y
      const ez = -b.size[2] / 2; // front, local z (back panel is at +z)
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const ry = ey * cos - ez * sin;
      const rz = ey * sin + ez * cos;
      mesh.rotation.x = ang;
      mesh.position.y += ey - ry; // pin the front-top edge: position += (e − R·e)
      mesh.position.z += ez - rz;
    }
    mesh.userData.partId = b.id;
    // thin edge outline so adjacent panels read as separate boards
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geom),
      new THREE.LineBasicMaterial({ color: EDGE }),
    );
    // Lines raycast with a default 1-unit (= 1 METRE here) threshold, so a click up to ~1m off a
    // board would still "hit" its outline — grabbing/selecting the block from empty space. The
    // outline is purely decorative → exclude it from raycasts so only the solid boards are pickable.
    edges.raycast = () => {};
    mesh.add(edges);
    group.add(mesh);
  }
  return group;
}

/** Tint the board whose id matches (selection). Pass null to clear every tint. */
export function highlightBoard(group: THREE.Group, id: string | null): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && "emissive" in mat) {
      const on = id != null && mesh.userData.partId === id;
      mat.emissive = new THREE.Color(on ? SELECTED : 0x000000);
      mat.emissiveIntensity = on ? 0.5 : 0;
      mat.needsUpdate = true;
    }
  }
}

/** Re-colour every board from `colorOf` (Phase F1 — decor changed, no geometry rebuild). Leaves the
 *  selection emissive untouched, so re-apply highlightBoard after if a part is selected. */
export function recolorBoards(group: THREE.Group, colorOf: (id: string) => number | undefined): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat && "color" in mat) {
      const col = colorOf(mesh.userData.partId as string) ?? WOOD;
      mesh.userData.baseColor = col; // keep the remembered decor in sync so mode switches stay correct
      mat.color = new THREE.Color(col);
      mat.needsUpdate = true;
    }
  }
}

/** Apply a Visual Style (imos) to every board: `realistic` = solid decor colour, `shaded` = solid
 *  uniform clay, `wireframe` = faces hidden so only the edge outlines remain (see-through). Mutates
 *  the shared materials in place; re-assert fade/selection after, and re-render. Never touches
 *  geometry, so it composes with recolour / fade / highlight. */
export function applyRenderMode(group: THREE.Group, mode: RenderMode): void {
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat || !("opacity" in mat)) continue;
    const edge = mesh.children[0] as THREE.LineSegments | undefined;
    const edgeMat = edge?.material as THREE.LineBasicMaterial | undefined;
    if (mode === "wireframe") {
      mat.transparent = true;
      mat.opacity = 0; // faces vanish; the edge outline (a child) carries the wireframe
      mat.depthWrite = false;
    } else if (mode === "xray") {
      // Step 8 — X-ray: every board see-through but still decor-tinted, so you read the whole assembly at once
      mat.transparent = true;
      mat.opacity = 0.28;
      mat.depthWrite = false;
      mat.color = new THREE.Color((mesh.userData.baseColor as number) ?? WOOD);
    } else {
      mat.transparent = false;
      mat.opacity = 1;
      mat.depthWrite = true;
      mat.color = new THREE.Color(mode === "shaded" ? SHADED : ((mesh.userData.baseColor as number) ?? WOOD));
    }
    mat.needsUpdate = true;
    if (edgeMat) {
      edgeMat.color = new THREE.Color(mode === "wireframe" ? WIRE_EDGE : EDGE);
      edgeMat.needsUpdate = true;
    }
  }
}

/** Drill-hole markers (imos "shows the borings"): a small dark disc at each hole, pushed to the
 *  panel's INNER face and oriented to face out of it, so pins/cups appear exactly on the boards.
 *  `bounds` is the scene recentering from layoutBounds (mm10). Returns a group to add/remove on the
 *  «Teshiklar» toggle. */
export function buildHoleMarkers(
  holes: readonly { x: number; y: number; z: number; r: number; normal: "x" | "y" | "z"; partId?: string; opId?: string; fx?: number; fy?: number }[],
  bounds: { cx: number; cz: number; minY: number; ctrX: number; ctrY: number; ctrZ: number },
): THREE.Group {
  const g = new THREE.Group();
  const M = (mm10: number): number => mm10 / 10_000;
  const HALF_T = 80; // 8mm (half a 16mm board) in mm10 — push the marker from mid-thickness to the face
  for (const h of holes) {
    let px = h.x * 10, py = h.y * 10, pz = h.z * 10; // mm → mm10
    // push from mid-thickness onto the INNER face (toward the block centre), 0.3mm proud (no z-fight)
    if (h.normal === "x") px += (bounds.ctrX >= px ? 1 : -1) * (HALF_T + 3);
    else if (h.normal === "y") py += (bounds.ctrY >= py ? 1 : -1) * (HALF_T + 3);
    else pz += (bounds.ctrZ >= pz ? 1 : -1) * (HALF_T + 3);
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(0.0015, h.r / 1000), 14),
      new THREE.MeshBasicMaterial({ color: 0x13485a, side: THREE.DoubleSide }),
    );
    mesh.position.set(M(px - bounds.cx), M(py - bounds.minY), M(pz - bounds.cz));
    if (h.normal === "x") mesh.rotation.y = Math.PI / 2;
    else if (h.normal === "y") mesh.rotation.x = Math.PI / 2;
    // Step 7c — carry the hole identity so a tap on the marker can select the individual hole. The main
    // panel picker raycasts the block group (not this hole group), so enabling raycast here is safe.
    if (h.partId && h.opId) mesh.userData.hole = { partId: h.partId, opId: h.opId, fx: h.fx ?? 0, fy: h.fy ?? 0 };
    g.add(mesh);
  }
  return g;
}

/**
 * Step 8.2 — Frame-view kromka: a coloured line along each BANDED edge of every panel, in its K-variable
 * colour, so the frame view reads which edges are edge-banded and with what. Edge order matches the
 * engine [front,back,side,side]; the face = the two largest axes, edge midlines at mid-thickness.
 */
export function buildKromkaEdges(scene: Scene, colorOf: (kId: string) => number): THREE.Group {
  const g = new THREE.Group();
  const add = (p: THREE.Vector3, axis: 0 | 1 | 2, v: number) => { if (axis === 0) p.x += v; else if (axis === 1) p.y += v; else p.z += v; };
  for (const b of scene.boards) {
    if (!b.kromka || !b.kromka.some((k) => k)) continue;
    const [sx, sy, sz] = b.size;
    let t: 0 | 1 | 2 = 0;
    if (sy <= sx && sy <= sz) t = 1;
    else if (sz <= sx && sz <= sy) t = 2;
    const fa = [0, 1, 2].filter((a) => a !== t) as [0 | 1 | 2, 0 | 1 | 2];
    const u = b.size[fa[0]], v = b.size[fa[1]];
    for (let i = 0; i < 4; i++) {
      const k = b.kromka[i];
      if (!k) continue;
      const p0 = new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]);
      const p1 = p0.clone();
      if (i < 2) { // top(+v)/bottom(-v): run along fa[0], fixed on fa[1]
        const fy = (i === 0 ? 1 : -1) * v / 2;
        add(p0, fa[1], fy); add(p1, fa[1], fy);
        add(p0, fa[0], -u / 2); add(p1, fa[0], u / 2);
      } else { // right(+u)/left(-u): run along fa[1], fixed on fa[0]
        const fx = (i === 2 ? 1 : -1) * u / 2;
        add(p0, fa[0], fx); add(p1, fa[0], fx);
        add(p0, fa[1], -v / 2); add(p1, fa[1], v / 2);
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), new THREE.LineBasicMaterial({ color: colorOf(k) }));
      line.raycast = () => {};
      g.add(line);
    }
  }
  return g;
}

/** Free the GPU resources of a structure group (call on unmount / before rebuild). */
export function disposeStructureGroup(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else if (m) m.dispose();
  });
}
