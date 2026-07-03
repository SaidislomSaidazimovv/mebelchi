// A small live 3D preview of ONE cabinet for the focused fill editor — built with
// buildKitchen (so it matches the main scene). Starts CLOSED; TAP a door/drawer to open
// (or close) just that one — e.g. pull out a drawer to inspect its organizer. Orbit to
// rotate. Render-on-demand + a light open/close ease; rebuilt when the cabinet changes.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildKitchen, type RunRef } from "../three/kitchen3d";
import { useT } from "../i18n/useT";
import type { KitchenStyle } from "../model/layout";
import type { Cabinet } from "../model/cabinet";

const RUN: RunRef = { placement: { ax: 0, az: 0, ux: 1, uz: 0, ix: 0, iz: 1, startS: 0, lenM: 5 }, kind: "wall" };

type Openable = { kind: string; axis?: string; rad?: number; maxRad?: number; maxZ?: number };

function disposeGroup(gr: THREE.Object3D) {
  gr.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

// apply an open amount (0..1) to one door/drawer subgroup
function applyOpenTo(o: THREE.Object3D, amount: number) {
  const od = o.userData.openable as Openable;
  if (od.kind === "door") {
    const rad = od.rad ?? -(od.maxRad ?? 0);
    if (od.axis === "x") o.rotation.x = amount * rad;
    else o.rotation.y = amount * rad;
  } else o.position.z = amount * (od.maxZ ?? 0);
}

export function CabinetPreview3D({ cab, style }: { cab: Cabinet; style: KitchenStyle }) {
  const t = useT();
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ setCab: (c: Cabinet, s: KitchenStyle) => void; dispose: () => void } | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 360);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, (mount.clientWidth || 320) / (mount.clientHeight || 360), 0.02, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.4;
    controls.maxDistance = 8;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    let needs = true;
    const invalidate = () => { needs = true; };
    controls.addEventListener("change", invalidate);

    let group: THREE.Group | null = null;
    let openables: THREE.Object3D[] = [];
    const target: number[] = []; // per-front target amount (persists across rebuilds)
    const cur: number[] = []; // per-front animated amount
    let framed = false;

    const setCab = (c: Cabinet, s: KitchenStyle) => {
      if (group) { scene.remove(group); disposeGroup(group); }
      const preview: Cabinet = { ...c, px: 0, pz: 0, rot: 0, run: 0, mountY: c.kind === "upper" ? 0 : c.mountY };
      group = buildKitchen([preview], [RUN], s, { cx: 0, cy: 0 });
      // index the openable subgroups; keep any prior open state (same structure → same order)
      openables = [];
      group.traverse((o) => { if (o.userData.openable) { o.userData.openIndex = openables.length; openables.push(o); } });
      for (let i = 0; i < openables.length; i++) {
        if (target[i] === undefined) target[i] = 0;
        cur[i] = target[i];
        applyOpenTo(openables[i], cur[i]);
      }
      scene.add(group);
      group.updateMatrixWorld(true);
      if (!framed) { // frame once (closed); keep the user's camera on later edits
        const box = new THREE.Box3().setFromObject(group);
        const ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const dist = (Math.max(size.x, size.y, size.z, 0.3) / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 2.1;
        controls.target.copy(ctr);
        camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.45, ctr.z + dist * 0.9);
        camera.lookAt(ctr);
        controls.update();
        framed = true;
      }
      invalidate();
    };

    // tap (not orbit-drag) a front → toggle just that one
    const raycaster = new THREE.Raycaster();
    const down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (!group || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      for (const hit of raycaster.intersectObjects(group.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== group) {
          if (o.userData.openable) { const i = o.userData.openIndex as number; target[i] = target[i] ? 0 : 1; setHint(false); invalidate(); return; }
          o = o.parent;
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); invalidate(); }
    });
    ro.observe(mount);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      let animating = false;
      for (let i = 0; i < openables.length; i++) {
        if (cur[i] !== target[i]) {
          cur[i] = Math.abs(target[i] - cur[i]) < 0.004 ? target[i] : cur[i] + (target[i] - cur[i]) * 0.16;
          applyOpenTo(openables[i], cur[i]);
          animating = true;
        }
      }
      if (needs || animating) { renderer.render(scene, camera); needs = false; }
    };
    raf = requestAnimationFrame(loop);

    setCab(cab, style);
    apiRef.current = {
      setCab,
      dispose: () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointerup", onUp);
        controls.removeEventListener("change", invalidate);
        controls.dispose();
        if (group) disposeGroup(group);
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      },
    };
    return () => { apiRef.current?.dispose(); apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { apiRef.current?.setCab(cab, style); }, [cab, style]);

  return (
    <div ref={mountRef} className="fill-3d">
      {hint && <div className="fill-3d-hint">{t.fe.tapFront}</div>}
    </div>
  );
}
