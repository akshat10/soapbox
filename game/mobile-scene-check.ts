import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { preloadModels } from './assets';
import { batchStaticTrack } from './scene-batch';
import { groundHeight, TRACK_PIECES } from './track';
import { createTrackScene } from './visuals';

// Only houses are used by this scenery fixture. Isolate car assets so a later
// textured car release cannot make this geometry check require a browser decoder.
const houseBytes = await readFile(new URL('../public/models/painted-lady.glb', import.meta.url));
const originalFetch = globalThis.fetch, originalWarn = console.warn;
globalThis.fetch = async input => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  return url === '/models/painted-lady.glb'
    ? new Response(new Uint8Array(houseBytes)) : new Response(null, { status: 404 });
};
console.warn = () => {};
try { await preloadModels(); }
finally { globalThis.fetch = originalFetch; console.warn = originalWarn; }

// Record the real label text while allowing CanvasTexture construction in Node.
const originalDocument = globalThis.document;
const labels: string[] = [];
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, strokeRect() {}, fillText(text: string) { labels.push(text); } }),
  }),
} as unknown as Document;
let desktop: THREE.Group, phone: THREE.Group;
let desktopLabels: string[];
try {
  desktop = createTrackScene();
  desktopLabels = labels.splice(0);
  phone = createTrackScene({ lowDetail: true });
} finally {
  if (originalDocument) globalThis.document = originalDocument;
  else Reflect.deleteProperty(globalThis, 'document');
}
assert.deepEqual(labels, desktopLabels, 'Phone scenery must retain every course, input, start, and finish label.');
desktop.updateMatrixWorld(true);
phone.updateMatrixWorld(true);

const desktopHouses = desktop.children.filter(node => node.userData.assetSource === '/models/painted-lady.glb');
assert.equal(desktopHouses.length, 7, 'Default scenery must retain all seven authored houses.');
const phoneHouses = desktopHouses.map(house => phone.children.find(node => node instanceof THREE.Group && node.position.equals(house.position)));
assert(phoneHouses.every(Boolean), 'Low-detail scenery must retain a house at every original location.');
assert(phoneHouses.every(house => !house!.userData.assetSource), 'Phones must use the procedural houses, not clone detailed geometry.');

function meshFingerprints(root: THREE.Group, excluded: Set<THREE.Object3D>) {
  const results: string[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (let ancestor: THREE.Object3D | null = node; ancestor; ancestor = ancestor.parent) if (excluded.has(ancestor)) return;
    const hash = createHash('sha256');
    hash.update(JSON.stringify([node.name, node.matrixWorld.elements, node.castShadow, node.receiveShadow]));
    const geometry: THREE.BufferGeometry = node.geometry;
    const attributes: Record<string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute | null> = { ...geometry.attributes, index: geometry.index };
    for (const [name, attribute] of Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b))) {
      if (!attribute) continue;
      hash.update(`${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`);
      hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    hash.update(JSON.stringify(materials.map(material => ({
      type: material.type, color: (material as THREE.MeshStandardMaterial).color?.getHex(),
      side: material.side, transparent: material.transparent, opacity: material.opacity,
    }))));
    results.push(hash.digest('hex'));
  });
  return results.sort();
}
assert.deepEqual(
  meshFingerprints(phone, new Set(phoneHouses as THREE.Object3D[])),
  meshFingerprints(desktop, new Set(desktopHouses)),
  'Every non-house mesh must retain its geometry, world transform, color, and shadow settings.',
);
for (const piece of TRACK_PIECES) {
  assert(phone.getObjectByName(`track-${piece.id}`), `Phone scenery must retain drivable track piece ${piece.id}.`);
}

function openingView(root: THREE.Group, far: number) {
  const road = (z: number) => Math.max(groundHeight(z), groundHeight(z - 4.5), groundHeight(z + 4.5));
  const camera = new THREE.PerspectiveCamera(58, 390 / 844, 0.1, far);
  camera.position.set(-4.95, road(0) + 6.25, -12.5);
  camera.lookAt(-4.5, road(12.8) - 0.5, 12.8);
  camera.updateMatrixWorld(true);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let meshes = 0, triangles = 0;
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !frustum.intersectsObject(node)) return;
    meshes++;
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });
  return { meshes, triangles };
}
batchStaticTrack(desktop);
batchStaticTrack(phone);
const detailed = openingView(desktop, 215);
const lowDetail = openingView(phone, 215);
const phoneView = openingView(phone, 110);
assert(lowDetail.triangles < detailed.triangles * 0.2, 'House LOD alone must remove at least 80% of opening-view triangles.');
assert(phoneView.meshes < detailed.meshes * 0.6, 'The shorter phone view must substantially reduce submitted scenery meshes.');
console.table({ detailed, lowDetail, phoneView });
console.log('Mobile scenery checks passed: authored desktop houses, all house locations, identical non-house geometry/materials/transforms, every track piece and label, and reduced opening-view geometry. Counts exclude vehicles and GPU timing.');
