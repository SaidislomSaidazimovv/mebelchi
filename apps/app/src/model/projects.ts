// Project persistence — saved kitchen designs in localStorage. A project is the
// design slice of the store (room + quiz + run + materials …) plus light metadata.
// Pure storage layer; the store calls these and owns the live state.

const KEY = "mebelchi.projects.v1";

/** Store fields that make up a saved design (everything else is transient UI). */
export const PERSIST_KEYS = [
  "quiz",
  "shape",
  "roomPoints",
  "openings",
  "interiorWalls",
  "fittings",
  "wallSurfaces",
  "wallLen",
  "ceiling",
  "water",
  "waterWall",
  "constraints",
  "roomName",
  "roomType",
  "floorCovering",
  "variant",
  "genVariants",
  "cabs",
  "cabsFrom",
  "selIdx",
  "runLayout",
  "runStyle",
  "view",
  "mat",
  "mode",
  "xray",
  "hardened",
  "hwGrade",
  "recFixed",
  "adviceApplied",
  "exported",
  "screen",
  "qi",
] as const;

export type DesignState = Record<string, unknown>;

export interface ProjectMeta {
  id: string;
  name: string;
  /** Client this kitchen is for (B2B — the designer works for clients). */
  client?: string;
  /** Small JPEG data-URL captured from the 3D scene for the project card. */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SavedProject extends ProjectMeta {
  state: DesignState;
}

function readAll(): SavedProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedProject[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedProject[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / unavailable — ignore */
  }
}

export function newProjectId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Project metadata, newest first (no heavy `state`). */
export function listProjects(): ProjectMeta[] {
  return readAll()
    .map(({ state: _state, ...meta }) => meta)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProjectState(id: string): DesignState | null {
  return readAll().find((p) => p.id === id)?.state ?? null;
}

/** Full saved records (with state) — used by the cloud sync to migrate/mirror. */
export function allProjects(): SavedProject[] {
  return readAll();
}

/** Replace the whole local project cache (cloud sync makes cloud the source of truth). */
export function replaceAllProjects(list: SavedProject[]): void {
  const current = readAll();
  const merged = list.map(p => {
    const existing = current.find(c => c.id === p.id);
    return { ...p, thumbnail: p.thumbnail || existing?.thumbnail };
  });
  writeAll(merged);
}

/** Insert or update a project, stamping updatedAt (createdAt + a default name on
 *  first save). Updates keep the existing name unless one is passed. */
export function upsertProject(id: string, state: DesignState, name?: string, thumbnail?: string | null): void {
  const list = readAll();
  const now = Date.now();
  const i = list.findIndex((p) => p.id === id);
  const thumbPatch = thumbnail ? { thumbnail } : {};
  if (i >= 0) list[i] = { ...list[i], state, updatedAt: now, ...(name ? { name } : {}), ...thumbPatch };
  else list.push({ id, name: name ?? defaultProjectName(), createdAt: now, updatedAt: now, state, ...thumbPatch });
  writeAll(list);
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

/** Edit a project's name/client without touching its saved design state. */
export function updateProjectMeta(id: string, patch: { name?: string; client?: string }): void {
  const list = readAll();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  const next = { ...list[i], updatedAt: Date.now() };
  if (patch.name !== undefined) next.name = patch.name.trim() || next.name;
  if (patch.client !== undefined) next.client = patch.client.trim();
  list[i] = next;
  writeAll(list);
}

/** Default name for a brand-new project (numbered by how many already exist). */
export function defaultProjectName(): string {
  return `Проект ${listProjects().length + 1}`;
}
