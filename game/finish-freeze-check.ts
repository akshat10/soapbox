import assert from 'node:assert/strict';
import { DEFAULT_BUILDS } from './catalogue';
import { heatPoints } from './race';
import { FINISH_Z, START_Z, TRACK_PIECES, groundHeight } from './track';

import { DerbyPhysics } from './physics';
const race = new DerbyPhysics();
race.reset(DEFAULT_BUILDS);
const bodies = race.world.bodies.filter(body => body.mass > 0).sort((a, b) => a.position.x - b.position.x);
assert.equal(bodies.length, 2);
const winner = bodies[0];
// Begin one physical crossing near the line so the second racer can continue
// through the full twelve-second finish window from the opening hill.
const z = FINISH_Z - 0.12;
winner.position.y += groundHeight(z) - groundHeight(START_Z);
winner.position.z = z;
winner.velocity.set(0, -0.072 * 12, 12);
winner.aabbNeedsUpdate = true;
race.start();
for (let frame = 0; frame < 120 && !race.getSnapshots()[0].finished; frame++) race.update(1 / 120);
const finished = race.getSnapshots()[0];
assert(finished.finished && finished.finishTime !== null, 'The first racer must physically cross the finish line.');
const score = heatPoints(race.getSnapshots());
const runnerStart = race.getSnapshots()[1].position.z;
const frozenBody = { position: winner.position.clone(), quaternion: winner.quaternion.clone() };

assert.equal(finished.speed, 0, 'Crossing must stop the winner immediately.');
for (let frame = 0; frame < 12 * 120; frame++) {
  // Stale, duplicated, and new phone input after finishing cannot launch it.
  race.setInput(0, frame % 24 < 12);
  if (frame % 37 === 0) race.cancelInput(0);
  race.update(1 / 120);
  const snapshots = race.getSnapshots();
  assert.deepEqual(snapshots[0], finished, `Finished chassis, wheels, speed and result must remain exact at post-finish frame ${frame}.`);
  assert.deepEqual(winner.position, frozenBody.position);
  assert.deepEqual(winner.quaternion, frozenBody.quaternion);
  assert.equal(winner.velocity.length(), 0);
  assert.equal(winner.angularVelocity.length(), 0);
  assert.equal(winner.force.length(), 0);
  assert.equal(winner.torque.length(), 0);
  assert.deepEqual(heatPoints(snapshots), score, 'Finish freeze cannot change scoring.');
  assert.equal(snapshots[1].finished, false, 'The other racer remains in the active heat throughout this finish window.');
}
const runner = race.getSnapshots()[1];
assert(runner.position.z > runnerStart + 20 && runner.speed > 0, 'Freezing a winner must not stop the world or another racer.');
assert.equal(race.events.filter(event => event.playerId === 0 && event.type === 'finish').length, 1);
assert.equal(race.events.filter(event => event.playerId === 0 && event.time > finished.finishTime! + 0.001).length, 0, 'Finished racers cannot accumulate landing, collision, jump, or recovery events.');

race.reset(DEFAULT_BUILDS, [0]);
assert.equal(race.world.bodies.length, TRACK_PIECES.length + 2, 'Reset must remove finished and active bodies and leave one fresh vehicle/anchor.');
assert.equal(race.world.constraints.length, 1);
assert.equal(race.getSnapshots()[0].finished, false);
race.start();
for (let frame = 0; frame < 3 * 120; frame++) race.update(1 / 120);
assert(race.getSnapshots()[0].position.z > START_Z + 0.2, 'The next heat must still roll normally after a frozen finish.');
race.dispose();
assert.equal(race.world.bodies.length, 0);
assert.equal(race.world.constraints.length, 0);
console.log('Finish freeze passed: exact chassis/wheel poses and zero motion for 12 seconds, stale phone inputs harmless, finish time/points unchanged, rival keeps racing, one finish event, reset/replay/disposal clean.');
