import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BAY_CIRCUIT_COURSE } from './course';

const BUILDING_IDS = ['sf_painted_lady', 'sf_soma_office', 'sf_skyline_cluster'] as const;
type BuildingId = typeof BUILDING_IDS[number];
type Prototype = { geometry: THREE.BufferGeometry; bounds: THREE.Box3 };
type Placement = { matrix: THREE.Matrix4; center: THREE.Vector3 };
const WALL_COLORS = [0xef785c, 0xe6b84d, 0x78b9c4, 0x91b598];
const WATERLINE = -4.25;

/** Reuse the authored architecture, including windows, cornices and bay fronts.
 * Baking its opaque palette gives each neighborhood one draw per building style.
 * Geometry is owned by this backdrop, so disposing either preview is independent.
 */
function bakePrototype(source: THREE.Object3D, wallColor?: number): Prototype {
  const inverse = source.matrixWorld.clone().invert();
  const parts: THREE.BufferGeometry[] = [];
  source.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = (Array.isArray(node.material) ? node.material[0] : node.material) as THREE.MeshStandardMaterial;
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld));
    const color = wallColor !== undefined && /painted coral/i.test(material.name)
      ? new THREE.Color(wallColor) : material.color.clone();
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const original = geometry.getAttribute('color');
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colors[i * 3] = color.r * (original?.getX(i) ?? 1);
      colors[i * 3 + 1] = color.g * (original?.getY(i) ?? 1);
      colors[i * 3 + 2] = color.b * (original?.getZ(i) ?? 1);
    }
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.clearGroups();
    parts.push(geometry);
  });
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!.clone();
  // Anchor every variant at the center of its actual footprint and at ground level.
  const center = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -bounds.min.y, -center.z);
  geometry.computeBoundingBox();
  return { geometry, bounds: geometry.boundingBox!.clone() };
}

/** A city around the course, with terraced residential blocks in the empty
 * interior and a deeper skyline behind the hill. All placement checks use the
 * complete circuit, so buildings never cut into its return road or jump spans.
 */
export function createCityBackdrop(authored: THREE.Group): THREE.Group {
  const root = new THREE.Group();
  root.name = 'San Francisco · hillside neighborhoods and downtown';
  authored.updateMatrixWorld(true);
  const sources = new Map<BuildingId, THREE.Object3D>();
  const occupied: THREE.Box3[] = [];
  const waterways: THREE.Box3[] = [];
  authored.traverse(node => {
    const id = node.userData.asset_id;
    if (BUILDING_IDS.includes(id) && !sources.has(id)) sources.set(id, node);
    if (/^sf_(painted_lady|mission_storefront|soma_office|skyline_cluster|coit_tower|pyramid_tower|chinatown_gate)$/.test(id ?? '')) {
      occupied.push(new THREE.Box3().setFromObject(node).expandByScalar(1.3));
    }
    if (id === 'golden_gate_portal') waterways.push(new THREE.Box3().setFromObject(node).expandByScalar(7));
  });
  if (BUILDING_IDS.some(id => !sources.has(id))) return root;

  const prototypes = new Map<string, Prototype>();
  WALL_COLORS.forEach((color, i) => prototypes.set(`house-${i}`, bakePrototype(sources.get('sf_painted_lady')!, color)));
  prototypes.set('office', bakePrototype(sources.get('sf_soma_office')!));
  prototypes.set('skyline', bakePrototype(sources.get('sf_skyline_cluster')!));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: .03 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xad9f84, roughness: 1 });
  const sidewalk = new THREE.MeshStandardMaterial({ color: 0xc4c8b3, roughness: 1 });
  const street = new THREE.MeshStandardMaterial({ color: 0x65757b, roughness: 1 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const batches = new Map<string, { prototype: string; placements: Placement[] }>();
  const foundations: Placement[] = [], sidewalks: Placement[] = [], streets: Placement[] = [];
  const samples = BAY_CIRCUIT_COURSE.paths[0].samples;
  const rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);

  const roadClear = (x: number, z: number, radius: number) => {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const dx = b.position[0] - a.position[0], dz = b.position[2] - a.position[2];
      const t = THREE.MathUtils.clamp(((x - a.position[0]) * dx + (z - a.position[2]) * dz) / (dx * dx + dz * dz), 0, 1);
      if (Math.hypot(x - a.position[0] - dx * t, z - a.position[2] - dz * t) < Math.max(a.width, b.width) / 2 + radius + 3) return false;
    }
    return true;
  };
  const slab = (list: Placement[], x: number, y: number, z: number, width: number, height: number, depth: number) => {
    const center = new THREE.Vector3(x, y, z);
    list.push({ center, matrix: new THREE.Matrix4().compose(center, new THREE.Quaternion(), new THREE.Vector3(width, height, depth)) });
  };
  const place = (style: string, x: number, y: number, z: number, yaw: number, widthScale = 1, heightScale = 1, padWidth = 9, padDepth = 12) => {
    const prototype = prototypes.get(style)!;
    const size = prototype.bounds.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.z) * widthScale / 2;
    if (!roadClear(x, z, Math.max(radius, Math.hypot(padWidth, padDepth) / 2))) return;
    if (waterways.some(box => x - padWidth / 2 < box.max.x && x + padWidth / 2 > box.min.x && z - padDepth / 2 < box.max.z && z + padDepth / 2 > box.min.z)) return;
    const center = new THREE.Vector3(x, y, z);
    matrix.compose(center, rotation.setFromAxisAngle(up, yaw), new THREE.Vector3(widthScale, heightScale, widthScale));
    const bounds = prototype.bounds.clone().applyMatrix4(matrix);
    if (occupied.some(box => bounds.min.x < box.max.x && bounds.max.x > box.min.x && bounds.min.z < box.max.z && bounds.max.z > box.min.z)) return;
    occupied.push(bounds.clone().expandByScalar(.45));
    const key = `${style}:${Math.floor(x / 60)}:${Math.floor(z / 60)}`;
    const batch = batches.get(key) ?? { prototype: style, placements: [] };
    batch.placements.push({ matrix: matrix.clone(), center }); batches.set(key, batch);
    // Each block reaches the bay floor. Joined plinths make a solid stepped
    // hillside; broad paved tops and inset sidewalks leave visible side streets.
    const height = y - WATERLINE;
    slab(foundations, x, WATERLINE + height / 2 - .12, z, padWidth, height, padDepth);
    slab(streets, x, y - .12, z, padWidth, .14, padDepth);
    slab(sidewalks, x, y - .035, z, padWidth - 1.25, .16, padDepth - 2.2);
  };

  // Inner Richmond / Sunset-style blocks fill the large void inside the loop.
  for (let row = 0; row < 13; row++) for (let column = 0; column < 6; column++) {
    const x = -101 + column * 9, z = -76 + row * 12;
    const y = 23 - row * 1.3 + column * .5;
    const office = row > 6 && (column + row) % 4 === 0;
    place(office ? 'office' : `house-${(column + row * 3) % 4}`, x, y, z,
      column % 2 ? Math.PI / 2 : -Math.PI / 2, office ? .87 : .98,
      office ? .85 + (row % 3) * .12 : .85 + ((column * 3 + row) % 5) * .08);
  }
  // Three dense rows climb behind the starting hill, in front of downtown.
  for (let row = 0; row < 3; row++) for (let column = 0; column < 19; column++) {
    const x = -145 + column * 11, z = -140 - row * 13;
    const y = 28 + row * 2.1 - Math.max(0, column - 9) * .55;
    const office = row === 2 && column % 3 === 0;
    place(office ? 'office' : `house-${(column + row) % 4}`, x, y, z, 0,
      office ? 1.04 : 1.15, .9 + ((column + row * 2) % 5) * .12, 11, 13);
  }
  // The long return climb gets an inhabited outer hillside too.
  for (let row = 0; row < 12; row++) for (let column = 0; column < 2; column++) {
    place(`house-${(row + column * 2) % 4}`, -153 - column * 12, 28 - row * 1.6 + column * 1.7,
      -78 + row * 13, Math.PI / 2, 1.07, .92 + (row % 4) * .09, 12, 13);
  }
  // Each authored skyline cluster contains several different tower silhouettes.
  for (let i = 0; i < 7; i++) {
    place('skyline', -148 + i * 34, 27 - Math.max(0, i - 3) * 1.5, -194,
      i % 2 ? Math.PI : 0, .91, .8 + (i % 3) * .22, 34, 29);
  }
  for (let i = 0; i < 4; i++) {
    place('skyline', -195, 22 - i * 3.6, -74 + i * 39,
      Math.PI / 2, .91, .72 + (i % 3) * .14, 29, 39);
  }

  const addBatch = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material, placements: Placement[]) => {
    const mesh = new THREE.InstancedMesh(geometry, mat, placements.length);
    mesh.name = name; mesh.receiveShadow = true;
    placements.forEach((placement, i) => mesh.setMatrixAt(i, placement.matrix));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    root.add(mesh);
  };
  for (const [key, batch] of batches) addBatch(`City architecture · ${key}`, prototypes.get(batch.prototype)!.geometry, material, batch.placements);
  // Chunk the ground too, so off-camera neighborhoods are cheap during a race.
  for (const [name, mat, placements] of [['City hillside', stone, foundations], ['City side streets', street, streets], ['City sidewalks', sidewalk, sidewalks]] as const) {
    const chunks = new Map<string, Placement[]>();
    for (const placement of placements) {
      const key = `${Math.floor(placement.center.x / 60)}:${Math.floor(placement.center.z / 60)}`;
      const chunk = chunks.get(key) ?? []; chunk.push(placement); chunks.set(key, chunk);
    }
    for (const [key, chunk] of chunks) addBatch(`${name} · ${key}`, cube, mat, chunk);
  }
  root.userData.buildingCount = [...batches.values()].reduce((sum, batch) => sum + batch.placements.length * (batch.prototype === 'skyline' ? 5 : 1), 0);
  root.userData.cityBlockCount = foundations.length;
  return root;
}
