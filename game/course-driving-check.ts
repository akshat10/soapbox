import assert from 'node:assert/strict';
import { DEFAULT_BUILDS, wheelMounts } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { DerbyPhysics } from './physics';
import type { Blueprint } from './types';

// Test-only steering driver. Production has no road-following AI, yaw correction,
// or lateral correction: all turns below use the same public control as a phone.
const builds: Blueprint[] = [DEFAULT_BUILDS[0], DEFAULT_BUILDS[1],
  { bodyId: 'painted_porch', wheelId: 'scooter', wheelbase: 'standard' }, DEFAULT_BUILDS[0]];
const summary = [];
for (const pattern of ['no hops', 'controlled hops', 'late hops'] as const) {
  const race = new DerbyPhysics();
  race.reset(builds, [0, 1, 2, 3], { course: 'bay-or-bust', steeringEnabled: true });
  const bodies = race.world.bodies.filter(body => body.mass > 0);
  const wheelbases = builds.map(build => Math.abs(wheelMounts(build)[0][2] - wheelMounts(build)[2][2]));
  race.start();
  for (let frame = 0; frame < 90 * 120; frame++) {
    for (const state of race.getSnapshots()) {
      if (state.finished) continue;
      const body = bodies[state.id], speed = Math.hypot(body.velocity.x, body.velocity.z);
      const distance = state.pathDistance!, length = wheelbases[state.id];
      const target = course.frame(distance + Math.max(4, speed * .6));
      const local = body.pointToLocalFrame(target.position);
      const cap = Math.atan(length / (8 + .2 * Math.min(speed, 10)));
      race.setSteering(state.id, Math.atan2(2 * length * local.x, local.x ** 2 + local.z ** 2) / cap);
      const offset = pattern === 'late hops' ? 2 : 0;
      const releases = [168.88931332 + offset, 396.74173108 + offset];
      race.setInput(state.id, pattern !== 'no hops' && releases.some(release => distance > release - speed * .65 && distance < release));
    }
    race.update(1 / 120);
    if (race.getSnapshots().every(state => state.finished)) break;
  }
  const results = race.getSnapshots();
  for (const state of results) {
    assert(state.finished && state.finishTime! < 75, `${pattern} P${state.id + 1}: should finish the full road with ordinary physical controls.`);
    assert(state.recoveries <= 3, `${pattern} P${state.id + 1}: should not get trapped in repeated recoveries.`);
    assert(Object.values(state.position).every(Number.isFinite));
    summary.push({ pattern, player: state.id + 1, body: state.blueprint.bodyId, seconds: state.finishTime!.toFixed(2), recoveries: state.recoveries });
  }
  const events = race.events.length;
  for (let frame = 0; frame < 12 * 120; frame++) race.update(1 / 120);
  race.getSnapshots().forEach((state, i) => {
    const previous = results[i].position;
    assert(Math.hypot(state.position.x - previous.x, state.position.y - previous.y, state.position.z - previous.z) < 1e-9,
      'Finished racers must stay visible in their winning pose throughout the finish window.');
    assert.equal(state.finishTime, results[i].finishTime);
    assert.equal(state.speed, 0);
  });
  assert.equal(race.events.length, events, 'The finish window must not generate new crashes or landings for finished racers.');
  race.dispose();
}
console.table(summary);
console.log('Full-course driving checks passed: four physical racers, road-following control, controlled and late hops, bounded recoveries, and stable finished poses. This is a simulation driver, not a substitute for human phone playtesting.');
