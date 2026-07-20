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

const GHOST_COLOR: Record<string, number> = {
  boiler: 0xd9534f, hanging: 0x5b8def, storage: 0xcaa15a, appliance: 0x8a8f98, display: 0x6fbf8f, drawer: 0xc9a24b, structural: 0x9aa0a6,
};

/**
 * Step 9 — Application-view ghost props: a low-poly translucent silhouette of what each tagged space
 * holds (a cylinder for a boiler / appliance-ish box, a rail for hanging, stacked boxes for storage),
 * centred in the space and sized to ~70%. Purely illustrative for the client; never machined.
 */
export function buildGhostProps(
  items: readonly { purpose: string; cx: number; cy: number; cz: number; w: number; h: number; d: number }[],
): THREE.Group {
  const g = new THREE.Group();
  for (const it of items) {
    const mat = new THREE.MeshStandardMaterial({ color: GHOST_COLOR[it.purpose] ?? 0x8892a0, transparent: true, opacity: 0.6, roughness: 0.75, metalness: 0 });
    let mesh: THREE.Mesh;
    if (it.purpose === "boiler") {
      const r = Math.min(it.w, it.d) * 0.34;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, it.h * 0.82, 18), mat);
    } else if (it.purpose === "hanging") {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(it.w * 0.78, it.h * 0.08, it.d * 0.5), mat); // a rail near the top
      mesh.position.set(it.cx, it.cy + it.h * 0.34, it.cz);
      mesh.raycast = () => {};
      g.add(mesh);
      continue;
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(it.w * 0.72, it.h * 0.72, it.d * 0.72), mat);
    }
    mesh.position.set(it.cx, it.cy, it.cz);
    mesh.raycast = () => {};
    g.add(mesh);
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
  opts: { resize?: boolean; rotate?: boolean } = {},
): THREE.Group {
  const withResize = opts.resize !== false; // a whole cabinet is move-only — it already resizes by face-drag
  const withRotate = opts.rotate !== false; // both a free board and a cabinet can be turned about Y
  const g = new THREE.Group();
  g.position.set(center[0], center[1], center[2]);
  const up = new THREE.Vector3(0, 1, 0);
  const maxS = Math.max(size[0], size[1], size[2]);
  const hs = Math.min(0.03, Math.max(0.014, maxS * 0.07)); // handle cube edge (m) — kept finger-sized on mobile
  const shaftL = maxS * 0.45 + 0.05;
  const shaftR = Math.max(0.004, shaftL * 0.05), coneR = shaftR * 2.6, coneH = shaftL * 0.28;
  const AXES = [
    { axis: "x", color: 0xe5484d, dir: new THREE.Vector3(1, 0, 0), half: size[0] / 2 },
    { axis: "y", color: 0x30a46c, dir: new THREE.Vector3(0, 1, 0), half: size[1] / 2 },
    { axis: "z", color: 0x2f6bff, dir: new THREE.Vector3(0, 0, 1), half: size[2] / 2 },
  ] as const;
  // An invisible-but-pickable proxy: fully transparent, so it enlarges the TAP TARGET without changing
  // the look. Without it a finger that lands a few px off the small handle grabs the board underneath
  // and moves it instead of resizing — the classic thin-board miss.
  const hitMat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  for (const a of AXES) {
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
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftL, 12), mat());
    shaft.quaternion.copy(q);
    shaft.position.copy(a.dir).multiplyScalar(base + shaftL / 2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 16), mat());
    cone.quaternion.copy(q);
    cone.position.copy(a.dir).multiplyScalar(base + shaftL + coneH / 2);
    shaft.userData.gizmoAxis = a.axis; cone.userData.gizmoAxis = a.axis;
    shaft.renderOrder = 1000; cone.renderOrder = 1000;
    const arrowHit = new THREE.Mesh(new THREE.CylinderGeometry(coneR * 1.5, coneR * 1.5, shaftL + coneH, 8), hitMat());
    arrowHit.quaternion.copy(q);
    arrowHit.position.copy(a.dir).multiplyScalar(base + (shaftL + coneH) / 2);
    arrowHit.userData.gizmoAxis = a.axis;
    g.add(shaft, cone, arrowHit);
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
