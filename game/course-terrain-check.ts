import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { repairCourseTerrain, createReturnRoadFoundation } from './course-terrain';
import { BAY_CIRCUIT_COURSE } from './course';
const b = fs.readFileSync(
  new URL('../public/models/track/bay-or-bust-course.glb', import.meta.url),
);
const n = b.readUInt32LE(12);
const json = JSON.parse(b.subarray(20, 20 + n).toString());
const bin = b.subarray(20 + n + 8);
delete json.images;
delete json.textures;
delete json.samplers;
json.materials = json.materials.map((m: { name: string }) => ({
  name: m.name,
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
}));
const js = Buffer.from(JSON.stringify(json));
const padded = Buffer.alloc(Math.ceil(js.length / 4) * 4, 32);
js.copy(padded);
const out = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
out.writeUInt32LE(0x46546c67);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(out.length, 8);
out.writeUInt32LE(padded.length, 12);
out.writeUInt32LE(0x4e4f534a, 16);
padded.copy(out, 20);
const at = 20 + padded.length;
out.writeUInt32LE(bin.length, at);
out.writeUInt32LE(0x004e4942, at + 4);
bin.copy(out, at + 8);
const gltf = await new GLTFLoader().parseAsync(
  out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength),
  '',
);
const root = gltf.scene;
root.updateMatrixWorld(true);

const terrain = repairCourseTerrain(root);
const deck = createReturnRoadFoundation(); root.add(deck); root.updateMatrixWorld(true);
let solids = 0;
for (const group of [terrain, deck]) group.traverse(node => {
  if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
  if (!/Sealed coastal island|Solid viaduct band|Landmark/.test(node.name)) return;
  const geometry = node.geometry, position = geometry.getAttribute('position');
  const index = geometry.index;
  const edges = new Map<string, number>(), directions = new Map<string, number>();
  const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  const key = (p: THREE.Vector3) => p.toArray().map(value => Math.round(value * 10000)).join(',');
  let volume = 0;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const points = [vertex(i), vertex(i + 1), vertex(i + 2)];
    assert(points.every(p => p.toArray().every(Number.isFinite)), `${node.name} has finite vertices`);
    volume += points[0].dot(points[1].clone().cross(points[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const a = key(points[j]), b = key(points[(j + 1) % 3]);
      if (a === b) continue;
      const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
      directions.set(edge, (directions.get(edge) ?? 0) + (a < b ? 1 : -1));
    }
  }
  assert([...edges.values()].every(count => count === 2), `${node.name} must be watertight`);
  assert([...directions.values()].every(count => count === 0), `${node.name} must have consistently wound faces`);
  assert(volume > 0, `${node.name} must face outward`);
  if (/Sealed coastal island|Landmark stone/.test(node.name)) {
    geometry.computeBoundingBox();
    assert(geometry.boundingBox!.min.y < -4.3, `${node.name} must extend below the bay surface`);
  }
  solids++;
});
assert.equal(solids, 24);
let boats = 0;
root.traverse(node => {
  if (/^sf_(fishing_boat|distant_sailboat)$/.test(node.userData.asset_id ?? '')) {
    assert(Math.abs(new THREE.Box3().setFromObject(node).min.y + 4.48) < .001, 'Boat hulls must meet the waterline');
    boats++;
  }
});
assert(boats >= 4);
let oldCliffs = 0;
root.traverse(node => { if (node.name.startsWith('Sculpted_waterfront_cliff')) { assert(!node.visible); oldCliffs++; } });
assert.equal(oldCliffs, 4);
assert.equal(terrain.userData.landmarkFoundations, 8);
const ray = new THREE.Raycaster(), intrusions: unknown[] = [];
const terrainMeshes: THREE.Object3D[] = [];
terrain.traverse(node => { if (node instanceof THREE.Mesh && /Sealed coastal island|Landmark/.test(node.name)) terrainMeshes.push(node); });
for (const sample of BAY_CIRCUIT_COURSE.paths[0].samples) for (const side of [-6.8, 0, 6.8]) {
  const p = new THREE.Vector3(...sample.position as [number, number, number]).addScaledVector(new THREE.Vector3(...sample.right as [number, number, number]), side);
  ray.set(p.clone().add(new THREE.Vector3(0, 100, 0)), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(terrainMeshes, false).find(hit => hit.point.y > p.y + .03);
  if (hit) intrusions.push({ s: sample.s, side, height: hit.point.y - p.y, object: hit.object.name, instance: hit.instanceId });
}
console.log(JSON.stringify({ solids, oldCliffs, boats, landmarks: terrain.userData.landmarkFoundations, props: terrain.userData.shorelineProps, intrusions: intrusions.slice(0,30), intrusionCount: intrusions.length }, null, 2));
assert.equal(intrusions.length, 0, 'New terrain must leave the entire driving ribbon clear');
