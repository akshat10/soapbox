import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CHUNK_WIDTH = 24;
const CHUNK_LENGTH = 32;
type StaticMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
type Candidate = { mesh: StaticMesh; transform: THREE.Matrix4 };

function hasDynamicAncestor(object: THREE.Object3D, root: THREE.Object3D): boolean {
 for (let current: THREE.Object3D | null = object; current; current = current.parent) {
  if (!current.visible || current.animations.length || Object.entries(current.userData).some(([key, value]) => /animated|dynamic|moving/i.test(key) && Boolean(value))) return true;
  if (current === root) break;
 }
 return false;
}

/**
 * Batch only opaque, static scenery. Small spatial chunks keep frustum culling useful;
 * materials and textures retain their original identity, and cars never enter this path.
 */
export function batchStaticTrack(root: THREE.Group): THREE.Group {
 root.updateWorldMatrix(true, true);
 const rootInverse = root.matrixWorld.clone().invert();
 const groups = new Map<string, Candidate[]>();
 let beforeMeshes = 0;
 root.traverse(node => {
  if (!(node instanceof THREE.Mesh)) return;
  beforeMeshes++;
  if (node instanceof THREE.SkinnedMesh || node instanceof THREE.InstancedMesh || Array.isArray(node.material)) return;
  if (node.children.length || hasDynamicAncestor(node, root) || node.userData.disposeTexture || node.customDepthMaterial || node.customDistanceMaterial) return;
  if (node.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || node.onAfterRender !== THREE.Object3D.prototype.onAfterRender) return;
  const geometry: THREE.BufferGeometry = node.geometry;
  if (!geometry.attributes.position || Object.keys(geometry.morphAttributes).length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return;
  // Transparent objects require independent depth sorting; mirrored transforms need
  // a winding flip, so both retain their existing renderer behavior unchanged.
  if (node.material.transparent || node.material.opacity < 1 || !node.frustumCulled) return;
  const transform = new THREE.Matrix4().multiplyMatrices(rootInverse, node.matrixWorld);
  if (transform.determinant() <= 0) return;
  const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b));
  if (attributes.some(([, attribute]) => attribute instanceof THREE.InterleavedBufferAttribute || attribute instanceof THREE.InstancedBufferAttribute)) return;
  const layout = attributes.map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`).join(',');
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(transform);
  const key = [
   node.material.uuid, layout, Boolean(geometry.index), node.castShadow, node.receiveShadow,
   node.layers.mask, node.renderOrder, Math.floor(center.x / CHUNK_WIDTH), Math.floor(center.z / CHUNK_LENGTH),
  ].join('|');
  const bucket = groups.get(key) ?? [];
  bucket.push({ mesh: node as StaticMesh, transform });
  groups.set(key, bucket);
 });

 const removedGeometry = new Set<THREE.BufferGeometry>();
 let mergedSources = 0, batches = 0;
 for (const candidates of groups.values()) {
  if (candidates.length < 2) continue;
  const geometry = candidates.map(({ mesh, transform }) => mesh.geometry.clone().applyMatrix4(transform));
  const merged = mergeGeometries(geometry, false);
  geometry.forEach(part => part.dispose());
  if (!merged) continue;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const original = candidates[0].mesh;
  const batch = new THREE.Mesh(merged, original.material);
  batch.name = `static-track-batch-${batches++}`;
  batch.castShadow = original.castShadow;
  batch.receiveShadow = original.receiveShadow;
  batch.layers.mask = original.layers.mask;
  batch.renderOrder = original.renderOrder;
  batch.userData.staticBatchSize = candidates.length;
  root.add(batch);
  for (const { mesh } of candidates) {
   removedGeometry.add(mesh.geometry);
   mesh.removeFromParent();
   mergedSources++;
  }
 }
 // An imported geometry can be shared by an excluded mesh; never dispose it while
 // that retained instance still owns it. Materials remain attached to the batches.
 root.traverse(node => { if (node instanceof THREE.Mesh) removedGeometry.delete(node.geometry); });
 removedGeometry.forEach(geometry => geometry.dispose());
 root.userData.staticBatching = { beforeMeshes, afterMeshes: beforeMeshes - mergedSources + batches, batches, mergedSources };
 root.updateWorldMatrix(true, true);
 return root;
}
