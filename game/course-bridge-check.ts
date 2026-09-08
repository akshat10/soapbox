// Check the actual asset through GLTFLoader, including its runtime node names.
// Textures are omitted only from this headless geometry fixture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { conformCourseBridges, bridgeRoadPoint } from './course-bridge';
import { BAY_OR_BUST_COURSE as course } from './course';
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
const oldGeometries = new Map<string, THREE.BufferGeometry>();
let originalTriangles = 0;
root.traverse((node) => {
  if (node instanceof THREE.Mesh && /golden_gate/.test(node.name)) {
    oldGeometries.set(node.name, node.geometry);
    originalTriangles +=
      (node.geometry.index?.count ?? node.geometry.attributes.position.count) /
      3;
  }
});
let beforeIntrusions = 0,
  beforeLow = 0,
  beforeNearest = Infinity;
root.traverse((node) => {
  if (!(node instanceof THREE.Mesh) || !oldGeometries.has(node.name)) return;
  const a = node.geometry.attributes.position,
    idx = node.geometry.index,
    anchor = node.parent!.name.endsWith('001') ? 167.35653 : 196.189;
  for (let i = 0; i < (idx?.count ?? a.count); i += 3) {
    const vs = [0, 1, 2].map((j) =>
      new THREE.Vector3()
        .fromBufferAttribute(a, idx ? idx.getX(i + j) : i + j)
        .applyMatrix4(node.matrixWorld),
    );
    vs.push(
      vs[0]
        .clone()
        .add(vs[1])
        .add(vs[2])
        .multiplyScalar(1 / 3),
    );
    for (const v of vs) {
      const pr = course.project(v, { pathId: 'main', distance: anchor }, 60);
      if (pr.height < 3 && pr.height > -0.8) {
        beforeLow++;
        beforeNearest = Math.min(beforeNearest, Math.abs(pr.lateral));
        if (Math.abs(pr.lateral) < 7) beforeIntrusions++;
      }
    }
  }
});
console.log({ beforeIntrusions, beforeLow, beforeNearest });
console.time('conformation');
const changed = conformCourseBridges(root);
console.timeEnd('conformation');
assert.equal(changed, 8);
root.updateMatrixWorld(true);
let triangles = 0,
  points = 0,
  lowSamples = 0,
  roadIntersections = 0;
let minLowLateral = Infinity;
const rows = [];
const bad = [];
root.traverse((node) => {
  if (!(node instanceof THREE.Mesh) || !oldGeometries.has(node.name)) return;
  const a = node.geometry.getAttribute('position');
  assert(a && a.count % 3 === 0);
  assert.notEqual(node.geometry, oldGeometries.get(node.name));
  triangles += a.count / 3;
  for (const [name, attr] of Object.entries(
    (node.geometry as THREE.BufferGeometry).attributes,
  )) {
    assert.equal(attr.count, a.count, name + ' count');
    for (const v of attr.array) assert(Number.isFinite(v), name + ' finite');
  }
  let minS = Infinity,
    maxS = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const portal = node.parent!;
  const anchor = portal.name.endsWith('001') ? 167.35653 : 196.189;
  for (let i = 0; i < a.count; i += 3) {
    const av = new THREE.Vector3()
      .fromBufferAttribute(a, i)
      .applyMatrix4(node.matrixWorld);
    const bv = new THREE.Vector3()
      .fromBufferAttribute(a, i + 1)
      .applyMatrix4(node.matrixWorld);
    const cv = new THREE.Vector3()
      .fromBufferAttribute(a, i + 2)
      .applyMatrix4(node.matrixWorld);
    assert(
      bv.clone().sub(av).cross(cv.clone().sub(av)).lengthSq() > 1e-22,
      'nondegenerate',
    );
    for (const v of [
      av,
      bv,
      cv,
      av
        .clone()
        .add(bv)
        .add(cv)
        .multiplyScalar(1 / 3),
    ]) {
      points++;
      const pr = course.project(v, { pathId: 'main', distance: anchor }, 60);
      minS = Math.min(minS, pr.distance);
      maxS = Math.max(maxS, pr.distance);
      minY = Math.min(minY, pr.height);
      maxY = Math.max(maxY, pr.height);
      if (pr.height < 3 && pr.height > -0.8) {
        lowSamples++;
        minLowLateral = Math.min(minLowLateral, Math.abs(pr.lateral));
        if (Math.abs(pr.lateral) < 7) {
          roadIntersections++;
          if (bad.length < 5)
            bad.push({
              name: node.name,
              lat: pr.lateral,
              s: pr.distance,
              height: pr.height,
            });
        }
      }
    }
  }
  rows.push({
    name: node.name,
    triangles: a.count / 3,
    minS,
    maxS,
    minY,
    maxY,
  });
});
console.log({
  changed,
  originalTriangles,
  triangles,
  points,
  lowSamples,
  minLowLateral,
  roadIntersections,
});
assert.equal(
  roadIntersections,
  0,
  'bridge low geometry must stay outside drivable ribbon',
);
const p1 = bridgeRoadPoint(
  new THREE.Vector3(8.45, 0.11, 21),
  167.35653,
  1,
  181.772765,
  -0.25,
);
const p2 = bridgeRoadPoint(
  new THREE.Vector3(8.45, 0.11, -21),
  196.189,
  -1,
  181.772765,
  -0.25,
);
assert(p1.distanceTo(p2) < 1e-5, 'Inward sidewalk ends meet');
console.log(
  'PASS: actual GLB parses; all 8 bridge meshes warped; finite attributed triangle geometry; no low vertices/centroids intrude driving ribbon; nominal inward ends meet.',
);
