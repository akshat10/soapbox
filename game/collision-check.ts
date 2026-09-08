import assert from 'node:assert/strict';
import { Body, RaycastResult, Vec3 } from 'cannon-es';
import { PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_BUILDS, getBody } from './catalogue';
import { BAY_CIRCUIT_COURSE as course, type RoadProjection } from './course';
import { BRIDGE_PORTALS, OBSTACLE_GROUP } from './course-obstacles';
import { DerbyPhysics } from './physics';
import { containOnTrack, lateralFootprint } from './track-boundary';
import { scenicCameraTargets, SCENIC_CAMERA } from './race-camera';

const race = new DerbyPhysics();
race.reset([DEFAULT_BUILDS[0], DEFAULT_BUILDS[0]], [0, 1], { course: 'bay-or-bust', circuit: true, steeringEnabled: true, arcade: true });
const bodies = race.world.bodies.filter(body => body.mass > 0);

// Sweep the real bridge deck, including its grade changes and span join.
for (let distance = BRIDGE_PORTALS[0] - 20; distance < BRIDGE_PORTALS[1] + 20; distance += .5) {
  const frame = course.frame(distance);
  for (const lateral of [-5.5, 0, 5.5]) {
    const surface = frame.position.vadd(frame.right.scale(lateral));
    const hit = new RaycastResult();
    race.world.rayTest(surface.vadd(frame.up.scale(3)), surface.vsub(frame.up.scale(3)), hit);
    assert(hit.hasHit && hit.body?.collisionFilterGroup === 1, 'The bridge must have continuous wheel support.');
    assert(hit.hitPointWorld.distanceTo(surface) < .12, 'Bridge deck contact must match the visible road.');
  }
}
for (const distance of BRIDGE_PORTALS) {
  const frame = course.frame(distance);
  for (const [lateral, height] of [[9, 4], [-9, 4], [0, 12], [0, 17.4]]) {
    const center = frame.position.vadd(frame.right.scale(lateral)); center.y += height - .251012;
    const hit = new RaycastResult();
    race.world.raycastClosest(center.vsub(frame.tangent.scale(4)), center.vadd(frame.tangent.scale(4)), { collisionFilterGroup: 2, collisionFilterMask: OBSTACLE_GROUP }, hit);
    assert(hit.hasHit, 'Bridge towers and crossbeams must be solid.');
  }
  const center = frame.position.vadd(new Vec3(0, 2, 0)), hit = new RaycastResult();
  race.world.raycastClosest(center.vsub(frame.tangent.scale(3)), center.vadd(frame.tangent.scale(3)), { collisionFilterGroup: 2, collisionFilterMask: OBSTACLE_GROUP }, hit);
  assert(!hit.hasHit, 'The open portal must remain drivable.');
}

// A launched, sideways car stays inside the complete ribbon, on both sides,
// while preserving its forward and upward momentum through an edge impact.
for (const distance of [30, 110, 170, 181.77, 200, 397, 550, 750]) {
  const frame = course.frame(distance), body = bodies[0];
  for (const side of [-1, 1]) {
    body.quaternion.copy(course.orientation(frame));
    body.position.copy(frame.position.vadd(frame.right.scale(side * 8)).vadd(frame.up.scale(6)));
    body.velocity.copy(frame.tangent.scale(30).vadd(frame.right.scale(side * 20)).vadd(frame.up.scale(5)));
    const projection = course.project(body.position, frame);
    const forwardSpeed = body.velocity.dot(projection.tangent), verticalSpeed = body.velocity.dot(projection.up);
    assert(containOnTrack(body, DEFAULT_BUILDS[0], projection) > 19);
    const contained = course.project(body.position, frame);
    assert(Math.abs(contained.lateral) + lateralFootprint(body, DEFAULT_BUILDS[0], contained.right) < 7.1, 'No part of the car may leave the track during a hop.');
    assert(Math.abs(body.velocity.dot(projection.tangent) - forwardSpeed) < 1e-8, 'Edge contact keeps forward momentum.');
    assert(Math.abs(body.velocity.dot(projection.up) - verticalSpeed) < 1e-8, 'Edge contact preserves the hop.');
    assert(body.velocity.dot(projection.right) * side <= 0, 'Outward velocity must bounce inward.');
  }
}

// Test-only relocation establishes a coherent fixture without awarding travel.
type Fixture = { chassis: Body; route: RoadProjection; lastCoursePosition: Vec3; validCourseDistance: number; recoveryLeft: number };
const fixtures = (race as unknown as { racers: Map<number, Fixture> }).racers;
function place(id: number, distance: number, lateral: number, height = 1.5) {
  const racer = fixtures.get(id)!, frame = course.frame(distance), body = racer.chassis;
  body.position.copy(frame.position.vadd(frame.right.scale(lateral)).vadd(frame.up.scale(height)));
  body.quaternion.copy(course.orientation(frame));
  body.velocity.setZero(); body.angularVelocity.setZero(); body.aabbNeedsUpdate = true;
  racer.route = course.project(body.position, frame);
  racer.lastCoursePosition.copy(body.position); racer.validCourseDistance = distance;
  race.world.broadphase.dirty = true;
}
race.start();
place(0, 320, -1.4); place(1, 320, 1.4);
const frame = course.frame(320);
bodies[0].velocity.copy(frame.right.scale(8)); bodies[1].velocity.copy(frame.right.scale(-8));
let contacts = 0;
bodies[0].addEventListener('collide', (event: { body: Body }) => { if (event.body === bodies[1]) contacts++; });
for (let tick = 0; tick < 45; tick++) race.update(1 / 120);
assert(contacts > 0, 'Racer chassis must collide with one another.');
assert(race.events.some(event => event.type === 'collision'), 'Impacts generate existing race feedback.');
assert(bodies[1].position.vsub(bodies[0].position).dot(frame.right) > getBody(DEFAULT_BUILDS[0].bodyId).width * .8, 'Cars cannot pass through each other.');

// Opponent chassis are never suspension support, even directly underneath.
const target = bodies[1], support = new RaycastResult();
race.world.rayTest(target.position.vadd(new Vec3(0, 8, 0)), target.position.vsub(new Vec3(0, 12, 0)), support);
assert(support.hasHit && support.body?.collisionFilterGroup === 1);

// Test the real fixed-step integration with a hard outward steering input and
// a fast airborne departure from the bridge edge.
place(0, 180, 5.3, 6); place(1, 310, 0);
bodies[0].velocity.copy(course.frame(180).tangent.scale(25).vadd(course.frame(180).right.scale(22)));
for (let tick = 0; tick < 180; tick++) {
  race.setSteering(0, 1); race.update(1 / 120);
  const racer = fixtures.get(0)!;
  if (racer.recoveryLeft > 0) continue;
  const projection = course.project(bodies[0].position, racer.route);
  assert(Math.abs(projection.lateral) + lateralFootprint(bodies[0], DEFAULT_BUILDS[0], projection.right) < 7.2, 'Simulation must enforce bounds after every step.');
}

for (const aspect of [390 / 844, 16 / 9, 1]) {
  for (const distance of [3, 80, 170, 196, 400, 600, 775]) {
    const road = course.frame(distance), snapshot = race.getSnapshots()[0];
    const position = { x: road.position.x, y: road.position.y + 1.2, z: road.position.z };
    const { eye, aim } = scenicCameraTargets({ ...snapshot, position, pathDistance: distance }, aspect);
    const camera = new PerspectiveCamera(SCENIC_CAMERA.fov, aspect, .1, 1400);
    camera.position.copy(eye); camera.lookAt(aim); camera.updateMatrixWorld(true);
    const screen = new Vector3(position.x, position.y, position.z).project(camera);
    assert(Math.abs(screen.x) < .7 && Math.abs(screen.y) < .7 && screen.z < 1, 'Scenic view keeps the racer visible on desktop and phone.');
    assert(eye.y > position.y + 7, 'Scenic view stays elevated above the road.');
  }
}
race.dispose();
console.log('Collisions passed: continuous bridge support, solid towers/beams, open portals, real car contact, suspension isolation, airborne boundaries, and scenic framing.');
