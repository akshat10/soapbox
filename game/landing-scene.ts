import * as THREE from 'three';
import { preloadModels, cloneModel } from './assets';
import { createVehicleModel, createWheelModel } from './visuals';
import { getBody, getWheel, wheelMounts } from './catalogue';
import type { Blueprint } from './types';

/** A small attract scene uses the same chassis, wheels and drivers as the race. */
export async function createLandingScene(host: HTMLElement): Promise<(() => void) | undefined> {
  await preloadModels();
  if (!host.isConnected) return;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xf7f0df, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 120);
  camera.position.set(14, 12, 19);
  camera.lookAt(0, 1, 0);
  scene.add(new THREE.HemisphereLight(0xfff9e9, 0x668779, 2.8));
  const sun = new THREE.DirectionalLight(0xfff4d9, 3.3);
  sun.position.set(-6, 16, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -16; sun.shadow.camera.right = 16; sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16; sun.shadow.normalBias = .04;
  scene.add(sun);
  const world = new THREE.Group(); scene.add(world);
  function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; world.add(mesh); return mesh;
  }
  box(10, .8, 16, 0xadc6b4, 0, -.6, 0);
  box(6.8, .22, 16, 0xaaa993, 0, -.09, 0);
  [-1, 1].forEach(side => { box(.9, .35, 16, 0xeadab9, side * 4, -.03, 0); box(.12, .24, 16, 0xf7f0df, side * 3.46, .03, 0); });
  const marks = Array.from({ length: 8 }, (_, i) => box(.13, .02, .95, 0xffefc0, 0, .04, -7 + i * 2));
  for (const [x, z, color] of [[-5.25, -4.8, 0xb7d4c3], [-5.25, .5, 0xe4ab91], [4.95, -5.8, 0xe6cd84]] as const) {
    const house = cloneModel('house', { Wall: color });
    if (house) {
      const bounds = new THREE.Box3().setFromObject(house); const size = bounds.getSize(new THREE.Vector3());
      house.scale.setScalar(3.2 / Math.max(size.x, size.z));
      const scaled = new THREE.Box3().setFromObject(house); const center = scaled.getCenter(new THREE.Vector3());
      house.position.set(x - center.x, -.2 - scaled.min.y, z - center.z);
      house.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      world.add(house);
    }
  }
  // A pair of real assembled game vehicles, each with independently rolling wheels.
  const builds: Blueprint[] = [{ bodyId: 'sourdough', wheelId: 'scooter', wheelbase: 'standard' }, { bodyId: 'mission_burrito', wheelId: 'skate', wheelbase: 'standard' }];
  const cars = builds.map((build, i) => {
    const color = i ? 0x163c32 : 0xe65339;
    const body = getBody(build.bodyId), wheel = getWheel(build.wheelId);
    const car = new THREE.Group(); car.add(createVehicleModel(build, color));
    const wheels = wheelMounts(build).map(mount => { const mesh = createWheelModel(build, color); mesh.position.set(...mount); car.add(mesh); return mesh; });
    const baseY = body.height / 2 - .12 + wheel.radius + .06;
    car.position.set(i ? -1.8 : 1.7, baseY, i ? -1.9 : 2.6); world.add(car);
    return { car, wheels, baseY, z: car.position.z };
  });
  // Helper-created materials can be shared with the game renderer: own copies here.
  const ownMaterials = new Map<THREE.Material, THREE.Material>();
  scene.traverse(node => { if (node instanceof THREE.Mesh) { const own = (m: THREE.Material) => { if (!ownMaterials.has(m)) ownMaterials.set(m, m.clone()); return ownMaterials.get(m)!; }; node.material = Array.isArray(node.material) ? node.material.map(own) : own(node.material); } });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const render = (time: number) => {
    cars.forEach(({ car, wheels, baseY, z }, i) => { const phase = time * 1.15 + i * 2.6; const hop = Math.pow(Math.max(0, Math.sin(phase)), 8) * .42; car.position.y = baseY + hop; car.position.z = z + Math.sin(phase * .6) * .75; car.rotation.z = Math.sin(phase) * .018; car.rotation.x = Math.sin(phase) * .025; wheels.forEach(wheel => { wheel.rotation.x = time * 3.4; }); });
    marks.forEach((mark, i) => { mark.position.z = ((i * 2 + time * 2) % 16) - 8; });
    renderer.render(scene, camera);
  };
  const resize = () => { const { width, height } = host.getBoundingClientRect(); renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); render(0); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  let frame = 0, last = 0, time = 0;
  const animate = (now: number) => { frame = requestAnimationFrame(animate); if (document.hidden || reduced.matches) { last = now; return; } if (now - last < 33) return; time += Math.min(.06, (now - last) / 1000); last = now; render(time); };
  frame = requestAnimationFrame(animate);
  const onReduced = () => render(0); reduced.addEventListener('change', onReduced);
  return () => { cancelAnimationFrame(frame); observer.disconnect(); reduced.removeEventListener('change', onReduced); const geometries = new Set<THREE.BufferGeometry>(); scene.traverse(node => { if (node instanceof THREE.Mesh) geometries.add(node.geometry); }); geometries.forEach(g => g.dispose()); ownMaterials.forEach(m => m.dispose()); renderer.dispose(); renderer.domElement.remove(); };
}
