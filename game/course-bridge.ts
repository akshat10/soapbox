import * as THREE from 'three';
import { BAY_OR_BUST_COURSE as course } from './course';

const SPAN = 21;
const TOWER_DEPTH = 2.1;
const SLICE = 1.5;
type Vertex = { point: THREE.Vector3; attributes: number[][] };

function clip(vertices: Vertex[], z: number, keepAbove: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const aInside = keepAbove ? a.point.z >= z : a.point.z <= z;
    const bInside = keepAbove ? b.point.z >= z : b.point.z <= z;
    if (aInside) result.push(a);
    if (aInside !== bInside) {
      const t = (z - a.point.z) / (b.point.z - a.point.z);
      result.push({ point: a.point.clone().lerp(b.point, t),
        attributes: a.attributes.map((values, index) => values.map((value, j) => THREE.MathUtils.lerp(value, b.attributes[index][j], t))) });
    }
  }
  return result;
}

/** Fit the two straight prefab spans to the actual curved, graded road.
 * Their inward ends meet halfway between towers instead of overlapping. */
export function bridgeRoadPoint(local: THREE.Vector3, anchor: number, inward: number, midpoint: number, verticalOffset: number): THREE.Vector3 {
  const inner = Math.max(0, local.z * inward - TOWER_DEPTH);
  const scale = (Math.abs(midpoint - anchor) - TOWER_DEPTH) / (SPAN - TOWER_DEPTH);
  const distance = anchor + local.z + inward * inner * (scale - 1);
  const frame = course.frame(distance);
  return new THREE.Vector3(frame.position.x + frame.right.x * local.x,
    frame.position.y + frame.right.y * local.x + local.y + verticalOffset,
    frame.position.z + frame.right.z * local.x);
}

export function conformCourseBridges(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const portals: { node: THREE.Object3D; anchor: number; offset: number }[] = [];
  root.traverse(node => {
    // GLTFLoader removes periods from authored node names.
    if (!/^golden_gate_portal\.?\d+$/.test(node.name)) return;
    const at = node.getWorldPosition(new THREE.Vector3());
    const projection = course.project(at, { pathId: 'main', distance: 180 }, course.finishDistance);
    portals.push({ node, anchor: projection.distance, offset: at.y - projection.position.y });
  });
  if (portals.length !== 2) return 0;
  portals.sort((a, b) => a.anchor - b.anchor);
  const midpoint = (portals[0].anchor + portals[1].anchor) / 2;
  const originals = new Set<THREE.BufferGeometry>();
  let count = 0;
  portals.forEach(({ node: portal, anchor, offset }, index) => {
    const portalInverse = portal.matrixWorld.clone().invert();
    portal.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const original = node.geometry as THREE.BufferGeometry;
      originals.add(original);
      const toPortal = portalInverse.clone().multiply(node.matrixWorld);
      const toMesh = node.matrixWorld.clone().invert();
      const position = original.getAttribute('position');
      const attributes = Object.entries(original.attributes).filter(([name]) => !['position', 'normal', 'tangent'].includes(name));
      const output = attributes.map(() => [] as number[]), points: number[] = [];
      const indices = original.index;
      const vertexCount = indices?.count ?? position.count;
      const read = (i: number): Vertex => {
        const vertex = indices ? indices.getX(i) : i;
        return { point: new THREE.Vector3().fromBufferAttribute(position, vertex).applyMatrix4(toPortal),
          attributes: attributes.map(([, attribute]) => Array.from({ length: attribute.itemSize }, (_, j) => attribute.getComponent(vertex, j))) };
      };
      const emit = (vertex: Vertex) => {
        const point = bridgeRoadPoint(vertex.point, anchor, index === 0 ? 1 : -1, midpoint, offset).applyMatrix4(toMesh);
        points.push(point.x, point.y, point.z);
        vertex.attributes.forEach((values, attribute) => output[attribute].push(...values));
      };
      for (let i = 0; i < vertexCount; i += 3) {
        const triangle = [read(i), read(i + 1), read(i + 2)];
        const lo = Math.floor(Math.min(...triangle.map(v => v.point.z)) / SLICE);
        const hi = Math.floor(Math.max(...triangle.map(v => v.point.z)) / SLICE);
        // Long sidewalk and rail faces need new vertices; moving only their
        // endpoints would leave straight chords through the driving lane.
        for (let slice = lo; slice <= hi; slice++) {
          const polygon = clip(clip(triangle, slice * SLICE, true), (slice + 1) * SLICE, false);
          for (let j = 1; j < polygon.length - 1; j++) {
            const [a, b, c] = [polygon[0], polygon[j], polygon[j + 1]];
            if (b.point.clone().sub(a.point).cross(c.point.clone().sub(a.point)).lengthSq() < 1e-16) continue;
            emit(a); emit(b); emit(c);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      attributes.forEach(([name, attribute], i) => geometry.setAttribute(name, new THREE.Float32BufferAttribute(output[i], attribute.itemSize)));
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      node.geometry = geometry; count++;
    });
  });
  const retained = new Set<THREE.BufferGeometry>();
  root.traverse(node => { if (node instanceof THREE.Mesh) retained.add(node.geometry); });
  originals.forEach(geometry => { if (!retained.has(geometry)) geometry.dispose(); });
  return count;
}
