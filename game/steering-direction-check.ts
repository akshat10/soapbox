import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_BUILDS } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { DerbyPhysics } from './physics';
import { keyboardSteering, manualSteering } from './session-rules';

function drive(direction: number) {
  const race = new DerbyPhysics();
  race.reset([DEFAULT_BUILDS[0]], [0], { course: 'bay-or-bust', steeringEnabled: true });
  race.start();
  for (let i = 0; i < 4 * 120; i++) race.update(1 / 120);
  race.setSteering(0, direction);
  for (let i = 0; i < 78; i++) race.update(1 / 120);
  const state = race.getSnapshots()[0]; race.dispose(); return state;
}

const leftKey = keyboardSteering('solo', 0, new Set(['ArrowLeft']));
const rightKey = keyboardSteering('solo', 0, new Set(['ArrowRight']));
assert.equal(keyboardSteering('solo', 0, new Set(['ArrowLeft']), true), rightKey, 'Reversed arrows swap the previous left and right commands.');
assert.equal(keyboardSteering('solo', 0, new Set(['ArrowRight']), true), leftKey);
assert.equal(keyboardSteering('solo', 0, new Set(['ArrowLeft', 'ArrowRight']), true), 0, 'Opposing arrows still center the tires when reversed.');
assert.equal(leftKey, manualSteering(-1), 'The left touch arrow and left keyboard arrow must agree.');
assert.equal(rightKey, manualSteering(1), 'The right touch arrow and right keyboard arrow must agree.');
const coast = drive(0), left = drive(leftKey), right = drive(rightKey);
const road = course.frame(coast.pathDistance!);
const camera = new PerspectiveCamera(55, 16 / 9, .1, 100);
camera.position.set(coast.position.x - road.tangent.x * 12, coast.position.y + 5, coast.position.z - road.tangent.z * 12);
camera.lookAt(coast.position.x, coast.position.y, coast.position.z);
camera.updateMatrixWorld(true);
const screenX = (state: typeof coast) => new Vector3(state.position.x, state.position.y, state.position.z).project(camera).x;
assert(screenX(left) < screenX(coast) - .001, 'ArrowLeft must move the car left in the actual forward-facing chase camera.');
assert(screenX(right) > screenX(coast) + .001, 'ArrowRight must move the car right in the actual forward-facing chase camera.');
console.log('Steering direction passed: physical car movement projects left/right as labelled, with keyboard and touch parity.');
