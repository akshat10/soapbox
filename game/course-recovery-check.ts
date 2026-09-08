import assert from 'node:assert/strict';
import { Quaternion, Vec3 } from 'cannon-es';
import { DEFAULT_BUILDS, wheelMounts } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { DerbyPhysics } from './physics';
import { courseHopHeld, courseSteering } from './solo';
import type { VehicleSnapshot } from './types';

function insideLine(state: VehicleSnapshot, lateral: number): number {
  const target = course.frame(state.pathDistance! + Math.max(4, state.speed * .6));
  const point = target.position.vadd(target.right.scale(lateral));
  const { x, y, z, w } = state.quaternion;
  const local = new Quaternion(x, y, z, w).conjugate().vmult(point.vsub(new Vec3(state.position.x, state.position.y, state.position.z)));
  const mounts = wheelMounts(state.blueprint), length = Math.abs(mounts[0][2] - mounts[2][2]);
  const cap = Math.atan(length / (8 + .2 * Math.min(state.speed, 10)));
  return Math.max(-1, Math.min(1, Math.atan2(2 * length * local.x, local.x ** 2 + local.z ** 2) / cap));
}

const summary = [];
for (const scenario of ['arrow keys', 'inside lane', 'wide inside lane', 'lost momentum'] as const) {
  const race = new DerbyPhysics();
  race.reset([DEFAULT_BUILDS[0]], [0], { course: 'bay-or-bust', steeringEnabled: true });
  race.start();
  const chassis = race.world.bodies.find(body => body.mass > 0)!;
  let stopped = false;
  for (let tick = 0; tick < 90 * 120; tick++) {
    const state = race.getSnapshots()[0];
    if (state.finished) break;
    if (scenario === 'lost momentum' && !stopped && state.pathDistance! > 125) {
      chassis.velocity.setZero();
      stopped = true;
    }
    // A 30 Hz sequence of fully pressed/released left/right keys reproduces
    // the Lantern Quarter lockup; it does not use analog steering values.
    if (tick % 4 === 0) {
      const steering = courseSteering(state);
      const insideLantern = state.pathDistance! > 90 && state.pathDistance! < 138;
      race.setSteering(0, scenario === 'arrow keys' ? Math.abs(steering) < .2 ? 0 : Math.sign(steering)
        : insideLantern && scenario.includes('lane') ? insideLine(state, scenario === 'inside lane' ? -3 : -5.25) : steering);
      race.setInput(0, courseHopHeld(state));
    }
    race.update(1 / 120);
  }
  const result = race.getSnapshots()[0];
  assert(result.finished, `${scenario}: the player must be able to complete the run.`);
  assert(result.recoveries <= 2, `${scenario}: recovery must not repeat indefinitely.`);
  const lanternRecoveries = race.events.filter(event => event.type === 'recovery' && event.pathDistance! > 86 && event.pathDistance! < 138);
  assert.equal(lanternRecoveries.length, 0, `${scenario}: valid driving inside Lantern Quarter must not reset the car.`);
  summary.push({ scenario, seconds: result.finishTime!.toFixed(2), recoveries: result.recoveries });
  race.dispose();
}

// The projection allowance must not accept even a one-metre physical warp.
// Leave it there for several frames to ensure rejection cannot heal itself.
const relocated = new DerbyPhysics();
relocated.reset([DEFAULT_BUILDS[0]], [0], { course: 'bay-or-bust', steeringEnabled: true });
relocated.start();
for (let tick = 0; tick < 30 * 120 && relocated.getSnapshots()[0].pathDistance! < 115; tick++) {
  relocated.setSteering(0, courseSteering(relocated.getSnapshots()[0]));
  relocated.update(1 / 120);
}
const before = relocated.getSnapshots()[0];
assert(before.pathDistance! >= 115);
const body = relocated.world.bodies.find(body => body.mass > 0)!;
body.position.vadd(course.frame(before.pathDistance!).tangent, body.position);
body.aabbNeedsUpdate = true;
for (let tick = 0; tick < 24; tick++) relocated.update(1 / 120);
assert.equal(relocated.getSnapshots()[0].progress, before.progress, 'Physical relocation must not earn progress through the projection allowance.');
for (let tick = 0; tick < 36; tick++) relocated.update(1 / 120);
assert(relocated.getSnapshots()[0].recovering, 'Invalid relocation must still trigger recovery.');
assert(relocated.getSnapshots()[0].progress < before.progress, 'Recovery must return behind the last genuinely reached road.');
relocated.dispose();

console.table(summary);
console.log('Lantern Quarter regression passed: binary arrow controls, both inside lines, lost momentum, complete runs, and physical relocation rejection.');
