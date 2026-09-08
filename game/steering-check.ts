import assert from 'node:assert/strict';
import { RaycastResult, Vec3 } from 'cannon-es';
import { DEFAULT_BUILDS } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { DerbyPhysics, RECOVERY_SECONDS } from './physics';

const STEP = 1 / 120;
function advance(race: DerbyPhysics, seconds: number) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) race.update(STEP);
}
function classicTurn(input: number) {
  const race = new DerbyPhysics();
  race.reset([DEFAULT_BUILDS[0]], [0], { steeringEnabled: true });
  race.start(); advance(race, 8);
  race.setSteering(0, input); advance(race, 0.6);
  const result = race.getSnapshots()[0];
  race.dispose(); return result;
}
const left = classicTurn(-1), right = classicTurn(1), coast = classicTurn(0);
assert(right.position.x > coast.position.x + 0.3 && left.position.x < coast.position.x - 0.3, 'Front tire steering must physically move the car in the requested direction.');
assert(Math.abs((right.position.x - coast.position.x) + (left.position.x - coast.position.x)) < .02, 'Left and right turning authority should match.');
assert(Math.abs(classicTurn(9).position.x - right.position.x) < .001, 'Steering must clamp to normalized input.');
assert(Math.abs(classicTurn(NaN).position.x - coast.position.x) < .001, 'Invalid steering must safely center.');

const independent = new DerbyPhysics();
independent.reset([DEFAULT_BUILDS[0]], [0], { steeringEnabled: true });
independent.start(); advance(independent, 4);
independent.setInput(0, true); independent.setSteering(0, 1); advance(independent, .3);
const beforeCancel = independent.getSnapshots()[0];
independent.cancelInput(0); advance(independent, .2);
assert(independent.getSnapshots()[0].position.x > beforeCancel.position.x + .05, 'Canceling hop must preserve steering.');
assert.equal(independent.getSnapshots()[0].charge, 0);
independent.setInput(0, true); independent.cancelSteering(0); advance(independent, .2);
assert(independent.getSnapshots()[0].charge > .15, 'Centering steering must preserve a held hop.');
independent.clearInputs(); advance(independent, .2);
assert.equal(independent.getSnapshots()[0].charge, 0);
assert.equal(independent.getSnapshots()[0].jumps, 0, 'Clearing controls must never launch.');
independent.dispose();

const curved = new DerbyPhysics();
curved.reset(DEFAULT_BUILDS, [0, 1], { steeringEnabled: true, course: 'bay-or-bust' });
const roadBodyCount = curved.world.bodies.length;
assert(roadBodyCount > 100, 'Curved course should install its authored collision surface.');
curved.start(); advance(curved, 2);
assert(curved.getSnapshots().every(s => s.grounded && s.courseId === 'bay-or-bust' && s.pathDistance! > course.startDistance), 'Cars should roll along the actual starting frame, not world +Z.');
assert(curved.getSnapshots().every(s => s.position.z < 0 && s.progress > 0), 'Race progress must use course distance even when world Z is negative.');

for (const distance of [30, 80, 120, 175, 190, 237, 300, 390, 424]) {
  const frame = course.frame(distance), q = course.orientation(frame);
  assert(q.vmult(new Vec3(0, 0, 1)).distanceTo(frame.tangent) < .00001, 'Spawn heading must match the road tangent.');
  assert(q.vmult(new Vec3(0, 1, 0)).distanceTo(frame.up) < .00001, 'Spawn bank must match the authored frame.');
  for (const offset of [0, -7.5, 7.5]) {
    const surface = frame.position.vadd(frame.right.scale(offset));
    const result = new RaycastResult();
    curved.world.raycastClosest(surface.vadd(frame.up.scale(5)), surface.vsub(frame.up.scale(8)), { collisionFilterGroup: 2, collisionFilterMask: 1 }, result);
    assert(result.hasHit, `Rendered road/curb at s${distance} offset${offset} must support the wheels.`);
    assert(result.hitPointWorld.distanceTo(surface) < .35, 'Collision top must closely match the visible ribbon/raised curb.');
  }
}

const chassis = curved.world.bodies.find(body => body.mass > 0)!;
const finish = course.frame(course.finishDistance);
chassis.position.copy(finish.position.vadd(finish.up.scale(2)));
advance(curved, .5);
let state = curved.getSnapshots()[0];
assert(!state.finished && state.progress < .02 && state.recovering, 'Teleporting near the finish must not grant skipped course progress.');
advance(curved, RECOVERY_SECONDS + .1);
state = curved.getSnapshots()[0];
assert(!state.finished && state.progress < .03 && !state.recovering, 'Invalid route movement must recover onto the previously reached road.');
curved.reset(DEFAULT_BUILDS, [0, 1]);
assert(curved.getSnapshots().every(s => s.courseId === 'bay-or-bust'), 'A new heat must preserve the selected course and steering mode.');
assert.equal(curved.world.bodies.length, roadBodyCount, 'Reset must not accumulate road bodies.');
curved.reset(DEFAULT_BUILDS, [0, 1], { steeringEnabled: false, course: 'classic' });
assert(curved.getSnapshots().every(s => s.courseId === undefined), 'Classic fixed-lane mode remains available.');
assert(curved.world.bodies.length < 50, 'Switching to classic must remove curved road collision bodies.');
curved.dispose();

console.log('Steering checks passed: real front-wheel turns, symmetric normalized controls, independent hop/steer cancellation, authored course contact and shoulders, frame-aligned spawns, path-based progress, skip prevention, safe recovery, and reset/fallback mode preservation.');
