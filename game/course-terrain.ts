import * as THREE from 'three';
import { BAY_CIRCUIT_COURSE, BAY_OR_BUST_COURSE, type CoursePath } from './course';

type Sample = CoursePath['samples'][number];
const WATER_FLOOR = -5.5;
// These are the exact sample intervals used by the authored grass shelves.
export const LAND_INTERVALS = [[0, 157], [191, 351]] as const;
const point = (sample: Sample, lateral: number, height: number) => new THREE.Vector3(...sample.position as [number, number, number])
  .addScaledVector(new THREE.Vector3(...sample.right as [number, number, number]), lateral)
  .addScaledVector(new THREE.Vector3(...sample.up as [number, number, number]), height);

/** Closed, outward-wound ribbon: top, bottom, both sides and both end caps.
 * Four vertices per section are left/top, right/top, left/bottom, right/bottom.
 * The same section vertices are shared at every seam, including banked turns. */
export function closedRibbon(sections: THREE.Vector3[][]): THREE.BufferGeometry {
  const positions = sections.flatMap(section => section.flatMap(p => p.toArray()));
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, a, c, d);
  quad(0, 1, 3, 2);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = i * 4, b = a + 4;
    quad(a, b, b + 1, a + 1);
    quad(a + 2, a + 3, b + 3, b + 2);
    quad(a, a + 2, b + 2, b);
    quad(a + 1, b + 1, b + 3, a + 3);
  }
  const end = (sections.length - 1) * 4;
  quad(end, end + 2, end + 3, end + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Fill beneath the existing road faces; driving geometry stays exactly where
 * it was authored. The shoulders and raised curbs get their own closed bands. */
export function createReturnRoadFoundation(): THREE.Group {
  const root = new THREE.Group(); root.name = 'Closed viaduct deck and curb walls';
  const samples = BAY_CIRCUIT_COURSE.paths[0].samples.slice(BAY_OR_BUST_COURSE.paths[0].samples.length - 1);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x78949e, roughness: .9 });
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x354657, roughness: .92 });
  const curb = new THREE.MeshStandardMaterial({ color: 0xffd452, roughness: .8 });
  // Prefer the original paint on coplanar top faces without lowering the side
  // walls and opening a hairline seam beneath every shoulder and curb.
  for (const material of [concrete, asphalt, curb]) {
    material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1;
  }
  const bands = [
    { lo: -7, hi: 7, height: 0, thickness: .35, material: asphalt },
    { lo: -7.7, hi: -7, height: .045, thickness: .52, material: curb },
    { lo: 7, hi: 7.7, height: .045, thickness: .52, material: curb },
    { lo: -7.75, hi: -7.3, height: .2, thickness: .2, material: curb },
    { lo: 7.3, hi: 7.75, height: .2, thickness: .2, material: curb },
    { lo: -7.7, hi: 7.7, height: -.34, thickness: .46, material: concrete },
  ];
  for (const [index, band] of bands.entries()) {
    const geometry = closedRibbon(samples.map(sample => [
      point(sample, band.lo, band.height), point(sample, band.hi, band.height),
      point(sample, band.lo, band.height - band.thickness), point(sample, band.hi, band.height - band.thickness),
    ]));
    const mesh = new THREE.Mesh(geometry, band.material); mesh.name = `Solid viaduct band ${index}`;
    mesh.receiveShadow = true; root.add(mesh);
  }
  return root;
}

/** Seal the original island down into the bay and ground its distant landmarks.
 * Added props reuse the authored art and enter the existing scenery batching. */
export function repairCourseTerrain(authored: THREE.Group): THREE.Group {
  const root = new THREE.Group(); root.name = 'Solid island and shoreline gardens';
  const sandstone = new THREE.MeshStandardMaterial({ color: 0xbba078, roughness: 1 });
  const ground = new THREE.MeshStandardMaterial({ color: 0x789958, roughness: 1 });
  const samples = BAY_OR_BUST_COURSE.paths[0].samples;
  const sources = new Map<string, THREE.Object3D>();
  const occupied: THREE.Box3[] = [];
  const landmarks: THREE.Object3D[] = [];
  const boats: THREE.Object3D[] = [];
  authored.updateMatrixWorld(true);
  authored.traverse(node => {
    if (node.name.startsWith('Sculpted_waterfront_cliff')) node.visible = false;
    const id = node.userData.asset_id;
    if (id && !sources.has(id)) sources.set(id, node);
    if (/^sf_(coit_tower|pyramid_tower|skyline_cluster)$/.test(id ?? '')) landmarks.push(node);
    if (/^sf_(fishing_boat|distant_sailboat)$/.test(id ?? '')) boats.push(node);
    if (/^sf_(painted_lady|mission_storefront|soma_office|market_stall|coit_tower|pyramid_tower|skyline_cluster|cypress_planter|palm_planter)$/.test(id ?? '')) {
      occupied.push(new THREE.Box3().setFromObject(node).expandByScalar(1));
    }
  });
  for (const boat of boats) {
    const bounds = new THREE.Box3().setFromObject(boat);
    const position = boat.getWorldPosition(new THREE.Vector3());
    // Immerse the hull slightly instead of leaving it suspended above the bay.
    position.y += -4.48 - bounds.min.y;
    boat.position.copy(boat.parent ? boat.parent.worldToLocal(position) : position);
    boat.updateMatrixWorld(true);
  }
  for (const [index, [lo, hi]] of LAND_INTERVALS.entries()) {
    const sections = samples.slice(lo, hi).map((sample, i) => {
      // Overlap the solid grass lip; derive both banked edges from that same
      // frame instead of the original cliff's unrelated world-height offset.
      const left = point(sample, -25, -1.85), right = point(sample, 25, -1.85);
      const spread = 28 + 1.4 * Math.sin(i * .11);
      const footLeft = point(sample, -spread, 0), footRight = point(sample, spread, 0);
      footLeft.y = WATER_FLOOR; footRight.y = WATER_FLOOR;
      return [left, right, footLeft, footRight];
    });
    const mesh = new THREE.Mesh(closedRibbon(sections), sandstone);
    mesh.name = `Sealed coastal island ${index}`; mesh.receiveShadow = true; root.add(mesh);
  }

  let foundationCount = 0;
  const addPad = (bounds: THREE.Box3) => {
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const top = bounds.min.y - .025;
    let outline = [new THREE.Vector2(bounds.min.x - .7, bounds.min.z - .7), new THREE.Vector2(bounds.max.x + .7, bounds.min.z - .7),
      new THREE.Vector2(bounds.max.x + .7, bounds.max.z + .7), new THREE.Vector2(bounds.min.x - .7, bounds.max.z + .7)];
    // Trim only nearby road-facing edges. In particular, the last skyline
    // footprint approaches the pier bend; a rectangular pad would cover a lane.
    for (const sample of BAY_CIRCUIT_COURSE.paths[0].samples) {
      if (sample.position[1] > top + .2 || Math.hypot(center.x - sample.position[0], center.z - sample.position[2]) > Math.hypot(size.x, size.z) / 2 + 11) continue;
      const normal = new THREE.Vector2(sample.right[0], sample.right[2]).normalize();
      const origin = new THREE.Vector2(sample.position[0], sample.position[2]);
      normal.multiplyScalar(Math.sign(new THREE.Vector2(center.x, center.z).sub(origin).dot(normal)) || 1);
      const distance = (p: THREE.Vector2) => p.clone().sub(origin).dot(normal) - (sample.width / 2 + 1.25);
      const clipped: THREE.Vector2[] = [];
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i], b = outline[(i + 1) % outline.length], da = distance(a), db = distance(b);
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
      }
      outline = clipped;
    }
    if (outline.length < 3) return;
    const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, -p.y)));
    for (const [name, material, bottom, height] of [['Landmark stone foundation', sandstone, WATER_FLOOR, top - WATER_FLOOR],
      ['Landmark garden top', ground, top - .05, .09]] as const) {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
      geometry.rotateX(-Math.PI / 2); geometry.translate(0, bottom, 0);
      const mesh = new THREE.Mesh(geometry, material); mesh.name = `${name} ${foundationCount}`;
      mesh.receiveShadow = true; root.add(mesh);
    }
    foundationCount++;
  };
  landmarks.forEach(node => addPad(new THREE.Box3().setFromObject(node)));

  const clearOfRoad = (position: THREE.Vector3, radius: number) => BAY_CIRCUIT_COURSE.paths[0].samples.every(sample =>
    Math.hypot(position.x - sample.position[0], position.z - sample.position[2]) > sample.width / 2 + radius + 2);
  let propCount = 0;
  const place = (id: string, position: THREE.Vector3, scale: number, yaw: number) => {
    const source = sources.get(id); if (!source) return;
    const clone = source.clone(true); clone.visible = true;
    clone.position.copy(position); clone.rotation.set(0, yaw, 0); clone.scale.setScalar(scale);
    clone.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const radius = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) / 2;
    if (!clearOfRoad(position, radius) || occupied.some(box => box.intersectsBox(bounds))) return;
    clone.name = `Shore garden ${propCount++} · ${id}`;
    occupied.push(bounds.clone().expandByScalar(.8)); root.add(clone);
  };
  for (const [lo, hi] of LAND_INTERVALS) {
    for (let i = lo + 8; i < hi - 7; i += 13) for (const side of [-1, 1]) {
      const sample = samples[i];
      place('sf_cypress_planter', point(sample, side * 21.5, -.65), .78 + (i % 4) * .07, i * .71);
      if (i % 3 === 0) {
        const shore = point(sample, side * 29, 0); shore.y = -4.15;
        place('sf_coastal_rocks', shore, .72 + (i % 5) * .06, i * .57);
      }
    }
  }
  root.userData.landmarkFoundations = foundationCount;
  root.userData.shorelineProps = propCount;
  authored.add(root);
  return root;
}
