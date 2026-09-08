import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  toaster: '/models/toast-malone.glb',
  house: '/models/painted-lady.glb',
  wheel: '/models/street-wheel.glb',
  sourdough: '/models/sf/sourdough.glb',
  mission_burrito: '/models/sf/mission_burrito.glb',
  painted_porch: '/models/sf/painted_porch.glb',
  skate: '/models/sf/skate.glb',
  scooter: '/models/sf/scooter.glb',
  transit_disc: '/models/sf/transit_disc.glb',
} as const;
export type AssetId = keyof typeof FILES;
const sources = new Map<AssetId, THREE.Group>();
let loading: Promise<void> | undefined;

/** Load once before either scene is constructed; failed assets use the original models. */
export function preloadModels(): Promise<void> {
  return loading ??= Promise.all(Object.entries(FILES).map(async ([id, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/');
      sources.set(id as AssetId, gltf.scene);
    } catch (error) {
      console.warn(`Doodle Derby: using the original ${id} model because its GLB could not load.`, error);
    }
  })).then(() => undefined);
}

/** Each instance owns its resources, so changing a build cannot dispose another vehicle. */
export function cloneModel(id: AssetId, colors: Record<string, number> = {}): THREE.Group | undefined {
  const source = sources.get(id);
  if (!source) return undefined;
  const model = source.clone(true);
  const materials = new Map<THREE.Material, THREE.Material>();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry = node.geometry.clone();
    const cloneMaterial = (original: THREE.Material) => {
      let copy = materials.get(original);
      if (!copy) {
        copy = original.clone();
        if (copy instanceof THREE.MeshStandardMaterial && colors[original.name] !== undefined) {
          copy.color.setHex(colors[original.name]);
        }
        materials.set(original, copy);
      }
      return copy;
    };
    node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
    node.castShadow = true;
    node.receiveShadow = true;
  });
  model.userData.assetSource = FILES[id];
  return model;
}
