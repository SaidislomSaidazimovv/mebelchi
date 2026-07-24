// M12.1 — the ROOM's own material palette: floors and walls.
//
// Deliberately SEPARATE from `BOARDS`. A room is not built out of ЛДСП, and offering
// «ЛДСП Белый · 150 000 сум/м²» as a floor would put a furniture price on a backdrop the workshop never
// makes — the founder and Antigravity both landed on a separate list for exactly that reason. Nothing
// here can ever reach the cut list, the estimate or the CNC file: room surfaces carry no `partId`, are
// not raycast, and are built in their own group.
//
// What IS reused is the M3.3 procedural texture machinery (`materialForFinish` + its cached wood/marble
// generators), so a parquet floor costs no new asset and matches the boards' lighting exactly.
import type { MaterialFinish, TextureKind } from "./materials";

/** Where a room material may be applied. A parquet belongs on the floor, paint on the wall; a few work on both. */
export type RoomSurface = "floor" | "wall" | "both";

export interface RoomMaterial {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
  readonly surface: RoomSurface;
  /** M3.3 procedural grain, reused from the board renderer. Absent = a flat painted surface. */
  readonly texture?: TextureKind;
  readonly finish?: MaterialFinish;
  /** How big the grain reads, in metres. A floor plank is ~1 m; a wall's paint has no grain at all. */
  readonly grain_m?: number;
}

export const ROOM_MATERIALS: readonly RoomMaterial[] = [
  // ── floors ──
  { id: "floor_parquet_oak", name: "Parket — eman", hex: "#c8a06a", surface: "floor", texture: "wood", finish: "satin", grain_m: 1.2 },
  { id: "floor_parquet_walnut", name: "Parket — yong'oq", hex: "#8a5f3c", surface: "floor", texture: "wood", finish: "satin", grain_m: 1.2 },
  { id: "floor_laminate_light", name: "Laminat — och", hex: "#d8c4a4", surface: "floor", texture: "wood", finish: "satin", grain_m: 1.4 },
  { id: "floor_tile_marble", name: "Marmar plitka", hex: "#e8e6e2", surface: "floor", texture: "marble", finish: "gloss", grain_m: 0.6 },
  { id: "floor_tile_grey", name: "Kulrang plitka", hex: "#b9bbbd", surface: "floor", finish: "satin", grain_m: 0.6 },
  { id: "floor_concrete", name: "Beton", hex: "#a5a49f", surface: "floor" },
  // ── walls ──
  { id: "wall_white", name: "Oq bo'yoq", hex: "#f2f1ee", surface: "wall" },
  { id: "wall_warm", name: "Krem bo'yoq", hex: "#ece3d4", surface: "wall" },
  { id: "wall_grey", name: "Kulrang bo'yoq", hex: "#d3d4d2", surface: "wall" },
  { id: "wall_sage", name: "Zaytun bo'yoq", hex: "#c3cbbb", surface: "wall" },
  { id: "wall_blue", name: "Ko'k bo'yoq", hex: "#b9c7d6", surface: "wall" },
  { id: "wall_terracotta", name: "Terrakota", hex: "#c99680", surface: "wall" },
  // ── either ──
  { id: "wood_panel", name: "Yog'och qoplama", hex: "#b08a5e", surface: "both", texture: "wood", finish: "matte", grain_m: 0.9 },
];

export function roomMaterialById(id: string | undefined): RoomMaterial | undefined {
  return id ? ROOM_MATERIALS.find((m) => m.id === id) : undefined;
}

/** The palette offered for one slot — `both` materials appear in either list. */
export function roomMaterialsFor(surface: "floor" | "wall"): readonly RoomMaterial[] {
  return ROOM_MATERIALS.filter((m) => m.surface === surface || m.surface === "both");
}

/** What a room falls back to when the master has not chosen: the neutral pair we already shipped. */
export const DEFAULT_FLOOR = "floor_laminate_light";
export const DEFAULT_WALL = "wall_white";
