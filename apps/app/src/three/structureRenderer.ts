// three/structureRenderer.ts — Scene (from structureScene) → three.js meshes. Plain three.js
// (NOT react-three-fiber): our app renders with three directly, so we build a THREE.Group of box
// meshes here instead of porting karkas's r3f CanvasScene. Each mesh carries its part id in
// userData for raycast selection, mirroring kitchen3d.ts's `userData.cabId` convention.

import * as THREE from "three";
import type { Scene, Board } from "./structureScene";
import type { MaterialFinish, TextureKind } from "./materials";

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
/** M4 — a NON-BOX primitive drawn inside the board's envelope: a cylinder (a round leg, or the hanging
 *  RAIL every wardrobe needs), a sphere (knob/foot), a tube (metal frame) or a wedge (angled support).
 *  The envelope stays the box, so a cylinder's height is size.y and its radius min(size.x, size.z)/2 —
 *  moving, anchoring and resizing keep working exactly as they do for a flat board. */
/**
 * Re-centre a geometry on its own bounds. Boards are positioned by the CENTRE of their box, so a shape
 * built off-origin (an arc grows from its chord, half a cylinder sits to one side of the axis) would
 * float away from where the usta dropped it.
 */
function centred(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  return g;
}

function primitiveGeometry(shape: NonNullable<Board["shape"]>, w: number, h: number, d: number): THREE.BufferGeometry {
  if (shape === "sphere") return new THREE.SphereGeometry(Math.max(0.001, Math.min(w, h, d) / 2), 32, 20);
  if (shape === "torus") {
    // A ring (a pull, a decorative hoop). It is FLAT, so its axis is the box's SHORTEST side — the same
    // reasoning as the long primitives, mirrored: the thin dimension is the one it is thin along.
    const thin: "x" | "y" | "z" = d <= w && d <= h ? "z" : w <= h ? "x" : "y";
    const across = thin === "z" ? Math.min(w, h) : thin === "x" ? Math.min(h, d) : Math.min(w, d);
    const tube = Math.max(0.001, Math.min(d, w, h) / 2);
    const g = new THREE.TorusGeometry(Math.max(tube * 1.2, across / 2 - tube), tube, 14, 36);
    if (thin === "x") g.rotateY(Math.PI / 2); // TorusGeometry is thin along Z by default
    else if (thin === "y") g.rotateX(Math.PI / 2);
    return g;
  }
  if (shape === "arc") {
    // A curved fascia: a half-ring wall standing on its edge. The chord runs along the LONGER of the two
    // horizontal sides, it bulges by the other, and `h` is how tall the panel is — so resizing the box
    // bends and stretches the same curve instead of swapping which way it faces.
    // A circular SEGMENT, not a half-circle: the box says how far it bows (the shallow side) and how wide
    // it is (the long side), and the radius follows from those two — R = (c²/4 + b²) / 2b, the sagitta
    // relation. A half-circle would ignore the box and bulge by half the width, so a 600 mm bowed door
    // would stick out 300 mm instead of the 80 the usta asked for.
    const chord = Math.max(w, d);
    const span = Math.max(0.002, Math.min(Math.min(w, d), chord / 2)); // past a semicircle is not a door
    const t = Math.min(span * 0.6, 0.018); // panel thickness — 18 mm stock, thinner on a shallow bow
    // The shell's own thickness has to come OUT of the bow, or the inner face's ends hang below the chord
    // and the part grows deeper than the box the usta sized (measured: an 80 mm box drew 96 mm).
    const bulge = Math.max(0.001, span - t);
    const R = (chord * chord / 4 + bulge * bulge) / (2 * bulge);
    const half = Math.asin(Math.min(1, chord / 2 / R)); // half the angle the segment spans
    const cy = bulge - R; // centre placed so the crown sits at y = bulge and the ends at y = 0
    const ring = new THREE.Shape();
    ring.absarc(0, cy, R, Math.PI / 2 - half, Math.PI / 2 + half, false);
    ring.absarc(0, cy, R - t, Math.PI / 2 + half, Math.PI / 2 - half, true);
    ring.closePath();
    const tall = Math.max(0.001, h);
    const g = new THREE.ExtrudeGeometry(ring, { depth: tall, bevelEnabled: false, curveSegments: 28 });
    g.translate(0, 0, -tall / 2);
    g.rotateX(-Math.PI / 2); // extrusion runs +Z → stand the panel up so `h` is its height
    if (d > w) g.rotateY(Math.PI / 2); // the chord follows the longer horizontal side
    return centred(g);
  }
  if (shape === "cylinder" || shape === "tube" || shape === "cone" || shape === "hexagon" || shape === "halfCylinder") {
    // The axis follows the LONGEST side, so ONE primitive serves a vertical round leg AND a horizontal
    // hanging rail (штанга) — the everyday wardrobe part that had no shape at all until now. (A fixed
    // Y axis would have drawn a 1.1 m rail as a stubby 30 mm-tall disc.)
    const axis: "x" | "y" | "z" = h >= w && h >= d ? "y" : w >= d ? "x" : "z";
    const len = Math.max(0.001, axis === "y" ? h : axis === "x" ? w : d);
    const across = axis === "y" ? Math.min(w, d) : axis === "x" ? Math.min(h, d) : Math.min(w, h);
    const r = Math.max(0.001, across / 2);
    let g: THREE.BufferGeometry;
    if (shape === "cylinder") g = new THREE.CylinderGeometry(r, r, len, 32);
    // A leg tapers DOWNWARD — wide where it meets the top, narrow on the floor. The other way round
    // reads as a funnel, not furniture.
    else if (shape === "cone") g = new THREE.CylinderGeometry(r, r * 0.5, len, 28);
    else if (shape === "hexagon") g = new THREE.CylinderGeometry(r, r, len, 6);
    // Half a cylinder: round on one side, flat on the other — a worktop's rounded end, a handrail.
    else if (shape === "halfCylinder") g = centred(new THREE.CylinderGeometry(r, r, len, 28, 1, false, 0, Math.PI));
    else {
      const inner = Math.max(r * 0.35, r - 0.004); // ≈4 mm wall
      const ring = new THREE.Shape();
      ring.absarc(0, 0, r, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
      ring.holes.push(hole);
      g = new THREE.ExtrudeGeometry(ring, { depth: len, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, -len / 2); g.rotateX(-Math.PI / 2); // Extrude runs +Z → make it Y-aligned first
    }
    if (axis === "x") g.rotateZ(Math.PI / 2); // lay the Y-aligned cylinder along X …
    else if (axis === "z") g.rotateX(Math.PI / 2); // … or along Z
    return g;
  }
  // wedge — a right-triangle prism (full at one edge, tapering to the other): an angled support / filler
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, -h / 2); tri.lineTo(w / 2, -h / 2); tri.lineTo(-w / 2, h / 2); tri.closePath();
  const g = new THREE.ExtrudeGeometry(tri, { depth: Math.max(0.001, d), bevelEnabled: false });
  g.translate(0, 0, -Math.max(0.001, d) / 2);
  return g;
}

function boardGeometry(b: Board): THREE.BufferGeometry {
  if (b.shape && b.shape !== "box") return primitiveGeometry(b.shape, b.size[0], b.size[1], b.size[2]); // M4
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

// ── M3.3 — procedural canvas textures (generated once per kind, cloned per board so each gets its own
//    real-world repeat). A grayscale height map is tinted by the decor colour (one wood generator serves
//    light oak + dark wenge); a matching normal map gives the grain / pores relief under the M3.1 light. ──
type TexPair = { map: THREE.Texture; normal: THREE.Texture };
const texCache = new Map<TextureKind, TexPair>();

const texHash = (x: number, y: number): number => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = texHash(xi, yi), b = texHash(xi + 1, yi), c = texHash(xi, yi + 1), d = texHash(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x: number, y: number): number { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * valueNoise(x * f, y * f); f *= 2; a *= 0.5; } return s; }

/** Grayscale height 0..1 for a texture kind at (x,y) in an N-tile (coords pre-wrapped for tileability). */
function texHeight(kind: TextureKind, x: number, y: number, N: number): number {
  const u = (x / N) * 8, v = (y / N) * 8;
  if (kind === "wood") return 0.82 + 0.09 * Math.sin((u * 1.3 + fbm(u * 0.5, v * 0.12) * 3.2) * 3.0) + (fbm(u * 7, v * 1.6) - 0.5) * 0.12;
  if (kind === "marble") return 0.93 - Math.pow(1 - Math.abs(Math.sin((u + fbm(u, v) * 4.2) * 1.1)), 3) * 0.5;
  if (kind === "leather") return 0.78 + (fbm(u * 3.2, v * 3.2) - 0.5) * 0.28 + (fbm(u * 15, v * 15) - 0.5) * 0.14;
  const weave = (Math.sin(u * 12) * Math.sin(v * 12)) * 0.5 + 0.5; // fabric
  return 0.8 + (weave - 0.5) * 0.22 + (fbm(u * 9, v * 9) - 0.5) * 0.08;
}

function makeTexPair(kind: TextureKind): TexPair {
  const N = 256;
  const cC = document.createElement("canvas"); cC.width = cC.height = N;
  const cN = document.createElement("canvas"); cN.width = cN.height = N;
  const gC = cC.getContext("2d")!, gN = cN.getContext("2d")!;
  const iC = gC.createImageData(N, N), iN = gN.createImageData(N, N);
  const H = (x: number, y: number): number => texHeight(kind, ((x % N) + N) % N, ((y % N) + N) % N, N);
  const bump = kind === "wood" || kind === "leather" ? 2.6 : kind === "fabric" ? 1.6 : 0.8;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const g = Math.round(Math.max(0, Math.min(1, H(x, y))) * 255);
    iC.data[i] = g; iC.data[i + 1] = g; iC.data[i + 2] = g; iC.data[i + 3] = 255; // grayscale → tinted by material.color
    const nx = -(H(x + 1, y) - H(x - 1, y)) * bump, ny = -(H(x, y + 1) - H(x, y - 1)) * bump;
    const l = Math.hypot(nx, ny, 1) || 1;
    iN.data[i] = Math.round((nx / l * 0.5 + 0.5) * 255);
    iN.data[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
    iN.data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    iN.data[i + 3] = 255;
  }
  gC.putImageData(iC, 0, 0); gN.putImageData(iN, 0, 0);
  const map = new THREE.CanvasTexture(cC); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const normal = new THREE.CanvasTexture(cN); normal.colorSpace = THREE.NoColorSpace; normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  return { map, normal };
}
function texPair(kind: TextureKind): TexPair { const c = texCache.get(kind); if (c) return c; const t = makeTexPair(kind); texCache.set(kind, t); return t; }

/** M3.2/M3.3 — the three.js material for a decor colour + finish + optional procedural texture. Absent
 *  finish/texture → the matte laminate look (byte-identical to pre-M3.2). Gloss/glass/frosted are
 *  MeshPhysicalMaterial; metal/mirror are metallic. A texture adds a cloned, per-board-scaled map +
 *  normalMap. Returned as MeshStandardMaterial so highlightBoard / recolorBoards keep working. */
export function materialForFinish(color: number, finish?: MaterialFinish, texture?: TextureKind, size?: readonly [number, number, number]): THREE.MeshStandardMaterial {
  const mat: THREE.MeshStandardMaterial = ((): THREE.MeshStandardMaterial => {
    switch (finish) {
      case "satin": return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 });
      case "gloss": return new THREE.MeshPhysicalMaterial({ color, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 });
      case "metal": return new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.9, envMapIntensity: 1 });
      case "mirror": return new THREE.MeshStandardMaterial({ color, roughness: 0.03, metalness: 1, envMapIntensity: 1 });
      case "glass": return new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0, transmission: 0.92, ior: 1.5, thickness: 6, transparent: true, depthWrite: false, envMapIntensity: 1, side: THREE.DoubleSide });
      case "frosted": return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, transmission: 0.85, ior: 1.5, thickness: 6, transparent: true, depthWrite: false, envMapIntensity: 0.8, side: THREE.DoubleSide });
      default: return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, envMapIntensity: 0.25 });
    }
  })();
  if (texture) {
    const { map, normal } = texPair(texture);
    const m = map.clone(); m.needsUpdate = true;
    const n = normal.clone(); n.needsUpdate = true;
    const tile = 0.35; // metres per repeat → a consistent real-world grain scale whatever the board size
    const rx = Math.max(1, Math.round(((size?.[0] ?? tile) / tile) * 10) / 10);
    const ry = Math.max(1, Math.round(((size?.[1] ?? tile) / tile) * 10) / 10);
    m.repeat.set(rx, ry); n.repeat.set(rx, ry);
    mat.map = m; mat.normalMap = n; mat.normalScale = new THREE.Vector2(0.55, 0.55);
    if (mat.roughness > 0.6) mat.roughness = 0.6; // a textured surface reads better a touch less flat
    mat.needsUpdate = true;
  }
  return mat;
}

/** Build the assembled cabinet as a THREE.Group of box meshes — one per render board. `colorOf` (Phase F1)
 *  maps a part id → its decor colour (int); absent → WOOD. `finishOf` (M3.2) maps id → surface finish;
 *  absent → matte. */
export function buildStructureGroup(scene: Scene, colorOf?: (id: string) => number | undefined, finishOf?: (id: string) => MaterialFinish | undefined, textureOf?: (id: string) => TextureKind | undefined): THREE.Group {
  const group = new THREE.Group();
  for (const b of scene.boards) {
    const geom = boardGeometry(b);
    const mesh = new THREE.Mesh(geom, materialForFinish(colorOf?.(b.id) ?? WOOD, finishOf?.(b.id), textureOf?.(b.id), b.size));
    mesh.userData.baseColor = colorOf?.(b.id) ?? WOOD; // remembered so realistic/shaded can restore it
    mesh.castShadow = true; mesh.receiveShadow = true; // M3.1 — boards cast onto the floor + onto each other
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
    // A free board turned about the VERTICAL axis (rotY, radians) simply spins in place — its centre is
    // the natural pivot for "face another way", so no edge-pinning offset is needed here.
    if (b.rotY) mesh.rotation.y = b.rotY;
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

/** Phase 5.r1 — the room's wall backdrop: matte, floor-standing panels in their OWN group (so highlight /
 *  recolor / render-mode never touch them). Non-interactive: no `userData.partId`, raycast disabled, so a tap
 *  never selects a wall and the walls never appear in the cut list. Returns an empty group when there's no room. */
export function buildRoomGroup(scene: Scene): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  for (const b of scene.walls ?? []) {
    const geom = new THREE.BoxGeometry(b.size[0], b.size[1], b.size[2]);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
    mesh.raycast = () => {}; // never pickable — a wall is a backdrop, not furniture
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

const GROUP_PICK = 0x00a961; // green emissive — a whole block ticked for grouping (U4.2 Blok mode)
/** U4.2 — tint EVERY board of each picked block green (whole-cabinet group selection). Call it AFTER
 *  highlightBoard (which clears all emissive): the picked blocks then win. A partId is `${blockId}__…`,
 *  so the block is the slice before the first `__`. No-op for an empty pick. */
export function highlightBlocks(group: THREE.Group, blockIds: readonly string[]): void {
  if (blockIds.length === 0) return;
  const set = new Set(blockIds);
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const pid = mesh.userData.partId as string | undefined;
    if (mat && "emissive" in mat && pid) {
      const sep = pid.indexOf("__");
      const bid = sep < 0 ? pid : pid.slice(0, sep);
      if (set.has(bid)) { mat.emissive = new THREE.Color(GROUP_PICK); mat.emissiveIntensity = 0.55; mat.needsUpdate = true; }
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

/**
 * Phase 1.3d — procedural, realistic-looking handle meshes from the fittings handles.ts derives off the
 * Ø4.5 screw holes. A bow = a rounded metal bar on two posts; a knob = a rounded knob on a post; a gola
 * `profile` (0 holes) draws nothing. Metal look (brushed-aluminium grey). Dimensions here are COSMETIC
 * (not manufacturing), so the "no numeric literals" rule that governs the drilling spec does not apply.
 * Empty when nothing is handled → an empty group, so a handle-less model renders byte-identically.
 */
export function buildHandleGroup(
  fittings: readonly {
    id: string; kind: "bow" | "knob"; seats: [number, number, number][];
    normal: "x" | "y" | "z"; out: [number, number, number]; along?: [number, number, number];
  }[],
  bounds: { cx: number; cz: number; minY: number; ctrX: number; ctrY: number; ctrZ: number },
): THREE.Group {
  const g = new THREE.Group();
  const M = (mm10: number): number => mm10 / 10_000;
  // Cosmetic proportions (metres). A real bow handle stands off the face on two posts; a knob on one.
  const STANDOFF = 0.028, POST_R = 0.005, BAR_R = 0.006, OVERHANG = 0.016, KNOB_R = 0.011, KNOB_POST_R = 0.006;
  const UP = new THREE.Vector3(0, 1, 0);
  // Brushed alu/steel. The scene has lights but NO environment map, so a full metalness:0.9 metal has
  // nothing to reflect and renders near-black; tuned metalness/roughness + a light base give the intended
  // brushed-aluminium look under these lights WITHOUT adding a scene envMap (which would alter the boards).
  const mat = new THREE.MeshStandardMaterial({ color: 0xd2d6dc, metalness: 0.55, roughness: 0.4 });
  // seat (mm, placement space) → scene metres, shifted exactly like buildHoleMarkers.
  const scenePos = (s: [number, number, number]): THREE.Vector3 =>
    new THREE.Vector3(M(s[0] * 10 - bounds.cx), M(s[1] * 10 - bounds.minY), M(s[2] * 10 - bounds.cz));
  /** A cylinder/capsule of length `len` centred at `center`, its long axis turned from +Y to `dir`. */
  const bar = (geom: THREE.BufferGeometry, center: THREE.Vector3, dir: THREE.Vector3): THREE.Mesh => {
    const m = new THREE.Mesh(geom, mat);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.position.copy(center);
    return m;
  };

  for (const f of fittings) {
    const out = new THREE.Vector3(f.out[0], f.out[1], f.out[2]);
    const seats = f.seats.map(scenePos);
    if (f.kind === "bow" && seats.length >= 2 && f.along) {
      const along = new THREE.Vector3(f.along[0], f.along[1], f.along[2]);
      // two posts (face → standoff) at each seat
      for (const s of seats) {
        g.add(bar(new THREE.CylinderGeometry(POST_R, POST_R, STANDOFF, 12), s.clone().addScaledVector(out, STANDOFF / 2), out));
      }
      // the grip bar, pushed STANDOFF off the face, spanning the seats + a small overhang past each
      const mid = seats[0]!.clone().add(seats[1]!).multiplyScalar(0.5).addScaledVector(out, STANDOFF);
      const span = seats[0]!.distanceTo(seats[1]!) + 2 * OVERHANG;
      g.add(bar(new THREE.CapsuleGeometry(BAR_R, Math.max(0.001, span - 2 * BAR_R), 6, 12), mid, along));
    } else {
      // knob: a post + a rounded knob head
      const s = seats[0]!;
      g.add(bar(new THREE.CylinderGeometry(KNOB_POST_R, KNOB_POST_R, STANDOFF, 12), s.clone().addScaledVector(out, STANDOFF / 2), out));
      const head = new THREE.Mesh(new THREE.SphereGeometry(KNOB_R, 16, 12), mat);
      head.position.copy(s.clone().addScaledVector(out, STANDOFF + KNOB_R * 0.5));
      g.add(head);
    }
  }
  return g;
}

/**
 * Phase 3.b — procedural per-kind APPLIANCE meshes from the fittings appliances.ts derives (a fitting = the
 * appliance's real-size box centred in its section). Steel/glass palette (metalness tuned for the envMap-less
 * scene, like the handle mesh). Front of the cabinet = −Z (doors/controls face −Z). Cosmetic dimensions.
 * Empty when nothing is an appliance → an empty group, so a model without appliances renders byte-identically.
 */
export function buildApplianceGroup(
  fittings: readonly { id: string; kind: string; center: [number, number, number]; size: [number, number, number] }[],
): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.5, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26292f, metalness: 0.3, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.25, roughness: 0.18 });
  const UP = new THREE.Vector3(0, 1, 0);
  /** A box of size (w,h,d) centred at (x,y,z). */
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.001, w), Math.max(0.001, h), Math.max(0.001, d)), mat);
    m.position.set(x, y, z);
    return m;
  };
  /** A cylinder of radius r, length len, long axis "x"|"y"|"z", centred at (x,y,z). */
  const cyl = (r: number, len: number, axis: "x" | "y" | "z", x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.max(0.001, len), 16), mat);
    if (axis !== "y") m.quaternion.setFromUnitVectors(UP, new THREE.Vector3(axis === "x" ? 1 : 0, 0, axis === "z" ? 1 : 0));
    m.position.set(x, y, z);
    return m;
  };

  for (const f of fittings) {
    const [cx, cy, cz] = f.center;
    const [w, h, d] = f.size;
    const front = cz - d / 2; // the cabinet-front face (−Z)
    const sub = new THREE.Group();
    const add = (...ms: THREE.Mesh[]) => ms.forEach((m) => sub.add(m));
    switch (f.kind) {
      case "oven":
        add(box(w, h, d, cx, cy, cz, steel),
            box(w * 0.88, h * 0.62, 0.02, cx, cy - h * 0.06, front - 0.011, glass),           // dark glass door
            box(w * 0.92, h * 0.14, 0.03, cx, cy + h * 0.4, front - 0.006, dark),               // top control strip
            cyl(0.011, w * 0.8, "x", cx, cy + h * 0.28, front - 0.028, steel));                 // handle bar
        break;
      case "hob":
        add(box(w, h, d, cx, cy, cz, glass));                                                    // dark glass slab
        for (const dx of [-w * 0.24, w * 0.24]) for (const dz of [-d * 0.24, d * 0.24])          // 4 burners
          add(cyl(Math.min(w, d) * 0.15, 0.01, "y", cx + dx, cy + h / 2 + 0.005, cz + dz, dark));
        break;
      case "sink":
        add(box(w, h * 0.22, d, cx, cy + h * 0.39, cz, steel),                                   // steel rim/top
            box(w * 0.78, h * 0.72, d * 0.72, cx, cy - h * 0.12, cz, dark),                       // recessed bowl
            cyl(0.014, h * 0.85, "y", cx + w * 0.28, cy + h * 0.4, cz + d * 0.34, steel),         // faucet stem
            cyl(0.011, d * 0.32, "z", cx + w * 0.28, cy + h * 0.78, cz + d * 0.18, steel));       // spout
        break;
      case "dishwasher":
        add(box(w, h, 0.03, cx, cy, front + 0.015, steel),                                        // steel front facade
            cyl(0.011, w * 0.86, "x", cx, cy + h * 0.42, front - 0.012, steel));                  // handle
        break;
      case "hood":
        add(box(w, h * 0.6, d, cx, cy + h * 0.2, cz, steel),                                      // body
            box(w, h * 0.4, d * 0.5, cx, cy - h * 0.3, front + d * 0.25, steel));                 // lower intake lip
        break;
      case "microwave":
        add(box(w, h, d, cx, cy, cz, steel),
            box(w * 0.6, h * 0.72, 0.015, cx - w * 0.12, cy, front - 0.008, glass),               // window (left)
            box(w * 0.24, h * 0.78, 0.015, cx + w * 0.32, cy, front - 0.008, dark));              // controls (right)
        break;
      case "fridge":
        add(box(w, h, d, cx, cy, cz, steel),
            box(w, 0.02, d * 0.3, cx, cy + h * 0.12, front - 0.011, dark),                        // door split line
            cyl(0.013, h * 0.36, "y", cx - w * 0.4, cy + h * 0.26, front - 0.03, steel),          // upper handle
            cyl(0.013, h * 0.42, "y", cx - w * 0.4, cy - h * 0.22, front - 0.03, steel));         // lower handle
        break;
      default:
        add(box(w, h, d, cx, cy, cz, steel)); // unknown kind → a plain steel box
    }
    sub.traverse((o) => { o.userData.partId = f.id; }); // 3.d — tap the appliance mesh → select its instance
    g.add(sub);
  }
  return g;
}

const GHOST_COLOR: Record<string, number> = {
  boiler: 0xd9534f, hanging: 0x5b8def, storage: 0xcaa15a, appliance: 0x8a8f98, display: 0x6fbf8f, drawer: 0xc9a24b, structural: 0x9aa0a6,
};

/**
 * Step 9 — Application-view ghost props: a low-poly translucent silhouette of what each tagged space
 * holds (a cylinder for a boiler / appliance-ish box, a rail for hanging, stacked boxes for storage),
 * centred in the space and sized to ~70%. Purely illustrative for the client; never machined.
 */
/** A tagged space's own dimensions (metres), local to its centre. */
interface GhostSpace { w: number; h: number; d: number }

/**
 * Which silhouette a tagged space gets. The purpose alone is too coarse — a 2 m «hanging» space holds
 * coats while a 0.6 m one holds shirts, and an «appliance» space is a fridge, an oven or a microwave
 * depending on how big it is. Reading the size lets one tag produce the figure the master actually
 * pictures, which is the whole point of the Application view.
 */
export function ghostVariant(purpose: string, s: GhostSpace): string {
  if (purpose === "hanging") return s.h >= 1.0 ? "hanging_long" : "hanging_short";
  if (purpose === "storage") return s.h >= 0.35 ? "storage_boxes" : "storage_baskets";
  if (purpose === "appliance") return s.h >= 1.0 ? "appliance_fridge" : s.h >= 0.4 ? "appliance_oven" : "appliance_micro";
  if (purpose === "display") return s.d >= 0.25 ? "display_plates" : "display_glasses";
  return purpose; // boiler · drawer · structural have one form each
}

/**
 * Step 9 / #19 — the ghost-prop silhouette library. Each figure is a small assembly of primitives
 * (a body, a door, a handle) rather than one block, so a client can tell a fridge from an oven at a
 * glance. Purely illustrative: never machined, never raycast (a ghost must not swallow a tap meant for
 * the panel behind it), and always sized well inside its space so it cannot poke through the carcass.
 */
export function buildGhostProps(
  items: readonly { purpose: string; cx: number; cy: number; cz: number; w: number; h: number; d: number }[],
): THREE.Group {
  const g = new THREE.Group();
  for (const it of items) {
    const mat = new THREE.MeshStandardMaterial({ color: GHOST_COLOR[it.purpose] ?? 0x8892a0, transparent: true, opacity: 0.6, roughness: 0.75, metalness: 0 });
    const group = new THREE.Group();
    group.position.set(it.cx, it.cy, it.cz);
    const add = (geom: THREE.BufferGeometry, x = 0, y = 0, z = 0, rot?: [number, number, number]): void => {
      const m = new THREE.Mesh(geom, mat);
      m.position.set(x, y, z);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.raycast = () => {}; // ghosts are scenery — taps must reach the cabinet behind them
      group.add(m);
    };
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r: number, h: number, seg = 16) => new THREE.CylinderGeometry(r, r, h, seg);
    const { w, h, d } = it;
    const half = h / 2;

    switch (ghostVariant(it.purpose, it)) {
      case "boiler": { // tank + the flue and feed pipes that make it read as a boiler, not a barrel
        const r = Math.min(w, d) * 0.34;
        add(cyl(r, h * 0.7, 18));
        add(cyl(r * 0.16, h * 0.16, 10), 0, h * 0.43, 0);
        add(cyl(r * 0.12, h * 0.14, 10), r * 0.55, -h * 0.42, 0);
        break;
      }
      case "hanging_long": { // rail + full-length coats
        add(cyl(h * 0.012, w * 0.78, 10), 0, half - h * 0.06, 0, [0, 0, Math.PI / 2]);
        for (const x of [-w * 0.2, 0, w * 0.2]) add(box(w * 0.14, h * 0.72, d * 0.34), x, -h * 0.07, 0);
        break;
      }
      case "hanging_short": { // rail + shirts, with the hanger hooks showing above them
        add(cyl(h * 0.02, w * 0.78, 10), 0, half - h * 0.08, 0, [0, 0, Math.PI / 2]);
        for (const x of [-w * 0.22, 0, w * 0.22]) {
          add(new THREE.ConeGeometry(w * 0.07, h * 0.1, 3), x, half - h * 0.16, 0);
          add(box(w * 0.17, h * 0.5, d * 0.3), x, -h * 0.02, 0);
        }
        break;
      }
      case "storage_boxes": { // a stack that narrows upward — instantly reads as boxes
        const n = h >= 0.6 ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          add(box(w * (0.74 - t * 0.14), h / n * 0.82, d * (0.74 - t * 0.1)), 0, -half + (i + 0.5) * (h / n), 0);
        }
        break;
      }
      case "storage_baskets": { // shallow space → trays side by side
        for (const x of [-w * 0.2, w * 0.2]) add(box(w * 0.36, h * 0.55, d * 0.72), x, 0, 0);
        break;
      }
      case "appliance_fridge": { // tall body + the split between the two doors + both handles
        add(box(w * 0.8, h * 0.9, d * 0.78));
        add(box(w * 0.82, h * 0.012, d * 0.02), 0, h * 0.1, d * 0.4);
        for (const y of [h * 0.28, -h * 0.1]) add(cyl(w * 0.022, h * 0.16, 8), w * 0.28, y, d * 0.41);
        break;
      }
      case "appliance_oven": { // body + a door panel proud of the front + a horizontal handle bar
        add(box(w * 0.8, h * 0.78, d * 0.76));
        add(box(w * 0.62, h * 0.44, d * 0.03), 0, -h * 0.06, d * 0.39);
        add(cyl(w * 0.028, w * 0.66, 8), 0, h * 0.22, d * 0.41, [0, 0, Math.PI / 2]);
        break;
      }
      case "appliance_micro": { // small body + a viewing window offset to one side
        add(box(w * 0.72, h * 0.72, d * 0.66));
        add(box(w * 0.42, h * 0.42, d * 0.03), -w * 0.08, 0, d * 0.34);
        break;
      }
      case "display_plates": { // a stack of discs
        const r = Math.min(w, d) * 0.3;
        for (let i = 0; i < 3; i++) add(cyl(r, h * 0.07, 20), 0, -half + h * (0.22 + i * 0.2), 0);
        break;
      }
      case "display_glasses": { // a row of tumblers
        const r = Math.min(w, d) * 0.12;
        for (const x of [-w * 0.24, 0, w * 0.24]) add(cyl(r, h * 0.42, 14), x, -h * 0.12, 0);
        break;
      }
      case "drawer": { // a front panel + its handle — what a closed drawer looks like from outside
        add(box(w * 0.82, h * 0.7, d * 0.72));
        add(cyl(w * 0.026, w * 0.4, 8), 0, 0, d * 0.38, [0, 0, Math.PI / 2]);
        break;
      }
      case "structural": { // a post with a diagonal brace
        add(box(w * 0.16, h * 0.86, d * 0.16));
        add(box(w * 0.5, h * 0.06, d * 0.14), w * 0.16, h * 0.2, 0, [0, 0, -Math.PI / 5]);
        break;
      }
      default:
        add(box(w * 0.72, h * 0.72, d * 0.72));
    }
    g.add(group);
  }
  return g;
}

/** U3.1 — invisible (but raycastable) hit-boxes for each leaf section + a translucent highlight on the
 *  active target. Lets the master TAP a compartment to choose where an add lands (instead of a numbered
 *  «1-bo'lim / 2-bo'lim»). A subtle edge outline shows every compartment; the target glows. */
export function buildSectionHitboxes(
  boxes: readonly { id: string; center: [number, number, number]; size: [number, number, number] }[],
  targetId: string | null,
): THREE.Group {
  const g = new THREE.Group();
  for (const b of boxes) {
    const on = b.id === targetId;
    const geom = new THREE.BoxGeometry(Math.max(0.001, b.size[0] * 0.9), Math.max(0.001, b.size[1] * 0.9), Math.max(0.001, b.size[2] * 0.9));
    // depthTest off + a high renderOrder → the compartment overlay reads ON TOP of the boards, so the
    // master can see where each add lands and which one is the target (glowing), even through fronts.
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: SELECTED, transparent: true, opacity: on ? 0.18 : 0, depthTest: false, depthWrite: false }));
    mesh.position.set(b.center[0], b.center[1], b.center[2]);
    mesh.renderOrder = 998;
    mesh.userData.sectionId = b.id;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: SELECTED, transparent: true, opacity: on ? 0.95 : 0.45, depthTest: false }));
    edges.renderOrder = 999;
    edges.raycast = () => {}; // only the box faces are pickable
    mesh.add(edges);
    g.add(mesh);
  }
  return g;
}

/**
 * A Moblo-style gizmo for the selected free board, sized to its own box (`size`, metres):
 *  · a RESIZE handle — a small cube just outside each axis' + face (`userData.resizeAxis`), dragged to
 *    grow/shrink that dimension (the opposite face stays put, so the board grows the way you pull);
 *  · a MOVE arrow — shaft + cone starting BEYOND that handle (`userData.gizmoAxis`), dragged to slide
 *    the board along that one axis.
 * Starting the arrows outside the handles keeps the two hit-targets from fighting for the same pixels.
 * X red · Y green · Z blue (Moblo's R/G/B = X/Y/Z). depthTest off + high renderOrder → always on top.
 */
export function buildGizmo(
  center: [number, number, number],
  size: [number, number, number],
  // `axes` limits which arrows appear: a shelf spans its bay, so only its HEIGHT is really its own and
  // offering X/Z arrows would promise a move the solver would immediately undo.
  opts: { resize?: boolean; rotate?: boolean; axes?: readonly ("x" | "y" | "z")[]; biDir?: boolean } = {},
): THREE.Group {
  const withResize = opts.resize !== false; // a whole cabinet is move-only — it already resizes by face-drag
  const withRotate = opts.rotate !== false; // only a free board turns from its own gizmo (see KarkasEditor)
  const g = new THREE.Group();
  g.position.set(center[0], center[1], center[2]);
  const up = new THREE.Vector3(0, 1, 0);
  const maxS = Math.max(size[0], size[1], size[2]);
  // Sizing is CLAMPED, not proportional. Sized off the raw extent, a whole cabinet grew arrows reaching
  // 0.84 m — bigger than the 0.6×0.72×0.56 m furniture they were pointing at. The handle stays
  // finger-sized on mobile and the arrow stays a short, readable stub whatever it is attached to.
  const hs = Math.min(0.024, Math.max(0.011, maxS * 0.05)); // handle cube edge (m)
  const shaftL = Math.min(0.14, Math.max(0.05, maxS * 0.28));
  const shaftR = Math.max(0.004, shaftL * 0.05), coneR = shaftR * 2.6, coneH = shaftL * 0.28;
  const AXES = [
    { axis: "x", color: 0xe5484d, dir: new THREE.Vector3(1, 0, 0), half: size[0] / 2 },
    { axis: "y", color: 0x30a46c, dir: new THREE.Vector3(0, 1, 0), half: size[1] / 2 },
    { axis: "z", color: 0x2f6bff, dir: new THREE.Vector3(0, 0, 1), half: size[2] / 2 },
  ] as const;
  const wanted = opts.axes ?? ["x", "y", "z"];
  // An invisible-but-pickable proxy: fully transparent, so it enlarges the TAP TARGET without changing
  // the look. Without it a finger that lands a few px off the small handle grabs the board underneath
  // and moves it instead of resizing — the classic thin-board miss.
  const hitMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  for (const a of AXES) {
    if (!wanted.includes(a.axis)) continue;
    const mat = () => new THREE.MeshBasicMaterial({ color: a.color, depthTest: false });
    const q = new THREE.Quaternion().setFromUnitVectors(up, a.dir); // default geoms point +Y → rotate to axis
    const handleAt = a.half + hs * 0.6;
    if (withResize) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(hs, hs, hs), mat());
      handle.position.copy(a.dir).multiplyScalar(handleAt);
      handle.userData.resizeAxis = a.axis;
      handle.renderOrder = 1001;
      const handleHit = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.8, hs * 1.8, hs * 1.8), hitMat());
      handleHit.position.copy(a.dir).multiplyScalar(handleAt);
      handleHit.userData.resizeAxis = a.axis;
      g.add(handle, handleHit);
    }
    const base = a.half + hs * 1.8; // arrows begin past the handle (and past its hit proxy)
    // A move arrow drawn only up the + direction reads as «this only goes up», which is wrong for a
    // shelf: it slides both ways inside its bay. `biDir` mirrors the arrow so the gesture is honest.
    for (const sign of opts.biDir ? [1, -1] : [1]) {
      const dir = a.dir.clone().multiplyScalar(sign);
      const rot = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftL, 12), mat());
      shaft.quaternion.copy(rot);
      shaft.position.copy(dir).multiplyScalar(base + shaftL / 2);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 16), mat());
      cone.quaternion.copy(rot);
      cone.position.copy(dir).multiplyScalar(base + shaftL + coneH / 2);
      shaft.userData.gizmoAxis = a.axis; cone.userData.gizmoAxis = a.axis;
      shaft.renderOrder = 1000; cone.renderOrder = 1000;
      const arrowHit = new THREE.Mesh(new THREE.CylinderGeometry(coneR * 1.5, coneR * 1.5, shaftL + coneH, 8), hitMat());
      arrowHit.quaternion.copy(rot);
      arrowHit.position.copy(dir).multiplyScalar(base + (shaftL + coneH) / 2);
      arrowHit.userData.gizmoAxis = a.axis;
      g.add(shaft, cone, arrowHit);
    }
  }
  // ROTATE ring — a horizontal hoop around the object; dragging it turns it about the vertical axis
  // (FreePart.rotY_deg for a board, Block.rotY_deg for a whole cabinet — both placement-only).
  if (withRotate) {
    const rr = Math.max(size[0], size[2]) / 2 + hs * 2.4; // hugs the footprint, clear of the face handles
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, Math.max(0.003, rr * 0.022), 8, 48), new THREE.MeshBasicMaterial({ color: 0x7a5cc9, depthTest: false }));
    ring.rotation.x = Math.PI / 2; // lay the hoop flat in the XZ plane so it spins about Y
    ring.userData.rotateAxis = "y";
    ring.renderOrder = 1000;
    const ringHit = new THREE.Mesh(new THREE.TorusGeometry(rr, Math.max(0.012, rr * 0.09), 6, 32), hitMat());
    ringHit.rotation.x = Math.PI / 2;
    ringHit.userData.rotateAxis = "y";
    g.add(ring, ringHit);
  }
  return g;
}

/**
 * A live DIMENSION LINE for the 3D view — the drafting figure a furniture master already reads on a
 * paper sheet: a shaft between two points, an arrowhead at each end, and the measurement floating at
 * the middle. Shown while a face/handle is being dragged, so the size is read ON the thing being
 * resized instead of in a corner pill.
 *
 * Built ONCE per drag and mutated per frame — a drag emits ~60 updates a second, so re-creating the
 * geometry and re-rasterising the label text every time would be pure waste. The label canvas is only
 * redrawn when the text actually changes (during a drag most frames repeat the previous millimetre).
 */
/** The slice of `<canvas>` the label needs — spelled out so the engine's DOM-less tsc still compiles. */
interface CanvasLike {
  width: number;
  height: number;
  getContext(id: "2d"): {
    font: string; textAlign: string; textBaseline: string; fillStyle: string;
    clearRect(x: number, y: number, w: number, h: number): void;
    measureText(t: string): { width: number };
    beginPath(): void;
    roundRect(x: number, y: number, w: number, h: number, r: number): void;
    fill(): void;
    fillText(t: string, x: number, y: number): void;
  } | null;
}

export interface DimLine {
  readonly group: THREE.Group;
  /** Re-aim the line between two world points and set its caption. Cheap enough to call every frame. */
  update(from: readonly [number, number, number], to: readonly [number, number, number], label: string): void;
  dispose(): void;
}

export function createDimLine(color = 0xf5a623): DimLine {
  const group = new THREE.Group();
  group.renderOrder = 1002;

  const lineGeom = new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );
  const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
  const line = new THREE.Line(lineGeom, lineMat);
  line.renderOrder = 1002;

  const headMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const heads = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12), headMat);
    m.renderOrder = 1002;
    return m;
  });

  // The label is rasterised into a canvas texture. Reached through globalThis because this file is also
  // type-checked by the engine's node-only tsc (no DOM lib) — the same dodge karkasStore uses for its
  // dev hook; in the browser globalThis IS window, so this resolves to the real document.
  const canvas = (globalThis as unknown as { document: { createElement(t: string): CanvasLike } })
    .document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  // CanvasLike is the DOM-less stand-in above; at runtime this IS a real <canvas>. The target type is
  // borrowed from three rather than spelled out, so no DOM type NAME appears in this file.
  const texture = new THREE.CanvasTexture(canvas as unknown as ConstructorParameters<typeof THREE.CanvasTexture>[0]);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 1003;

  group.add(line, sprite, ...heads);

  let lastLabel = "";
  const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), mid = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();

  return {
    group,
    update(from, to, label) {
      a.set(from[0], from[1], from[2]);
      b.set(to[0], to[1], to[2]);
      const pos = lineGeom.getAttribute("position") as THREE.BufferAttribute;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y, b.z);
      pos.needsUpdate = true;
      lineGeom.computeBoundingSphere();

      const len = a.distanceTo(b);
      dir.subVectors(b, a).normalize();
      mid.addVectors(a, b).multiplyScalar(0.5);

      // arrowheads point OUTWARD at each end, like a drafting dimension
      const hs = Math.min(0.035, Math.max(0.008, len * 0.09));
      quat.setFromUnitVectors(up, dir);
      heads[0]!.scale.set(hs * 0.5, hs, hs * 0.5);
      heads[0]!.quaternion.copy(quat);
      heads[0]!.position.copy(a).addScaledVector(dir, hs / 2);
      heads[0]!.rotateX(Math.PI); // flip so it aims back down the line
      heads[1]!.scale.set(hs * 0.5, hs, hs * 0.5);
      heads[1]!.quaternion.copy(quat);
      heads[1]!.position.copy(b).addScaledVector(dir, -hs / 2);

      if (label !== lastLabel && ctx) {
        lastLabel = label;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 40px ui-monospace, Menlo, Consolas, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const w = Math.min(canvas.width - 8, ctx.measureText(label).width + 30);
        ctx.fillStyle = "rgba(20,24,32,0.88)"; // a plate behind the text — the model behind it can be any colour
        const x0 = (canvas.width - w) / 2;
        ctx.beginPath();
        ctx.roundRect(x0, 6, w, canvas.height - 12, 12);
        ctx.fill();
        ctx.fillStyle = "#ffd479";
        ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
        texture.needsUpdate = true;
      }
      // Float the caption clear of the shaft (and off to the side for a vertical dimension). Sized as an
      // ANNOTATION, not a banner: an earlier pass scaled it at 0.3× the span and capped at 0.2 m, which on
      // a 1.4 m cabinet produced a 0.8 m-wide plate covering the model it was measuring.
      const off = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(0.075, 0, 0) : new THREE.Vector3(0, 0.075, 0);
      sprite.position.copy(mid).add(off);
      const ss = Math.min(0.085, Math.max(0.045, len * 0.09));
      sprite.scale.set(ss * (canvas.width / canvas.height), ss, 1);
    },
    dispose() {
      lineGeom.dispose();
      lineMat.dispose();
      heads.forEach((h) => h.geometry.dispose());
      headMat.dispose();
      texture.dispose();
      sprite.material.dispose();
    },
  };
}

/** Free the GPU resources of a structure group (call on unmount / before rebuild). */
export function disposeStructureGroup(group: THREE.Group): void {
  // M3.3 — a textured board's material carries a CLONED map + normalMap; three won't free those on
  // material.dispose(), so free them here to keep scene rebuilds leak-free. The module-cached BASE
  // textures are never assigned to a material (only clones are), so they stay safe.
  const disposeMat = (mat: THREE.Material): void => {
    const s = mat as THREE.MeshStandardMaterial;
    s.map?.dispose(); s.normalMap?.dispose();
    mat.dispose();
  };
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(m)) m.forEach(disposeMat);
    else if (m) disposeMat(m);
  });
}
