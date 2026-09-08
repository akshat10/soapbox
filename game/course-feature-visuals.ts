import * as THREE from 'three';
import { BAY_OR_BUST_COURSE as course } from './course';
import { AERIAL_RINGS, BOOST_PADS, ROUGH_PATCHES, SIGNATURE_JUMPS, type CourseStrip } from './course-features';
import type { VehicleSnapshot } from './types';
import { createResetPickup, createResetTexture } from './reset-pickup';
import { createSiliconValleyScene, type ValleyScene } from './silicon-valley-scene';

type SurfacePoint = readonly [distance: number, lateral: number];
type Paint = { positions: number[]; material: THREE.MeshStandardMaterial; name: string };

function paint(name: string, color: number, emissive = 0): Paint {
  return { name, positions: [], material: new THREE.MeshStandardMaterial({
    name, color, roughness: .8, metalness: .02, emissive,
    emissiveIntensity: emissive ? .1 : 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }) };
}

/** Small polygons follow the same banked, graded road frames as the collider. */
function polygon(target: Paint, points: readonly SurfacePoint[], height = .036) {
  const world = points.map(([distance, lateral]) => {
    const frame = course.frame(distance);
    return new THREE.Vector3(
      frame.position.x + frame.right.x * lateral + frame.up.x * height,
      frame.position.y + frame.right.y * lateral + frame.up.y * height,
      frame.position.z + frame.right.z * lateral + frame.up.z * height,
    );
  });
  const frame = course.frame(points[0][0]);
  const up = new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z);
  for (let i = 1; i < world.length - 1; i++) {
    const a = world[0], b = world[i], c = world[i + 1];
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const vertices = normal.dot(up) >= 0 ? [a, b, c] : [a, c, b];
    vertices.forEach(vertex => target.positions.push(vertex.x, vertex.y, vertex.z));
  }
}

function strip(target: Paint, start: number, end: number, lateral: number, width: number, height = .036) {
  const count = Math.max(1, Math.ceil((end - start) / .5));
  for (let i = 0; i < count; i++) {
    const a = start + (end - start) * i / count, b = start + (end - start) * (i + 1) / count;
    polygon(target, [[a, lateral - width / 2], [b, lateral - width / 2], [b, lateral + width / 2], [a, lateral + width / 2]], height);
  }
}

function chevron(target: Paint, distance: number, lateral: number, width: number, depth: number, thickness: number, height = .048) {
  for (const side of [-1, 1]) polygon(target, [
    [distance - depth / 2, lateral + side * width / 2],
    [distance + depth / 2, lateral],
    [distance + depth / 2 - thickness, lateral],
    [distance - depth / 2 - thickness, lateral + side * width / 2],
  ], height);
}

function finishPaint(root: THREE.Group, target: Paint) {
  if (!target.positions.length) { target.material.dispose(); return; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(target.positions, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, target.material);
  mesh.name = target.name; mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.userData.courseFeatureVisual = true;
  root.add(mesh);
}

/** Cosmetic views of the shared gameplay definitions; never creates colliders. */
export class CourseFeatureVisuals {
  readonly root = new THREE.Group();
  private readonly rings: { id: string; root: THREE.Group; artwork: THREE.Object3D }[] = [];
  private readonly pads: { definition: CourseStrip; material: THREE.MeshStandardMaterial }[] = [];
  private elapsed = 0;
  private readonly valley: ValleyScene;

  constructor(courseRoot: THREE.Group) {
    this.valley = createSiliconValleyScene(courseRoot);
    this.root.add(this.valley.root);
    this.root.name = 'Bay or Bust · playable feature cues';
    const gold = paint('Feature paint · warm gold', 0xffcf59);
    const cream = paint('Feature paint · warm white', 0xffefd1);
    const dark = paint('Rumble seams · deep slate', 0x354654);
    const stone = paint('Rumble cobbles · cool stone', 0x849c9e);
    const lightStone = paint('Rumble cobbles · pale stone', 0xa9b7af);
    const wood = paint('Rumble boards · warm timber', 0xa97c56);

    for (const pad of BOOST_PADS) {
      const teal = paint(`Boost lane · ${pad.id}`, 0x149c9e, 0x36efd3);
      strip(teal, pad.start, pad.end, pad.lateral, pad.width);
      for (const side of [-1, 1]) strip(cream, pad.start + .12, pad.end - .12,
        pad.lateral + side * (pad.width / 2 - .11), .09, .046);
      for (let s = pad.start + .9; s < pad.end - .35; s += 1.45) {
        chevron(gold, s, pad.lateral, pad.width * .7, .62, .27);
      }
      this.pads.push({ definition: pad, material: teal.material });
      finishPaint(this.root, teal);
    }

    for (const patch of ROUGH_PATCHES) {
      strip(dark, patch.start, patch.end, patch.lateral, patch.width);
      const garden = patch.id.includes('garden');
      const rows = Math.ceil((patch.end - patch.start - .65) / .65);
      const columns = garden ? 5 : 1;
      for (let row = 0; row < rows; row++) {
        const a = patch.start + .35 + row * .65;
        const b = Math.min(a + .53, patch.end - .2);
        if (b <= a) continue;
        for (let column = 0; column < columns; column++) {
          const cellWidth = (patch.width - .2) / columns;
          const x = patch.lateral - patch.width / 2 + .1 + cellWidth * (column + .5);
          strip(garden ? ((row + column) % 3 ? stone : lightStone) : wood,
            a, b, x, cellWidth - .065, .047);
        }
      }
      // Yellow threshold and edge ticks distinguish drag surfaces from boost lanes.
      strip(gold, patch.start - .12, patch.start + .1, patch.lateral, patch.width, .048);
      for (let s = patch.start + .5; s < patch.end; s += 1.35) {
        for (const side of [-1, 1]) strip(gold, s, s + .42,
          patch.lateral + side * (patch.width / 2 - .08), .12, .049);
      }
    }

    // A quiet edge rhythm leads to each launch; the broad center stays readable.
    for (const jump of SIGNATURE_JUMPS) {
      for (let s = jump.charge; s < jump.release - 1; s += 2.8) {
        for (const side of [-1, 1]) chevron(cream, s, side * 5.65, .75, .62, .19);
      }
      for (const side of [-1, 1]) {
        strip(gold, jump.release - .85, jump.release - .55, side * 4.8, 2.45, .047);
        chevron(gold, jump.release - 2.4, side * 4.8, 1.8, 1.1, .26);
      }
    }

    for (const target of [gold, cream, dark, stone, lightStone, wood]) finishPaint(this.root, target);

    const resetTexture = createResetTexture();
    for (const ring of AERIAL_RINGS) {
      const anchor = new THREE.Group();
      anchor.name = `ChatGPT reset · ${ring.id}`;
      anchor.userData.featureId = ring.id;
      const frame = course.frame(ring.distance);
      const right = new THREE.Vector3(frame.right.x, frame.right.y, frame.right.z);
      const up = new THREE.Vector3(frame.up.x, frame.up.y, frame.up.z);
      const forward = new THREE.Vector3(frame.tangent.x, frame.tangent.y, frame.tangent.z);
      anchor.position.set(frame.position.x, frame.position.y, frame.position.z)
        .addScaledVector(right, ring.lateral).addScaledVector(up, ring.height);
      anchor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
      const artwork = createResetPickup(ring.radius, resetTexture);
      anchor.add(artwork); this.root.add(anchor);
      this.rings.push({ id: ring.id, root: anchor, artwork });
    }
    courseRoot.add(this.root);
  }

  update(snapshot: VehicleSnapshot | undefined, dt: number, active: boolean, reducedMotion: boolean): void {
    this.valley.update(snapshot?.lap ?? 1);
    if (active && !reducedMotion) this.elapsed += Math.max(0, Math.min(dt, .1));
    for (const ring of this.rings) {
      ring.root.visible = !snapshot?.collectedRings?.includes(ring.id);
      // The token stays aligned with its sensor and its RESET label stays readable.
      ring.artwork.rotation.z = 0;
    }
    for (const pad of this.pads) {
      const s = snapshot?.pathDistance ?? -Infinity;
      const triggered = active && (snapshot?.boostRemaining ?? 0) > 0
        && s >= pad.definition.start && s < pad.definition.end + 16;
      pad.material.emissiveIntensity = triggered ? .5 : .1;
    }
  }

  setCircuit(enabled: boolean): void {
    for (const ring of this.rings) {
      const definition=AERIAL_RINGS.find(target=>target.id===ring.id)!;
      ring.root.scale.setScalar(enabled ? (definition.circuitRadius ?? definition.radius)/definition.radius : 1);
    }
  }
}
