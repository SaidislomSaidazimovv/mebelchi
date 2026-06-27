// Live 3D room (three.js setup adapted from spike-3d.html: capped DPR,
// render-on-demand, OrbitControls, explicit dispose). Wood floor + light walls,
// with WALL CULLING — walls between the camera and the interior are hidden so you
// can see inside; they reappear as the camera orbits past them.
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { polygonBoundsMm, offsetPolygon, defaultOpeningSill, type Pt, type Opening, type Fitting } from "../model/room";
import { leafRects, coveringColor, defaultSurface, type Surface } from "../model/walls";

export type SceneView = "3d" | "plan" | "front";

export interface WallInfo {
  mesh: THREE.Object3D;
  nx: number; // outward normal (xz)
  nz: number;
  mx: number; // midpoint (xz)
  mz: number;
}

function darken(hex: string, f: number, a = 1): string {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `rgba(${r},${g},${b},${a})`;
}

export function makeWoodTexture(base: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 8; i++) {
    const y = i * 32;
    ctx.fillStyle = i % 2 ? darken(base, 0.95) : base;
    ctx.fillRect(0, y, 256, 32);
    ctx.strokeStyle = darken(base, 0.7, 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(256, y + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace; // render covering colours accurately
  return tex;
}

// fills the opening void with a (procedurally detailed) window or door, centred in
// the hole. A bare wall opening fills NOTHING — it's a true cut-through hole.
const WIN_GRID: Record<string, [number, number]> = { single: [1, 1], twin: [2, 1], grid: [2, 2], triple: [3, 1], pano: [1, 1], balcony: [2, 1] };

function makeOpening(
  C0: { x: number; z: number },
  C1: { x: number; z: number },
  t: number,
  widthM: number,
  heightM: number,
  kind: "window" | "door" | "opening",
  design: string,
  sillM: number,
): THREE.Object3D[] {
  if (kind === "opening") return [];
  const cx = C0.x + (C1.x - C0.x) * t;
  const cz = C0.z + (C1.z - C0.z) * t;
  const angle = Math.atan2(C1.z - C0.z, C1.x - C0.x);
  const w = widthM;

  const grp = new THREE.Group();
  grp.position.set(cx, 0, cz);
  grp.rotation.y = -angle;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    grp.add(m);
  };
  const box = (a: number, b: number, c: number) => new THREE.BoxGeometry(a, b, c);

  if (kind === "window") {
    const sill = sillM; // bottom above floor (m)
    const h = heightM > 0 ? heightM : 1.2;
    const fw = design === "pano" ? 0.045 : 0.06;
    const top = sill + h;
    const yc = (sill + top) / 2;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xaedcf0, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.1 });
    const mull = new THREE.MeshStandardMaterial({ color: 0xeaeaea, roughness: 0.6 });
    add(box(w, h, 0.02), glass, 0, yc, 0); // glass
    add(box(w + 2 * fw, fw, 0.1), frameMat, 0, top + fw / 2, 0); // top
    add(box(w + 2 * fw, fw, 0.1), frameMat, 0, sill - fw / 2, 0); // bottom
    add(box(fw, h + 2 * fw, 0.1), frameMat, -w / 2 - fw / 2, yc, 0); // left
    add(box(fw, h + 2 * fw, 0.1), frameMat, w / 2 + fw / 2, yc, 0); // right
    const [cols, rows] = WIN_GRID[design] ?? [2, 1];
    for (let k = 1; k < cols; k++) add(box(0.04, h, 0.06), mull, -w / 2 + (k * w) / cols, yc, 0.01);
    for (let k = 1; k < rows; k++) add(box(w, 0.04, 0.06), mull, 0, sill + (k * h) / rows, 0.01);
    add(box(w + 2 * fw, 0.05, 0.16), frameMat, 0, sill - fw, 0.03); // sill ledge
    return [grp];
  }

  // door
  const h = heightM > 0 ? heightM : 2.05;
  const fw = 0.07; // casing width
  const yc = h / 2;
  const caseMat = new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 0.8 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb2, roughness: 0.85 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xc3b496, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaedcf0, transparent: true, opacity: 0.4, roughness: 0.1 });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.6 });
  const leaves = design === "double" ? 2 : 1;
  const lw = (w - (leaves - 1) * 0.02) / leaves; // per-leaf width
  add(box(fw, h + fw, 0.12), caseMat, -w / 2 - fw / 2, yc, 0); // left casing
  add(box(fw, h + fw, 0.12), caseMat, w / 2 + fw / 2, yc, 0); // right casing
  add(box(w + 2 * fw, fw, 0.12), caseMat, 0, h + fw / 2, 0); // head casing
  for (let li = 0; li < leaves; li++) {
    const lx = -w / 2 + lw / 2 + li * (lw + 0.02);
    add(box(lw - 0.02, h - 0.03, 0.05), leafMat, lx, yc, 0); // leaf
    if (design === "glazed") {
      add(box(lw * 0.7, h * 0.42, 0.02), glassMat, lx, yc + h * 0.2, 0.03); // glass upper
      add(box(lw * 0.7, h * 0.26, 0.02), panelMat, lx, yc - h * 0.26, 0.03); // panel lower
    } else if (design !== "solid") {
      add(box(lw * 0.66, h * 0.34, 0.02), panelMat, lx, yc + h * 0.22, 0.03); // upper panel
      add(box(lw * 0.66, h * 0.34, 0.02), panelMat, lx, yc - h * 0.22, 0.03); // lower panel
    }
    const hx = leaves === 2 ? (li === 0 ? lx + lw / 2 - 0.08 : lx - lw / 2 + 0.08) : lx + lw / 2 - 0.1;
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 12), handleMat, hx, yc, 0.06); // handle
  }
  return [grp];
}

// a wall fitting (socket/switch, radiator, vent) on the inner face at fraction `t`
function makeFitting(
  I0: { x: number; z: number },
  I1: { x: number; z: number },
  fit: Fitting,
  inwardX: number,
  inwardZ: number,
  ceilingM: number,
): THREE.Mesh[] {
  const cx = I0.x + (I1.x - I0.x) * fit.t;
  const cz = I0.z + (I1.z - I0.z) * fit.t;
  const angle = Math.atan2(I1.z - I0.z, I1.x - I0.x);
  const widthM = fit.width / 1000;

  let w: number;
  let h: number;
  let depth: number;
  let yc: number;
  let color: number;
  if (fit.category === "heating") {
    w = Math.max(widthM, 0.5);
    h = 0.5;
    depth = 0.09;
    yc = 0.4; // sits low on the wall
    color = 0xf2efe8;
  } else if (fit.category === "vent") {
    w = Math.max(widthM, 0.2);
    h = w;
    depth = 0.05;
    yc = ceilingM - 0.45; // near the ceiling
    color = 0xd0d0d0;
  } else {
    w = 0.12; // socket / switch plate
    h = 0.12;
    depth = 0.035;
    yc = fit.kind.startsWith("switch") ? 1.25 : 1.05;
    color = 0xf4f4f4;
  }
  if (fit.height != null && fit.category !== "electric") h = Math.max(0.1, fit.height / 1000);
  if (fit.mountY != null) yc = Math.max(h / 2, Math.min(ceilingM - h / 2, fit.mountY / 1000));

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
  const meshes = [plate];
  // a darker inset face so it reads against the wall
  if (fit.category === "electric") {
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.55, h * 0.55, depth + 0.01),
      new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.7 }),
    );
    meshes.push(face);
  }
  for (const m of meshes) {
    m.position.set(cx + inwardX * (depth / 2 + 0.01), yc, cz + inwardZ * (depth / 2 + 0.01));
    m.rotation.y = -angle;
    m.userData.fitting = fit.id; // raycast target → selects/drags this item
  }
  return meshes;
}

export function makeRoom(
  outer: { x: number; z: number }[],
  inner: { x: number; z: number }[],
  ceilingM: number,
  wood: THREE.Texture,
  openings: Opening[],
  interior: { x: number; z: number }[][],
  fittings: Fitting[],
  wallSurfaces: Record<number, Surface>,
  selected: number | null,
  selectedFit: string | null,
  selectedOpen: string | null,
  floorSel: boolean,
): { group: THREE.Group; walls: WallInfo[] } {
  const g = new THREE.Group();

  // floor (UVs are in metres → wood tiles ~1 plank-set per metre)
  const floorShape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.z)));
  const floorGeo = new THREE.ShapeGeometry(floorShape);
  floorGeo.rotateX(Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95, side: THREE.DoubleSide });
  if (floorSel) {
    floorMat.emissive = new THREE.Color(0x2a6df0);
    floorMat.emissiveIntensity = 0.18;
  }
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.userData.floor = true; // raycast target → selects the floor
  g.add(floor);

  const cx = outer.reduce((s, p) => s + p.x, 0) / outer.length;
  const cz = outer.reduce((s, p) => s + p.z, 0) / outer.length;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 1 });
  const walls: WallInfo[] = [];
  const wallNormals: { nx: number; nz: number; mx: number; mz: number }[] = []; // per room wall
  const n = outer.length;
  const T3 = 0.1; // wall thickness (m)
  // wall centreline (between outer and inner faces) — openings are placed/cut here
  const centerline = outer.map((p, i) => ({ x: (p.x + inner[i].x) / 2, z: (p.z + inner[i].z) / 2 }));
  for (let i = 0; i < n; i++) {
    const O0 = outer[i];
    const O1 = outer[(i + 1) % n];
    const I0 = inner[i];
    const I1 = inner[(i + 1) % n];
    // outward normal + midpoint (every piece of this wall culls together)
    const dx = O1.x - O0.x;
    const dz = O1.z - O0.z;
    const mx = (O0.x + O1.x) / 2;
    const mz = (O0.z + O1.z) / 2;
    let nx = dz;
    let nz = -dx;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    if ((mx - cx) * nx + (mz - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    wallNormals[i] = { nx, nz, mx, mz };
    const addCull = (mesh: THREE.Mesh) => {
      mesh.userData.wall = i; // raycast target → selects this wall
      g.add(mesh);
      walls.push({ mesh, nx, nz, mx, mz });
    };

    const wallOps = openings.filter((o) => o.wall === i).sort((a, b) => a.t - b.t);
    if (wallOps.length === 0) {
      // solid wall — extruded footprint quad (keeps mitred corners)
      const shape = new THREE.Shape([
        new THREE.Vector2(O0.x, -O0.z),
        new THREE.Vector2(O1.x, -O1.z),
        new THREE.Vector2(I1.x, -I1.z),
        new THREE.Vector2(I0.x, -I0.z),
      ]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: ceilingM, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      addCull(new THREE.Mesh(geo, wallMat));
      continue;
    }
    // wall with openings → pillars + lintels (+ window sills) leave a real hole
    const C0 = centerline[i];
    const C1 = centerline[(i + 1) % n];
    const L = Math.hypot(C1.x - C0.x, C1.z - C0.z) || 1;
    const u = { x: (C1.x - C0.x) / L, z: (C1.z - C0.z) / L };
    const angY = -Math.atan2(u.z, u.x);
    const piece = (s0: number, s1: number, h0: number, h1: number) => {
      const len = s1 - s0;
      const ht = h1 - h0;
      if (len <= 0.002 || ht <= 0.002) return;
      const ms = (s0 + s1) / 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(len, ht, T3), wallMat);
      box.position.set(C0.x + u.x * ms, (h0 + h1) / 2, C0.z + u.z * ms);
      box.rotation.y = angY;
      addCull(box);
    };
    let cursor = 0;
    for (const op of wallOps) {
      const c = op.t * L;
      const hw = Math.min(op.width / 1000, L) / 2;
      const sill = (op.sill ?? defaultOpeningSill(op.kind, op.design)) / 1000;
      const oh = (op.height ?? 0) / 1000 || (op.kind === "window" ? 1.2 : 2.05);
      const top = Math.min(ceilingM, sill + oh);
      const a = Math.max(cursor, c - hw);
      const b = Math.min(L, c + hw);
      if (a > cursor) piece(cursor, a, 0, ceilingM); // pillar before the hole
      if (top < ceilingM) piece(a, b, top, ceilingM); // lintel above
      if (sill > 0) piece(a, b, 0, sill); // sill below (windows)
      cursor = Math.max(cursor, b);
    }
    if (cursor < L) piece(cursor, L, 0, ceilingM); // final pillar
  }

  // paint surfaces + selection highlight on the inner face of each room wall
  for (let i = 0; i < n; i++) {
    const wn = wallNormals[i];
    if (!wn) continue;
    const I0 = inner[i];
    const I1 = inner[(i + 1) % n];
    const L = Math.hypot(I1.x - I0.x, I1.z - I0.z) || 1;
    const u = { x: (I1.x - I0.x) / L, z: (I1.z - I0.z) / L };
    const inward = { x: -wn.nx, z: -wn.nz }; // into the room
    const rotY = Math.atan2(-u.z, u.x);
    // openings on this wall in face coords (along 0..L, up 0..ceiling) — cut from paint
    const faceOpenings = openings
      .filter((o) => o.wall === i)
      .map((o) => {
        const half = Math.min(o.width / 1000, L) / 2;
        const c = o.t * L;
        const sill = (o.sill ?? defaultOpeningSill(o.kind, o.design)) / 1000;
        const oh = (o.height ?? 0) / 1000 || (o.kind === "window" ? 1.2 : 2.05);
        return { a0: Math.max(0, c - half), a1: Math.min(L, c + half), b0: sill, b1: Math.min(ceilingM, sill + oh) };
      });
    const facePlane = (x0: number, x1: number, y0: number, y1: number, off: number, mat: THREE.Material) => {
      const a0 = x0 * L;
      const a1 = x1 * L;
      const b0 = y0 * ceilingM;
      const b1 = y1 * ceilingM;
      const w = a1 - a0;
      const h = b1 - b0;
      if (w <= 0.001 || h <= 0.001) return;
      const ac = (a0 + a1) / 2;
      const bc = (b0 + b1) / 2;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2, -h / 2);
      shape.lineTo(w / 2, -h / 2);
      shape.lineTo(w / 2, h / 2);
      shape.lineTo(-w / 2, h / 2);
      shape.closePath();
      for (const fo of faceOpenings) {
        const ha0 = Math.max(a0, fo.a0);
        const ha1 = Math.min(a1, fo.a1);
        const hb0 = Math.max(b0, fo.b0);
        const hb1 = Math.min(b1, fo.b1);
        if (ha1 - ha0 > 0.01 && hb1 - hb0 > 0.01) {
          const hole = new THREE.Path();
          hole.moveTo(ha0 - ac, hb0 - bc);
          hole.lineTo(ha1 - ac, hb0 - bc);
          hole.lineTo(ha1 - ac, hb1 - bc);
          hole.lineTo(ha0 - ac, hb1 - bc);
          hole.closePath();
          shape.holes.push(hole);
        }
      }
      const plane = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
      plane.position.set(I0.x + u.x * ac + inward.x * off, bc, I0.z + u.z * ac + inward.z * off);
      plane.rotation.y = rotY;
      plane.userData.wall = i;
      g.add(plane);
      walls.push({ mesh: plane, nx: wn.nx, nz: wn.nz, mx: wn.mx, mz: wn.mz });
    };
    const surf = wallSurfaces[i] ?? defaultSurface();
    for (const lr of leafRects(surf)) {
      const col = coveringColor(lr.c);
      if (!col) continue;
      facePlane(lr.x0, lr.x1, lr.y0, lr.y1, 0.012, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, side: THREE.DoubleSide }));
    }
    if (selected === i) {
      facePlane(0, 1, 0, 1, 0.02, new THREE.MeshStandardMaterial({ color: 0x2a6df0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    }
  }

  // flat list of interior-wall segments (same order/index as model wallSegments)
  const interiorSegs: { a: { x: number; z: number }; b: { x: number; z: number } }[] = [];
  for (const poly of interior) for (let i = 0; i < poly.length - 1; i++) interiorSegs.push({ a: poly[i], b: poly[i + 1] });

  // interior (free-drawn) walls — full height, not culled; segmented around their
  // openings exactly like room walls so drawn-wall openings are true cut-throughs
  const IWT = 0.1; // drawn wall thickness (m)
  interiorSegs.forEach((seg, idx) => {
    const gi = n + idx;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.02) return;
    const u = { x: dx / L, z: dz / L };
    const angY = -Math.atan2(dz, dx);
    const iwPiece = (s0: number, s1: number, h0: number, h1: number) => {
      const len = s1 - s0;
      const ht = h1 - h0;
      if (len <= 0.002 || ht <= 0.002) return;
      const ms = (s0 + s1) / 2;
      const box = new THREE.Mesh(new THREE.BoxGeometry(len, ht, IWT), wallMat);
      box.position.set(seg.a.x + u.x * ms, (h0 + h1) / 2, seg.a.z + u.z * ms);
      box.rotation.y = angY;
      g.add(box);
    };
    const segOps = openings.filter((o) => o.wall === gi).sort((p, q) => p.t - q.t);
    if (segOps.length === 0) {
      iwPiece(0, L, 0, ceilingM);
      return;
    }
    let cursor = 0;
    for (const op of segOps) {
      const c = op.t * L;
      const hw = Math.min(op.width / 1000, L) / 2;
      const sill = (op.sill ?? defaultOpeningSill(op.kind, op.design)) / 1000;
      const oh = (op.height ?? 0) / 1000 || (op.kind === "window" ? 1.2 : 2.05);
      const top = Math.min(ceilingM, sill + oh);
      const pa = Math.max(cursor, c - hw);
      const pb = Math.min(L, c + hw);
      if (pa > cursor) iwPiece(cursor, pa, 0, ceilingM);
      if (top < ceilingM) iwPiece(pa, pb, top, ceilingM);
      if (sill > 0) iwPiece(pa, pb, 0, sill);
      cursor = Math.max(cursor, pb);
    }
    if (cursor < L) iwPiece(cursor, L, 0, ceilingM);
  });
  // fill the corner joints of multi-segment drawn walls so segments fully intersect
  for (const poly of interior) {
    const k = poly.length;
    const closed = k > 3 && Math.hypot(poly[0].x - poly[k - 1].x, poly[0].z - poly[k - 1].z) < 0.05;
    for (let i = 0; i < k; i++) {
      const joint = (i > 0 && i < k - 1) || (closed && i === 0);
      if (!joint) continue;
      const p = poly[i];
      const box = new THREE.Mesh(new THREE.BoxGeometry(IWT, ceilingM, IWT), wallMat);
      box.position.set(p.x, ceilingM / 2, p.z);
      g.add(box);
    }
  }
  const perp = (seg: { a: { x: number; z: number }; b: { x: number; z: number } }) => {
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const L = Math.hypot(dx, dz) || 1;
    return { x: -dz / L, z: dx / L };
  };

  // opening fills (glass / door leaf) seated in the hole; the bare wall opening
  // fills nothing. Room-wall fills cull with their wall; drawn-wall fills stay.
  const tagOpening = (o: THREE.Object3D, id: string) => {
    o.userData.opening = id; // raycast target → selects this opening
    if (id === selectedOpen) {
      o.traverse((c) => {
        const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat && "emissive" in mat) {
          mat.emissive = new THREE.Color(0x2a6df0);
          mat.emissiveIntensity = 0.55;
        }
      });
    }
    return o;
  };
  for (const op of openings) {
    if (op.wall < n) {
      const wi = wallNormals[op.wall];
      if (!wi) continue;
      const meshes = makeOpening(centerline[op.wall], centerline[(op.wall + 1) % n], op.t, op.width / 1000, (op.height ?? 0) / 1000, op.kind, op.design, (op.sill ?? defaultOpeningSill(op.kind, op.design)) / 1000);
      for (const m of meshes) {
        g.add(tagOpening(m, op.id));
        walls.push({ mesh: m, nx: wi.nx, nz: wi.nz, mx: wi.mx, mz: wi.mz });
      }
    } else {
      const seg = interiorSegs[op.wall - n];
      if (!seg) continue;
      for (const m of makeOpening(seg.a, seg.b, op.t, op.width / 1000, (op.height ?? 0) / 1000, op.kind, op.design, (op.sill ?? defaultOpeningSill(op.kind, op.design)) / 1000)) g.add(tagOpening(m, op.id));
    }
  }

  // wall fittings — room walls cull, drawn-wall fittings stay visible
  const litFit = (m: THREE.Mesh) => {
    if (m.userData.fitting === selectedFit) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissive = new THREE.Color(0x2a6df0);
      mat.emissiveIntensity = 0.5;
    }
    return m;
  };
  for (const fit of fittings) {
    if (fit.wall < n) {
      const wi = wallNormals[fit.wall];
      if (!wi) continue;
      const meshes = makeFitting(inner[fit.wall], inner[(fit.wall + 1) % n], fit, -wi.nx, -wi.nz, ceilingM);
      for (const m of meshes) {
        g.add(litFit(m));
        walls.push({ mesh: m, nx: wi.nx, nz: wi.nz, mx: wi.mx, mz: wi.mz });
      }
    } else {
      const seg = interiorSegs[fit.wall - n];
      if (!seg) continue;
      const pn = perp(seg);
      for (const m of makeFitting(seg.a, seg.b, fit, pn.x, pn.z, ceilingM)) g.add(litFit(m));
    }
  }

  // crisp floor outline
  const loop = outer.map((p) => new THREE.Vector3(p.x, 0.004, p.z));
  loop.push(loop[0].clone());
  g.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(loop),
      new THREE.LineBasicMaterial({ color: 0x9a9a9a }),
    ),
  );
  return { group: g, walls };
}

interface Api {
  setView: (v: SceneView) => void;
  rebuild: (points: Pt[], ceilingMm: number, openings: Opening[], color: string, interior: Pt[][], fittings: Fitting[], wallSurfaces: Record<number, Surface>, selected: number | null, selectedFit: string | null, selectedOpen: string | null, floorSel: boolean) => void;
  dispose: () => void;
}

export function ThreeScene({
  points,
  ceiling,
  view,
  openings,
  coveringColor,
  interiorWalls,
  fittings,
  wallSurfaces,
  selectedWall3D,
  selectedFit3D,
  selectedOpen3D,
  floorSel3D,
  onWallClick,
  onFittingClick,
  onFittingDrag,
  onOpeningClick,
  onFloorClick,
}: {
  points: Pt[];
  ceiling: number;
  view: SceneView;
  openings: Opening[];
  coveringColor: string;
  interiorWalls: Pt[][];
  fittings: Fitting[];
  wallSurfaces: Record<number, Surface>;
  selectedWall3D: number | null;
  selectedFit3D: string | null;
  selectedOpen3D: string | null;
  floorSel3D: boolean;
  onWallClick: (wall: number | null) => void;
  onFittingClick: (id: string) => void;
  onFittingDrag: (id: string, x: number, y: number, heightMm: number) => void;
  onOpeningClick: (id: string) => void;
  onFloorClick: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const cbRef = useRef({ onWallClick, onFittingClick, onFittingDrag, onOpeningClick, onFloorClick });
  cbRef.current = { onWallClick, onFittingClick, onFittingDrag, onOpeningClick, onFloorClick };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const w0 = mount.clientWidth || 320;
    const h0 = mount.clientHeight || 480;
    renderer.setSize(w0, h0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.05, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    const center = new THREE.Vector3(0, 0, 0);
    controls.target.copy(center);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.25));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 8, 6);
    scene.add(dir);

    let wood: THREE.Texture | null = null;

    let needs = true;
    const invalidate = () => {
      needs = true;
    };
    controls.addEventListener("change", invalidate);

    let room: THREE.Group | null = null;
    let walls: WallInfo[] = [];
    let woodColor = ""; // cache the floor texture across rebuilds (drag = many rebuilds)
    const bounds = { cx: 0, cy: 0 }; // mm origin, for converting 3D hits back to mm
    const disposeGroup = (gr: THREE.Group) => {
      gr.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    };
    const rebuild = (pts: Pt[], ceilMm: number, ops: Opening[], color: string, interior: Pt[][], fits: Fitting[], surfaces: Record<number, Surface>, selected: number | null, selectedFit: string | null, selectedOpen: string | null, floorSel: boolean) => {
      if (room) {
        scene.remove(room);
        disposeGroup(room);
      }
      if (!wood || woodColor !== color) {
        wood?.dispose();
        wood = makeWoodTexture(color);
        woodColor = color;
      }
      // outer + mitred inner (wall thickness 100mm), both centred on the outer bounds
      const b = polygonBoundsMm(pts);
      bounds.cx = b.cx;
      bounds.cy = b.cy;
      const innerMm = offsetPolygon(pts, 100);
      const toM = (p: Pt) => ({ x: (p.x - b.cx) / 1000, z: (p.y - b.cy) / 1000 });
      const built = makeRoom(
        pts.map(toM),
        innerMm.map(toM),
        ceilMm / 1000,
        wood,
        ops,
        interior.map((poly) => poly.map(toM)),
        fits,
        surfaces,
        selected,
        selectedFit,
        selectedOpen,
        floorSel,
      );
      room = built.group;
      walls = built.walls;
      scene.add(room);
      invalidate();
    };

    const fit = () => {
      const b = polygonBoundsMm(points);
      return Math.max(b.w, b.h) / 1000;
    };
    const setView = (v: SceneView) => {
      const d = fit();
      if (v === "plan") {
        camera.position.set(0, d * 2.2, 0.001);
        controls.enableRotate = false;
      } else if (v === "front") {
        camera.position.set(0, d * 0.45, d * 1.7);
        controls.enableRotate = false;
      } else {
        camera.position.set(d * 1.1, d * 0.95, d * 1.1);
        controls.enableRotate = true;
      }
      controls.target.copy(center);
      camera.lookAt(center);
      controls.update();
      invalidate();
    };

    // hide walls between the camera and the interior
    const updateCull = () => {
      for (const wll of walls) {
        const dot = (camera.position.x - wll.mx) * wll.nx + (camera.position.z - wll.mz) * wll.nz;
        wll.mesh.visible = dot <= 0.001;
      }
    };

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w && h) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        invalidate();
      }
    });
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      if (needs) {
        updateCull();
        renderer.render(scene, camera);
        needs = false;
      }
    };
    raf = requestAnimationFrame(loop);

    // picking + dragging: a tap selects a wall / fitting; pressing a fitting and
    // dragging moves it along the wall (and onto other walls), sticking to walls.
    const raycaster = new THREE.Raycaster();
    const downXY = { x: 0, y: 0 };
    let dragId: string | null = null;
    const ndcOf = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    // resolve a hit object (often a nested group child) to its target by walking parents
    type Target = { kind: "fitting" | "opening" | "wall" | "floor"; id?: string; wall?: number };
    const targetOf = (obj: THREE.Object3D | null): Target | null => {
      let o: THREE.Object3D | null = obj;
      while (o) {
        if (o.userData.fitting != null) return { kind: "fitting", id: o.userData.fitting as string };
        if (o.userData.opening != null) return { kind: "opening", id: o.userData.opening as string };
        if (o.userData.floor) return { kind: "floor" };
        if (o.userData.wall != null) return { kind: "wall", wall: o.userData.wall as number };
        o = o.parent;
      }
      return null;
    };
    const nearestTarget = (e: PointerEvent): Target | null => {
      if (!room) return null;
      raycaster.setFromCamera(ndcOf(e), camera);
      const hits = raycaster.intersectObjects(room.children, true).filter((h) => h.object.visible);
      return hits.length ? targetOf(hits[0].object) : null;
    };
    const onDown = (e: PointerEvent) => {
      downXY.x = e.clientX;
      downXY.y = e.clientY;
      const t = nearestTarget(e);
      if (t?.kind === "fitting") {
        dragId = t.id!;
        controls.enabled = false; // don't orbit while moving an item
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragId || !room) return;
      raycaster.setFromCamera(ndcOf(e), camera);
      const hit = raycaster.intersectObjects(room.children, true).filter((h) => h.object.visible && targetOf(h.object)?.kind === "wall")[0];
      if (!hit) return;
      const p = hit.point;
      cbRef.current.onFittingDrag(dragId, p.x * 1000 + bounds.cx, p.z * 1000 + bounds.cy, p.y * 1000);
    };
    const onPick = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downXY.x, e.clientY - downXY.y);
      if (dragId) {
        const id = dragId;
        dragId = null;
        controls.enabled = true;
        if (moved <= 6) cbRef.current.onFittingClick(id); // press-release = select
        return;
      }
      if (moved > 6 || !room) return;
      const t = nearestTarget(e);
      if (t?.kind === "fitting") cbRef.current.onFittingClick(t.id!);
      else if (t?.kind === "opening") cbRef.current.onOpeningClick(t.id!);
      else if (t?.kind === "floor") cbRef.current.onFloorClick();
      else cbRef.current.onWallClick(t?.kind === "wall" ? t.wall! : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onPick);

    rebuild(points, ceiling, openings, coveringColor, interiorWalls, fittings, wallSurfaces, selectedWall3D, selectedFit3D, selectedOpen3D, floorSel3D);
    setView(view);

    apiRef.current = {
      setView,
      rebuild,
      dispose: () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onPick);
        controls.removeEventListener("change", invalidate);
        controls.dispose();
        if (room) disposeGroup(room);
        wood?.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      },
    };

    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // built once; prop changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.rebuild(points, ceiling, openings, coveringColor, interiorWalls, fittings, wallSurfaces, selectedWall3D, selectedFit3D, selectedOpen3D, floorSel3D);
  }, [points, ceiling, openings, coveringColor, interiorWalls, fittings, wallSurfaces, selectedWall3D, selectedFit3D, selectedOpen3D, floorSel3D]);

  useEffect(() => {
    apiRef.current?.setView(view);
  }, [view]);

  return <div ref={mountRef} className="scene-canvas" />;
}
