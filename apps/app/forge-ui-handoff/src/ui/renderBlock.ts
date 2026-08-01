import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { mm10ToMeters } from "../contract/types";
import type { Panel, Hole } from "../contract/types";
import { ldspMaterial, edgeMaterial, hdfMaterial } from "./materials";

const RENDER_AXIS = { width: "x", height: "y", depth: "z" } as const;

const BOX_FACES = {
  x: { max: 0, min: 1 },
  y: { max: 2, min: 3 },
  z: { max: 4, min: 5 }
} as const;

type PanelCuts = {
  windows?: ReadonlyArray<{w: number;h: number;radius: number;cx: number;cy: number;}>;
  rounds?: ReadonlyArray<{cornerId: string;radius: number;}>;
  notches?: ReadonlyArray<{edgeId: string;width: number;depth: number;radius: number;pos: number;}>;
  chamfers?: ReadonlyArray<{edgeId: string;width: number;depth: number;}>;
};

function facePoints(x0: number, x1: number, y0: number, y1: number, cuts: PanelCuts): THREE.Vector2[] {
  const W = x1 - x0,H = y1 - y0;
  const radOf = (id: string) => {
    const r = (cuts.rounds ?? []).find((x) => x.cornerId === id);
    return r && r.radius > 0 ? Math.min(mm10ToMeters(r.radius), W / 2, H / 2) : 0;
  };
  const nOf = (id: string) => {
    const n = (cuts.notches ?? []).find((x) => x.edgeId === id && x.width > 0);
    return n ? { w: mm10ToMeters(n.width), d: mm10ToMeters(n.depth), pos: mm10ToMeters(n.pos), rr: Math.max(0, Math.min(mm10ToMeters(n.radius), mm10ToMeters(n.width) / 2, mm10ToMeters(n.depth))) } : null;
  };
  const rBL = radOf("c00"),rBR = radOf("c10"),rTR = radOf("c11"),rTL = radOf("c01");
  const P: THREE.Vector2[] = [];
  const v = (x: number, y: number) => P.push(new THREE.Vector2(x, y));
  const carc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    const N = 6;
    for (let i = 1; i <= N; i++) {const a = a0 + (a1 - a0) * (i / N);v(cx + r * Math.cos(a), cy + r * Math.sin(a));}
  };
  const dent = (n: {w: number;d: number;pos: number;rr: number;}, map: (a: number, i: number) => [number, number], entry: number, exit: number) => {
    const dir = Math.sign(exit - entry) || 1;
    const d = n.d,rr = Math.min(n.rr, Math.abs(exit - entry) / 2);
    const pt = (a: number, i: number) => {const m = map(a, i);v(m[0], m[1]);};
    const parc = (ca: number, ci: number, t0: number, t1: number) => {
      const N = 4;
      for (let i = 1; i <= N; i++) {const t = t0 + (t1 - t0) * (i / N);const m = map(ca + rr * Math.cos(t), ci + rr * Math.sin(t));v(m[0], m[1]);}
    };
    pt(entry, 0);
    pt(entry, d - rr);
    if (rr > 0) parc(entry + dir * rr, d - rr, dir > 0 ? Math.PI : 0, Math.PI / 2);
    pt(exit - dir * rr, d);
    if (rr > 0) parc(exit - dir * rr, d - rr, Math.PI / 2, dir > 0 ? 0 : Math.PI);
    pt(exit, 0);
  };
  v(x0 + rBL, y0);
  const n0 = nOf("e0");
  if (n0) dent(n0, (a, i) => [a, y0 + i], n0.pos - n0.w / 2, n0.pos + n0.w / 2);
  v(x1 - rBR, y0);
  if (rBR > 0) carc(x1 - rBR, y0 + rBR, rBR, -Math.PI / 2, 0);
  const n3 = nOf("e3");
  if (n3) dent(n3, (a, i) => [x1 - i, a], n3.pos - n3.w / 2, n3.pos + n3.w / 2);
  v(x1, y1 - rTR);
  if (rTR > 0) carc(x1 - rTR, y1 - rTR, rTR, 0, Math.PI / 2);
  const n1 = nOf("e1");
  if (n1) dent(n1, (a, i) => [a, y1 - i], n1.pos + n1.w / 2, n1.pos - n1.w / 2);
  v(x0 + rTL, y1);
  if (rTL > 0) carc(x0 + rTL, y1 - rTL, rTL, Math.PI / 2, Math.PI);
  const n2 = nOf("e2");
  if (n2) dent(n2, (a, i) => [x0 + i, a], n2.pos + n2.w / 2, n2.pos - n2.w / 2);
  v(x0, y0 + rBL);
  if (rBL > 0) carc(x0 + rBL, y0 + rBL, rBL, Math.PI, Math.PI * 1.5);
  return P;
}

function shapeWithHole(pts: THREE.Vector2[], cuts: PanelCuts, faE: number, fbE: number): THREE.Shape {
  const shape = new THREE.Shape(pts);
  const M = 0.002;
  for (const win of cuts.windows ?? []) {
    if (win.w <= 0 || win.h <= 0) continue;
    const wW = Math.min(mm10ToMeters(win.w), faE - 2 * M);
    const wH = Math.min(mm10ToMeters(win.h), fbE - 2 * M);
    if (wW <= 0.001 || wH <= 0.001) continue;
    const cx = Math.max(wW / 2 + M, Math.min(faE - wW / 2 - M, mm10ToMeters(win.cx)));
    const cy = Math.max(wH / 2 + M, Math.min(fbE - wH / 2 - M, mm10ToMeters(win.cy)));
    const hole = new THREE.Path();
    roundedRectPath(hole, cx - wW / 2, cy - wH / 2, wW, wH, Math.min(mm10ToMeters(win.radius), wW / 2, wH / 2));
    shape.holes.push(hole);
  }
  return shape;
}

function geoValid(g: THREE.BufferGeometry, faE: number, fbE: number, thickE: number): boolean {
  const pos = g.getAttribute("position");
  if (!pos || pos.count < 3) return false;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (!bb || !Number.isFinite(bb.min.x) || !Number.isFinite(bb.max.x)) return false;
  const T = 0.01;
  return bb.min.x >= -T && bb.min.y >= -T && bb.min.z >= -T && bb.max.x <= faE + T && bb.max.y <= fbE + T && bb.max.z <= thickE + T;
}

function faceAxes(p: Panel): {fa: "width" | "height" | "depth";fb: "width" | "height" | "depth";thick: "width" | "height" | "depth";} {
  const AX = ["width", "height", "depth"] as const;
  const ox = p.orientation?.xAxis;
  const oy = p.orientation?.yAxis;
  const thick = ox && oy ? AX.find((a) => a !== ox && a !== oy)! : p.width <= p.height && p.width <= p.depth ? "width" : p.height <= p.depth ? "height" : "depth";
  const face = AX.filter((a) => a !== thick);
  return { fa: face[0]!, fb: face[1]!, thick };
}

function roundedRectPath(path: THREE.Path, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  if (rr > 0) path.absarc(x + w - rr, y + rr, rr, -Math.PI / 2, 0, false);
  path.lineTo(x + w, y + h - rr);
  if (rr > 0) path.absarc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2, false);
  path.lineTo(x + rr, y + h);
  if (rr > 0) path.absarc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + rr);
  if (rr > 0) path.absarc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5, false);
}

function buildExtrudeGeometry(p: Panel, cuts: PanelCuts): THREE.BufferGeometry {
  const { fa, fb, thick } = faceAxes(p);
  const faE = Math.max(mm10ToMeters(p[fa]), 0.001);
  const fbE = Math.max(mm10ToMeters(p[fb]), 0.001);
  const thickE = Math.max(mm10ToMeters(p[thick]), 0.001);
  const chamfers = (cuts.chamfers ?? []).filter((c) => c.width > 0 && c.depth > 0);

  const buildGeo = (cts: PanelCuts): THREE.BufferGeometry => {
    if (chamfers.length === 0) {
      return new THREE.ExtrudeGeometry(shapeWithHole(facePoints(0, faE, 0, fbE, cts), cts, faE, fbE), { depth: thickE, bevelEnabled: false, steps: 1 });
    }
    const D = Math.min(thickE * 0.98, Math.max(...chamfers.map((c) => mm10ToMeters(c.depth))));
    const insetOf = (id: string, maxE: number) => {
      const c = chamfers.find((x) => x.edgeId === id);
      return c ? Math.min(mm10ToMeters(c.width), maxE * 0.45) : 0;
    };
    const iL = insetOf("e2", faE),iR = insetOf("e3", faE),iB = insetOf("e0", fbE),iT = insetOf("e1", fbE);
    const low = new THREE.ExtrudeGeometry(shapeWithHole(facePoints(0, faE, 0, fbE, cts), cts, faE, fbE), { depth: thickE - D, bevelEnabled: false, steps: 1 });
    const up = new THREE.ExtrudeGeometry(shapeWithHole(facePoints(iL, faE - iR, iB, fbE - iT, cts), cts, faE, fbE), { depth: D, bevelEnabled: false, steps: 1 });
    up.translate(0, 0, thickE - D);
    const merged = mergeGeometries([low, up], false);
    if (merged) {low.dispose();up.dispose();return merged;}
    up.dispose();
    return low;
  };

  let geo = buildGeo(cuts);
  if (!geoValid(geo, faE, fbE, thickE) && (cuts.windows?.length ?? 0) > 0) {
    geo.dispose();
    geo = buildGeo({ ...cuts, windows: [] });
  }
  geo.translate(-faE / 2, -fbE / 2, -thickE / 2);
  const AXVEC: Record<string, [number, number, number]> = { width: [1, 0, 0], height: [0, 1, 0], depth: [0, 0, 1] };
  const ua = new THREE.Vector3(...AXVEC[fa]);
  const ub = new THREE.Vector3(...AXVEC[fb]);
  const n = new THREE.Vector3().crossVectors(ua, ub);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(ua, ub, n));
  return geo;
}

function hasAnyCut(c: PanelCuts | undefined): boolean {
  if (!c) return false;
  if (c.windows && c.windows.some((w) => w.w > 0 && w.h > 0)) return true;
  if (c.rounds && c.rounds.some((r) => r.radius > 0)) return true;
  if (c.notches && c.notches.some((n) => n.width > 0)) return true;
  if (c.chamfers && c.chamfers.some((x) => x.width > 0 && x.depth > 0)) return true;
  return false;
}

type GeoCacheEntry = {key: string;geo: THREE.BufferGeometry;edgesGeo: THREE.BufferGeometry;};

export function buildBlockGroup(
panels: Panel[],
holes: Hole[],
selectedPanelId: string | null,
cutsById?: Record<string, PanelCuts>,
geoCache?: Map<string, GeoCacheEntry>)
: THREE.Group {
  const group = new THREE.Group();
  const ldspMat = ldspMaterial();
  const hdfMat = hdfMaterial();
  const edge = edgeMaterial();
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.95 });

  const selectedMaterial = new THREE.MeshStandardMaterial({
    color: 0xbed6f5,
    roughness: 0.5,
    metalness: 0.1
  });
  const selectedEdgeMaterial = new THREE.LineBasicMaterial({
    color: 0x3b82f6
  });

  const midX = 3000;
  const midZ = 2800;

  for (const p of panels) {
    const w = Math.max(mm10ToMeters(p.width), 0.001);
    const h = Math.max(mm10ToMeters(p.height), 0.001);
    const d = Math.max(mm10ToMeters(p.depth), 0.001);

    const isSelected = p.id === selectedPanelId;
    const pcut = cutsById?.[p.id];
    const cut = hasAnyCut(pcut);
    let geometry: THREE.BufferGeometry;
    let edgesGeo: THREE.BufferGeometry;
    if (cut) {
      const key = JSON.stringify(pcut);
      const cached = geoCache?.get(p.id);
      if (cached && cached.key === key) {
        geometry = cached.geo;
        edgesGeo = cached.edgesGeo;
      } else {
        geometry = buildExtrudeGeometry(p, pcut!);
        edgesGeo = new THREE.EdgesGeometry(geometry);
        if (geoCache) {
          if (cached) {cached.geo.dispose();cached.edgesGeo.dispose();}
          geoCache.set(p.id, { key, geo: geometry, edgesGeo });
        }
      }
    } else {
      const cached = geoCache?.get(p.id);
      if (cached) {cached.geo.dispose();cached.edgesGeo.dispose();geoCache?.delete(p.id);}
      geometry = new THREE.BoxGeometry(w, h, d);
      edgesGeo = new THREE.EdgesGeometry(geometry);
    }
    const px = mm10ToMeters(p.x + p.width / 2 - midX);
    const py = mm10ToMeters(p.y + p.height / 2);
    const pz = mm10ToMeters(p.z + p.depth / 2 - midZ);

    const baseMat = p.material === "hdf" ? hdfMat : ldspMat;
    const meshMat = isSelected ? selectedMaterial : baseMat;
    const edgeMatToUse = isSelected ? selectedEdgeMaterial : edge;

    const k1Mat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.8 });
    const k2Mat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.8 });
    const getBMat = (thick: number) => {
      if (thick <= 0) return meshMat;
      if (thick <= 5) return k2Mat;
      return k1Mat;
    };

    let faceMaterials: THREE.Material | THREE.Material[] = meshMat;
    if (p.bands && p.orientation && !isSelected && !cut) {
      const mats: THREE.Material[] = [meshMat, meshMat, meshMat, meshMat, meshMat, meshMat];
      const xf = BOX_FACES[RENDER_AXIS[p.orientation.xAxis]];
      const yf = BOX_FACES[RENDER_AXIS[p.orientation.yAxis]];
      mats[yf.max] = getBMat(p.bands[0] ?? 0);
      mats[yf.min] = getBMat(p.bands[1] ?? 0);
      mats[xf.max] = getBMat(p.bands[2] ?? 0);
      mats[xf.min] = getBMat(p.bands[3] ?? 0);
      faceMaterials = mats;
    }

    const mesh = new THREE.Mesh(geometry, faceMaterials);
    mesh.name = p.id;
    mesh.position.set(px, py, pz);
    if (p.rx) mesh.rotation.x = p.rx;
    if (p.ry) mesh.rotation.y = p.ry;
    if (p.rz) mesh.rotation.z = p.rz;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const edges = new THREE.LineSegments(edgesGeo, edgeMatToUse);
    edges.position.set(px, py, pz);
    if (p.rx) edges.rotation.x = p.rx;
    if (p.ry) edges.rotation.y = p.ry;
    if (p.rz) edges.rotation.z = p.rz;

    group.add(mesh);
    group.add(edges);
  }

  for (const h of holes) {
    const r = mm10ToMeters(h.diameter / 2);
    const len = mm10ToMeters(h.depth) + 0.0004;
    const geom = new THREE.CylinderGeometry(r, r, len, 16);
    const mesh = new THREE.Mesh(geom, holeMat);
    const hx = mm10ToMeters(h.x - midX);
    const hy = mm10ToMeters(h.y);
    const hz = mm10ToMeters(h.z - midZ);
    mesh.position.set(hx, hy, hz);
    if (h.direction === "x") {
      mesh.rotation.z = Math.PI / 2;
    } else if (h.direction === "z") {
      mesh.rotation.x = Math.PI / 2;
    }
    group.add(mesh);
  }

  return group;
}
