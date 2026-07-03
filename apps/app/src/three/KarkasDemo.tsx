// three/KarkasDemo.tsx — Phase-2 proof screen: renders the ported StructuralModel engine in OUR
// three.js stack. buildDemoModel → solveLayout → layoutToScene → buildStructureGroup, in a plain
// three.js canvas with OrbitControls + tap-to-select. Entirely parallel to the kitchen 3D; used
// via the dev hash route (#karkas) until Phase 3 wires it into the constructor as a real screen.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildDemoModel, buildLCornerModel } from "../../../../engine/structure/demoModel.js";
import { solveLayout } from "../../../../engine/structure/layout.js";
import { layoutToScene, sceneDimsMm } from "./structureScene";
import { buildStructureGroup, highlightBoard, disposeStructureGroup } from "./structureRenderer";

export function KarkasDemo() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [variant, setVariant] = useState<"straight" | "lcorner">("straight");
  const [picked, setPicked] = useState<string | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0, d: 0 });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const model = variant === "lcorner" ? buildLCornerModel() : buildDemoModel();
    const scene3 = layoutToScene(solveLayout(model));
    setDims(sceneDimsMm(scene3));

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 480);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, (mount.clientWidth || 320) / (mount.clientHeight || 480), 0.02, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.4;
    controls.maxDistance = 12;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c8c8, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    const group = buildStructureGroup(scene3);
    scene.add(group);

    // frame the camera on the cabinet
    const ctr = new THREE.Vector3(scene3.center[0], scene3.center[1], scene3.center[2]);
    const dist = (Math.max(scene3.radius, 0.3) / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 2.2;
    controls.target.copy(ctr);
    camera.position.set(ctr.x + dist * 0.6, ctr.y + dist * 0.4, ctr.z + dist * 0.95);
    camera.lookAt(ctr);
    controls.update();

    // tap (not orbit-drag) a panel → highlight it + show its id
    const raycaster = new THREE.Raycaster();
    const down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { down.x = e.clientX; down.y = e.clientY; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        camera,
      );
      const hit = raycaster.intersectObjects(group.children, true)[0];
      let o = hit?.object as THREE.Object3D | undefined;
      while (o && o.userData.partId == null && o.parent) o = o.parent;
      const id = (o?.userData.partId as string) ?? null;
      highlightBoard(group, id);
      setPicked(id);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      const w = mount.clientWidth || 320, h = mount.clientHeight || 480;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      disposeStructureGroup(group);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#f0efe9", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", fontFamily: "system-ui", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>Karkas demo</b>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#5c6a61" }}>
          {dims.w}×{dims.h}×{dims.d} mm
        </span>
        <button onClick={() => setVariant("straight")} style={pill(variant === "straight")} type="button">Тумба</button>
        <button onClick={() => setVariant("lcorner")} style={pill(variant === "lcorner")} type="button">L-угол</button>
        <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#006b3f" }}>
          {picked ? `▸ ${picked}` : "panelni bosing"}
        </span>
      </div>
      <div ref={mountRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

const pill = (on: boolean): CSSProperties => ({
  padding: "6px 12px", borderRadius: 999, border: "1px solid " + (on ? "#000" : "#d8d2c4"),
  background: on ? "#000" : "none", color: on ? "#fff" : "#18241d", font: "600 13px system-ui", cursor: "pointer",
});
