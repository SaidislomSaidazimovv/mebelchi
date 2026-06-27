// Builds a 3D kitchen run from the solver's Cabinet[] and seats it against the
// room wall(s) / a free-standing island. Product-level geometry (boxes per module
// + simple appliance shapes), NOT the engine's full panel/hardware decomposition.
// Honours onboarding (built-in vs free fridge, oven tower, dome hood) and the
// per-variant finish (KitchenStyle colours). Metres, room-centred. One run ref
// (placement + kind) per Cabinet.run.

import * as THREE from "three";
import type { Placement } from "../model/runPlan";
import type { KitchenStyle } from "../model/layout";
import type { Cabinet } from "../model/cabinet";

const DEPTH_MM: Record<Cabinet["kind"], number> = { base: 560, tall: 560, upper: 350 };

// heights (m)
const PLINTH = 0.1;
const BASE_TOP = 0.82;
const WORKTOP = 0.04;
const UPPER_BOTTOM = 1.52;
const TALL_TOP = 2.2;

const STEEL = 0xd2d7da;
const STEEL_DARK = 0x2f3338;
const CARCASS_T = 0.018; // panel thickness (m) for the hollow carcass

/** One run for the renderer: where it sits + whether it's a free-standing piece. */
export interface RunRef {
  placement: Placement;
  kind: "wall" | "peninsula" | "island";
}

/** Build the run(s) as a THREE.Group, using one RunRef per Cabinet.run.
 *  `roomCenter` (mm) lets modules with a free plan transform (px/pz/rot) be placed
 *  in the same centred-metre space as the run placements. */
export function buildKitchen(cabs: Cabinet[], runs: RunRef[], style: KitchenStyle, roomCenter?: { cx: number; cy: number }): THREE.Group {
  const root = new THREE.Group();
  const mat = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
  const facadeMat = () => mat(style.facade);
  const carcassMat = () => mat(style.carcass);
  const worktopMat = () => mat(style.worktop, { roughness: 0.55 });
  const handleMat = () => mat(style.handle, { metalness: 0.5, roughness: 0.4 });
  const steelMat = () => mat(STEEL, { metalness: 0.4, roughness: 0.35 });

  const cursor: Record<string, number> = {};
  for (const c of cabs) {
    if (c.appliance === "filler") continue;
    const run = c.run ?? 0;
    const ref = runs[run] ?? runs[0];
    if (!ref) continue;
    const p = ref.placement;
    const freestanding = ref.kind !== "wall"; // island / peninsula → seating side

    const key = `${run}:${c.kind}`;
    const xMm = c.x ?? cursor[key] ?? 0;
    cursor[key] = xMm + c.w;

    const wM = c.w / 1000;
    const dM = (c.depth ?? DEPTH_MM[c.kind] ?? 560) / 1000;
    const sCenter = p.startS + (xMm + c.w / 2) / 1000;

    const g = new THREE.Group();
    g.userData.cabId = c.id; // raycast target → selects this module

    // diagonal corner unit (Phase 1): a PENTAGON body that fills the corner square,
    // with the room corner chamfered into a flat diagonal door. NOTE: first cut —
    // may still need visual tuning (chamfer depth / door).
    if (c.corner && c.px != null && c.pz != null && roomCenter) {
      g.rotation.y = -((c.rot ?? 0) * Math.PI) / 180; // local +z = the room diagonal
      g.position.set((c.px - roomCenter.cx) / 1000, 0, (c.pz - roomCenter.cy) / 1000);
      const s = c.w / 1000 / Math.SQRT2; // half-diagonal of the corner square (m)
      const zd = 0.3 * s; // chamfer depth → door sits at local z = zd
      const hd = s - zd; // half door-width
      // pentagon prism filling the square (V=wall corner back, room corner chamfered),
      // extruded upward (shape Y = −localZ so the door faces +z after rotateX(−90°))
      const prism = (height: number, yBase: number, m: THREE.Material) => {
        const shp = new THREE.Shape();
        shp.moveTo(0, s); // V (wall corner, back)
        shp.lineTo(-s, 0); // A (along wall a)
        shp.lineTo(-hd, -zd); // chamfer left
        shp.lineTo(hd, -zd); // chamfer right
        shp.lineTo(s, 0); // B (along wall b)
        shp.closePath();
        const geo = new THREE.ExtrudeGeometry(shp, { depth: height, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, yBase, 0);
        g.add(new THREE.Mesh(geo, m));
      };
      const doorPanel = (yc: number, height: number) => {
        const d = new THREE.Mesh(new THREE.BoxGeometry(hd * 2 - 0.03, height - 0.03, 0.02), facadeMat());
        d.position.set(0, yc, zd + 0.012);
        g.add(d);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, Math.min(0.22, height * 0.3), 10), handleMat());
        handle.position.set(hd - 0.07, yc, zd + 0.025);
        g.add(handle);
      };
      if (c.kind === "upper") {
        const h = c.h / 1000;
        const bottom = c.mountY != null ? c.mountY / 1000 : UPPER_BOTTOM;
        prism(h, bottom, carcassMat());
        doorPanel(bottom + h / 2, h);
      } else {
        const h = BASE_TOP - PLINTH;
        prism(h, PLINTH, carcassMat());
        prism(WORKTOP, BASE_TOP, worktopMat());
        doorPanel(PLINTH + h / 2, h);
      }
      root.add(g);
      continue;
    }

    if (c.px != null && c.pz != null && roomCenter) {
      // free plan transform: place the footprint centre, rotate to match the plan.
      // group origin is the module's BACK face, so back-off by half depth along +z.
      const rotRad = ((c.rot ?? 0) * Math.PI) / 180;
      g.rotation.y = -rotRad;
      const fwdX = -Math.sin(rotRad); // local +z in world after rotation.y = -rotRad
      const fwdZ = Math.cos(rotRad);
      const vx = (c.px - roomCenter.cx) / 1000;
      const vz = (c.pz - roomCenter.cy) / 1000;
      g.position.set(vx - fwdX * (dM / 2), 0, vz - fwdZ * (dM / 2));
    } else {
      g.position.set(p.ax + p.ux * sCenter, 0, p.az + p.uz * sCenter);
      const baseAngle = -Math.atan2(p.uz, p.ux);
      const localZIsInward = -p.uz * p.ix + p.ux * p.iz > 0;
      g.rotation.y = localZIsInward ? baseAngle : baseAngle + Math.PI;
    }

    const add = (w: number, h: number, d: number, lx: number, ly: number, lz: number, m: THREE.Material, target: THREE.Object3D = g) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(lx, ly, lz);
      target.add(mesh);
    };
    // a rounded handle bar (cylinder); `vertical` = along Y, else along the wall (X)
    const bar = (length: number, vertical: boolean, lx: number, ly: number, lz: number, target: THREE.Object3D = g) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 10), handleMat());
      m.position.set(lx, ly, lz);
      if (!vertical) m.rotation.z = Math.PI / 2;
      target.add(m);
    };

    if (c.kind === "upper") {
      if (c.appliance === "hood") {
        add(wM * 0.62, 0.16, dM, 0, 1.5, dM * 0.6, steelMat());
        add(0.22, 0.55, 0.12, 0, 1.88, dM * 0.42, steelMat());
        root.add(g);
        continue;
      }
      const h = c.h / 1000;
      const bottom = c.mountY != null ? c.mountY / 1000 : UPPER_BOTTOM;
      const yc = bottom + h / 2;
      hollowCarcass(add, wM, h, dM, yc, carcassMat);
      if (c.fill === "shelves") addShelves(add, c.count, wM, h, dM, yc, carcassMat);
      facade(add, bar, c, wM, h, yc, dM, style, facadeMat, g);
      root.add(g);
      continue;
    }

    if (c.kind === "tall") {
      const h = TALL_TOP - PLINTH;
      const yc = (TALL_TOP + PLINTH) / 2;
      add(wM - 0.01, PLINTH, dM * 0.85, 0, PLINTH / 2, dM * 0.55, mat(STEEL_DARK));
      if (c.appliance === "fridge" && !c.builtin) {
        add(wM, h, dM, 0, yc, dM / 2, mat(0xdde2e5, { metalness: 0.45, roughness: 0.3 }));
        add(wM + 0.002, 0.012, 0.01, 0, PLINTH + h * 0.62, dM + 0.006, mat(STEEL_DARK));
        bar(h * 0.34, true, wM / 2 - 0.05, PLINTH + h * 0.8, dM + 0.02);
        bar(h * 0.3, true, wM / 2 - 0.05, PLINTH + h * 0.3, dM + 0.02);
      } else if (c.appliance === "fridge") {
        add(wM, h, dM, 0, yc, dM / 2, carcassMat());
        add(wM - 0.04, h * 0.6 - 0.02, 0.02, 0, PLINTH + h * 0.72, dM + 0.011, facadeMat());
        add(wM - 0.04, h * 0.4 - 0.02, 0.02, 0, PLINTH + h * 0.22, dM + 0.011, facadeMat());
        bar(h * 0.22, true, wM / 2 - 0.06, PLINTH + h * 0.72, dM + 0.02);
      } else if (c.appliance === "oven") {
        add(wM, h, dM, 0, yc, dM / 2, carcassMat());
        const ovY = 1.55;
        add(wM - 0.04, 0.58, 0.02, 0, ovY, dM + 0.011, steelMat());
        add(wM - 0.16, 0.34, 0.012, 0, ovY + 0.02, dM + 0.02, mat(STEEL_DARK));
        bar(wM - 0.18, false, 0, ovY + 0.32, dM + 0.02);
        add(wM - 0.04, h - 1.18, 0.02, 0, PLINTH + (h - 1.18) / 2, dM + 0.011, facadeMat());
        add(wM - 0.04, 0.32, 0.02, 0, TALL_TOP - 0.2, dM + 0.011, facadeMat());
      } else {
        hollowCarcass(add, wM, h, dM, yc, carcassMat);
        if (c.fill === "shelves") addShelves(add, c.count, wM, h, dM, yc, carcassMat);
        facade(add, bar, c, wM, h, yc, dM, style, facadeMat, g);
      }
      root.add(g);
      continue;
    }

    // base ---------------------------------------------------------------------
    const h = BASE_TOP - PLINTH;
    const yc = (BASE_TOP + PLINTH) / 2;
    add(wM - 0.01, PLINTH, dM * 0.85, 0, PLINTH / 2, dM * 0.55, mat(STEEL_DARK)); // toe-kick
    hollowCarcass(add, wM, h, dM, yc, carcassMat);
    if (c.fill === "shelves" && (!c.appliance || c.appliance === "none")) addShelves(add, c.count, wM, h, dM, yc, carcassMat);

    // worktop with a front overhang (bigger on the seating side of an island)
    const front = freestanding ? 0.26 : 0.03;
    const wtDepth = dM + 0.02 + front;
    add(wM, WORKTOP, wtDepth, 0, BASE_TOP + WORKTOP / 2, dM / 2 - 0.01 + front / 2, worktopMat());

    if (c.appliance === "sink") {
      facade(add, bar, { ...c, fill: "shelves" } as Cabinet, wM, h, yc, dM, style, facadeMat, g);
      add(wM * 0.55, 0.05, dM * 0.6, 0, BASE_TOP - 0.01, dM * 0.5, mat(STEEL_DARK)); // basin well
      add(wM * 0.55, 0.015, dM * 0.6, 0, BASE_TOP + WORKTOP - 0.005, dM * 0.5, steelMat()); // rim
      // gooseneck faucet: column + forward spout
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.22, 10), steelMat());
      col.position.set(wM * 0.2, BASE_TOP + WORKTOP + 0.11, dM * 0.16);
      g.add(col);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), steelMat());
      spout.position.set(wM * 0.2, BASE_TOP + WORKTOP + 0.21, dM * 0.3);
      spout.rotation.x = Math.PI / 2;
      g.add(spout);
    } else if (c.appliance === "hob" || c.appliance === "cooktop") {
      if (c.appliance === "hob") {
        add(wM - 0.06, h - 0.14, 0.02, 0, yc, dM + 0.01, steelMat()); // oven front
        add(wM - 0.16, h - 0.34, 0.012, 0, yc + 0.02, dM + 0.02, mat(STEEL_DARK)); // window
        bar(wM - 0.18, false, 0, BASE_TOP - 0.06, dM + 0.02); // oven handle
      } else {
        facade(add, bar, c, wM, h, yc, dM, style, facadeMat, g); // drawers below cooktop
      }
      const topY = BASE_TOP + WORKTOP + 0.006;
      add(wM * 0.92, 0.012, dM * 0.8, 0, topY, dM * 0.5, mat(STEEL_DARK)); // hob glass
      for (const [a, b2] of [[-0.22, -0.15], [0.22, -0.15], [-0.22, 0.15], [0.22, 0.15]] as const) {
        const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), mat(0x111417));
        burner.position.set(wM * a, topY + 0.006, dM * (0.5 + b2));
        g.add(burner);
      }
    } else if (c.appliance === "dishwasher") {
      add(wM - 0.02, h - 0.02, 0.02, 0, yc, dM + 0.01, facadeMat());
      add(wM - 0.06, 0.03, 0.02, 0, BASE_TOP - 0.06, dM + 0.02, steelMat());
    } else {
      facade(add, bar, c, wM, h, yc, dM, style, facadeMat, g);
    }

    // bar stools tucked under a free-standing island/peninsula
    if (freestanding && c.w >= 400) {
      const sz = dM + front - 0.12; // under the overhang, on the room side
      const seatMat = mat(0x4a4640, { roughness: 0.7 });
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16), seatMat);
      seat.position.set(0, 0.6, sz);
      g.add(seat);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 10), steelMat());
      post.position.set(0, 0.3, sz);
      g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16), steelMat());
      foot.position.set(0, 0.02, sz);
      g.add(foot);
    }

    root.add(g);
  }
  return root;
}

type AddFn = (w: number, h: number, d: number, lx: number, ly: number, lz: number, m: THREE.Material, target?: THREE.Object3D) => void;
type BarFn = (length: number, vertical: boolean, lx: number, ly: number, lz: number, target?: THREE.Object3D) => void;

// re-pivot a group around (px, _, pz) by shifting its children the opposite way, so
// rotating/sliding the group hinges at that point while staying visually put at rest
function pivotGroup(group: THREE.Group, px: number, pz: number) {
  for (const ch of group.children) {
    ch.position.x -= px;
    ch.position.z -= pz;
  }
  group.position.set(px, 0, pz);
}

const DOOR_OPEN_RAD = Math.PI / 2; // exactly 90° swing

// a hollow carcass — 2 sides, top, bottom, back (open front) — so an open door/
// drawer reveals a real interior instead of a solid block
function hollowCarcass(add: AddFn, wM: number, h: number, dM: number, yc: number, m: () => THREE.Material) {
  const t = CARCASS_T;
  add(t, h, dM, -wM / 2 + t / 2, yc, dM / 2, m()); // left
  add(t, h, dM, wM / 2 - t / 2, yc, dM / 2, m()); // right
  add(wM, t, dM, 0, yc - h / 2 + t / 2, dM / 2, m()); // bottom
  add(wM, t, dM, 0, yc + h / 2 - t / 2, dM / 2, m()); // top
  add(wM - t * 2, h - t * 2, t, 0, yc, t / 2, m()); // back
}

// evenly spaced interior shelves (shown when the door opens / through glass)
function addShelves(add: AddFn, count: number, wM: number, h: number, dM: number, yc: number, m: () => THREE.Material) {
  const t = CARCASS_T;
  const inner = h - t * 2;
  for (let i = 1; i <= count; i++) {
    const sy = yc - h / 2 + (inner * i) / (count + 1);
    add(wM - t * 2, t, dM - t - 0.03, 0, sy, dM / 2 + t / 2, m());
  }
}

/** Carve a facade onto the front of a carcass: drawers / a (glass) door / open.
 *  Doors + drawers are built as `userData.openable` subgroups so the 3D view can
 *  animate them (door hinges on its handle-opposite edge; drawer slides forward). */
function facade(add: AddFn, bar: BarFn, c: Cabinet, wM: number, h: number, yc: number, dM: number, style: KitchenStyle, facadeMat: () => THREE.Material, g: THREE.Group) {
  const z = dM + 0.011;
  const inset = 0.02;
  const bottom = yc - h / 2;
  const glassMat = () => new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 });

  if (c.door === 3 && c.fill !== "drawers") {
    add(wM - inset * 2, h - inset * 2, 0.01, 0, yc, dM * 0.15, new THREE.MeshStandardMaterial({ color: 0xcfc7b8, roughness: 0.95 }));
    return;
  }

  if (c.fill === "drawers" && c.count > 0) {
    const n = c.count;
    const gap = 0.012;
    const fh = (h - inset * 2 - gap * (n - 1)) / n;
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xcfc7b8, roughness: 0.9 });
    const fwD = wM - inset * 2; // drawer width
    const boxD = dM * 0.85; // box depth (stays partly inside when pulled → no float)
    const sideH = Math.min(fh * 0.55, 0.12); // low box walls
    const t = 0.012;
    for (let i = 0; i < n; i++) {
      const fy = bottom + inset + fh / 2 + i * (fh + gap);
      const drw = new THREE.Group();
      add(fwD, fh, 0.02, 0, fy, z, facadeMat(), drw); // front
      bar(wM * 0.4, false, 0, fy + fh / 2 - 0.03, z + 0.012, drw); // handle
      // open-top box behind the front (floor + 2 sides + back) so it reads as a real drawer
      const cz = z - boxD / 2 - 0.006; // box centre z
      const fy0 = fy - fh / 2; // drawer-front bottom
      add(fwD - 0.02, t, boxD, 0, fy0 + 0.02, cz, boxMat, drw); // floor
      add(t, sideH, boxD, -(fwD / 2 - t), fy0 + sideH / 2 + 0.02, cz, boxMat, drw); // left wall
      add(t, sideH, boxD, fwD / 2 - t, fy0 + sideH / 2 + 0.02, cz, boxMat, drw); // right wall
      add(fwD - 0.02, sideH, t, 0, fy0 + sideH / 2 + 0.02, z - boxD, boxMat, drw); // back wall
      // staggered open: lower drawers out less, top drawer most (IKEA-style cascade)
      const frac = n > 1 ? 0.45 + 0.32 * (i / (n - 1)) : 0.62;
      drw.userData.openable = { kind: "drawer", maxZ: dM * frac };
      g.add(drw);
    }
    return;
  }

  const glass = c.door === 2 || (c.kind === "upper" && style.glassUppers);
  const fw = wM - inset * 2;
  const door = new THREE.Group();
  add(fw, h - inset * 2, 0.02, 0, yc, z, glass ? glassMat() : facadeMat(), door); // door panel
  bar(Math.min(0.22, h * 0.3), true, wM / 2 - 0.05, yc, z + 0.012, door); // handle (right) → hinge left
  pivotGroup(door, -fw / 2, z); // hinge on the front-left vertical edge
  door.userData.openable = { kind: "door", maxRad: DOOR_OPEN_RAD };
  g.add(door);
}
