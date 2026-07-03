// PBR texture system for the live 3D. Real tileable maps (CC0/ambientCG + permissive,
// bundled under public/textures) give surfaces real grain under the existing direct
// lighting — NO IBL/env map (that path was rejected for over-brightening). Catalog
// materials reference a texture KEY; the 3D builds a textured material for it. Flip PBR
// to false to revert to flat materials. Textures load lazily + shared → bounded memory.
import * as THREE from "three";
import { FLOOR_COVERINGS } from "../model/floors";

/** master switch — false → flat materials as before */
export const PBR = true;

const BASE = import.meta.env.BASE_URL; // respects the Vite base ("/" by default)

// A shared LoadingManager so a render-on-demand scene can redraw once textures arrive
// (otherwise the first frame draws before they load → black surfaces until the next draw).
const manager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(manager);
const readyCbs = new Set<() => void>();
manager.onLoad = () => { for (const cb of readyCbs) cb(); };
/** run `cb` each time a batch of textures finishes loading; returns an unsubscribe */
export function onTexturesReady(cb: () => void): () => void {
  readyCbs.add(cb);
  return () => { readyCbs.delete(cb); };
}

function tex(file: string, srgb = false): THREE.Texture {
  const t = loader.load(BASE + "textures/" + file);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface MapSet {
  map: THREE.Texture;
  normalMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  roughnessMap: THREE.Texture;
}

interface TexDef {
  diff: string;
  nor?: string;
  bump?: string;
  rough: string;
  /** false → the texture carries its own colour (wood), so don't tint by the finish */
  tint?: boolean;
  roughness?: number;
}

// the texture library — add a row + drop the files in public/textures to grow it
const TEX: Record<string, TexDef> = {
  hardwood: { diff: "hardwood2_diffuse.jpg", bump: "hardwood2_bump.jpg", rough: "hardwood2_roughness.jpg", roughness: 1 },
  marble: { diff: "marble_diff.jpg", nor: "marble_nor.jpg", rough: "marble_rough.jpg", roughness: 0.62 },
  wood_oak: { diff: "wood_oak_diff.jpg", nor: "wood_oak_nor.jpg", rough: "wood_oak_rough.jpg", tint: false, roughness: 0.72 },
  wood_walnut: { diff: "wood_walnut_diff.jpg", nor: "wood_walnut_nor.jpg", rough: "wood_walnut_rough.jpg", tint: false, roughness: 0.72 },
  wood_ash: { diff: "wood_ash_diff.jpg", nor: "wood_ash_nor.jpg", rough: "wood_ash_rough.jpg", tint: false, roughness: 0.74 },
  wood_wenge: { diff: "wood_wenge_diff.jpg", nor: "wood_wenge_nor.jpg", rough: "wood_wenge_rough.jpg", tint: false, roughness: 0.7 },
};

const cache = new Map<string, MapSet>();
export function texSet(key: string): MapSet | null {
  const d = TEX[key];
  if (!d) return null;
  let s = cache.get(key);
  if (!s) {
    s = { map: tex(d.diff, true), roughnessMap: tex(d.rough) };
    if (d.nor) s.normalMap = tex(d.nor);
    if (d.bump) s.bumpMap = tex(d.bump);
    cache.set(key, s);
  }
  return s;
}

/** a MeshStandardMaterial for texture `key`, tinted by `tint` unless the texture carries
 *  its own colour (wood). Returns null if the key/textures aren't available. */
export function texturedMaterial(key: string, tint: number, roughnessMul = 1): THREE.MeshStandardMaterial | null {
  const s = texSet(key);
  const d = TEX[key];
  if (!s || !d) return null;
  return new THREE.MeshStandardMaterial({
    color: d.tint === false ? 0xffffff : tint,
    map: s.map,
    normalMap: s.normalMap,
    bumpMap: s.bumpMap,
    roughnessMap: s.roughnessMap,
    roughness: (d.roughness ?? 0.8) * roughnessMul,
    metalness: 0,
  });
}

// floor textures are CLONED (own repeat) + cached per (key@repeat) so the floor's tiling
// density doesn't disturb cabinet facades/worktops that share the same wood texture, and
// we don't leak a GPU texture on every rebuild (the editor rebuilds on each drag frame).
const floorCache = new Map<string, MapSet>();
function floorMapSet(key: string, repeat: number): MapSet | null {
  const ck = `${key}@${repeat}`;
  let s = floorCache.get(ck);
  if (!s) {
    const base = texSet(key);
    if (!base) return null;
    const cl = (t?: THREE.Texture) => {
      if (!t) return undefined;
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat, repeat);
      c.needsUpdate = true;
      return c;
    };
    s = { map: cl(base.map)!, roughnessMap: cl(base.roughnessMap)!, bumpMap: cl(base.bumpMap), normalMap: cl(base.normalMap) };
    floorCache.set(ck, s);
  }
  // re-flag for upload (the shared image may have finished loading after the clone)
  s.map.needsUpdate = s.roughnessMap.needsUpdate = true;
  if (s.bumpMap) s.bumpMap.needsUpdate = true;
  if (s.normalMap) s.normalMap.needsUpdate = true;
  return s;
}

/** Apply the selected floor covering's REAL material (wood / marble / …) to the floor
 *  mesh (userData.floor): its PBR texture, tiling density, and — for a tinted material —
 *  the covering colour (wood textures carry their own colour). No-op unless PBR. Shared
 *  by the constructor AND room-editor scenes. */
export function applyPbrFloor(root: THREE.Object3D, color: string, floorId?: string) {
  if (!PBR) return;
  const cov = floorId ? FLOOR_COVERINGS.find((f) => f.id === floorId) : null;
  const key = cov?.tex ?? "hardwood";
  const repeat = cov?.repeat ?? 0.45;
  const w = floorMapSet(key, repeat);
  const d = TEX[key];
  if (!w || !d) return;
  const ownColor = d.tint === false; // wood textures carry their own colour
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.floor) return;
    const fm = m.material as THREE.MeshStandardMaterial;
    fm.map = w.map;
    fm.bumpMap = w.bumpMap ?? null;
    if (w.bumpMap) fm.bumpScale = 0.03;
    fm.normalMap = w.normalMap ?? null;
    fm.roughnessMap = w.roughnessMap;
    fm.roughness = d.roughness ?? 1;
    fm.color.set(ownColor ? "#ffffff" : color);
    fm.needsUpdate = true;
  });
}

/** Diffuse-map URL for a texture key (for showing a real material thumbnail in the
 *  picker lists), plus whether the texture is colour-tinted vs carries its own colour. */
export function texThumb(key: string | undefined): { url: string; tint: boolean } | null {
  const d = key ? TEX[key] : undefined;
  if (!d) return null;
  return { url: BASE + "textures/" + d.diff, tint: d.tint !== false };
}

/** A swatch `style` for a material picker: a real texture thumbnail when the material has
 *  a PBR texture (tinted materials get the colour multiplied over the image), else a flat
 *  colour. So oak/walnut/marble read as photos in the list, paints stay solid colours. */
export function matSwatchStyle(color: string, texKey?: string): Record<string, string> {
  const t = texThumb(texKey);
  if (!t) return { background: color };
  const s: Record<string, string> = { backgroundImage: `url("${t.url}")`, backgroundSize: "cover", backgroundPosition: "center" };
  if (t.tint) {
    s.backgroundColor = color;
    s.backgroundBlendMode = "multiply"; // tint the grey marble / hardwood by the finish colour
  }
  return s;
}

/** Top-down planar UVs from a box's LOCAL x/z, in metres/`tile`. `offU` shifts along the
 *  run so adjacent cabinets' worktops share one continuous slab (not per-cabinet blocks). */
export function planarUV(geo: THREE.BufferGeometry, tile: number, offU: number, offV: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!pos || !uv) return;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + offU) / tile, (pos.getZ(i) + offV) / tile);
  uv.needsUpdate = true;
}
