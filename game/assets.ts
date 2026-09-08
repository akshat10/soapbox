import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const FILES = {
  toaster: '/models/toast-malone.glb',
  house: '/models/painted-lady.glb',
  wheel: '/models/street-wheel.glb',
  sourdough: '/models/sf/sourdough.glb',
  mission_burrito: '/models/sf/mission_burrito.glb',
  painted_porch: '/models/sf-v2/painted_porch.glb',
  skate: '/models/sf-v2/skate.glb',
  scooter: '/models/sf-v2/scooter.glb',
  transit_disc: '/models/sf-v2/transit_disc.glb',
} as const;
export type AssetId = keyof typeof FILES;
const sources = new Map<AssetId, THREE.Group>();
let loading: Promise<void> | undefined;

/** Load once before either scene is constructed; failed assets use the original models. */
export function preloadModels(): Promise<void> {
  return loading ??= Promise.all(Object.entries(FILES).map(async ([id, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/');
      sources.set(id as AssetId, gltf.scene);
    } catch (error) {
      console.warn(`Doodle Derby: using the original ${id} model because its GLB could not load.`, error);
    }
  })).then(() => undefined);
}

/** Instances own geometry/materials; imported textures stay shared across vehicles. */
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
        const color = colors[original.name]
          ?? (original.name.includes('PlayerColor') ? colors.PlayerColor : undefined);
        if (copy instanceof THREE.MeshStandardMaterial && color !== undefined) {
          copy.color.setHex(color);
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
