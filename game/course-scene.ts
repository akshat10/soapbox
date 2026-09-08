import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { conformCourseBridges } from './course-bridge';

export interface CourseScene { root: THREE.Group; mixer: THREE.AnimationMixer; sky: THREE.Texture | null }

/** The road is used at its authored metre scale and origin, exactly as the collider. */
export async function loadCourseScene(): Promise<CourseScene> {
  const response = await fetch('/models/track/bay-or-bust-course.glb', { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('The Bay or Bust course could not load.');
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/track/');
  const root = gltf.scene;
  root.name = 'Bay or Bust · authored race course';
  conformCourseBridges(root);
  root.traverse(node=>{if(/sf_cloud_cluster/i.test(node.name))node.visible=false;});
  root.updateMatrixWorld(true);
  const protectedNodes = new Set<THREE.Object3D>();
  const names = new Map<string, THREE.Object3D>();
  root.traverse(node => { names.set(node.name, node); names.set(node.uuid, node); });
  const decorative = gltf.animations.map(clip => new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(track => {
    const name = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
    const target = names.get(name);
    if (target) target.traverse(node => protectedNodes.add(node));
    // Road furniture and vehicles remain static until their moving colliders exist.
    return /lantern|arm|swing/i.test(name);
  })));
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = !node.userData.disable_cast_shadow;
    node.receiveShadow = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material instanceof THREE.MeshStandardMaterial && /Bay_Turquoise|Water_Glint/.test(material.name)) {
        material.metalness = .05; material.roughness = .42;
        material.envMapIntensity = .35;
      }
    }
  });
  // Instance repeated scenery in local chunks to keep distant neighborhoods culled.
  root.updateMatrixWorld(true);
  const groups = new Map<string, THREE.Mesh[]>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh || protectedNodes.has(node) || node.morphTargetInfluences) return;
    for(let parent:THREE.Object3D|null=node;parent;parent=parent.parent)if(!parent.visible)return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some(material => material.transparent) || node.matrixWorld.determinant() < 0) return;
    const at = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const key = [node.geometry.uuid, ...materials.map(material => material.uuid), Math.floor(at.x / 50), Math.floor(at.z / 50)].join(':');
    const group = groups.get(key) || []; group.push(node); groups.set(key, group);
  });
  for (const group of groups.values()) {
    if (group.length < 3) continue;
    const batch = new THREE.InstancedMesh(group[0].geometry, group[0].material, group.length);
    batch.name = 'Neighborhood scenery'; batch.castShadow = true; batch.receiveShadow = true;
    group.forEach((node, index) => { batch.setMatrixAt(index, node.matrixWorld); node.visible = false; });
    batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); root.add(batch);
  }
  const mixer = new THREE.AnimationMixer(root);
  decorative.forEach(clip => { if (clip.tracks.length) mixer.clipAction(clip).play(); });
  let sky: THREE.Texture | null = null;
  try {
    sky = await new THREE.TextureLoader().loadAsync('/models/track/coastal-sky.png');
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  } catch { /* The matching coastal-blue horizon remains available. */ }
  return { root, mixer, sky };
}

export function disposeCourseScene(scene:CourseScene) {
 scene.mixer.stopAllAction();scene.mixer.uncacheRoot(scene.root);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 scene.root.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
 for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
 geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());scene.sky?.dispose();
 scene.root.removeFromParent();
}
