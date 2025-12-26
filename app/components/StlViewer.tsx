"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

type Props = {
  geometry: THREE.BufferGeometry | null;
  rotationDeg: { x: number; y: number; z: number };
};

export default function StlViewer({ geometry, rotationDeg }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  // Create scene once per geometry
  useEffect(() => {
    if (!mountRef.current) return;

    // cleanup existing
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }
    sceneRef.current = null;
    cameraRef.current = null;
    meshRef.current = null;

    const w = 320;
    const h = 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    camera.position.set(0, -200, 150);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(100, 50, 200);
    scene.add(dir);

    // grid (simple “bed” feel)
    const grid = new THREE.GridHelper(200, 20);
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // mesh
    if (geometry) {
      const g = geometry.clone();
      g.computeBoundingBox();
      g.center();

      const mat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        metalness: 0.1,
        roughness: 0.65,
      });

      const mesh = new THREE.Mesh(g, mat);
      scene.add(mesh);
      meshRef.current = mesh;

      // camera fit
      const box = g.boundingBox!;
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 50;

      camera.position.set(0, -maxDim * 2.2, maxDim * 1.4);
      camera.lookAt(0, 0, 0);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;

    let running = true;
    const animate = () => {
      if (!running) return;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      running = false;
      controls.dispose();
      renderer.dispose();
    };
  }, [geometry]);

  // Apply mesh rotation whenever rotationDeg changes
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.rotation.set(
      THREE.MathUtils.degToRad(rotationDeg.x),
      THREE.MathUtils.degToRad(rotationDeg.y),
      THREE.MathUtils.degToRad(rotationDeg.z),
      "XYZ"
    );
  }, [rotationDeg.x, rotationDeg.y, rotationDeg.z]);

  return (
    <div className="border rounded-lg p-2 bg-white">
      <div ref={mountRef} />
      <p className="text-xs text-gray-500 mt-1 text-center">
        Drag = rotate view · Scroll = zoom · Right click = pan
      </p>
    </div>
  );
}
