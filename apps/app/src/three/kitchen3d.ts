// Builds a 3D kitchen run from the solver's Cabinet[] and seats it against the
// room wall(s) / a free-standing island. Product-level geometry (boxes per module
// + simple appliance shapes), NOT the engine's full panel/hardware decomposition.
// Honours onboarding (built-in vs free fridge, oven tower, dome hood) and the
// per-variant finish (KitchenStyle colours). Metres, room-centred. One run ref
// (placement + kind) per Cabinet.run.

import * as THREE from "three";
import type { Placement } from "../model/runPlan";
import type { KitchenStyle } from "../model/layout";
import { cabinetLayout, cellSizes, isLeaf, type Cabinet, type Cell, type HandlePos, type DoorOpening } from "../model/cabinet";
import { PBR, texturedMaterial, planarUV } from "./pbr";
import { catalogByColor } from "../model/materials";

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

    // per-module finish: each present override wins over the kitchen-wide style
    const fin = c.finish;
    // facade: a picked catalog material with a PBR texture (wood) → its real grain;
    // painted/gloss fronts (no texture) stay flat colour
    const facadeMat = () => {
      const col = fin?.facade ?? style.facade;
      if (PBR) {
        const key = catalogByColor(col, "facade")?.tex;
        const m2 = key ? texturedMaterial(key, col) : null;
        if (m2) return m2;
      }
      return mat(col);
    };
    const carcassMat = () => mat(fin?.carcass ?? style.carcass);
    // worktop: the picked worktop material's texture (marble / oak butcher-block), tinted
    // by the colour where the texture is tintable; defaults to marble
    const worktopMat = () => {
      const col = fin?.worktop ?? style.worktop;
      if (!PBR) return mat(col, { roughness: 0.55 });
      const key = catalogByColor(col, "worktop")?.tex ?? "marble";
      return texturedMaterial(key, col) ?? mat(col, { roughness: 0.55 });
    };
    const handleMat = () => mat(fin?.handle ?? style.handle, { metalness: 0.5, roughness: 0.4 });

    // diagonal corner unit (Phase 1): a FULL wall-aligned square so its two sides are
    // the full run depth (flush with the runs); the diagonal door sits ACROSS the room
    // corner (doesn't cut the sides).
    if (c.corner && c.px != null && c.pz != null && roomCenter) {
      const rotRad = ((c.rot ?? 0) * Math.PI) / 180;
      g.rotation.y = -rotRad; // local axes aligned with the two walls
      g.position.set((c.px - roomCenter.cx) / 1000, 0, (c.pz - roomCenter.cy) / 1000);
      const half = c.w / 2000; // half side of the corner square (m)
      // which corner faces the room (local sign), from the room-centre direction
      let wdx = roomCenter.cx - c.px;
      let wdz = roomCenter.cy - c.pz;
      const wl = Math.hypot(wdx, wdz) || 1;
      wdx /= wl; wdz /= wl;
      const ldx = wdx * Math.cos(rotRad) + wdz * Math.sin(rotRad); // world → local
      const ldz = -wdx * Math.sin(rotRad) + wdz * Math.cos(rotRad);
      const sx = ldx >= 0 ? 1 : -1;
      const sz = ldz >= 0 ? 1 : -1;
      const isUpper = c.kind === "upper";
      // run depth (the arm/run-butt depth): base 560, upper 350 (m)
      const armD = (isUpper ? 350 : 560) / 1000;
      const cut = armD - half; // how far the run-butt edge sits past centre (m)
      // Footprint local (x,z), shape Y = −z. Two full sides sit against the walls; the
      // adjacent runs butt the two run-depth sides. The ROOM-FACING corner is removed:
      // BASE → via the inner notch corner (an L-shape with an L-door); UPPER → a single
      // 45° chamfer (a pentagon with a diagonal door, ≈ a regular door wide).
      // `ov` pushes the room-facing (door) edges outward — +ov for the worktop overhang,
      // −ov to recess the toe-kick — while the run-butt/wall edges stay put so neighbours
      // still butt flush.
      const footPts = (ov = 0): [number, number][] => {
        const base: [number, number][] = [
          [-sx * half, -sz * half], // back corner (wall vertex)
          [sx * half, -sz * half], // along wall A
          [sx * half, sz * (cut + ov)], // run-A butt edge ends here (+overhang)
        ];
        const tail: [number, number][] = [
          [sx * (cut + ov), sz * half], // run-B butt edge starts here (+overhang)
          [-sx * half, sz * half], // along wall B
        ];
        return isUpper ? [...base, ...tail] : [...base, [sx * (cut + ov), sz * (cut + ov)], ...tail];
      };
      const prism = (height: number, yBase: number, m: THREE.Material, ov = 0) => {
        const s = new THREE.Shape();
        footPts(ov).forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
        s.closePath();
        const geo = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); // extrude axis Z → Y up; shape Y → −Z
        geo.translate(0, yBase, 0);
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      };
      // a flat door panel facing direction (nx,nz), centred on the face midpoint, added
      // to `target` (a swinging subgroup for the openable leaf, else `g`)
      const panel = (cx: number, cz: number, width: number, nx: number, nz: number, yc: number, height: number, target: THREE.Object3D) => {
        const d = new THREE.Mesh(new THREE.BoxGeometry(width, height - 0.03, 0.018), facadeMat());
        d.position.set(cx + nx * 0.011, yc, cz + nz * 0.011);
        d.rotation.y = Math.atan2(nx, nz);
        d.castShadow = true;
        target.add(d);
      };
      // ONE handle on the door, by type (c.handle index into HANDLES): 3 Без = none,
      // 2 Кнопка = knob (sphere), else a vertical bar pull — added to `target` so it
      // swings WITH the door; reacts to the handle picker / "apply to all" like regular cabinets.
      const cornerHandle = (px: number, pz: number, nx: number, nz: number, yc: number, len: number, target: THREE.Object3D) => {
        const HT = c.handle ?? 0;
        if (HT === 3) return; // none
        if (HT === 2) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.015, 14, 10), handleMat());
          cap.position.set(px + nx * 0.03, yc, pz + nz * 0.03);
          target.add(cap);
          return;
        }
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 10), handleMat());
        b.position.set(px + nx * 0.024, yc, pz + nz * 0.024);
        target.add(b);
      };
      // build the swinging leaf as a subgroup pivoted on its hinge edge (hx,hz), tagged
      // openable so VariantScene's applyOpen hinges it like a normal cabinet door
      const swingDoor = (hx: number, hz: number, build: (door: THREE.Group) => void) => {
        const door = new THREE.Group();
        build(door);
        pivotGroup(door, hx, hz);
        door.userData.openable = { kind: "door", maxRad: DOOR_OPEN_RAD };
        g.add(door);
      };
      const doors = (yc: number, height: number) => {
        const face = half - cut; // length of each run-butt face / door arm
        const len = Math.min(0.22, height * 0.5);
        if (isUpper) {
          // single diagonal door across the chamfer (run-butt-A → run-butt-B); hinge at the
          // run-butt-A end so it swings open toward the room
          swingDoor(sx * half, sz * cut, (door) => {
            panel((sx * (half + cut)) / 2, (sz * (half + cut)) / 2, face * Math.SQRT2, sx, sz, yc, height, door);
            // handle ON the diagonal door surface (x+z = half+cut), offset toward one end
            // along the chamfer; unit normal so it just protrudes (was floating off the door)
            const dn = 1 / Math.SQRT2;
            const off = face * 0.35;
            cornerHandle((sx * (half + cut)) / 2 - sx * dn * off, (sz * (half + cut)) / 2 + sz * dn * off, sx * dn, sz * dn, yc, len, door);
          });
        } else {
          // L-door: BOTH arms are ONE L-shaped leaf that swings open from one side like a
          // regular door — hinged at arm-A's outer edge, handle at arm-B's outer end.
          swingDoor(sx * half, sz * cut, (door) => {
            panel((sx * (half + cut)) / 2, sz * cut, face, 0, sz, yc, height, door); // arm A (∥ wall A)
            panel(sx * cut, (sz * (half + cut)) / 2, face, sx, 0, yc, height, door); // arm B (∥ wall B)
            cornerHandle(sx * cut, sz * (half - 0.06), sx, 0, yc, len, door);
          });
        }
      };
      // a thin vertical carcass panel along the edge (ax,az)→(bx,bz), centred on it
      const sidePanel = (ax: number, az: number, bx: number, bz: number, yBase: number, hh: number) => {
        const L = Math.hypot(bx - ax, bz - az);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(L, hh, CARCASS_T), carcassMat());
        mesh.position.set((ax + bx) / 2, yBase + hh / 2, (az + bz) / 2);
        mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
      };
      // HOLLOW body: thin bottom + top + shelves + side/back walls (open ONLY at the door
      // face) — so the door reveals an interior with separations + the shelves are enclosed
      // by real side panels instead of floating. Walls on every footprint edge EXCEPT the
      // two door-face edges; same 4 edges for base (L) and upper (chamfer).
      const hollowBody = (yBase: number, hh: number) => {
        prism(CARCASS_T, yBase, carcassMat()); // bottom panel
        prism(CARCASS_T, yBase + hh - CARCASS_T, carcassMat()); // top panel
        for (const f of [0.38, 0.68]) prism(CARCASS_T, yBase + hh * f, carcassMat()); // shelves
        const Vx = -sx * half, Vz = -sz * half; // back wall vertex
        const Ax = sx * half, Az = -sz * half; // end of the wall-A side
        const bAx = sx * half, bAz = sz * cut; // run-butt-A
        const bBx = sx * cut, bBz = sz * half; // run-butt-B
        const Bx = -sx * half, Bz = sz * half; // end of the wall-B side
        sidePanel(Vx, Vz, Ax, Az, yBase, hh); // back, against wall A
        sidePanel(Ax, Az, bAx, bAz, yBase, hh); // side at the run-A butt
        sidePanel(bBx, bBz, Bx, Bz, yBase, hh); // side at the run-B butt
        sidePanel(Bx, Bz, Vx, Vz, yBase, hh); // back, against wall B
      };
      if (isUpper) {
        const h = c.h / 1000;
        const bottom = c.mountY != null ? c.mountY / 1000 : UPPER_BOTTOM;
        hollowBody(bottom, h);
        doors(bottom + h / 2, h);
      } else {
        const h = BASE_TOP - PLINTH;
        prism(PLINTH, 0, mat(STEEL_DARK), -0.02); // toe-kick (recessed, like regular bases)
        hollowBody(PLINTH, h);
        prism(WORKTOP, BASE_TOP, worktopMat(), 0.03); // worktop with the same front overhang
        doors(PLINTH + h / 2, h);
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
      return mesh;
    };
    // a rounded handle bar (cylinder); `vertical` = along Y, else along the wall (X).
    // used for appliance handles (always a bar).
    const bar = (length: number, vertical: boolean, lx: number, ly: number, lz: number, target: THREE.Object3D = g) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, length, 10), handleMat());
      m.position.set(lx, ly, lz);
      if (!vertical) m.rotation.z = Math.PI / 2;
      target.add(m);
    };
    // cabinet handle by TYPE (c.handle index into HANDLES): 0 Скоба = bar pull,
    // 1 Профиль = slim near-flush edge pull, 2 Кнопка = round knob, 3 Без = none.
    // Same call signature as `bar` so it drops into facade() unchanged.
    const handle: BarFn = (length, vertical, lx, ly, lz, target = g) => {
      const type = c.handle ?? 0;
      if (type === 3) return; // none
      if (type === 2) {
        // knob: a round cap on a short stem, protruding from the front face
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.02, 10), handleMat());
        stem.rotation.x = Math.PI / 2;
        stem.position.set(lx, ly, lz + 0.01);
        target.add(stem);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), handleMat());
        cap.position.set(lx, ly, lz + 0.024);
        target.add(cap);
        return;
      }
      if (type === 1) {
        // profile: a slim flat edge pull, sitting almost flush
        const strip = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.014 : length, vertical ? length : 0.014, 0.008), handleMat());
        strip.position.set(lx, ly, lz - 0.004);
        target.add(strip);
        return;
      }
      bar(length, vertical, lx, ly, lz, target); // 0 = bar pull
    };

    // free-standing furniture (dining table / chair) — built where a cabinet body would
    // sit (g is already placed by the free branch, origin = back face), so the piece is
    // centred at local z = dM/2 and the move gizmo's back-off matches with no jump.
    if (c.furniture) {
      const woodMat = () => mat(fin?.facade ?? 0xc79a64, { roughness: 0.6 });
      const zc = dM / 2;
      const Ht = c.h / 1000;
      const legT = 0.06;
      const legsAt = (lh: number, inset: number, t: number, m: THREE.Material) => {
        const lx = wM / 2 - inset;
        const lz = dM / 2 - inset;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(t, lh, t, sx * lx, lh / 2, zc + sz * lz, m);
      };
      const steel = () => steelMat();
      if (c.furniture === "table") {
        const topT = 0.04;
        add(wM, topT, dM, 0, Ht - topT / 2, zc, woodMat()); // tabletop slab
        legsAt(Ht - topT, 0.07, legT, woodMat());
      } else if (c.furniture === "chair") {
        const seatY = 0.45;
        const seatT = 0.045;
        add(wM, seatT, dM, 0, seatY - seatT / 2, zc, woodMat()); // seat
        legsAt(seatY - seatT, 0.04, 0.042, woodMat());
        const backH = 0.45; // backrest rising from the rear edge
        add(wM, backH, seatT, 0, seatY + backH / 2, zc - dM / 2 + seatT / 2, woodMat());
      } else if (c.furniture === "stool") {
        const seatY = Ht; // bar height
        const seatT = 0.05;
        add(wM, seatT, dM, 0, seatY - seatT / 2, zc, woodMat()); // seat
        legsAt(seatY - seatT, 0.04, 0.04, steel());
        add(wM - 0.06, 0.025, 0.025, 0, seatY * 0.32, zc + dM / 2 - 0.04, steel()); // footrest bar
      } else if (c.furniture === "trolley") {
        const topT = 0.035;
        add(wM, topT, dM, 0, Ht - topT / 2, zc, woodMat()); // top
        add(wM - 0.06, 0.03, dM - 0.06, 0, Ht * 0.42, zc, woodMat()); // lower shelf
        legsAt(Ht, 0.035, 0.04, steel());
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // castor wheels
          const wheel = add(0.05, 0.05, 0.05, sx * (wM / 2 - 0.035), 0.025, zc + sz * (dM / 2 - 0.035), mat(0x222222));
          wheel.scale.set(1, 1, 1);
        }
      } else if (c.furniture === "shelf") {
        // open wall shelf — a plank mounted at height, two brackets underneath
        const yShelf = c.mountY != null ? c.mountY / 1000 : 1.45;
        const plankT = 0.03;
        add(wM, plankT, dM, 0, yShelf, zc, woodMat());
        for (const sx of [-1, 1]) add(0.02, 0.14, dM * 0.8, sx * (wM / 2 - 0.06), yShelf - 0.08, zc, steel()); // brackets
      } else {
        // free-standing waste bin — a tapered-ish body + a lid
        const bodyH = Ht - 0.04;
        add(wM, bodyH, dM, 0, bodyH / 2, zc, mat(0x9a9ea2, { metalness: 0.3, roughness: 0.5 }));
        add(wM + 0.01, 0.04, dM + 0.01, 0, bodyH + 0.02, zc, mat(0x70747a, { metalness: 0.4, roughness: 0.4 })); // lid
      }
      root.add(g);
      continue;
    }

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
      buildModuleInterior(add, handle, c, wM, h, dM, yc, style, facadeMat, carcassMat, true, g);
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
        buildModuleInterior(add, handle, c, wM, h, dM, yc, style, facadeMat, carcassMat, false, g);
      }
      root.add(g);
      continue;
    }

    // base ---------------------------------------------------------------------
    const h = BASE_TOP - PLINTH;
    const yc = (BASE_TOP + PLINTH) / 2;
    add(wM - 0.01, PLINTH, dM * 0.85, 0, PLINTH / 2, dM * 0.55, mat(STEEL_DARK)); // toe-kick
    hollowCarcass(add, wM, h, dM, yc, carcassMat);

    // worktop with a front overhang (bigger on the seating side of an island)
    const front = freestanding ? 0.26 : 0.03;
    const wtDepth = dM + 0.02 + front;
    const wt = add(wM, WORKTOP, wtDepth, 0, BASE_TOP + WORKTOP / 2, dM / 2 - 0.01 + front / 2, worktopMat());
    // map the marble in run space (offset by the cabinet's position along the run) so the
    // worktops flow into one continuous slab instead of per-cabinet blocks
    if (PBR) planarUV(wt.geometry, 1.4, sCenter, 0);

    if (c.appliance === "sink") {
      facade(add, handle, { ...c, fill: "shelves" } as Cabinet, wM, h, yc, dM, style, facadeMat, g);
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
        facade(add, handle, c, wM, h, yc, dM, style, facadeMat, g); // drawers below cooktop
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
      buildModuleInterior(add, handle, c, wM, h, dM, yc, style, facadeMat, carcassMat, false, g);
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
// same, but around a HORIZONTAL edge (py, _, pz) → rotating on X lifts/flaps the group
function pivotGroupY(group: THREE.Group, py: number, pz: number) {
  for (const ch of group.children) {
    ch.position.y -= py;
    ch.position.z -= pz;
  }
  group.position.set(0, py, pz);
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

// ── HYBRID INTERIOR (cell tree) ────────────────────────────────────────────────
// A cell occupies an interior sub-rect in fractions [fx0..fx1]×[fy0..fy1] (x across the
// width from the left, y up from the bottom). A split builds carcass dividers at the child
// boundaries + recurses; a leaf builds its own front (door / drawers / open) + shelves.
interface Rect { fx0: number; fy0: number; fx1: number; fy1: number; }

// place a handle bar/knob on the chosen edge of a front (vertical bar for left/right)
function placeHandle(handle: BarFn, pos: HandlePos, xL: number, xR: number, yB: number, yT: number, z: number, target: THREE.Object3D) {
  const wL = xR - xL, hL = yT - yB, xC = (xL + xR) / 2, yC = (yB + yT) / 2, m = 0.05, zz = z + 0.012;
  if (pos === "none") return; // handleless — push-to-open latch (no visible pull)
  if (pos === "center") handle(0.05, false, xC, yC, zz, target); // central knob
  else if (pos === "top") handle(Math.min(0.22, wL * 0.4), false, xC, yT - m, zz, target);
  else if (pos === "bottom") handle(Math.min(0.22, wL * 0.4), false, xC, yB + m, zz, target);
  else if (pos === "left") handle(Math.min(0.22, hL * 0.4), true, xL + m, yC, zz, target);
  else handle(Math.min(0.22, hL * 0.4), true, xR - m, yC, zz, target);
}

// organizer (cutlery-tray) dividers inside a drawer box, from a top-down cell tree in the
// width(X) × depth(Z) plane. "cols" splits width → a panel spanning depth; "rows" splits
// depth → a panel spanning width. Panels are `panelH` tall (= the drawer wall height).
function addOrganizer(add: AddFn, cell: Cell, xC: number, fwInner: number, floorY: number, panelH: number, cz: number, boxD: number, m: THREE.Material, drw: THREE.Group, r: Rect) {
  if (isLeaf(cell)) return;
  const sizes = cellSizes(cell), orgT = 0.006, yc = floorY + panelH / 2;
  const xAt = (ufx: number) => xC - fwInner / 2 + fwInner * ufx;
  const zAt = (ufz: number) => cz - boxD / 2 + boxD * ufz;
  let acc = 0;
  for (let i = 0; i < cell.children!.length; i++) {
    const f = sizes[i];
    const sub: Rect = cell.split === "rows"
      ? { fx0: r.fx0, fy0: r.fy0 + (r.fy1 - r.fy0) * acc, fx1: r.fx1, fy1: r.fy0 + (r.fy1 - r.fy0) * (acc + f) }
      : { fx0: r.fx0 + (r.fx1 - r.fx0) * acc, fy0: r.fy0, fx1: r.fx0 + (r.fx1 - r.fx0) * (acc + f), fy1: r.fy1 };
    addOrganizer(add, cell.children![i], xC, fwInner, floorY, panelH, cz, boxD, m, drw, sub);
    acc += f;
    if (i < cell.children!.length - 1) {
      if (cell.split === "rows") add(fwInner * (r.fx1 - r.fx0) * 0.98, panelH, orgT, xAt((r.fx0 + r.fx1) / 2), yc, zAt(r.fy0 + (r.fy1 - r.fy0) * acc), m, drw);
      else add(orgT, panelH, boxD * (r.fy1 - r.fy0) * 0.98, xAt(r.fx0 + (r.fx1 - r.fx0) * acc), yc, zAt((r.fy0 + r.fy1) / 2), m, drw);
    }
  }
}

// a door / drawer front covering a sub-rect (door: opening side + handle placement). Used
// for both a cell's own front and a combined-door overlay (any rectangle of cells).
function buildFront(add: AddFn, handle: BarFn, kind: "door" | "drawer", opening: DoorOpening | undefined, handlePos: HandlePos | undefined, organizer: Cell | undefined, wM: number, h: number, dM: number, yc: number, style: KitchenStyle, facadeMat: () => THREE.Material, isUpper: boolean, g: THREE.Group, r: Rect) {
  const t = CARCASS_T, iw = wM - 2 * t, ih = h - 2 * t;
  const REVEAL = 0.0025; // ~2.5 mm gap between adjacent overlay fronts
  // OVERLAY extent: cover the carcass out to the MODULE edge at an outer boundary, and meet
  // near the divider centre at an interior boundary — so only a thin reveal shows (a real
  // overlay front, not a small panel inset inside the box exposing the carcass).
  const outerL = r.fx0 <= 0.001, outerR = r.fx1 >= 0.999, outerB = r.fy0 <= 0.001, outerT = r.fy1 >= 0.999;
  const xL = (outerL ? -wM / 2 : -wM / 2 + t + iw * r.fx0) + (outerL ? REVEAL : REVEAL / 2);
  const xR = (outerR ? wM / 2 : -wM / 2 + t + iw * r.fx1) - (outerR ? REVEAL : REVEAL / 2);
  const yB = (outerB ? yc - h / 2 : yc - h / 2 + t + ih * r.fy0) + (outerB ? REVEAL : REVEAL / 2);
  const yT = (outerT ? yc + h / 2 : yc - h / 2 + t + ih * r.fy1) - (outerT ? REVEAL : REVEAL / 2);
  const xC = (xL + xR) / 2, yC2 = (yB + yT) / 2, z = dM + 0.01;
  const fw = xR - xL, fh = yT - yB;

  if (kind === "drawer") {
    const drw = new THREE.Group();
    add(fw, fh, 0.02, xC, yC2, z, facadeMat(), drw);
    placeHandle(handle, handlePos ?? "top", xL, xR, yB, yT, z, drw);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xcfc7b8, roughness: 0.9 });
    const boxD = dM * 0.85, sideH = Math.min(fh * 0.5, 0.12), bt = 0.012, cz = z - boxD / 2 - 0.006, fy0 = yB + 0.02;
    add(fw - 0.04, bt, boxD, xC, fy0 + 0.02, cz, boxMat, drw);
    add(bt, sideH, boxD, xC - (fw / 2 - bt), fy0 + sideH / 2 + 0.02, cz, boxMat, drw);
    add(bt, sideH, boxD, xC + (fw / 2 - bt), fy0 + sideH / 2 + 0.02, cz, boxMat, drw);
    add(fw - 0.02, sideH, bt, xC, fy0 + sideH / 2 + 0.02, z - boxD, boxMat, drw);
    // organizer (cutlery-tray) dividers — same height as the drawer walls (sideH)
    if (organizer) addOrganizer(add, organizer, xC, fw - 2 * bt, fy0 + 0.02, sideH, cz, boxD - 2 * bt, boxMat, drw, { fx0: 0, fy0: 0, fx1: 1, fy1: 1 });
    drw.userData.openable = { kind: "drawer", maxZ: dM * 0.6 };
    g.add(drw);
    return;
  }

  // door: panel + handle (placement) + hinge (opening side; top/bottom = hydraulic lift)
  const glass = isUpper && style.glassUppers;
  const glassMat = () => new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 });
  const door = new THREE.Group();
  add(fw, fh, 0.02, xC, yC2, z, glass ? glassMat() : facadeMat(), door);
  const opn = opening ?? "left";
  const hpos: HandlePos = handlePos ?? (opn === "left" ? "right" : opn === "right" ? "left" : opn === "top" ? "bottom" : "top");
  placeHandle(handle, hpos, xL, xR, yB, yT, z, door);
  // hinge on the DOOR's own edge (xL/xR/yB/yT) at the carcass front (hz=dM), NOT proud of
  // the box — otherwise an open door floats with a gap. top/bottom rotate on X and must
  // swing OUT (+z): top lifts up (−rad), bottom flaps down (+rad).
  const hz = dM;
  if (opn === "left") { pivotGroup(door, xL, hz); door.userData.openable = { kind: "door", axis: "y", rad: -DOOR_OPEN_RAD }; }
  else if (opn === "right") { pivotGroup(door, xR, hz); door.userData.openable = { kind: "door", axis: "y", rad: DOOR_OPEN_RAD }; }
  else if (opn === "top") { pivotGroupY(door, yT, hz); door.userData.openable = { kind: "door", axis: "x", rad: -DOOR_OPEN_RAD }; }
  else { pivotGroupY(door, yB, hz); door.userData.openable = { kind: "door", axis: "x", rad: DOOR_OPEN_RAD }; }
  g.add(door);
}

// interior structure BEHIND a front (a combined door) — split dividers only, no sub-fronts
function buildInterior(add: AddFn, cell: Cell, wM: number, h: number, dM: number, yc: number, carcassMat: () => THREE.Material, r: Rect) {
  if (isLeaf(cell)) return;
  const t = CARCASS_T, iw = wM - 2 * t, ih = h - 2 * t, x0 = -wM / 2 + t, yb = yc - h / 2 + t, zc = dM / 2 + t / 2, zd = dM - t - 0.03;
  const sizes = cellSizes(cell);
  let acc = 0;
  for (let i = 0; i < cell.children!.length; i++) {
    const f = sizes[i];
    const sub: Rect = cell.split === "rows"
      ? { fx0: r.fx0, fy0: r.fy0 + (r.fy1 - r.fy0) * acc, fx1: r.fx1, fy1: r.fy0 + (r.fy1 - r.fy0) * (acc + f) }
      : { fx0: r.fx0 + (r.fx1 - r.fx0) * acc, fy0: r.fy0, fx1: r.fx0 + (r.fx1 - r.fx0) * (acc + f), fy1: r.fy1 };
    buildInterior(add, cell.children![i], wM, h, dM, yc, carcassMat, sub);
    acc += f;
    if (i < cell.children!.length - 1) {
      if (cell.split === "rows") add(iw * (r.fx1 - r.fx0), t, zd, x0 + iw * (r.fx0 + r.fx1) / 2, yb + ih * (r.fy0 + (r.fy1 - r.fy0) * acc), zc, carcassMat());
      else add(t, ih * (r.fy1 - r.fy0), zd, x0 + iw * (r.fx0 + (r.fx1 - r.fx0) * acc), yb + ih * (r.fy0 + r.fy1) / 2, zc, carcassMat());
    }
  }
}

// recurse the cell tree: a node with a `front` gets ONE front over its whole rect (+ its
// children rendered as the interior behind it); an un-fronted split recurses into cells.
function buildCells(add: AddFn, handle: BarFn, cell: Cell, wM: number, h: number, dM: number, yc: number, style: KitchenStyle, facadeMat: () => THREE.Material, carcassMat: () => THREE.Material, isUpper: boolean, g: THREE.Group, r: Rect = { fx0: 0, fy0: 0, fx1: 1, fy1: 1 }) {
  if (cell.front) {
    buildFront(add, handle, cell.front, cell.opening, cell.handle, cell.organizer, wM, h, dM, yc, style, facadeMat, isUpper, g, r);
    if (cell.children && cell.children.length) buildInterior(add, cell, wM, h, dM, yc, carcassMat, r);
    return;
  }
  if (isLeaf(cell)) return; // open compartment — the hollow carcass shows through
  const t = CARCASS_T, iw = wM - 2 * t, ih = h - 2 * t, x0 = -wM / 2 + t, yb = yc - h / 2 + t, zc = dM / 2 + t / 2, zd = dM - t - 0.03;
  const sizes = cellSizes(cell);
  let acc = 0;
  for (let i = 0; i < cell.children!.length; i++) {
    const f = sizes[i];
    const sub: Rect = cell.split === "rows"
      ? { fx0: r.fx0, fy0: r.fy0 + (r.fy1 - r.fy0) * acc, fx1: r.fx1, fy1: r.fy0 + (r.fy1 - r.fy0) * (acc + f) }
      : { fx0: r.fx0 + (r.fx1 - r.fx0) * acc, fy0: r.fy0, fx1: r.fx0 + (r.fx1 - r.fx0) * (acc + f), fy1: r.fy1 };
    buildCells(add, handle, cell.children![i], wM, h, dM, yc, style, facadeMat, carcassMat, isUpper, g, sub);
    acc += f;
    if (i < cell.children!.length - 1) {
      if (cell.split === "rows") add(iw * (r.fx1 - r.fx0), t, zd, x0 + iw * (r.fx0 + r.fx1) / 2, yb + ih * (r.fy0 + (r.fy1 - r.fy0) * acc), zc, carcassMat());
      else add(t, ih * (r.fy1 - r.fy0), zd, x0 + iw * (r.fx0 + (r.fx1 - r.fx0) * acc), yb + ih * (r.fy0 + r.fy1) / 2, zc, carcassMat());
    }
  }
}

// the whole module interior: the cell tree (structure + per-cell fronts) + any combined-door
// overlays (one door over a rectangle of cells; the cells behind it show as interior shelves)
function buildModuleInterior(add: AddFn, handle: BarFn, c: Cabinet, wM: number, h: number, dM: number, yc: number, style: KitchenStyle, facadeMat: () => THREE.Material, carcassMat: () => THREE.Material, isUpper: boolean, g: THREE.Group) {
  buildCells(add, handle, cabinetLayout(c), wM, h, dM, yc, style, facadeMat, carcassMat, isUpper, g);
  for (const cd of c.combinedDoors ?? [])
    buildFront(add, handle, "door", cd.opening, cd.handle, undefined, wM, h, dM, yc, style, facadeMat, isUpper, g, { fx0: cd.fx0, fy0: cd.fy0, fx1: cd.fx1, fy1: cd.fy1 });
}

/** Carve a facade onto the front of a carcass: drawers / a (glass) door / open.
 *  Doors + drawers are built as `userData.openable` subgroups so the 3D view can
 *  animate them (door hinges on its handle-opposite edge; drawer slides forward). */
function facade(add: AddFn, bar: BarFn, c: Cabinet, wM: number, h: number, yc: number, dM: number, style: KitchenStyle, facadeMat: () => THREE.Material, g: THREE.Group) {
  const z = dM + 0.011;
  const inset = 0.02;
  const bottom = yc - h / 2;
  const glassMat = () => new THREE.MeshStandardMaterial({ color: 0xbfe0ee, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.1 });

  // no door: an explicit "Без" facade OR an "Открытый" (open) module → open front
  if ((c.door === 3 || c.fill === "open") && c.fill !== "drawers") {
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
