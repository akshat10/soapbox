import assert from 'node:assert/strict';
import { DerbyPhysics } from './physics';
import { DEFAULT_BUILDS, isLegalBuild } from './catalogue';
import { SOLO_RIVALS, SoloRaceDriver, aiHopHeld } from './solo';
import { heatPoints, PLAYER_IDS, racePlace } from './race';
import type { VehicleSnapshot } from './types';

const outcomes = (snapshots: VehicleSnapshot[]) => snapshots.map(({ id, finished, finishTime, progress, jumps, recoveries, blueprint }) => ({ id, finished, finishTime, progress, jumps, recoveries, blueprint }));

function race(heat: number, hz: number, timed: boolean) {
  const physics = new DerbyPhysics(), driver = new SoloRaceDriver();
  const builds = [{ ...DEFAULT_BUILDS[0] }, ...SOLO_RIVALS.slice(0,3).map(rival => ({ ...rival.build }))];
  assert(builds.every(isLegalBuild));
  physics.reset(builds, PLAYER_IDS); physics.start();
  let elapsed = 0;
  for (let frame = 0; frame < hz * 60; frame++) {
    const human = physics.getSnapshots()[0];
    physics.setInput(0, timed && ((human.position.z > 74 && human.position.z < 83.5) || (human.position.z > 213 && human.position.z < 226)));
    elapsed += driver.update(physics, 1 / hz, heat);
    if (physics.getSnapshots().every(snapshot => snapshot.finished)) break;
  }
  const snapshots = physics.getSnapshots();
  assert(snapshots.every(snapshot => snapshot.finished && snapshot.finishTime! < 40), 'Every racer completes a full race.');
  assert(snapshots.every(snapshot => Number.isFinite(snapshot.position.y) && Number.isFinite(snapshot.position.z)));
  assert.deepEqual(snapshots.map(snapshot => snapshot.blueprint), builds, 'AI never changes a build.');
  assert(snapshots.slice(1).every(snapshot => snapshot.jumps === 2 && snapshot.recoveries === 0), 'Rivals use two real timed hops without recovery.');
  assert.equal(racePlace(snapshots[0], snapshots), timed ? 1 : 4, 'Well-timed starter controls win; coasting loses.');
  assert.equal(snapshots[0].jumps, timed ? 2 : 0, 'AI must never control the human.');
  assert.equal(heatPoints(snapshots).reduce((sum, points) => sum + points, 0), 11, 'Solo uses normal championship awards.');
  assert(elapsed > 30 && elapsed < 40);
  const frozen = snapshots.map(snapshot => ({ ...snapshot }));
  driver.update(physics, 0, heat);
  assert.deepEqual(physics.getSnapshots(), frozen, 'No race advances during a pause.');
  assert(snapshots.every(snapshot => !aiHopHeld({ ...snapshot, recovering: true }, heat)));
  physics.dispose();
  return snapshots;
}
const summary: object[] = [];
for (const heat of [1, 2, 3]) {
  const reference = race(heat, 120, true);
  for (const hz of [30, 60, 120]) {
    const timed = race(heat, hz, true), coast = race(heat, hz, false);
    assert.deepEqual(outcomes(timed.slice(1)), outcomes(reference.slice(1)), 'AI results are identical across rendering frame rates.');
    assert.deepEqual(outcomes(coast.slice(1)), outcomes(reference.slice(1)), 'Rivals do not cheat in response to the human.');
    summary.push({ heat, hz, human: timed[0].finishTime?.toFixed(3), rivals: timed.slice(1).map(snapshot => snapshot.finishTime?.toFixed(3)).join(', '), coast: coast[0].finishTime?.toFixed(3) });
  }
}
assert.deepEqual(race(1, 60, true), race(1, 60, true), 'Replays are deterministic.');
const physics = new DerbyPhysics(), driver = new SoloRaceDriver();
physics.reset([{ ...DEFAULT_BUILDS[0] }, ...SOLO_RIVALS.slice(0,3).map(rival => ({ ...rival.build }))], PLAYER_IDS); physics.start();
driver.update(physics, 1 / 240, 1); driver.reset();
const before = physics.getSnapshots();
assert.equal(driver.update(physics, 1 / 240, 2), 0, 'A rematch clears fractional time from the prior heat.');
assert.deepEqual(physics.getSnapshots(), before);
physics.dispose();
console.table(summary);
console.log('Solo checks passed: all heats, legal rivals, human control isolation, real hop timing, beatable starter balance, standard scoring, deterministic AI at 30/60/120 Hz, pause, and rematch reset.');
