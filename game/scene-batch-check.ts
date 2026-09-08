import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticTrack } from './scene-batch';

function preciseStaticBounds(group: THREE.Group) {
 const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
 group.traverse(node => {
  if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh || node instanceof THREE.SkinnedMesh) return;
  const position = node.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) bounds.expandByPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld));
 });
 return bounds;
}

const root = new THREE.Group();
root.position.set(3, 4, 5);
root.rotation.y = .3;
const texture = new THREE.Texture();
const material = new THREE.MeshStandardMaterial({ map: texture });
const nested = new THREE.Group();
nested.position.set(2, 1, 2);
nested.rotation.z = .2;
root.add(nested);
const sources: THREE.Mesh[] = [];
const disposed = new Set<THREE.BufferGeometry>();
for (let i = 0; i < 3; i++) {
 const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), material);
 mesh.position.set(i * 2, 1, 2);
 mesh.rotation.x = i * .15;
 mesh.scale.set(1, 1 + i * .1, 1);
 mesh.castShadow = true;
 mesh.receiveShadow = true;
 mesh.geometry.addEventListener('dispose', () => { disposed.add(mesh.geometry); });
 nested.add(mesh);
 sources.push(mesh);
}
const sharedGeometry = sources[0].geometry;
const retained = new THREE.Mesh(sharedGeometry, material);
retained.userData.animated = true;
root.add(retained);
const skinned = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
skinned.geometry.computeBoundingBox();
skinned.boundingBox = skinned.geometry.boundingBox!.clone();
const special: THREE.Object3D[] = [
 new THREE.Mesh(new THREE.BoxGeometry(), [material, material]),
 new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2),
 skinned,
 new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: .5 })),
];
const ownedLabel = new THREE.Mesh(new THREE.PlaneGeometry(), material);
ownedLabel.userData.disposeTexture = texture;
special.push(ownedLabel);
const mirrored = new THREE.Mesh(new THREE.BoxGeometry(), material);
mirrored.scale.x = -1;
special.push(mirrored);
special.forEach(mesh => { root.add(mesh); });
root.updateWorldMatrix(true, true);
const originalBounds = preciseStaticBounds(root);
const originalNormals = sources.map(mesh => {
 const matrix = new THREE.Matrix4().multiplyMatrices(root.matrixWorld.clone().invert(), mesh.matrixWorld);
 return new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
});
const originalUVs = sources.map(mesh => Array.from(mesh.geometry.attributes.uv.array));
const originalVertexCounts = sources.map(mesh => mesh.geometry.attributes.position.count);
const originalTriangles = sources.reduce((sum, mesh) => sum + mesh.geometry.index!.count / 3, 0);
batchStaticTrack(root);
const batches: THREE.Mesh[] = [];
root.traverse(node => { if (node instanceof THREE.Mesh && node.userData.staticBatchSize) batches.push(node); });
assert.equal(batches.length, 1, 'Compatible nearby meshes should share one draw call.');
const batch = batches[0];
assert.equal(batch.material, material, 'Batching must preserve the original material and its texture identity.');
assert.equal((batch.material as THREE.MeshStandardMaterial).map, texture);
assert.equal(batch.castShadow, true);
assert.equal(batch.receiveShadow, true);
assert.equal(batch.geometry.index!.count / 3, originalTriangles, 'Merging must preserve every triangle.');
let offset = 0;
for (let i = 0; i < sources.length; i++) {
 const normal = new THREE.Vector3().fromBufferAttribute(batch.geometry.attributes.normal, offset);
 assert(normal.distanceTo(originalNormals[i]) < 0.00001, 'Normals must preserve rotation and nonuniform scale.');
 const uv = Array.from(batch.geometry.attributes.uv.array).slice(offset * 2, (offset + originalVertexCounts[i]) * 2);
 assert.deepEqual(uv, originalUVs[i], 'Texture coordinates must remain unchanged.');
 offset += originalVertexCounts[i];
}
assert.equal(disposed.has(sharedGeometry), false, 'A retained special mesh must keep its shared source geometry alive.');
assert(disposed.has(sources[1].geometry) && disposed.has(sources[2].geometry), 'Removed, unshared source geometries must be disposed.');
for (const mesh of [...special, retained]) assert(mesh.parent, 'Special or animated meshes must stay in the source scene.');
const mergedBounds = preciseStaticBounds(root);
assert(mergedBounds.min.distanceTo(originalBounds.min) < .00001 && mergedBounds.max.distanceTo(originalBounds.max) < .00001, 'Root and nested transforms must retain world-space bounds.');
let mergedDisposed = false;
batch.geometry.addEventListener('dispose', () => { mergedDisposed = true; });
batch.geometry.dispose();
assert(mergedDisposed, 'The resulting batch must retain normal geometry disposal behavior.');
console.log('Scene batching checks passed: shared material/texture identity, nested transforms, bounds, triangle count, normals, UVs, shadow settings, special-mesh exclusions, and geometry lifetime.');
