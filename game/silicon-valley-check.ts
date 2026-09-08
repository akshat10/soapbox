import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSiliconValleyScene, valleyJokeIndex, VALLEY_COPY } from './silicon-valley-scene';
import { repairCourseTerrain } from './course-terrain';
import { BAY_CIRCUIT_COURSE as course } from './course';
import { CourseFeatureVisuals } from './course-feature-visuals';
import { AERIAL_RINGS } from './course-features';

const bytes = fs.readFileSync(new URL('../public/models/track/bay-or-bust-course.glb', import.meta.url));
const loader = new GLTFLoader();
loader.register(() => ({ name: 'geometry-check-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
repairCourseTerrain(scene);
const valley = createSiliconValleyScene(scene);
valley.root.updateMatrixWorld(true);
const placements = valley.root.userData.signPlacements as { distance: number; x: number; z: number; radius: number }[];
assert(placements.length >= 8, 'At least eight jokes must be placed around the complete circuit.');
assert.equal(valley.root.userData.campusSignCount, 4);
for (const sign of placements) for (const sample of course.paths[0].samples) {
  assert(Math.hypot(sign.x - sample.position[0], sign.z - sample.position[2]) > sample.width / 2 + sign.radius + 1,
    'Sign silhouettes and supports must stay outside the complete road, including the return.');
}
for (let pair = 0; pair < 8; pair++) {
  assert.notEqual(valleyJokeIndex(pair, 1), valleyJokeIndex(pair, 2), 'Jokes change next lap.');
  assert.equal(valleyJokeIndex(pair, 1), valleyJokeIndex(pair, 3));
  assert(VALLEY_COPY[valleyJokeIndex(pair, 1)]);
}
const faces = valley.root.getObjectByName('Readable roadside jokes and campus wordmarks') as THREE.Mesh;
const firstUV = Array.from(faces.geometry.getAttribute('uv').array);
valley.update(2); assert.notDeepEqual(Array.from(faces.geometry.getAttribute('uv').array), firstUV);
valley.update(1); assert.deepEqual(Array.from(faces.geometry.getAttribute('uv').array), firstUV, 'Reconnect/heat reset reconstructs the same signs.');
let meshes = 0, triangles = 0;
valley.root.traverse(node => {
  if (!(node instanceof THREE.Mesh)) return; meshes++;
  const p = node.geometry.getAttribute('position');
  assert(Array.from(p.array).every(Number.isFinite));
  triangles += (node.geometry.index?.count ?? p.count) / 3;
});
assert(meshes <= 12, 'The campus extension must remain cheap for phone renderers.');
const featureRoot = new THREE.Group();
const features = new CourseFeatureVisuals(featureRoot);
const pickups: THREE.Object3D[] = [];
featureRoot.traverse(node => { if (node.userData.resetPickup) pickups.push(node); });
assert.equal(pickups.length, AERIAL_RINGS.length);
features.setCircuit(true);
for (const pickup of pickups) assert.equal(pickup.name, 'ChatGPT reset · 3 second speed boost');
console.log({ signs: placements.length, campusWordmarks: 4, meshes, triangles, pickupCount: pickups.length });
console.log('Campus checks passed: clear driving corridor, deterministic lap jokes, batched geometry, and reset token replacement.');
