import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Self-contained, texture-free Silicon Valley campus props. Units are metres;
 * +Y is up, and each factory's Y=0 plane rests on its supporting roof/ground.
 *
 * Use the individual factories to position props beside authored buildings.
 * createCampusProps() provides the complete kit in an exploded arrangement.
 * `userData.localBounds` describes full geometry (including the crane boom),
 * while `supportBounds` describes the area that must have a support surface.
 * Materials and primitive templates are module-shared: dispose only geometries
 * tagged `campusOwnedGeometry`, or call disposeCampusProps() on a removed kit.
 */

type Point = [number, number, number];
type Bounds = { min: Point; max: Point };
type Finish = 'matte' | 'solar';
type Primitive = 'box' | 'sphere' | 'pebble' | 'foliage' | 'cylinder' | 'cone' | 'octahedron' | 'ring';

const COLORS = {
  cream: 0xf3ead8,
  white: 0xfffdfa,
  edge: 0xdcd1b9,
  soil: 0x786d53,
  mint: 0x9ce0bd,
  leaf: 0x63ad79,
  leafLight: 0x94c783,
  leafDark: 0x3a845f,
  trunk: 0x967b5c,
  wood: 0xcda882,
  steel: 0x445d67,
  navy: 0x284c61,
  glass: 0x87becb,
  solar: 0x406a86,
  grid: 0xa4cfdb,
  yellow: 0xf6c448,
  yellowShade: 0xd89d24,
  load: 0xdabf8d,
};

// Prototypes are immutable; only cloned geometry is transformed and disposed.
const SHAPES: Record<Primitive, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(1, 24, 16),
  pebble: new THREE.SphereGeometry(1, 12, 8),
  foliage: new THREE.IcosahedronGeometry(1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  octahedron: new THREE.OctahedronGeometry(1, 0),
  ring: new THREE.TorusGeometry(1, 0.2, 6, 16),
};

const MATERIALS: Record<Finish, THREE.MeshStandardMaterial> = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.02 }),
  solar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.26 }),
};
MATERIALS.matte.name = 'campus-shared-matte';
MATERIALS.solar.name = 'campus-shared-solar';

class PropBatch {
  private parts: Record<Finish, THREE.BufferGeometry[]> = { matte: [], solar: [] };

  add(shape: Primitive, color: number, position: Point, scale: Point, rotation: Point = [0, 0, 0], finish: Finish = 'matte'): void {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    this.transformed(shape, color, position, scale, quaternion, finish);
  }

  box(color: number, position: Point, scale: Point, rotation: Point = [0, 0, 0], finish: Finish = 'matte'): void {
    this.add('box', color, position, scale, rotation, finish);
  }

  beam(color: number, from: Point, to: Point, thickness: number, depth = thickness): void {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.0001) return;
    const center = start.add(end).multiplyScalar(0.5).toArray() as Point;
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length));
    this.transformed('box', color, center, [thickness, length, depth], rotation, 'matte');
  }

  private transformed(shape: Primitive, color: number, position: Point, scale: Point, quaternion: THREE.Quaternion, finish: Finish): void {
    const source = SHAPES[shape];
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    // The primitive family has heterogeneous UV layouts. Vertex colors are the
    // only surface data needed, so normalize attributes before merging.
    for (const key of Object.keys(geometry.attributes)) {
      if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
    }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale));
    geometry.applyMatrix4(transform);
    const rgb = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = rgb.r;
      colors[i + 1] = rgb.g;
      colors[i + 2] = rgb.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts[finish].push(geometry);
  }

  finish(name: string, supportBounds: Bounds): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const finish of ['matte', 'solar'] as const) {
      const parts = this.parts[finish];
      if (!parts.length) continue;
      const merged = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      this.parts[finish] = [];
      if (!merged) throw new Error(`Could not merge campus prop: ${name}/${finish}`);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      merged.name = `${name}-${finish}-geometry`;
      merged.userData.campusOwnedGeometry = true;
      const mesh = new THREE.Mesh(merged, MATERIALS[finish]);
      mesh.name = `${name}-${finish}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.supportBounds = supportBounds;
    return annotateBounds(group);
  }
}

function annotateBounds(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.userData.localBounds = { min: box.min.toArray(), max: box.max.toArray() };
  group.userData.campusProp = true;
  group.userData.origin = 'support-surface';
  group.userData.drawCalls = 0;
  group.traverse(object => { if (object instanceof THREE.Mesh) group.userData.drawCalls++; });
  return group;
}

function tree(batch: PropBatch, x: number, z: number, radius: number, height = 2.7): void {
  batch.box(COLORS.cream, [x, 0.3, z], [radius * 1.82, 0.5, radius * 1.82]);
  batch.box(COLORS.soil, [x, 0.56, z], [radius * 1.5, 0.04, radius * 1.5]);
  batch.add('cylinder', COLORS.trunk, [x, height * 0.43, z], [0.105, height * 0.75, 0.105]);
  batch.add('foliage', COLORS.leaf, [x, height * 0.82, z], [radius, radius * 1.22, radius], [0, 0.42, 0]);
  batch.add('foliage', COLORS.leafLight, [x - radius * 0.24, height * 1.01, z + radius * 0.1], [radius * 0.72, radius * 0.78, radius * 0.7]);
}

function sculpture(batch: PropBatch, x: number, y: number, z: number, size = 1): void {
  batch.box(COLORS.cream, [x, y + 0.14 * size, z], [1.12 * size, 0.28 * size, 1.12 * size]);
  batch.box(COLORS.edge, [x, y + 0.32 * size, z], [0.76 * size, 0.08 * size, 0.76 * size]);
  // A tilted mint loop and suspended gold polyhedron read as small public art.
  batch.add('ring', COLORS.mint, [x, y + 1.2 * size, z], [0.72 * size, 0.72 * size, 0.72 * size], [0.16, 0.38, -0.4]);
  batch.add('octahedron', COLORS.yellow, [x, y + 1.23 * size, z], [0.35 * size, 0.47 * size, 0.35 * size], [0.2, 0.4, 0.32]);
}

/** A compact public-art object, approximately 2.05 m tall. */
export function createCampusSculpture(): THREE.Group {
  const batch = new PropBatch();
  sculpture(batch, 0, 0, 0);
  return batch.finish('campus-public-art', { min: [-0.56, 0, -0.56], max: [0.56, 0.28, 0.56] });
}

/** Rooftop terrace with solar canopy, raised planters, trees, benches and art. */
export function createRooftopGarden(width = 12, depth = 8): THREE.Group {
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 4 || depth < 4) {
    throw new RangeError('Campus garden width and depth must be finite and at least 4 metres.');
  }
  const batch = new PropBatch();
  const size = Math.min(1, width / 10, depth / 7);
  batch.box(COLORS.cream, [0, 0.065, 0], [width, 0.13, depth]);
  // Low planter rims frame the roof; leave the front open as an entry.
  batch.box(COLORS.edge, [0, 0.24, -depth * 0.5 + 0.12], [width, 0.34, 0.24]);
  for (const side of [-1, 1]) {
    batch.box(COLORS.edge, [side * (width * 0.5 - 0.12), 0.24, 0], [0.24, 0.34, depth]);
  }
  const crown = 0.77 * size;
  tree(batch, -width * 0.35, -depth * 0.28, crown, 2.8 * size);
  tree(batch, -width * 0.35, depth * 0.27, crown * 0.91, 2.55 * size);
  tree(batch, width * 0.35, depth * 0.28, crown * 0.78, 2.5 * size);
  // Two narrow meadow beds behind the canopy.
  for (const side of [-1, 1]) {
    const x = side * width * 0.16;
    batch.box(COLORS.white, [x, 0.33, -depth * 0.37], [width * 0.23, 0.4, 0.58 * size]);
    batch.box(COLORS.leafDark, [x, 0.55, -depth * 0.37], [width * 0.21, 0.08, 0.44 * size]);
    for (let i = 0; i < 5; i++) {
      batch.add('foliage', i % 2 ? COLORS.leafLight : COLORS.leaf, [x + (i - 2) * width * 0.036, 0.7, -depth * 0.37], [0.25 * size, 0.29 * size, 0.22 * size]);
    }
  }
  const canopyX = width * 0.16;
  const canopyZ = -depth * 0.07;
  const canopyW = width * 0.46;
  const canopyD = depth * 0.41;
  const canopyY = 3.15 * size;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      batch.box(COLORS.steel, [canopyX + x * canopyW * 0.44, canopyY * 0.5, canopyZ + z * canopyD * 0.43], [0.105 * size, canopyY, 0.105 * size]);
    }
  }
  batch.box(COLORS.white, [canopyX, canopyY, canopyZ], [canopyW + 0.12, 0.13 * size, canopyD + 0.12]);
  // Four separate solar modules with fine, geometry-only cell dividers.
  for (let col = 0; col < 4; col++) {
    const cellX = canopyX + (col - 1.5) * canopyW * 0.246;
    batch.box(COLORS.solar, [cellX, canopyY + 0.09 * size, canopyZ], [canopyW * 0.231, 0.04 * size, canopyD * 0.94], [0, 0, 0], 'solar');
    for (let row = 1; row < 5; row++) {
      batch.box(COLORS.grid, [cellX, canopyY + 0.113 * size, canopyZ + canopyD * (row / 5 - 0.5) * 0.94], [canopyW * 0.227, 0.009 * size, 0.018 * size], [0, 0, 0], 'solar');
    }
    batch.box(COLORS.grid, [cellX, canopyY + 0.113 * size, canopyZ], [0.017 * size, 0.009 * size, canopyD * 0.94], [0, 0, 0], 'solar');
  }
  // Slatted teak benches under the canopy.
  for (const side of [-1, 1]) {
    const z = canopyZ + side * canopyD * 0.28;
    for (const leg of [-1, 1]) {
      batch.box(COLORS.steel, [canopyX + leg * canopyW * 0.18, 0.4 * size, z], [0.1 * size, 0.58 * size, 0.4 * size]);
    }
    for (let slat = 0; slat < 3; slat++) {
      batch.box(COLORS.wood, [canopyX, 0.69 * size, z + (slat - 1) * 0.16 * size], [canopyW * 0.49, 0.1 * size, 0.135 * size]);
    }
  }
  sculpture(batch, -width * 0.06, 0.13, depth * 0.29, 0.68 * size);
  const garden = batch.finish('campus-rooftop-garden', { min: [-width / 2, 0, -depth / 2], max: [width / 2, 0.13, depth / 2] });
  garden.userData.dimensions = { width, depth };
  return garden;
}

/** Yellow tower crane: +X is the long jib direction; full height is ~23 m. */
export function createCampusCrane(): THREE.Group {
  const batch = new PropBatch();
  batch.box(COLORS.cream, [0, 0.25, 0], [3.2, 0.5, 3.2]);
  batch.box(COLORS.yellowShade, [0, 0.61, 0], [1.8, 0.22, 1.8]);
  const half = 0.62;
  const start = 0.72;
  const top = 18.72;
  for (const x of [-half, half]) for (const z of [-half, half]) {
    batch.beam(COLORS.yellow, [x, start, z], [x, top, z], 0.16);
  }
  for (let section = 0; section < 6; section++) {
    const low = start + section * 3;
    const high = low + 3;
    for (const side of [-half, half]) {
      batch.beam(COLORS.yellowShade, [-half, low, side], [half, high, side], 0.095);
      batch.beam(COLORS.yellow, [side, low, half], [side, high, -half], 0.095);
      batch.beam(COLORS.yellow, [-half, high, side], [half, high, side], 0.11);
      batch.beam(COLORS.yellow, [side, high, -half], [side, high, half], 0.11);
    }
  }
  batch.add('cylinder', COLORS.steel, [0, 18.82, 0], [0.95, 0.24, 0.95]);
  batch.box(COLORS.yellow, [0, 19.12, 0], [1.7, 0.42, 1.55]);
  // Operator cabin is opaque blue glass to preserve predictable batching.
  batch.box(COLORS.cream, [0.8, 19.36, 0.74], [1.1, 1.26, 0.86]);
  batch.box(COLORS.glass, [0.82, 19.51, 1.179], [0.91, 0.82, 0.024]);
  batch.box(COLORS.glass, [1.359, 19.51, 0.74], [0.024, 0.82, 0.67]);
  batch.box(COLORS.yellow, [0.8, 20.04, 0.76], [1.24, 0.12, 1.02]);
  const jibLow = 19.4;
  const jibHigh = 20.55;
  for (const z of [-0.46, 0.46]) {
    batch.beam(COLORS.yellow, [-4.4, jibLow, z], [11.8, jibLow, z], 0.14);
    batch.beam(COLORS.yellow, [-4.4, jibHigh, z], [11.8, jibHigh, z], 0.12);
    for (let i = 0; i < 12; i++) {
      const x = -4.4 + i * 1.35;
      batch.beam(COLORS.yellowShade, [x, jibLow, z], [x + 1.35, jibHigh, z], 0.08);
      batch.beam(COLORS.yellow, [x, jibLow, z], [x, jibHigh, z], 0.08);
      if (z < 0) batch.beam(COLORS.yellow, [x, jibLow, -0.46], [x, jibLow, 0.46], 0.08);
    }
  }
  batch.beam(COLORS.yellow, [0, 19.6, 0], [-0.3, 22.9, 0], 0.19);
  batch.beam(COLORS.steel, [-0.3, 22.9, 0], [9.7, jibHigh, 0], 0.045);
  batch.beam(COLORS.steel, [-0.3, 22.9, 0], [-4.25, jibHigh, 0], 0.045);
  for (let i = 0; i < 3; i++) {
    batch.box(COLORS.edge, [-3.55 + i * 0.64, 18.88, 0], [0.57, 0.92, 1.22]);
  }
  batch.box(COLORS.yellowShade, [7.6, 19.2, 0], [0.82, 0.3, 1.04]);
  for (const z of [-0.17, 0.17]) batch.beam(COLORS.steel, [7.6, 19.08, z], [7.6, 13.65, z], 0.044);
  batch.add('cylinder', COLORS.yellow, [7.6, 13.63, 0], [0.24, 0.38, 0.24]);
  for (const x of [-0.6, 0.6]) {
    batch.beam(COLORS.steel, [7.6, 13.47, 0], [7.6 + x, 12.7, 0], 0.04);
  }
  batch.box(COLORS.load, [7.6, 12.05, 0], [1.72, 1.3, 1.26]);
  for (const x of [-0.55, 0.55]) batch.box(COLORS.wood, [7.6 + x, 12.05, 0], [0.085, 1.33, 1.29]);
  const crane = batch.finish('campus-yellow-tower-crane', { min: [-1.6, 0, -1.6], max: [1.6, 0.5, 1.6] });
  crane.userData.boomDirection = [1, 0, 0];
  crane.userData.suspendedLoadBounds = { min: [6.74, 11.4, -0.65], max: [8.46, 13.83, 0.65] };
  crane.userData.roadClearanceHint = 'Place the support pad outside the road; rotate +X jib away from the driving corridor.';
  return crane;
}

/** White spherical campus mascot, facing +Z, with a mint geometric crown. */
export function createRooftopMascot(): THREE.Group {
  const batch = new PropBatch();
  batch.add('cylinder', COLORS.cream, [0, 0.17, 0], [1.48, 0.34, 1.48]);
  batch.add('cylinder', COLORS.mint, [0, 0.38, 0], [1.13, 0.1, 1.13]);
  batch.add('sphere', COLORS.white, [0, 2.08, 0], [1.72, 1.72, 1.72]);
  // Small pebble feet and relaxed arms keep the white orb playful at race scale.
  for (const side of [-1, 1]) {
    batch.add('pebble', COLORS.white, [side * 0.72, 0.51, 0.57], [0.5, 0.3, 0.64]);
    batch.add('pebble', COLORS.white, [side * 1.64, 1.75, 0.08], [0.36, 0.55, 0.35], [0, 0, side * 0.5]);
    batch.add('pebble', COLORS.navy, [side * 0.48, 2.3, 1.64], [0.11, 0.145, 0.065]);
    batch.add('pebble', COLORS.white, [side * 0.48 - 0.022, 2.345, 1.702], [0.029, 0.035, 0.012]);
  }
  batch.add('pebble', COLORS.navy, [0, 1.97, 1.714], [0.1, 0.044, 0.028]);
  batch.add('octahedron', COLORS.mint, [0.44, 3.84, 0.05], [0.57, 0.68, 0.44], [0.12, 0.1, -0.26]);
  batch.add('octahedron', COLORS.leafLight, [0.91, 3.59, 0.1], [0.29, 0.38, 0.3], [0, 0, -0.65]);
  const mascot = batch.finish('campus-white-mint-mascot', { min: [-1.48, 0, -1.48], max: [1.48, 0.34, 1.48] });
  mascot.userData.facing = [0, 0, 1];
  return mascot;
}

/** The full 5-draw-call kit; each named child can be independently positioned. */
export function createCampusProps(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'silicon-valley-campus-props';
  const garden = createRooftopGarden();
  const mascot = createRooftopMascot();
  mascot.position.set(-8.5, 0, 0);
  const crane = createCampusCrane();
  crane.position.set(9.1, 0, -1.2);
  const art = createCampusSculpture();
  art.position.set(-8.5, 0, 3.4);
  group.add(garden, mascot, crane, art);
  group.userData.placement = 'Exploded prop kit. Position named children on individual roofs/support surfaces.';
  return annotateBounds(group);
}

/** Dispose this factory's output geometries only; shared materials stay usable. */
export function disposeCampusProps(group: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh && object.geometry.userData.campusOwnedGeometry === true) owned.add(object.geometry);
  });
  owned.forEach(geometry => geometry.dispose());
}
