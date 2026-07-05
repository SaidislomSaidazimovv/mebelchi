// Single zustand store for the whole journey. Mirrors v7-journey.html's `S`
// object + actions, typed. Screens read slices from here; the price ticker reads
// the same state through model/toProject.ts → priceProject.

import { create } from "zustand";
import { MATERIALS, mk, newCabId, type Cabinet, type FinishKey } from "./model/cabinet";
import { fillGapSpan, firstFitX, parkX, rowEndX } from "./model/fill";
import { dockToRun, cabFootprints, footsOverlap } from "./model/footprint";
import { generateVariants as solveVariants, type GenVariant, type KitchenStyle, type Zone, type FridgeType, type OvenType, type HoodType } from "./model/layout";
import { planRuns, cornerUnits, interiorWallCabs, type KitchenLayout } from "./model/runPlan";
import { roomOutlineMm, defaultOpenings, defaultOpeningHeight, fittingKind, wallSegments, interiorSegRef, polygonBoundsMm, type Pt, type Opening, type OpeningKind, type Fitting, type FittingCategory } from "./model/room";
import { defaultSurface, splitLeaf, colorLeaf, type Surface, type SurfPath } from "./model/walls";
import { PERSIST_KEYS, loadProjectState, upsertProject, deleteProject, updateProjectMeta, newProjectId, allProjects, replaceAllProjects, type DesignState } from "./model/projects";
import { listLibrary, upsertLibraryItem, deleteLibraryItem, libraryItemFromCab, libraryItemFromKarkas, type LibraryItem } from "./model/library";
import { loadSettings, saveSettings, type Settings } from "./model/settings";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { pullProfile, pushProfile, pullProjects, pushProject, deleteProjectCloud } from "./lib/sync";
import { AI_RENDER } from "./config";
import { captureThumbnail } from "./lib/thumbnailCapture";
import { QUIZ } from "./quiz/questions";

const snap100 = (v: number) => Math.round(v / 100) * 100;
let fittingSeq = 0;
let openingSeq = 0;

interface RoomSnapshot {
  shape: "i" | "l";
  roomPoints: Pt[];
  openings: Opening[];
  interiorWalls: Pt[][];
  fittings: Fitting[];
}
const snapshot = (s: RoomSnapshot): RoomSnapshot => ({
  shape: s.shape,
  roomPoints: s.roomPoints,
  openings: s.openings,
  interiorWalls: s.interiorWalls,
  fittings: s.fittings,
});

// ---- constructor (cabinet) edit history — separate from the room geometry undo ----
interface CabSnap {
  cabs: Cabinet[];
  runStyle: KitchenStyle;
  mat: number;
}
type CabHistState = { cabsPast: CabSnap[]; cabs: Cabinet[]; runStyle: KitchenStyle; mat: number };
// push the current cabinet state onto the undo stack (and clear redo)
const cabHist = (s: CabHistState) => ({
  cabsPast: [...s.cabsPast.slice(-49), { cabs: s.cabs, runStyle: s.runStyle, mat: s.mat }],
  cabsFuture: [] as CabSnap[],
});
const cabNow = (s: CabHistState): CabSnap => ({ cabs: s.cabs, runStyle: s.runStyle, mat: s.mat });

export type Screen =
  | "home"
  | "projects"
  | "settings"
  | "auth"
  | "quiz"
  | "space"
  | "details"
  | "variants"
  | "configure"
  | "preview"
  | "engineering"
  | "cost"
  | "handoff";

export const FLOW: Screen[] = [
  "quiz",
  "space",
  "details",
  "variants",
  "configure",
  ...(AI_RENDER ? (["preview"] as Screen[]) : []), // AI render (Preview) held for v1
  "engineering",
  "cost",
  "handoff",
];

/** Hardware grade picked in the Инженерия step (фаза Г). */
export type HwGrade = "eco" | "std" | "premium";

/** The signed-in user (Supabase auth). Null when signed out / auth disabled. */
export interface AuthUser {
  id: string;
  email: string;
}

/** RU labels for the hardware grade — shared by the Инженерия + Передача screens. */
export const HW_GRADE_LABEL: Record<HwGrade, string> = {
  eco: "Эконом",
  std: "Стандарт",
  premium: "Премиум",
};

/** A karkas block placed into the current project (Phase D) — its project JSON + a display name +
 *  its room placement (block-centre X/Z in mm, relative to the room centre; D3). */
export interface ProjectBlock {
  id: string;
  name: string;
  karkasJson: string;
  x: number;
  z: number;
  /** floor rotation in degrees (like a cabinet's `rot`); absent = 0 */
  rot?: number;
}

export interface AppState {
  // journey
  screen: Screen;
  qi: number;
  /** selected option(s) per quiz question (multi-select where the question allows) */
  quiz: Record<string, string[]>;
  /** true when a quiz question was opened from the summary to be changed */
  editing: boolean;
  // space (Phase A.2)
  shape: "i" | "l";
  /** the editable room outline (mm); seeded from `shape`, then freely edited */
  roomPoints: Pt[];
  openings: Opening[];
  /** free-drawn interior wall polylines (mm) */
  interiorWalls: Pt[][];
  /** wall fittings — sockets/switches, radiators, vents — placed on walls */
  fittings: Fitting[];
  /** per-wall paint surface (split tree); missing wall = unpainted */
  wallSurfaces: Record<number, Surface>;
  past: RoomSnapshot[];
  future: RoomSnapshot[];
  wallLen: number;
  ceiling: number;
  water: "left" | "center" | "right" | "none";
  /** wall index the water supply comes from (drives dishwasher placement), null = unset */
  waterWall: number | null;
  constraints: string[];
  // room metadata
  roomName: string;
  roomType: string;
  floorCovering: number;
  // transient UI toast
  toast: string | null;
  // navbar hamburger drawer
  menuOpen: boolean;
  // Настройки popup — an overlay (not a screen) so it opens over any journey step
  // without unmounting the work in progress
  settingsOpen: boolean;
  // set when the variants "add water?" prompt sends the user to the room to place it →
  // RoomScene opens its water-picker on entry
  pendingWater: boolean;
  // persistence — the project this session is editing + a bump to refresh lists
  currentProjectId: string | null;
  projectsRev: number;
  // personal block library (Biblioteka → «Mening bloklarim»). localStorage-only for the
  // demo; libraryRev bumps to refresh any open picker. Global (survives newProject).
  myLibrary: LibraryItem[];
  libraryRev: number;
  // Phase D1 — karkas blocks placed INTO the current project (session state, fully separate from
  // `cabs` so the kitchen Cell flow is untouched). Each holds the karkas project JSON.
  projectBlocks: ProjectBlock[];
  addProjectBlock: (name: string, json: string) => void;
  removeProjectBlock: (id: string) => void;
  /** Update a placed block's karkas JSON in place (Phase E — edit, not duplicate). Keeps id/name/pos. */
  updateProjectBlock: (id: string, json: string) => void;
  /** Move a placed karkas block to a room position (block-centre X/Z, mm) + optional floor rotation (deg) — D3. */
  setBlockPosition: (id: string, x: number, z: number, rot?: number) => void;
  /** The last block removed from the room, kept so a delete can be undone. Cleared on restore. */
  lastDeletedBlock: ProjectBlock | null;
  /** Put the last-deleted block back into the room (undo a whole-block delete). */
  restoreLastBlock: () => void;
  /** Drop the undo buffer without restoring (the undo toast timed out / was dismissed). */
  dismissLastDeleted: () => void;
  // global user/app settings (profile · company · preferences), Supabase-ready
  settings: Settings;
  // auth (Supabase). authReady = session checked; authUser = null when signed out.
  // The app is GUEST-FIRST: no login wall at launch — sign in from the menu / the nudge.
  authReady: boolean;
  authUser: AuthUser | null;
  recovery: boolean; // in a password-recovery session (opened from the reset email)
  authReturn: Screen; // where the auth screen returns to on close
  loginNudge: boolean; // one-time soft "sign in to sync" prompt after the first project
  // cloud sync status (for the subtle indicator): in-flight writes + last-write-failed
  syncBusy: number;
  syncError: boolean;
  // run
  variant: number;
  /** Phase-B generated layouts (empty until "Сгенерировать раскладки" runs). */
  genVariants: GenVariant[];
  cabs: Cabinet[];
  cabsFrom: number;
  selIdx: number;
  /** constructor edit history (cabs + finish), separate from the room geometry undo */
  cabsPast: CabSnap[];
  cabsFuture: CabSnap[];
  /** layout + finish committed from the chosen variant (drives the constructor 3D) */
  runLayout: KitchenLayout;
  runStyle: KitchenStyle;
  // configure view / materials
  view: "front" | "open" | "top";
  mat: number;
  mode: "real" | "xray" | "wire";
  // engineering / cost / handoff
  xray: boolean;
  hardened: boolean;
  hwGrade: HwGrade;
  recFixed: boolean;
  adviceApplied: boolean;
  exported: boolean;

  // actions — quiz
  pickQuiz: (id: string, v: string) => void;
  // actions — nav
  next: () => void;
  back: () => void;
  goTo: (s: Screen) => void;
  requestWater: () => void; // go to the room + auto-open the water picker
  clearPendingWater: () => void;
  // actions — space
  setShape: (v: "i" | "l") => void;
  setWater: (v: AppState["water"]) => void;
  toggleConstraint: (c: string) => void;
  setWall: (d: number) => void;
  setCeiling: (d: number) => void;
  setRoomName: (v: string) => void;
  setRoomType: (v: string) => void;
  setFloorCovering: (i: number) => void;
  setHardened: (v: boolean) => void;
  setHwGrade: (v: HwGrade) => void;
  // room polygon editing
  beginEdit: () => void; // snapshot before a drag/edit gesture (for undo)
  undo: () => void;
  redo: () => void;
  moveCorner: (i: number, x: number, y: number) => void;
  setWallEndpoints: (i: number, a: Pt, b: Pt) => void;
  setWallLength: (i: number, length: number, endpoint: "a" | "b") => void;
  moveOpening: (id: string, t: number) => void;
  dragOpeningTo: (id: string, x: number, y: number) => void; // hop to the nearest wall
  setOpeningWidth: (id: string, width: number) => void;
  setOpeningHeight: (id: string, height: number) => void;
  setOpeningSill: (id: string, sill: number) => void;
  setOpeningFinish: (id: string, finish: string) => void;
  addOpening: (item: OpeningKind, wall?: number) => string;
  removeOpening: (id: string) => void;
  duplicateOpening: (id: string) => string | null;
  replaceOpening: (id: string, item: OpeningKind) => void;
  flipOpening: (id: string) => void;
  addInteriorWall: (poly: Pt[]) => void;
  moveInteriorPoint: (wi: number, pi: number, x: number, y: number) => void;
  /** resize a drawn-wall segment (global segment index) to `length`, moving its far endpoint */
  setInteriorWallLength: (globalSeg: number, length: number) => void;
  // wall paint / surfaces
  setWallColor: (wall: number, c: number) => void; // whole wall → one colour
  setAllWallsColor: (c: number) => void;
  splitWallSurface: (wall: number, path: SurfPath, dir: "h" | "v") => void;
  colorWallSurface: (wall: number, path: SurfPath, c: number) => void;
  // wall fittings (electric / heating / vent)
  addFitting: (category: FittingCategory, kind: string, wall?: number) => string;
  dragFittingTo: (id: string, x: number, y: number) => void; // slide along / hop to nearest wall
  moveFitting: (id: string, t: number) => void; // slide along its current wall
  setFittingWidth: (id: string, width: number) => void;
  setFittingHeight: (id: string, height: number) => void;
  dragFitting3D: (id: string, x: number, y: number, heightMm: number) => void; // 3D: nearest wall + along + height
  removeFitting: (id: string) => void;
  duplicateFitting: (id: string) => string | null;
  replaceFitting: (id: string, category: FittingCategory, kind: string) => void;
  // water supply
  setWaterWall: (i: number | null) => void;
  // phase B — variant generation
  generateVariants: () => void;
  selectVariant: (i: number) => void;
  // phase C — constructor (per-module editing)
  selectCab: (i: number) => void;
  patchCab: (i: number, patch: Partial<Cabinet>) => void;
  /** live patch (NO undo entry) — for continuous gestures; pair with beginCabEdit() */
  patchCabLive: (i: number, patch: Partial<Cabinet>) => void;
  /** merge a finish (part → colour) into every module — the editor's "apply to all" */
  applyFinishToAll: (finish: Partial<Record<FinishKey, number>>) => void;
  /** apply a patch (e.g. handle type, fill) to every module — "apply to all" scope */
  patchAllCabs: (patch: Partial<Cabinet>) => void;
  /** add a NEW module from the catalog (model/addCatalog) — auto-fits into the first
   *  free gap on a wall run (else drops free-floating); selects it; returns its id */
  addCab: (cab: Partial<Cabinet>, preferredRun?: number) => string | null;
  /** grow a module to fill the empty space beside it in its row (after a delete) */
  fillCabGap: (id: string) => void;
  /** remove a module from the run (best-effort — the run isn't re-flowed yet) */
  removeCab: (id: string) => void;
  /** copy a module, parked at the end of its run lane; returns the new id */
  duplicateCab: (id: string) => string | null;
  /** swap a module's TYPE for a catalog template, keeping its place (run/x or px/pz/rot),
   *  finish and id — a run-tiled module keeps its slot width so it fits the same space */
  replaceCab: (id: string, cab: Partial<Cabinet>) => void;
  /** resize a module's width; the next module in its row absorbs the change (shifts
   *  + shrinks/grows) so the row stays tiled with no overlap */
  resizeCab: (id: string, newW: number) => void;
  /** batch-set module positions (x / mountY) — front-view drag reorder commit */
  moveCabsX: (updates: { id: string; x: number; mountY?: number }[]) => void;
  /** set a module's free plan transform (px/pz centre mm, rot degrees) — 2D plan drag/rotate */
  moveCabPlan: (id: string, patch: { px?: number; pz?: number; rot?: number }) => void;
  setMat: (i: number) => void;
  /** snapshot cabs before a continuous gesture (plan drag/rotate) so it's one undo step */
  beginCabEdit: () => void;
  undoCab: () => void;
  redoCab: () => void;
  /** constructor render style: realistic / translucent / wireframe */
  setMode: (m: AppState["mode"]) => void;
  flash: (msg: string) => void;
  clearToast: () => void;
  openMenu: () => void;
  closeMenu: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  // projects — saveCurrent persists the design; withThumb=true ALSO (re)captures the
  // project card image (only done once per constructor entry, not on every auto-save)
  saveCurrent: (withThumb?: boolean) => void;
  openProject: (id: string) => void;
  newProject: () => void;
  removeProject: (id: string) => void;
  renameProject: (id: string, patch: { name?: string; client?: string }) => void;
  // library — save the selected module as a personal block / remove one (localStorage)
  saveToLibrary: (cab: Cabinet) => void;
  /** Save a from-scratch karkas block (its project JSON) into «Mening bloklarim» (Phase K). */
  saveKarkasToLibrary: (name: string, json: string) => void;
  removeLibraryItem: (id: string) => void;
  // settings
  updateSettings: (patch: Partial<Settings>) => void;
  // auth
  openAuth: () => void; // open the login/registration screen (remembers where to return)
  closeAuth: () => void;
  dismissNudge: () => void;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  updatePassword: (password: string) => Promise<{ error?: string }>;
  deleteAccount: () => Promise<{ error?: string }>;
}

// The default design slice — shared by the store's initial state and `newProject`
// (everything `newProject` should reset; transient UI + project id live outside).
function freshDesign() {
  return {
    screen: "quiz" as Screen,
    qi: 0,
    quiz: {} as Record<string, string[]>,
    editing: false,
    shape: "i" as "i" | "l",
    roomPoints: roomOutlineMm("i"),
    openings: defaultOpenings(roomOutlineMm("i")),
    interiorWalls: [] as Pt[][],
    fittings: [] as Fitting[],
    wallSurfaces: {} as Record<number, Surface>,
    past: [] as RoomSnapshot[],
    future: [] as RoomSnapshot[],
    wallLen: 2400,
    ceiling: 2700,
    water: "left" as AppState["water"],
    waterWall: null as number | null,
    constraints: [] as string[],
    roomName: "Kitchen",
    roomType: "Кухня",
    floorCovering: 0,
    variant: 0,
    genVariants: [] as GenVariant[],
    cabs: [] as Cabinet[],
    cabsFrom: -1,
    selIdx: -1,
    cabsPast: [] as CabSnap[],
    cabsFuture: [] as CabSnap[],
    runLayout: "i" as KitchenLayout,
    runStyle: { carcass: 0xefe8da, facade: 0xe7ddc9, worktop: 0x7c756b, handle: 0x6f6a62, glassUppers: false } as KitchenStyle,
    view: "front" as AppState["view"],
    mat: 0,
    mode: "real" as AppState["mode"],
    xray: true,
    hardened: false,
    hwGrade: "std" as HwGrade,
    recFixed: false,
    adviceApplied: false,
    exported: false,
    // Karkas blocks placed in THIS project's room. Must reset per project (leaks across
    // openProject/newProject otherwise) and persist alongside cabs (see PERSIST_KEYS).
    projectBlocks: [] as ProjectBlock[],
    lastDeletedBlock: null as ProjectBlock | null, // transient undo buffer — not persisted
  };
}

let profileTimer: ReturnType<typeof setTimeout> | undefined; // debounces the profile cloud push

// one-time soft login nudge (shown once after a guest saves their first project)
const NUDGE_KEY = "mebelchi.nudged.v1";
const nudged = () => { try { return !!localStorage.getItem(NUDGE_KEY); } catch { return true; } };

// Track a cloud write for the sync indicator: bump busy, then clear + flip error on result.
function trackSync(p: Promise<unknown>): void {
  useStore.setState((s) => ({ syncBusy: s.syncBusy + 1 }));
  const done = (error: boolean) =>
    useStore.setState((s) => ({ syncBusy: Math.max(0, s.syncBusy - 1), syncError: error }));
  p.then(() => done(false), () => done(true));
}

export const useStore = create<AppState>((set, get) => ({
  ...freshDesign(),
  toast: null,
  menuOpen: false,
  settingsOpen: false,
  pendingWater: false,
  currentProjectId: null,
  projectsRev: 0,
  myLibrary: listLibrary(),
  libraryRev: 0,
  projectBlocks: [] as ProjectBlock[],
  settings: loadSettings(),
  // if Supabase isn't configured, auth is skipped (app runs on localStorage)
  authReady: !isSupabaseConfigured,
  authUser: null,
  recovery: false,
  authReturn: "home",
  loginNudge: false,
  syncBusy: 0,
  syncError: false,
  screen: "home", // guest-first: launch on the home hub (freshDesign's "quiz" is for New project)

  pickQuiz: (id, v) =>
    set((s) => {
      if (id === "layout") {
        // multi-select kitchen layout; the variants explore each chosen layout.
        // Room shape stays a rectangle unless the ONLY choice is L (then an
        // L-shaped room); a rectangle hosts every layout (incl. an L-run).
        const cur = s.quiz.layout ?? [];
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        const sel = next.length ? next : [v];
        const shape: "i" | "l" = sel.length === 1 && sel[0] === "l" ? "l" : "i";
        const roomChanged = shape !== s.shape;
        return {
          quiz: { ...s.quiz, layout: sel },
          ...(roomChanged
            ? {
                shape,
                roomPoints: roomOutlineMm(shape),
                openings: defaultOpenings(roomOutlineMm(shape)),
                interiorWalls: [],
                fittings: [],
                wallSurfaces: {},
                waterWall: null,
                past: [],
                future: [],
              }
            : {}),
        };
      }
      const multi = QUIZ.find((q) => q.id === id)?.multi;
      const cur = s.quiz[id] ?? [];
      if (multi) {
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        return { quiz: { ...s.quiz, [id]: next } };
      }
      return { quiz: { ...s.quiz, [id]: [v] } };
    }),

  next: () => {
    const s = get();
    switch (s.screen) {
      case "quiz":
        // all 4 questions live on one screen now → straight to the room (the CTA is
        // disabled until every question has a pick)
        if (QUIZ.some((q) => !s.quiz[q.id]?.length)) return;
        set({ screen: "space" });
        break;
      case "space":
        set({ screen: "details" });
        break;
      case "details":
        set({ screen: "variants" });
        break;
      case "variants": {
        const chosen = s.genVariants[s.variant];
        if (!chosen) return; // nothing generated yet — CTA is disabled anyway
        // commit the chosen layout + finish to the editable run on the way into the
        // constructor; re-commit only when the selection changed so edits survive
        if (s.cabsFrom !== s.variant) {
          set({ cabs: chosen.cabs.map((c) => ({ ...c })), cabsFrom: s.variant, selIdx: 0, runLayout: chosen.layout, runStyle: chosen.style, cabsPast: [], cabsFuture: [] });
        }
        set({ screen: "configure" });
        break;
      }
      case "configure":
        set({ screen: AI_RENDER ? "preview" : "engineering" }); // Preview held for v1
        break;
      case "preview":
        set({ screen: "engineering" });
        break;
      case "engineering":
        set({ screen: "cost" });
        break;
      case "cost":
        set({ screen: "handoff" });
        break;
      case "handoff":
        if (!s.exported) set({ exported: true });
        break;
    }
  },

  back: () => {
    const s = get();
    const i = FLOW.indexOf(s.screen);
    if (i > 0) set({ screen: FLOW[i - 1] });
  },

  goTo: (screen) => {
    const s = get();
    const toList = screen === "home" || screen === "projects";
    const fromMenu = s.screen === "home" || s.screen === "projects" || s.screen === "settings" || s.screen === "auth";
    const hasContent = s.cabs.length > 0 || Object.keys(s.quiz).length > 0;
    // leaving a design screen for the project list → flush a save NOW, while the 3D scene
    // is still mounted, so the card gets a freshly captured thumbnail (the debounced
    // auto-save would otherwise fire 30s later, after the scene is gone). Bump projectsRev
    // so the list re-reads the new thumbnail.
    if (toList && !fromMenu && hasContent) {
      s.saveCurrent();
      set((st) => ({ screen, projectsRev: st.projectsRev + 1 }));
    } else {
      set({ screen });
    }
  },
  requestWater: () => set({ pendingWater: true, screen: "details" }),
  clearPendingWater: () => set({ pendingWater: false }),

  setShape: (shape) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      shape,
      roomPoints: roomOutlineMm(shape),
      openings: defaultOpenings(roomOutlineMm(shape)),
      interiorWalls: [],
      fittings: [],
      wallSurfaces: {},
      waterWall: null,
    })),
  setWater: (water) => set({ water }),
  toggleConstraint: (c) =>
    set((s) => ({
      constraints: s.constraints.includes(c)
        ? s.constraints.filter((x) => x !== c)
        : [...s.constraints, c],
    })),
  setWall: (d) =>
    set((s) => ({ wallLen: Math.min(4000, Math.max(1200, s.wallLen + d)) })),
  setCeiling: (d) =>
    set((s) => ({ ceiling: Math.min(3300, Math.max(2400, s.ceiling + d)) })),
  setRoomName: (roomName) => set({ roomName }),
  setRoomType: (roomType) => set({ roomType }),
  setFloorCovering: (floorCovering) => set({ floorCovering }),
  setHardened: (hardened) => set({ hardened }),
  setHwGrade: (hwGrade) => set({ hwGrade }),

  // snapshot the room before a continuous gesture so it's one undo step
  beginEdit: () => set((s) => ({ past: [...s.past.slice(-49), snapshot(s)], future: [] })),
  undo: () =>
    set((s) => {
      if (!s.past.length) return {};
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), future: [...s.future, snapshot(s)], ...prev };
    }),
  redo: () =>
    set((s) => {
      if (!s.future.length) return {};
      const nxt = s.future[s.future.length - 1];
      return { future: s.future.slice(0, -1), past: [...s.past, snapshot(s)], ...nxt };
    }),

  moveCorner: (i, x, y) =>
    set((s) => {
      const p = s.roomPoints.slice();
      p[i] = { x: snap100(x), y: snap100(y) };
      return { roomPoints: p };
    }),

  // move a whole wall (both endpoints) — used for edge dragging
  setWallEndpoints: (i, a, b) =>
    set((s) => {
      const n = s.roomPoints.length;
      const p = s.roomPoints.slice();
      p[i] = { x: snap100(a.x), y: snap100(a.y) };
      p[(i + 1) % n] = { x: snap100(b.x), y: snap100(b.y) };
      return { roomPoints: p };
    }),

  // resize wall `i` (points[i]→points[i+1]) to `length`, moving endpoint a or b
  setWallLength: (i, length, endpoint) =>
    set((s) => {
      const n = s.roomPoints.length;
      const a = s.roomPoints[i];
      const b = s.roomPoints[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const p = s.roomPoints.slice();
      if (endpoint === "b") {
        p[(i + 1) % n] = { x: snap100(a.x + ux * length), y: snap100(a.y + uy * length) };
      } else {
        p[i] = { x: snap100(b.x - ux * length), y: snap100(b.y - uy * length) };
      }
      return { roomPoints: p }; // history handled by the caller (beginEdit)
    }),

  // slide an opening along its wall segment (clamped so it stays on the wall)
  moveOpening: (id, t) =>
    set((s) => {
      const op = s.openings.find((o) => o.id === id);
      if (!op) return {};
      const seg = wallSegments(s.roomPoints, s.interiorWalls)[op.wall];
      if (!seg) return {};
      const wl = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1;
      const margin = (op.width / 2 + 60) / wl;
      const ct = Math.max(margin, Math.min(1 - margin, t));
      return { openings: s.openings.map((o) => (o.id === id ? { ...o, t: ct } : o)) };
    }),

  // drag an opening to whichever wall segment (room or drawn) is nearest, clamped onto it
  dragOpeningTo: (id, x, y) =>
    set((s) => {
      const op = s.openings.find((o) => o.id === id);
      if (!op) return {};
      const segs = wallSegments(s.roomPoints, s.interiorWalls);
      let best = { wall: op.wall, t: 0.5, d: Infinity };
      for (let i = 0; i < segs.length; i++) {
        const { a, b } = segs[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1) continue; // ignore degenerate (e.g. loop-closing) segments
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
        if (d < best.d) best = { wall: i, t, d };
      }
      const seg = segs[best.wall];
      const wl = seg ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1 : 1;
      const margin = (op.width / 2 + 60) / wl;
      const ct = Math.max(margin, Math.min(1 - margin, best.t));
      return { openings: s.openings.map((o) => (o.id === id ? { ...o, wall: best.wall, t: ct } : o)) };
    }),

  setOpeningWidth: (id, width) =>
    set((s) => {
      const op = s.openings.find((o) => o.id === id);
      if (!op) return {};
      const seg = wallSegments(s.roomPoints, s.interiorWalls)[op.wall];
      const wl = seg ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1 : 4000;
      const w = Math.max(300, Math.min(wl - 200, snap100(width)));
      return { openings: s.openings.map((o) => (o.id === id ? { ...o, width: w } : o)) };
    }),
  setOpeningHeight: (id, height) =>
    set((s) => ({
      openings: s.openings.map((o) => (o.id === id ? { ...o, height: Math.max(300, Math.min(3000, snap100(height))) } : o)),
    })),
  // window sill — bottom above floor (mm), clamped to leave room under the ceiling
  setOpeningSill: (id, sill) =>
    set((s) => ({
      openings: s.openings.map((o) => (o.id === id ? { ...o, sill: Math.max(0, Math.min(s.ceiling - 300, snap100(sill))) } : o)),
    })),
  // window-frame / door-leaf finish (colour or wood) — see OPENING_FINISHES
  setOpeningFinish: (id, finish) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      openings: s.openings.map((o) => (o.id === id ? { ...o, finish } : o)),
    })),
  // add a window / door / wall-opening from a catalog; seeds on the longest wall
  addOpening: (item, wall) => {
    const id = `o${++openingSeq}`;
    set((s) => {
      const n = s.roomPoints.length;
      let w = wall ?? 0;
      if (wall == null) {
        let best = -1;
        for (let i = 0; i < n; i++) {
          const a = s.roomPoints[i];
          const b = s.roomPoints[(i + 1) % n];
          const l = Math.hypot(b.x - a.x, b.y - a.y);
          if (l > best) {
            best = l;
            w = i;
          }
        }
      }
      const op: Opening = { id, wall: Math.min(w, n - 1), kind: item.kind, t: 0.5, width: item.width, height: item.height ?? defaultOpeningHeight(item.kind), design: item.design, name: item.name, desc: item.desc };
      return { past: [...s.past.slice(-49), snapshot(s)], future: [], openings: [...s.openings, op] };
    });
    return id;
  },
  removeOpening: (id) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      openings: s.openings.filter((o) => o.id !== id),
    })),
  duplicateOpening: (id) => {
    const src = get().openings.find((o) => o.id === id);
    if (!src) return null;
    const nid = `o${++openingSeq}`;
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      openings: [...s.openings, { ...src, id: nid, t: Math.min(0.9, src.t + 0.12) }],
    }));
    return nid;
  },
  replaceOpening: (id, item) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      openings: s.openings.map((o) =>
        o.id === id ? { ...o, kind: item.kind, width: item.width, height: item.height ?? defaultOpeningHeight(item.kind), design: item.design, name: item.name, desc: item.desc } : o,
      ),
    })),
  flipOpening: (id) =>
    set((s) => ({ openings: s.openings.map((o) => (o.id === id ? { ...o, flip: !o.flip } : o)) })),

  addInteriorWall: (poly) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      interiorWalls: [...s.interiorWalls, poly.map((p) => ({ x: snap100(p.x), y: snap100(p.y) }))],
    })),
  moveInteriorPoint: (wi, pi, x, y) =>
    set((s) => ({
      interiorWalls: s.interiorWalls.map((w, i) =>
        i === wi ? w.map((p, j) => (j === pi ? { x: snap100(x), y: snap100(y) } : p)) : w,
      ),
    })),
  // resize a drawn segment by moving its far endpoint along the segment direction
  setInteriorWallLength: (globalSeg, length) =>
    set((s) => {
      const ref = interiorSegRef(s.roomPoints, s.interiorWalls, globalSeg);
      if (!ref) return {};
      const poly = s.interiorWalls[ref.wall];
      const a = poly[ref.seg];
      const b = poly[ref.seg + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nb = { x: snap100(a.x + ((b.x - a.x) / len) * length), y: snap100(a.y + ((b.y - a.y) / len) * length) };
      return {
        interiorWalls: s.interiorWalls.map((w, i) => (i === ref.wall ? w.map((p, j) => (j === ref.seg + 1 ? nb : p)) : w)),
      }; // history handled by the caller (beginEdit)
    }),

  // ---- wall paint / surfaces ----
  setWallColor: (wall, c) => set((s) => ({ wallSurfaces: { ...s.wallSurfaces, [wall]: { t: "leaf", c } } })),
  setAllWallsColor: (c) =>
    set((s) => {
      const next: Record<number, Surface> = {};
      for (let i = 0; i < s.roomPoints.length; i++) next[i] = { t: "leaf", c };
      return { wallSurfaces: next };
    }),
  splitWallSurface: (wall, path, dir) =>
    set((s) => ({ wallSurfaces: { ...s.wallSurfaces, [wall]: splitLeaf(s.wallSurfaces[wall] ?? defaultSurface(), path, dir) } })),
  colorWallSurface: (wall, path, c) =>
    set((s) => ({ wallSurfaces: { ...s.wallSurfaces, [wall]: colorLeaf(s.wallSurfaces[wall] ?? defaultSurface(), path, c) } })),

  // ---- wall fittings (electric / heating / vent) ----
  addFitting: (category, kind, wall = 0) => {
    const k = fittingKind(category, kind);
    const id = `f${++fittingSeq}`;
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      fittings: [...s.fittings, { id, category, wall: Math.min(wall, s.roomPoints.length - 1), t: 0.5, width: k?.width ?? 120, kind }],
    }));
    return id;
  },
  // slide along (or hop to) whichever wall segment (room or drawn) is nearest
  dragFittingTo: (id, x, y) =>
    set((s) => {
      const it = s.fittings.find((e) => e.id === id);
      if (!it) return {};
      const segs = wallSegments(s.roomPoints, s.interiorWalls);
      let best = { wall: it.wall, t: 0.5, d: Infinity };
      for (let i = 0; i < segs.length; i++) {
        const { a, b } = segs[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
        if (d < best.d) best = { wall: i, t, d };
      }
      const seg = segs[best.wall];
      const wl = seg ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1 : 1;
      const margin = (it.width / 2 + 40) / wl;
      const ct = Math.max(margin, Math.min(1 - margin, best.t));
      return { fittings: s.fittings.map((e) => (e.id === id ? { ...e, wall: best.wall, t: ct } : e)) };
    }),
  // slide a fitting along its current wall segment (clamped)
  moveFitting: (id, t) =>
    set((s) => {
      const it = s.fittings.find((e) => e.id === id);
      if (!it) return {};
      const seg = wallSegments(s.roomPoints, s.interiorWalls)[it.wall];
      if (!seg) return {};
      const wl = Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1;
      const margin = (it.width / 2 + 40) / wl;
      const ct = Math.max(margin, Math.min(1 - margin, t));
      return { fittings: s.fittings.map((e) => (e.id === id ? { ...e, t: ct } : e)) };
    }),
  setFittingWidth: (id, width) =>
    set((s) => {
      const it = s.fittings.find((e) => e.id === id);
      if (!it) return {};
      const seg = wallSegments(s.roomPoints, s.interiorWalls)[it.wall];
      const wl = seg ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1 : 4000;
      const w = Math.max(60, Math.min(wl - 200, snap100(width)));
      return { fittings: s.fittings.map((e) => (e.id === id ? { ...e, width: w } : e)) };
    }),
  setFittingHeight: (id, height) =>
    set((s) => ({
      fittings: s.fittings.map((e) => (e.id === id ? { ...e, height: Math.max(40, Math.min(2600, snap100(height))) } : e)),
    })),
  // 3D drag: hop to whichever wall segment is nearest (x,y in mm), set along + height
  dragFitting3D: (id, x, y, heightMm) =>
    set((s) => {
      const it = s.fittings.find((e) => e.id === id);
      if (!it) return {};
      const segs = wallSegments(s.roomPoints, s.interiorWalls);
      let best = { wall: it.wall, t: 0.5, d: Infinity };
      for (let i = 0; i < segs.length; i++) {
        const { a, b } = segs[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const l2 = dx * dx + dy * dy;
        if (l2 < 1) continue;
        const tt = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
        const dd = Math.hypot(x - (a.x + dx * tt), y - (a.y + dy * tt));
        if (dd < best.d) best = { wall: i, t: tt, d: dd };
      }
      const seg = segs[best.wall];
      const wl = seg ? Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1 : 1;
      const margin = (it.width / 2 + 40) / wl;
      const ct = Math.max(margin, Math.min(1 - margin, best.t));
      const mountY = Math.max(80, Math.min(3200, Math.round(heightMm)));
      return { fittings: s.fittings.map((e) => (e.id === id ? { ...e, wall: best.wall, t: ct, mountY } : e)) };
    }),
  removeFitting: (id) =>
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      fittings: s.fittings.filter((e) => e.id !== id),
    })),
  duplicateFitting: (id) => {
    const src = get().fittings.find((e) => e.id === id);
    if (!src) return null;
    const nid = `f${++fittingSeq}`;
    set((s) => ({
      past: [...s.past.slice(-49), snapshot(s)],
      future: [],
      fittings: [...s.fittings, { ...src, id: nid, t: Math.min(0.9, src.t + 0.12) }],
    }));
    return nid;
  },
  replaceFitting: (id, category, kind) =>
    set((s) => {
      const k = fittingKind(category, kind);
      return {
        past: [...s.past.slice(-49), snapshot(s)],
        future: [],
        fittings: s.fittings.map((e) => (e.id === id ? { ...e, category, kind, width: k?.width ?? e.width } : e)),
      };
    }),

  // ---- water supply: pick the wall it enters from; also derive the legacy
  // left/center/right marker so the plan + project stay consistent ----
  setWaterWall: (i) =>
    set((s) => {
      if (i == null) return { waterWall: null, water: "none" };
      const seg = wallSegments(s.roomPoints, s.interiorWalls)[i];
      if (!seg) return { waterWall: i, water: "center" };
      const mx = (seg.a.x + seg.b.x) / 2;
      const xs = s.roomPoints.map((p) => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const f = (mx - minX) / (maxX - minX || 1);
      const water = f < 0.34 ? "left" : f > 0.66 ? "right" : "center";
      return { waterWall: i, water };
    }),

  // ---- phase B: generate the four layout variants from the current space ----
  // Geometry lives here (we have roomPoints/openings + helpers); the solver itself
  // is a pure function fed clean primitives. The water gate is enforced by the
  // screen before this runs, so `water` is always a real side by now.
  generateVariants: () =>
    set((s) => {
      const water: Zone = s.water === "none" ? "center" : s.water;
      // plan the runs for each SELECTED layout (the planner handles water-wall
      // priority, door avoidance, corners, island/peninsula); the solver spreads
      // these layouts across the variants
      const LAYOUTS = ["i", "galley", "l", "u", "peninsula"];
      const chosen = (s.quiz.layout ?? []).filter((v): v is KitchenLayout => LAYOUTS.includes(v));
      const layouts = (chosen.length ? chosen : (["i"] as KitchenLayout[])).map((lay) => {
        const { runs, waterRun } = planRuns(s.roomPoints, s.waterWall, lay, s.openings);
        return { layout: lay, runs: runs.map((r) => ({ kind: r.kind, len: r.len, cornerStart: r.cornerStart, cornerEnd: r.cornerEnd, openings: r.openings })), waterRun };
      });
      // the user's selected option SET per appliance dimension (multi-select → the
      // variants explore each choice); fall back to a sensible default when unanswered
      const sel = <T extends string>(id: string, map: (v: string) => T | null, fallback: T): T[] => {
        const vals = (s.quiz[id] ?? []).map(map).filter((x): x is T => x != null);
        return vals.length ? Array.from(new Set(vals)) : [fallback];
      };
      const fridge = sel<FridgeType>("fridge", (v) => (v === "integ" ? "integ" : v === "free" ? "free" : null), "free");
      const oven = sel<OvenType>("oven", (v) => (v === "tall" ? "tall" : v === "under" ? "under" : null), "under");
      const hood = sel<HoodType>("hood", (v) => (v === "dome" ? "dome" : v === "integ" ? "integ" : null), "integ");
      const genVariants = solveVariants({
        layouts,
        ceiling: s.ceiling,
        water,
        hasGas: s.constraints.includes("Газовая труба"),
        fridge,
        oven,
        hood,
      });
      // inject a diagonal corner unit into every inside corner the runs cleared — L has
      // one, U has two. BASE: 1.5× base depth (840), L-shaped with an L-door. UPPER: 1.75×
      // upper depth (613), chamfered. Each run clears its own span so the regular cabinets
      // butt the corner unit flush (see runPlan CORNER_*). Computed per the variant's layout.
      const withCorners = genVariants.map((gv) => {
        if (gv.layout !== "l" && gv.layout !== "u") return gv;
        const baseCorner = cornerUnits(s.roomPoints, s.waterWall, gv.layout, s.openings, 840);
        const upperCorner = cornerUnits(s.roomPoints, s.waterWall, gv.layout, s.openings, 613);
        if (!baseCorner.length) return gv;
        return {
          ...gv,
          cabs: [
            ...gv.cabs,
            ...baseCorner.map((cs) => mk({ kind: "base", corner: true, px: cs.px, pz: cs.pz, rot: cs.rot, w: cs.w, depth: cs.depth, h: 720, fill: "shelves", count: 1, door: 0, handle: 0, run: 0 })),
            ...upperCorner.map((cs) => mk({ kind: "upper", corner: true, px: cs.px, pz: cs.pz, rot: cs.rot, w: cs.w, depth: cs.depth, h: 720, fill: "shelves", count: 1, door: 0, handle: 0, run: 0 })),
          ],
        };
      });
      // back a cabinet row against every wall the user DREW inside the room — placed free
      // (px/pz/rot) so it renders through the existing free-placement path; added to every
      // variant so a drawn wall is never ignored by the furniture generation
      const wallCabs = interiorWallCabs(s.roomPoints, s.interiorWalls);
      const withWalls = wallCabs.length
        ? withCorners.map((gv) => {
            // build the wall modules, then DROP any that clash with an existing same-layer
            // module (perimeter run / corner) or an already-accepted wall module — so a row
            // backed against a drawn wall never triggers the red overlap warning
            const objs = wallCabs.map((c) => mk({ kind: c.kind, px: c.px, pz: c.pz, rot: c.rot, w: c.w, depth: c.depth, h: 720, fill: "shelves", count: 2, door: 0, handle: 0 }));
            const foots = [...cabFootprints(gv.cabs, s.roomPoints, s.waterWall, gv.layout, s.openings)];
            const wallFoots = cabFootprints(objs, s.roomPoints, s.waterWall, gv.layout, s.openings);
            const keep: typeof objs = [];
            objs.forEach((cab, i) => {
              const f = wallFoots[i];
              if (f && !foots.some((o) => o.upper === f.upper && footsOverlap(o, f))) {
                keep.push(cab);
                foots.push(f);
              }
            });
            return { ...gv, cabs: [...gv.cabs, ...keep] };
          })
        : withCorners;
      // fresh layouts → force a re-commit on the way into the constructor
      return { genVariants: withWalls, variant: 0, cabsFrom: -1 };
    }),
  selectVariant: (i) => set({ variant: i }),

  // ---- phase C: constructor (per-module editing) ----
  selectCab: (i) => set({ selIdx: i }),
  patchCab: (i, patch) =>
    set((s) => ({ ...cabHist(s), cabs: s.cabs.map((c, j) => (j === i ? { ...c, ...patch } : c)) })),
  patchCabLive: (i, patch) =>
    set((s) => ({ cabs: s.cabs.map((c, j) => (j === i ? { ...c, ...patch } : c)) })),
  applyFinishToAll: (finish) =>
    set((s) => ({ ...cabHist(s), cabs: s.cabs.map((c) => ({ ...c, finish: { ...c.finish, ...finish } })) })),
  patchAllCabs: (patch) =>
    set((s) => ({ ...cabHist(s), cabs: s.cabs.map((c) => ({ ...c, ...patch })) })),
  addCab: (tpl, preferredRun) => {
    const s = get();
    const cab = mk(tpl);
    // every existing module's 2D footprint (tiled AND free-dragged) — so a new block
    // avoids overlapping modules the user moved off their run, not just tiled ones.
    const foots = cabFootprints(s.cabs, s.roomPoints, s.waterWall, s.runLayout, s.openings);
    const clears = (candidate: Cabinet): boolean => {
      const [cf] = cabFootprints([candidate], s.roomPoints, s.waterWall, s.runLayout, s.openings);
      return !cf || !foots.some((o) => o.upper === cf.upper && footsOverlap(o, cf));
    };
    let placed: Cabinet | null = null;
    // auto-fit into a wall run (corner units + free-standing furniture can't tile a
    // straight run → skip to free-floating)
    if (!cab.corner && !cab.furniture) {
      const runs = planRuns(s.roomPoints, s.waterWall, s.runLayout, s.openings).runs;
      const isUpper = cab.kind === "upper";
      // try the active wall (the one shown in the front view) FIRST
      const order =
        preferredRun != null && preferredRun >= 0 && preferredRun < runs.length
          ? [preferredRun, ...runs.map((_, i) => i).filter((i) => i !== preferredRun)]
          : runs.map((_, i) => i);
      // 1) slot into a wall-run gap that is free of tiled mates AND clear of any
      //    dragged-away module's footprint
      for (const r of order) {
        if (runs[r].kind !== "wall") continue;
        const x = firstFitX(s.cabs, r, isUpper, runs[r].len, cab.w);
        if (x != null) {
          const cand = { ...cab, run: r, x };
          if (clears(cand)) {
            placed = cand;
            break;
          }
        }
      }
      // 2) no clear gap → dock to a wall: from each run's tiled tail, step outward to the
      //    first footprint-clear slot (past any freed module sitting on that wall); keep
      //    the run that needs the least outward push, so it lands in the emptiest wall.
      if (!placed) {
        let best: { run: number; x: number; free: number } | null = null;
        for (const r of order) {
          if (runs[r].kind !== "wall") continue;
          let x = rowEndX(s.cabs, r, isUpper);
          for (let k = 0; k < 24 && !clears({ ...cab, run: r, x }); k++) x += 100;
          const free = runs[r].len - x;
          if (!best || free > best.free) best = { run: r, x, free };
        }
        if (best) placed = { ...cab, run: best.run, x: best.x };
      }
    }
    // 3) corner unit / free furniture / no wall run → free-float, staggered to a
    //    footprint-clear spot around the room centre (never on top of another module).
    if (!placed) {
      const b = polygonBoundsMm(s.roomPoints);
      const step = 350;
      const at = (slot: number): Cabinet => {
        const dx = ((slot % 3) - 1) * step;
        const dz = (Math.floor(slot / 3) - 1) * step;
        const halfW = cab.w / 2 + 50;
        const halfD = (cab.depth ?? 560) / 2 + 50;
        const px = Math.max(b.minX + halfW, Math.min(b.maxX - halfW, b.cx + dx));
        const pz = Math.max(b.minY + halfD, Math.min(b.maxY - halfD, b.cy + dz));
        return { ...cab, px, pz, rot: cab.rot ?? 0 };
      };
      let cand = at(0);
      for (let slot = 0; slot < 9; slot++) {
        cand = at(slot);
        if (clears(cand)) break;
      }
      placed = cand;
    }
    set({ ...cabHist(s), cabs: [...s.cabs, placed], selIdx: s.cabs.length });
    return placed.id;
  },
  fillCabGap: (id) =>
    set((s) => {
      const i = s.cabs.findIndex((c) => c.id === id);
      if (i < 0) return {};
      let cab = s.cabs[i];
      // a module dragged onto a wall is free (px/pz) — re-tile it into that run first,
      // so it can then grow into the empty space beside it
      if (cab.px != null && cab.pz != null) {
        const docked = dockToRun(cab, s.roomPoints, s.waterWall, s.runLayout, s.openings);
        if (!docked) return {};
        cab = { ...cab, run: docked.run, x: docked.x, px: undefined, pz: undefined, rot: undefined };
      }
      const cabs = s.cabs.map((c, j) => (j === i ? cab : c)); // gap math against the re-tiled cab
      const runLen = planRuns(s.roomPoints, s.waterWall, s.runLayout, s.openings).runs[cab.run ?? 0]?.len ?? Infinity;
      const span = fillGapSpan(cabs, cab, runLen);
      const filled = span ? { ...cab, x: span.x, w: span.w } : cab;
      if (filled === s.cabs[i]) return {}; // nothing changed (already tiled, no gap)
      return { ...cabHist(s), cabs: cabs.map((c, j) => (j === i ? filled : c)) };
    }),
  removeCab: (id) =>
    set((s) => {
      const cabs = s.cabs.filter((c) => c.id !== id);
      return { ...cabHist(s), cabs, selIdx: Math.min(s.selIdx, cabs.length - 1) };
    }),
  resizeCab: (id, newW) =>
    set((s) => {
      const i = s.cabs.findIndex((c) => c.id === id);
      if (i < 0) return {};
      const a = s.cabs[i];
      const w = Math.max(150, Math.min(1200, Math.round(newW)));
      const delta = w - a.w;
      if (delta === 0) return {};
      const aRight = (a.x ?? 0) + a.w;
      // base+tall share the floor row; uppers are their own row
      const floorRow = (c: Cabinet) => c.kind === "base" || c.kind === "tall";
      const sameRow = (c: Cabinet) =>
        (a.kind === "upper" ? c.kind === "upper" : floorRow(c)) && (c.run ?? 0) === (a.run ?? 0) && c.appliance !== "filler";
      // the module immediately to the right in the same row absorbs the change
      let nb = -1;
      let nbX = Infinity;
      for (let j = 0; j < s.cabs.length; j++) {
        if (j === i) continue;
        const c = s.cabs[j];
        if (!sameRow(c)) continue;
        const cx = c.x ?? 0;
        if (cx >= aRight - 2 && cx < nbX) {
          nb = j;
          nbX = cx;
        }
      }
      const cabs = s.cabs.slice();
      if (nb >= 0) {
        const b = cabs[nb];
        const newBW = Math.max(150, b.w - delta); // neighbour shrinks (or grows) to absorb
        const applied = b.w - newBW; // how much A can actually take/give without overlap
        cabs[i] = { ...a, w: a.w + applied };
        cabs[nb] = { ...b, x: (b.x ?? 0) + applied, w: newBW };
      } else {
        cabs[i] = { ...a, w }; // rightmost module — just resize
      }
      return { ...cabHist(s), cabs };
    }),
  moveCabsX: (updates) =>
    set((s) => ({
      ...cabHist(s),
      cabs: s.cabs.map((c) => {
        const u = updates.find((x) => x.id === c.id);
        if (!u) return c;
        return { ...c, x: u.x, ...(u.mountY != null ? { mountY: u.mountY } : {}) };
      }),
    })),
  moveCabPlan: (id, patch) =>
    set((s) => ({ cabs: s.cabs.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  duplicateCab: (id) => {
    const s = get();
    const src = s.cabs.find((c) => c.id === id);
    if (!src) return null;
    // drop the copy into the first gap in its row that fits (so duplicating fills
    // empty space directly), else at the row end — never overlapping a sibling
    const { id: _drop, ...rest } = src;
    void _drop;
    const dup = mk({ ...rest, x: src.x != null ? parkX(s.cabs, src, src.w) : undefined });
    set({ ...cabHist(s), cabs: [...s.cabs, dup], selIdx: s.cabs.length });
    return dup.id;
  },
  replaceCab: (id, tpl) =>
    set((s) => {
      const i = s.cabs.findIndex((c) => c.id === id);
      if (i < 0) return {};
      const old = s.cabs[i];
      const tiled = old.px == null && old.x != null; // sits in a run slot vs free-floating
      const base = mk(tpl);
      const next: Cabinet = {
        ...base,
        id: old.id, // keep the id so the selection stays valid
        run: old.run,
        x: old.x,
        px: old.px,
        pz: old.pz,
        rot: old.rot,
        mountY: old.mountY,
        w: tiled ? old.w : base.w, // tiled → keep the slot width; free → take the new size
        finish: old.finish,
      };
      return { ...cabHist(s), cabs: s.cabs.map((c, j) => (j === i ? next : c)) };
    }),
  setMat: (i) =>
    set((s) => {
      const m = MATERIALS[i] ?? MATERIALS[0];
      return { ...cabHist(s), mat: i, runStyle: { ...s.runStyle, facade: parseInt(m.c.slice(1), 16) } };
    }),
  // continuous gesture (plan drag/rotate uses moveCabPlan live) → one snapshot up front
  beginCabEdit: () => set((s) => cabHist(s)),
  undoCab: () =>
    set((s) => {
      if (!s.cabsPast.length) return {};
      const prev = s.cabsPast[s.cabsPast.length - 1];
      return { cabsPast: s.cabsPast.slice(0, -1), cabsFuture: [...s.cabsFuture, cabNow(s)], ...prev };
    }),
  redoCab: () =>
    set((s) => {
      if (!s.cabsFuture.length) return {};
      const nxt = s.cabsFuture[s.cabsFuture.length - 1];
      return { cabsFuture: s.cabsFuture.slice(0, -1), cabsPast: [...s.cabsPast, cabNow(s)], ...nxt };
    }),
  setMode: (mode) => set({ mode }),

  flash: (msg) => set({ toast: msg }),
  clearToast: () => set({ toast: null }),
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
  // settings is a popup overlay (keeps the current screen mounted) — close the menu on open
  openSettings: () => set({ settingsOpen: true, menuOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),

  // ---- projects (persisted to localStorage) ----
  saveCurrent: (withThumb = false) => {
    const s = get();
    let id = s.currentProjectId;
    const created = !id;
    if (!id) id = newProjectId();
    const design: DesignState = {};
    for (const k of PERSIST_KEYS) design[k] = (s as unknown as Record<string, unknown>)[k];
    // Only (re)capture the thumbnail when asked (constructor entry). Otherwise pass null so
    // upsertProject KEEPS the existing image — the auto-save / leave-flush persist data
    // without disturbing the one consistent thumbnail captured on entry.
    upsertProject(id, design, undefined, withThumb ? captureThumbnail() : null);
    if (created) set({ currentProjectId: id });
    if (withThumb) set((st) => ({ projectsRev: st.projectsRev + 1 })); // refresh any open list
    if (s.authUser) {
      const p = allProjects().find((x) => x.id === id); // full record with fresh meta
      if (p) trackSync(pushProject(s.authUser.id, p)); // push to the cloud + track status
    } else if (isSupabaseConfigured && !nudged() && s.cabs.length > 0) {
      // a guest's first REAL project (a kitchen has been designed) → soft, one-time
      // "sign in to sync" nudge. Guarded by a flag so it appears exactly once, ever.
      try { localStorage.setItem(NUDGE_KEY, "1"); } catch { /* ignore */ }
      set({ loginNudge: true });
    }
  },
  openProject: (id) => {
    const state = loadProjectState(id);
    if (!state) return;
    // Never restore to a menu screen — jump straight to the design
    const menuScreens = ["home", "projects", "settings", "auth"];
    const restored = state as Partial<AppState>;
    if (!restored.screen || menuScreens.includes(restored.screen as string)) {
      restored.screen = "quiz";
    }
    // Heal duplicate cab ids from the old counter-based id scheme (designs saved before
    // the reload-safe uid fix). Two modules sharing an id highlighted + moved as one;
    // reassign a fresh id to any repeat so each module is independent again.
    if (restored.cabs) {
      const seen = new Set<string>();
      restored.cabs = restored.cabs.map((c) => {
        if (seen.has(c.id)) return { ...c, id: newCabId() };
        seen.add(c.id);
        return c;
      });
    }
    set({ ...freshDesign(), ...restored, currentProjectId: id, menuOpen: false });
    set((s) => ({ projectsRev: s.projectsRev + 1 }));
  },
  newProject: () => set({ ...freshDesign(), currentProjectId: null, menuOpen: false }),
  removeProject: (id) => {
    deleteProject(id);
    if (get().authUser) trackSync(deleteProjectCloud(id));
    set((s) => ({
      projectsRev: s.projectsRev + 1,
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    }));
  },
  renameProject: (id, patch) => {
    updateProjectMeta(id, patch);
    const s = get();
    if (s.authUser) {
      const p = allProjects().find((x) => x.id === id);
      if (p) trackSync(pushProject(s.authUser.id, p));
    }
    set(() => ({ projectsRev: s.projectsRev + 1 }));
  },

  // ---- library (personal blocks, persisted to localStorage) ----
  // Mirrors saveCurrent's local-then-cloud shape, but LOCAL ONLY for the demo.
  saveToLibrary: (cab) => {
    upsertLibraryItem(libraryItemFromCab(cab));
    // TODO: Supabase sync (phase 2) — push the personal block to the cloud here
    set((s) => ({ myLibrary: listLibrary(), libraryRev: s.libraryRev + 1 }));
  },
  saveKarkasToLibrary: (name, json) => {
    upsertLibraryItem(libraryItemFromKarkas(name, json));
    set((s) => ({ myLibrary: listLibrary(), libraryRev: s.libraryRev + 1 }));
  },
  addProjectBlock: (name, json) =>
    set((s) => ({
      projectBlocks: [
        ...s.projectBlocks,
        // auto-place in a row: each new block ~800mm to the right of the last
        { id: `pb-${Date.now().toString(36)}-${s.projectBlocks.length.toString(36)}`, name: name.trim() || "Blok", karkasJson: json, x: s.projectBlocks.length * 800, z: 0 },
      ],
    })),
  removeProjectBlock: (id) => set((s) => ({ projectBlocks: s.projectBlocks.filter((b) => b.id !== id), lastDeletedBlock: s.projectBlocks.find((b) => b.id === id) ?? s.lastDeletedBlock })),
  restoreLastBlock: () => set((s) => (s.lastDeletedBlock ? { projectBlocks: [...s.projectBlocks, s.lastDeletedBlock], lastDeletedBlock: null } : {})),
  dismissLastDeleted: () => set({ lastDeletedBlock: null }),
  updateProjectBlock: (id, json) =>
    set((s) => ({ projectBlocks: s.projectBlocks.map((b) => (b.id === id ? { ...b, karkasJson: json } : b)) })),
  setBlockPosition: (id, x, z, rot) =>
    set((s) => ({ projectBlocks: s.projectBlocks.map((b) => (b.id === id ? { ...b, x, z, ...(rot !== undefined ? { rot } : {}) } : b)) })),
  removeLibraryItem: (id) => {
    deleteLibraryItem(id);
    // TODO: Supabase sync (phase 2) — mirror the delete to the cloud here
    set((s) => ({ myLibrary: listLibrary(), libraryRev: s.libraryRev + 1 }));
  },

  updateSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      if (s.authUser) {
        clearTimeout(profileTimer); // debounce cloud push while typing
        const uid = s.authUser.id;
        profileTimer = setTimeout(() => trackSync(pushProfile(uid, useStore.getState().settings)), 800);
      }
      return { settings };
    }),

  openAuth: () => set((s) => ({ screen: "auth", authReturn: s.screen === "auth" ? s.authReturn : s.screen, loginNudge: false, menuOpen: false })),
  closeAuth: () => set((s) => ({ screen: s.authReturn })),
  dismissNudge: () => set({ loginNudge: false }),
  signIn: async (email, password) => {
    if (!supabase) return { error: "Supabase не настроен" };
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message };
  },
  signUp: async (email, password) => {
    if (!supabase) return { error: "Supabase не настроен" };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { error: error.message };
    // no session back → the project requires email confirmation before first login
    return { needsConfirm: !data.session };
  },
  signOut: async () => {
    await supabase?.auth.signOut();
  },
  resetPassword: async (email) => {
    if (!supabase) return { error: "Supabase не настроен" };
    const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return { error: error?.message };
  },
  updatePassword: async (password) => {
    if (!supabase) return { error: "Supabase не настроен" };
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) set({ recovery: false });
    return { error: error?.message };
  },
  deleteAccount: async () => {
    if (!supabase) return { error: "Supabase не настроен" };
    const { error } = await supabase.rpc("delete_own_account");
    if (error) return { error: error.message };
    // wipe the local cache so nothing lingers, then sign out
    try {
      localStorage.removeItem("mebelchi.projects.v1");
      localStorage.removeItem("mebelchi.settings.v1");
      localStorage.removeItem("mebelchi.migrated.v1");
      localStorage.removeItem(NUDGE_KEY);
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    return {};
  },
}));

// auto-save the current design to localStorage (debounced) once it has content,
// so the journey is captured as a project without an explicit "save" step
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = useStore.getState();
    if (s.cabs.length > 0 || Object.keys(s.quiz).length > 0) s.saveCurrent();
  }, 30_000);
});

// One-time-per-login sync: adopt the cloud profile + projects for this user.
// Cloud is the source of truth; on the very first login on this device we migrate any
// local-only projects up (so pre-account work isn't lost), guarded by a flag so a second
// account on the same device can't leak the first account's local projects.
const MIGRATED_KEY = "mebelchi.migrated.v1";
async function syncOnLogin(userId: string): Promise<void> {
  try {
    const profile = await pullProfile(userId);
    if (profile) {
      // usdRate has no cloud column yet — keep the local value so it isn't reset on login
      const merged = { ...profile, usdRate: useStore.getState().settings.usdRate };
      saveSettings(merged);
      useStore.setState({ settings: merged });
    }
    const cloud = await pullProjects();
    try {
      if (!localStorage.getItem(MIGRATED_KEY)) {
        const cloudIds = new Set(cloud.map((p) => p.id));
        for (const lp of allProjects()) {
          if (!cloudIds.has(lp.id)) {
            await pushProject(userId, lp);
            cloud.push(lp);
          }
        }
        localStorage.setItem(MIGRATED_KEY, "1");
      }
    } catch {
      /* storage / push error — fall through with whatever cloud we have */
    }
    replaceAllProjects(cloud);
    useStore.setState((s) => ({ projectsRev: s.projectsRev + 1, screen: "home" }));
  } catch {
    /* offline / RLS error — keep the local cache, app still works */
  }
}

// wire Supabase auth → store: pick up an existing session on load, then track changes;
// run the login sync once when a user appears (not on token refresh)
if (supabase) {
  let syncedUser: string | null = null;
  const toUser = (u: { id: string; email?: string } | undefined | null): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? "" } : null;
  const handle = (event: string, session: { user?: { id: string; email?: string } } | null) => {
    const authUser = toUser(session?.user);
    useStore.setState({ authUser, authReady: true });
    // opened the reset link → show "set a new password" instead of the app
    if (event === "PASSWORD_RECOVERY") useStore.setState({ recovery: true });
    if (authUser) {
      if (syncedUser !== authUser.id) {
        syncedUser = authUser.id;
        trackSync(syncOnLogin(authUser.id));
      }
    } else {
      syncedUser = null;
    }
  };
  supabase.auth.getSession().then(({ data }) => handle("INITIAL_SESSION", data.session));
  supabase.auth.onAuthStateChange((event, session) => handle(event, session));
}

// dev-only: lets local tooling drive the store directly (stripped from prod builds)
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}
