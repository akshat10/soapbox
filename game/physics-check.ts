import assert from 'node:assert/strict';
import { BODIES, DEFAULT_BUILDS, isLegalBuild, WHEELS } from './catalogue';
import { DerbyPhysics, RECOVERY_SECONDS } from './physics';
import { LANE_CENTERS } from './track';
import type { Blueprint, VehicleSnapshot } from './types';

function advance(physics: DerbyPhysics, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 120); i++) physics.update(1 / 120);
}

const physics = new DerbyPhysics();
physics.reset([DEFAULT_BUILDS[0], DEFAULT_BUILDS[0]]);
physics.start();
advance(physics, 2);
let snapshots = physics.getSnapshots();
assert(snapshots.every((s) => s.position.z > 0.2), 'Gravity should start both vehicles rolling.');
assert(Math.abs(snapshots[0].position.z - snapshots[1].position.z) < 0.001, 'Identical builds should share lane conditions.');
assert(snapshots.every((s) => s.grounded), 'Opening slope should provide reliable ground contact.');
physics.setInput(0, true);
physics.setInput(1, true);
advance(physics, 1.2);
snapshots = physics.getSnapshots();
assert(snapshots.every((s) => s.charge > 0.99 && s.charge <= 1), 'Both players charge independently and cap at one.');
physics.cancelInput(0);
snapshots = physics.getSnapshots();
assert.equal(snapshots[0].charge, 0, 'A canceled touch clears that player.');
assert.equal(snapshots[0].jumps, 0, 'A canceled touch must not launch.');
assert(snapshots[1].charge > 0.99, 'Canceling one touch must preserve the other player charge.');
physics.clearInputs();
assert(physics.getSnapshots().every((s) => s.charge === 0 && s.jumps === 0), 'Focus clear must not launch.');
physics.setInput(0, true);
advance(physics, 0.8);
physics.setInput(0, false);
snapshots = physics.getSnapshots();
assert.equal(snapshots[0].jumps, 1, 'A charged grounded release should hop.');
assert.equal(snapshots[1].jumps, 0, 'One player release must not trigger the other.');
assert.equal(snapshots[0].charge, 0);
advance(physics, 0.1);
physics.setInput(0, true);
advance(physics, 0.1);
physics.setInput(0, false);
assert.equal(physics.getSnapshots()[0].jumps, 1, 'Airborne presses must not create additional hops.');
assert(physics.getSnapshots().every((s) => s.wheels.length === 4), 'Vehicles should have four physical support wheels.');
physics.dispose();

// A phone press and release can arrive between the same two simulation frames.
const quickTap = new DerbyPhysics();
const fourBuilds = Array.from({ length: 4 }, () => ({ ...DEFAULT_BUILDS[0] }));
quickTap.reset(fourBuilds, [0, 3]);
assert.deepEqual(quickTap.getSnapshots().map(s => s.id), [0, 3], 'Sparse IDs must not create phantom racers or renumber player four.');
quickTap.start();
advance(quickTap, 2);
assert(quickTap.getSnapshots().every(s => s.grounded), 'Same-frame tap regression begins on the opening ground.');
const beforeTap = quickTap.getSnapshots().find(s => s.id === 3)!;
quickTap.setInput(3, true);
quickTap.setInput(3, false);
let tapped = quickTap.getSnapshots().find(s => s.id === 3)!;
assert.equal(tapped.jumps, 1, 'A grounded press/release within one frame must produce one small hop.');
assert(!tapped.grounded && tapped.charge === 0, 'The tap immediately consumes its charge and marks the racer airborne.');
quickTap.setInput(3, false);
quickTap.setInput(3, true);
quickTap.setInput(3, false);
assert.equal(quickTap.getSnapshots().find(s => s.id === 3)!.jumps, 1, 'Duplicate releases and airborne repeat taps must not launch twice.');
quickTap.setInput(1, true);
quickTap.setInput(1, false);
assert.equal(quickTap.getSnapshots().length, 2, 'Inputs for an unoccupied slot must stay harmless.');
advance(quickTap, 0.1);
tapped = quickTap.getSnapshots().find(s => s.id === 3)!;
assert(tapped.position.y > beforeTap.position.y + 0.05, 'The same-frame tap must impart real upward motion, not only increment a counter.');
assert.equal(quickTap.getSnapshots().find(s => s.id === 0)!.jumps, 0, 'Player four tapping cannot launch player one.');
quickTap.reset(fourBuilds, [3]);
assert.deepEqual(quickTap.getSnapshots().map(s => s.id), [3], 'Reset must remove players that have left the room.');
assert.equal(quickTap.getSnapshots()[0].jumps, 0, 'Reset clears the previous heat jump count.');
quickTap.dispose();

type Pattern = 'timed' | 'coast' | 'maximum spam' | 'rapid taps';

function runRace(builds: Blueprint[], pattern: Pattern): VehicleSnapshot[] {
  const race = new DerbyPhysics();
  race.reset(builds);
  race.start();
  for (let frame = 0; frame < 60 * 120; frame++) {
    for (const state of race.getSnapshots()) {
      const z = state.position.z;
      const held = pattern === 'timed'
        ? (z > 74 && z < 83.5) || (z > 213 && z < 226)
        : pattern === 'maximum spam'
          ? state.charge < 0.99
          : pattern === 'rapid taps'
            ? Math.floor(frame / 12) % 2 === 0
            : false;
      race.setInput(state.id, held);
    }
    race.update(1 / 120);
    if (race.getSnapshots().every((s) => s.finished)) break;
  }
  const result = race.getSnapshots();
  assert(result.every((s) => Number.isFinite(s.position.y) && Number.isFinite(s.position.z)), 'Physics must stay finite.');
  race.dispose();
  return result;
}

const starterSummary: object[] = [];
for (const body of BODIES) {
  const [result] = runRace([{ bodyId: body.id, wheelId: 'standard', wheelbase: 'standard' }], 'timed');
  assert(result.finished && result.finishTime !== null && result.finishTime >= 30 && result.finishTime < 35,
    `${body.name} should complete the demonstrated timed-hop run in approximately 32–34 seconds.`);
  assert.equal(result.recoveries, 0, `${body.name} should have a clean viable starter configuration.`);
  starterSummary.push({ body: body.name, seconds: result.finishTime.toFixed(2), jumps: result.jumps, recoveries: result.recoveries });
}

const score = (s: VehicleSnapshot) => s.finishTime ?? 60 + (1 - s.progress) * 60;
const timed = runRace(DEFAULT_BUILDS, 'timed');
const patternSummary: object[] = [];
for (const pattern of ['timed', 'coast', 'maximum spam', 'rapid taps'] as const) {
  const results = pattern === 'timed' ? timed : runRace(DEFAULT_BUILDS, pattern);
  if (pattern !== 'timed') {
    results.forEach((result, id) => assert(score(timed[id]) < score(result), `Deliberate timing should outperform ${pattern} for player ${id + 1}.`));
  }
  for (const result of results) patternSummary.push({ pattern, player: result.id + 1, seconds: result.finishTime?.toFixed(2) ?? 'timeout', progress: Math.round(result.progress * 100) + '%', jumps: result.jumps, recoveries: result.recoveries });
}

const identical = runRace(fourBuilds, 'timed');
assert.equal(identical.length, 4, 'All four race slots must be simulated.');
assert(identical.every((s) => s.finished), 'Identical builds should finish all four lanes.');
for (const result of identical) {
  assert(Math.abs(result.finishTime! - identical[0].finishTime!) < 0.02, 'Identical builds and inputs should receive equivalent full-course results across all four lanes.');
  assert(Math.abs(result.position.x - LANE_CENTERS[result.id]) < 0.01, 'Each racer should remain in the lane corresponding to their stable player ID.');
  assert.equal(result.recoveries, 0, 'The timed reference run should clear every lane without recovery.');
}

const recovery = new DerbyPhysics();
recovery.reset([DEFAULT_BUILDS[0]]);
recovery.start();
advance(recovery, 12);
recovery.setInput(0, true);
advance(recovery, 0.3);
const beforeCrash = recovery.getSnapshots()[0];
const chassis = recovery.world.bodies.find((body) => body.mass > 0)!;
chassis.position.y -= 20;
recovery.update(1 / 120);
let recovered = recovery.getSnapshots()[0];
assert(recovered.recovering && recovered.recoveries === 1, 'Falling away from the track should initiate one recovery.');
assert.equal(recovered.charge, 0, 'Recovery must discard stored spring charge.');
advance(recovery, RECOVERY_SECONDS - 0.1);
assert(recovery.getSnapshots()[0].recovering, 'Recovery must apply its visible time cost.');
advance(recovery, 0.2);
recovered = recovery.getSnapshots()[0];
assert(!recovered.recovering && recovered.progress < beforeCrash.progress, 'Recovery must return behind previous progress.');
assert.deepEqual(recovered.blueprint, beforeCrash.blueprint, 'Recovery must preserve the selected build.');
assert.equal(recovered.jumps, beforeCrash.jumps, 'Recovery must not accidentally launch.');
recovery.dispose();

for (const body of BODIES) assert(WHEELS.some((wheel) => isLegalBuild({ bodyId: body.id, wheelId: wheel.id, wheelbase: 'standard' })), `${body.name} needs an affordable configuration.`);
console.log(`Physics checks passed: gravity, charge cap, independent input/cancel, same-frame phone taps, sparse racer IDs/reset, safe focus clear, airborne lock, four wheels, four-lane full-course fairness, recovery without progress gain, all ${BODIES.length} viable starters, and intentional timing over coasting/tapping/spam.`);
console.table(starterSummary);
console.table(patternSummary);
console.log('These repeatable input patterns verify prototype behavior; they do not prove exhaustive catalogue balance or human game feel.');
