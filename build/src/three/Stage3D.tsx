import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { Panel, Hole } from "../engine/block";
import { buildBlockGroup } from "./renderBlock";
import { mm10ToMm } from "../engine/units";
import { snapBox, type Box3D } from "../engine/snap";

export function Stage3D({
  panels,
  holes,
  selectedPanelId,
  onSelectPanel,
  onDragPanel,
  onUpdateDim,
  transformMode = "translate",
}: {
  panels: Panel[];
  holes: Hole[];
  selectedPanelId: string | null;
  onSelectPanel: (id: string | null) => void;
  onDragPanel: (id: string, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;
  onUpdateDim: (dim: "width" | "height" | "depth", val: number) => void;
  transformMode?: "translate" | "rotate";
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const onDragPanelRef = useRef(onDragPanel);
  onDragPanelRef.current = onDragPanel;

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) || null;

  useEffect(() => {
    const transformControls = transformRef.current;
    if (transformControls) {
      transformControls.mode = transformMode;
    }
  }, [transformMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f6f8);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1.4, 2.2, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-1.6, 1, -1.2);
    scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2;
    controlsRef.current = controls;

    const midX = 3000;
    const midZ = 2800;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.mode = transformMode;
    transformControls.addEventListener("dragging-changed", (event) => {
      controls.enabled = !event.value;
      if (!event.value) {
        const mesh = transformControls.object;
        if (mesh && mesh.name) {
          const p = panelsRef.current.find((x) => x.id === mesh.name);
          if (p) {
            const rawX = mesh.position.x * 10000 + midX - p.width / 2;
            const rawY = mesh.position.y * 10000 - p.height / 2;
            const rawZ = mesh.position.z * 10000 + midZ - p.depth / 2;

            const snapAngle = (val: number) => {
              const step = Math.PI / 2;
              return Math.round(val / step) * step;
            };
            const rx = snapAngle(mesh.rotation.x);
            const ry = snapAngle(mesh.rotation.y);
            const rz = snapAngle(mesh.rotation.z);

            const movingBox: Box3D = {
              x: rawX,
              y: rawY,
              z: rawZ,
              w: p.width,
              h: p.height,
              d: p.depth,
            };
            const otherBoxes: Box3D[] = panelsRef.current
              .filter((x) => x.id !== p.id)
              .map((x) => ({
                x: x.x,
                y: x.y,
                z: x.z,
                w: x.width,
                h: x.height,
                d: x.depth,
              }));

            const snapResult = snapBox(movingBox, otherBoxes, 300);

            const snappedX = snapResult.snapped.x ? snapResult.x : Math.round(rawX / 100) * 100;
            const snappedY = snapResult.snapped.y ? snapResult.y : Math.round(rawY / 100) * 100;
            const snappedZ = snapResult.snapped.z ? snapResult.z : Math.round(rawZ / 100) * 100;

            if (isFinite(snappedX) && isFinite(snappedY) && isFinite(snappedZ)) {
              onDragPanelRef.current(mesh.name, snappedX, snappedY, snappedZ, rx, ry, rz);
            }
          }
        }
      }
    });
    scene.add((transformControls as any).getHelper());
    transformRef.current = transformControls;

    camera.position.set(0.8, 0.5, 1.8);
    controls.target.set(0, 0, 0);
    controls.update();

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const raycaster = new THREE.Raycaster();
    const handleCanvasClick = (e: MouseEvent) => {
      if (transformControls.dragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);

      if (groupRef.current) {
        const intersects = raycaster.intersectObjects(groupRef.current.children, true);
        const panelMesh = intersects.find((int) => int.object instanceof THREE.Mesh && int.object.name);
        if (panelMesh) {
          onSelectPanel(panelMesh.object.name);
        } else {
          const isGizmoIntersect = raycaster.intersectObjects((transformControls as any).getHelper().children, true).length > 0;
          if (!isGizmoIntersect) {
            onSelectPanel(null);
          }
        }
      }
    };
    renderer.domElement.addEventListener("click", handleCanvasClick, true);

    let frame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      transformControls.dispose();
      renderer.domElement.removeEventListener("click", handleCanvasClick, true);
      scene.traverse((object) => {
        const holder = object as THREE.Mesh & THREE.LineSegments;
        if (holder.geometry) holder.geometry.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const transformControls = transformRef.current;
    if (!scene || !transformControls) return;

    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current = null;
    }

    const group = buildBlockGroup(panels, holes, selectedPanelId);
    scene.add(group);
    groupRef.current = group;

    const bounds = new THREE.Box3().setFromObject(group);
    if (isFinite(bounds.min.y)) {
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.PlaneGeometry) {
          obj.position.y = bounds.min.y;
        }
      });
    }

    if (selectedPanelId) {
      const selectedMesh = group.children.find((child) => child.name === selectedPanelId);
      if (selectedMesh) {
        transformControls.attach(selectedMesh);
      } else {
        transformControls.detach();
      }
    } else {
      transformControls.detach();
    }
  }, [panels, holes, selectedPanelId]);

  useEffect(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return;

    let frame = 0;
    const updateOverlay = () => {
      if (selectedPanelId && groupRef.current) {
        const selectedMesh = groupRef.current.children.find((child) => child.name === selectedPanelId);
        if (selectedMesh) {
          const center = new THREE.Vector3();
          selectedMesh.getWorldPosition(center);
          center.project(camera);
          
          const rect = renderer.domElement.getBoundingClientRect();
          const x = (center.x * 0.5 + 0.5) * rect.width;
          const y = (-(center.y * 0.5) + 0.5) * rect.height;
          setOverlayPos({ x, y });
        } else {
          setOverlayPos(null);
        }
      } else {
        setOverlayPos(null);
      }
      frame = requestAnimationFrame(updateOverlay);
    };
    updateOverlay();

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [selectedPanelId, panels]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {overlayPos && selectedPanel && (
        <div className="floating-dims-card" style={{ left: overlayPos.x, top: overlayPos.y }}>
          <div className="float-field">
            <span className="float-lbl">En (X)</span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.width))}
              onChange={(e) => onUpdateDim("width", Number(e.target.value) || 0)}
            />
          </div>
          <div className="float-field">
            <span className="float-lbl">Bo'y (Y)</span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.height))}
              onChange={(e) => onUpdateDim("height", Number(e.target.value) || 0)}
            />
          </div>
          <div className="float-field">
            <span className="float-lbl">Chuqurlik (Z)</span>
            <input
              type="number"
              value={Math.round(mm10ToMm(selectedPanel.depth))}
              onChange={(e) => onUpdateDim("depth", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
