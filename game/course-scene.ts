import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { conformCourseBridges } from './course-bridge';
import { CourseFeatureVisuals } from './course-feature-visuals';
import { createCircuitScene } from './circuit-scene';
import { createCityBackdrop } from './city-backdrop';
import { repairCourseTerrain } from './course-terrain';
import { BAY_CIRCUIT_COURSE as course } from './course';

/** Reuse the authored arch and paint at the joined start/finish. Their road
 * frame transform preserves the native artwork's orientation and scale. */
export function placeCircuitFinish(root: THREE.Group): void {
  const roadMatrix = (distance: number) => {
    const frame=course.frame(distance),q=course.orientation(frame);
    return new THREE.Matrix4().compose(new THREE.Vector3(...frame.position.toArray()),new THREE.Quaternion(q.x,q.y,q.z,q.w),new THREE.Vector3(1,1,1));
  };
  const archDelta=roadMatrix(0).multiply(roadMatrix(423.53269445).invert());
  const paintDelta=roadMatrix(0).multiply(roadMatrix(3).invert());
  root.updateMatrixWorld(true);
  root.traverse(node=>{
    const tile=/^Checkered_race_line[._]?(\d*)$/.exec(node.name);
    if(tile&&Number(tile[1]||0)>=28){node.visible=false;return;}
    const delta=node.userData.asset_id==='finish_arch'?archDelta:tile?paintDelta:null;
    if(!delta)return;
    const world=node.matrixWorld.clone().premultiply(delta);
    if(node.parent)world.premultiply(node.parent.matrixWorld.clone().invert());
    world.decompose(node.position,node.quaternion,node.scale);
    node.updateMatrix();
  });
  root.updateMatrixWorld(true);
}

export interface CourseScene { root: THREE.Group; mixer: THREE.AnimationMixer; sky: THREE.Texture | null; features: CourseFeatureVisuals; setCircuit: (enabled: boolean) => void }

/** The road is used at its authored metre scale and origin, exactly as the collider. */
export async function loadCourseScene(): Promise<CourseScene> {
  const response = await fetch('/models/track/bay-or-bust-course.glb', { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('The Bay or Bust course could not load.');
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/track/');
  const root = gltf.scene;
  root.name = 'Bay or Bust · authored race course';
  conformCourseBridges(root);
  repairCourseTerrain(root);
  const conflictingScenery=/^sf_distant_sailboat[._]?006$|^sf_coastal_rocks[._]?006$/i;
  const circuitProtected=new Set<THREE.Object3D>();
  const circuitOriginals: { node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; visible: boolean }[]=[];
  root.traverse(node=>{
    if(node.userData.asset_id!=='finish_arch'&&!node.name.startsWith('Checkered_race_line')&&!conflictingScenery.test(node.name))return;
    circuitOriginals.push({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone(),visible:node.visible});
    node.traverse(child=>circuitProtected.add(child));
  });
  placeCircuitFinish(root);
  root.traverse(node => {
    const assetId = node.userData.asset_id;
    if (assetId === 'track_aerial_ring') node.visible = false;
    if (assetId === 'track_boost_pad' || /sf_cloud_cluster|^sf_distant_sailboat[._]?006$|^sf_coastal_rocks[._]?006$/i.test(node.name)) node.visible = false;
  });
  const cityBackdrop = createCityBackdrop(root);
  root.updateMatrixWorld(true);
  const protectedNodes = new Set<THREE.Object3D>(circuitProtected);
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
  const features = new CourseFeatureVisuals(root);
  root.add(cityBackdrop);
  features.setCircuit(true);
  const returnRoad=createCircuitScene();root.add(returnRoad);
  let circuitActive=true;
  const setCircuit=(enabled:boolean)=>{
    if(enabled===circuitActive)return;
    circuitActive=enabled;
    features.setCircuit(enabled);
    for(const original of circuitOriginals){const {node}=original;node.position.copy(original.position);node.quaternion.copy(original.quaternion);node.scale.copy(original.scale);node.visible=original.visible;node.updateMatrix();}
    root.updateMatrixWorld(true);
    if(enabled){placeCircuitFinish(root);for(const {node} of circuitOriginals)if(conflictingScenery.test(node.name))node.visible=false;}
    returnRoad.visible=enabled;
  };
  const mixer = new THREE.AnimationMixer(root);
  decorative.forEach(clip => { if (clip.tracks.length) mixer.clipAction(clip).play(); });
  let sky: THREE.Texture | null = null;
  try {
    sky = await new THREE.TextureLoader().loadAsync('/models/track/coastal-sky.png');
    sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  } catch { /* The matching coastal-blue horizon remains available. */ }
  return { root, mixer, sky, features, setCircuit };
}

export function disposeCourseScene(scene:CourseScene) {
 scene.mixer.stopAllAction();scene.mixer.uncacheRoot(scene.root);
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 scene.root.traverse(node=>{if(node instanceof THREE.InstancedMesh)node.dispose();if(node instanceof THREE.Mesh){geometries.add(node.geometry);for(const material of Array.isArray(node.material)?node.material:[node.material])materials.add(material);}});
 for(const material of materials)for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
 geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());scene.sky?.dispose();
 scene.root.removeFromParent();
}
