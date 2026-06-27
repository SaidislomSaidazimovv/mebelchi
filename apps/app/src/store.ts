// Single zustand store for the whole journey. Mirrors v7-journey.html's `S`
// object + actions, typed. Screens read slices from here; the price ticker reads
// the same state through model/toProject.ts → priceProject.

import { create } from "zustand";
import { MATERIALS, mk, type Cabinet } from "./model/cabinet";
import { generateVariants as solveVariants, type GenVariant, type KitchenStyle, type Zone, type FridgeType, type OvenType, type HoodType } from "./model/layout";
import { planRuns, cornerUnits, type KitchenLayout } from "./model/runPlan";
import { roomOutlineMm, defaultOpenings, defaultOpeningHeight, fittingKind, wallSegments, interiorSegRef, type Pt, type Opening, type OpeningKind, type Fitting, type FittingCategory } from "./model/room";
import { defaultSurface, splitLeaf, colorLeaf, type Surface, type SurfPath } from "./model/walls";
import { PERSIST_KEYS, loadProjectState, upsertProject, deleteProject, newProjectId, type DesignState } from "./model/projects";
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
  | "quiz"
  | "summary"
  | "space"
  | "details"
  | "variants"
  | "configure"
  | "engineering"
  | "cost"
  | "handoff";

export const FLOW: Screen[] = [
  "quiz",
  "summary",
  "space",
  "details",
  "variants",
  "configure",
  "engineering",
  "cost",
  "handoff",
];

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
  // persistence — the project this session is editing + a bump to refresh lists
  currentProjectId: string | null;
  projectsRev: number;
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
  recFixed: boolean;
  adviceApplied: boolean;
  exported: boolean;

  // actions — quiz
  pickQuiz: (id: string, v: string) => void;
  noPref: () => void;
  editQuiz: (index: number) => void;
  finishEdit: () => void;
  // actions — nav
  next: () => void;
  back: () => void;
  goTo: (s: Screen) => void;
  // actions — space
  setShape: (v: "i" | "l") => void;
  setWater: (v: AppState["water"]) => void;
  toggleConstraint: (c: string) => void;
  setWall: (d: number) => void;
  setCeiling: (d: number) => void;
  setRoomName: (v: string) => void;
  setRoomType: (v: string) => void;
  setFloorCovering: (i: number) => void;
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
  /** remove a module from the run (best-effort — the run isn't re-flowed yet) */
  removeCab: (id: string) => void;
  /** copy a module, parked at the end of its run lane; returns the new id */
  duplicateCab: (id: string) => string | null;
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
  // projects
  saveCurrent: () => void;
  openProject: (id: string) => void;
  newProject: () => void;
  removeProject: (id: string) => void;
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
    recFixed: false,
    adviceApplied: false,
    exported: false,
  };
}

export const useStore = create<AppState>((set, get) => ({
  ...freshDesign(),
  toast: null,
  menuOpen: false,
  currentProjectId: null,
  projectsRev: 0,

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

  noPref: () => {
    const s = get();
    const q = QUIZ[s.qi];
    // "no preference" → for multi questions select every option (variants explore
    // all of them); for the single layout question default to the straight run
    if (q.id === "layout") get().pickQuiz("layout", "i");
    else set({ quiz: { ...s.quiz, [q.id]: q.opts.map((o) => o.v) } });
    if (s.qi < QUIZ.length - 1) set({ qi: s.qi + 1 });
    else set({ screen: "summary" });
  },

  // open a single question from the summary to change it
  editQuiz: (index) => set({ qi: index, screen: "quiz", editing: true }),
  finishEdit: () => set({ editing: false, screen: "summary" }),

  next: () => {
    const s = get();
    switch (s.screen) {
      case "quiz": {
        const q = QUIZ[s.qi];
        if (!s.quiz[q.id]?.length) return; // CTA is disabled anyway
        if (s.qi < QUIZ.length - 1) set({ qi: s.qi + 1 });
        else set({ screen: "summary" });
        break;
      }
      case "summary":
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
    if (s.screen === "quiz" && s.qi > 0) {
      set({ qi: s.qi - 1 });
      return;
    }
    const i = FLOW.indexOf(s.screen);
    if (i > 0) {
      const prev = FLOW[i - 1];
      if (prev === "quiz") set({ screen: "quiz", qi: QUIZ.length - 1 });
      else set({ screen: prev });
    }
  },

  goTo: (screen) => set({ screen }),

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
      // inject a diagonal corner unit (base + upper) into L variants — fills the
      // blind corner the runs cleared, with a 45° door facing the room (Phase 1)
      const corners = cornerUnits(s.roomPoints, s.waterWall, "l", s.openings);
      const withCorners = corners.length
        ? genVariants.map((gv) =>
            gv.layout !== "l"
              ? gv
              : {
                  ...gv,
                  cabs: [
                    ...gv.cabs,
                    ...corners.flatMap((cs) => [
                      mk({ kind: "base", corner: true, px: cs.px, pz: cs.pz, rot: cs.rot, w: cs.w, depth: cs.depth, h: 720, fill: "shelves", count: 1, door: 0, handle: 0, run: 0 }),
                      mk({ kind: "upper", corner: true, px: cs.px, pz: cs.pz, rot: cs.rot, w: cs.w, depth: cs.depth, h: 720, fill: "shelves", count: 1, door: 0, handle: 0, run: 0 }),
                    ]),
                  ],
                },
          )
        : genVariants;
      // fresh layouts → force a re-commit on the way into the constructor
      return { genVariants: withCorners, variant: 0, cabsFrom: -1 };
    }),
  selectVariant: (i) => set({ variant: i }),

  // ---- phase C: constructor (per-module editing) ----
  selectCab: (i) => set({ selIdx: i }),
  patchCab: (i, patch) =>
    set((s) => ({ ...cabHist(s), cabs: s.cabs.map((c, j) => (j === i ? { ...c, ...patch } : c)) })),
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
    // park the copy at the end of its run+kind lane so it doesn't overlap a sibling
    const endX = s.cabs
      .filter((c) => (c.run ?? 0) === (src.run ?? 0) && c.kind === src.kind)
      .reduce((m, c) => Math.max(m, (c.x ?? 0) + c.w), 0);
    const { id: _drop, ...rest } = src;
    void _drop;
    const dup = mk({ ...rest, x: src.x != null ? endX : undefined });
    set({ ...cabHist(s), cabs: [...s.cabs, dup], selIdx: s.cabs.length });
    return dup.id;
  },
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

  // ---- projects (persisted to localStorage) ----
  saveCurrent: () => {
    const s = get();
    let id = s.currentProjectId;
    const created = !id;
    if (!id) id = newProjectId();
    const design: DesignState = {};
    for (const k of PERSIST_KEYS) design[k] = (s as unknown as Record<string, unknown>)[k];
    upsertProject(id, design); // keeps the existing name; defaults one on first save
    if (created) set({ currentProjectId: id });
  },
  openProject: (id) => {
    const state = loadProjectState(id);
    if (!state) return;
    set({ ...freshDesign(), ...(state as Partial<AppState>), currentProjectId: id, menuOpen: false });
    set((s) => ({ projectsRev: s.projectsRev + 1 }));
  },
  newProject: () => set({ ...freshDesign(), currentProjectId: null, menuOpen: false }),
  removeProject: (id) => {
    deleteProject(id);
    set((s) => ({
      projectsRev: s.projectsRev + 1,
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    }));
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
  }, 700);
});

// dev-only: lets local tooling drive the store directly (stripped from prod builds)
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}
