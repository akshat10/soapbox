import assert from 'node:assert/strict';
import { SnapshotPlayback } from './snapshot-playback';
import type { PartyState } from './party-types';
import type { VehicleSnapshot } from './types';

/** Run with node --import tsx game/snapshot-playback-check.ts. */
function state(elapsed: number, revision: number, changes: Partial<PartyState> = {}, car: Partial<VehicleSnapshot> = {}): PartyState {
  const blueprint = { bodyId: 'sourdough', wheelId: 'scooter', wheelbase: 'standard' } as const;
  const position = { x: 0, y: 1, z: elapsed * 10 };
  const quaternion = { x: 0, y: 0, z: 0, w: 1 };
  const snapshot: VehicleSnapshot = {
    id: 0, blueprint, position, quaternion,
    wheels: [-1, 1, -1, 1].map((x, index) => ({ position: { x, y: 0, z: position.z + (index < 2 ? -1 : 1) }, quaternion })),
    speed: 10, progress: elapsed / 100, charge: .7, grounded: true, recovering: false, finished: false,
    finishTime: null, flips: 0, recoveries: 0, jumps: 0, maxRoll: 0, ...car,
  };
  return { elapsed, revision, stage: 'racing', heat: 1, builds: [blueprint, blueprint], snapshots: [snapshot], racerIds: [0], scores: [0, 0], ready: [true, true], paused: false, countdown: 0, ...changes };
}

function motionCheck(name: string, intervals: number[]) {
  const playback = new SnapshotPlayback();
  let nextArrival = 0, revision = 0, previous = 0, stationary = 0, samples = 0;
  const steps: number[] = [];
  for (let now = 0; now <= 6_000; now += 1000 / 60) {
    while (nextArrival <= now + .001) {
      playback.push(state(nextArrival / 1000, revision++), nextArrival);
      nextArrival += intervals[(revision - 1) % intervals.length];
    }
    const snapshot = playback.sample(now)[0];
    assert.equal(snapshot.charge, .7, `${name}: never interpolate authoritative charge`);
    if (now > 1_000) {
      const step = snapshot.position.z - previous;
      assert.ok(step >= -1e-8, `${name}: playback moved backwards by ${step}`);
      if (step < .00001) stationary++;
      steps.push(step);
      samples++;
    }
    previous = snapshot.position.z;
  }
  assert.equal(stationary, 0, `${name}: repeating fixed-duration blend stalls remain`);
  assert.ok(Math.max(...steps) < .3, `${name}: packet arrival caused a position jump`);
  assert.ok(samples > 250);
  console.log(`${name}: ${samples} moving frames, no stop-start gaps; adaptive delay ${Math.round(playback.delayMs)} ms.`);
}

motionCheck('30 Hz direct', [1000 / 30]);
motionCheck('200 ms relay', [200]);
motionCheck('100–300 ms jittering relay', [200, 300, 100, 250, 150]);

const delayed = new SnapshotPlayback();
const delays = [0, 50, 0, 90, 10, 60];
let nextPacket = 0, lastPosition = 0;
for (let now = 0; now <= 6_000; now += 1000 / 60) {
  while (nextPacket * 200 + delays[nextPacket % delays.length] <= now + .001) {
    const arrival = nextPacket * 200 + delays[nextPacket % delays.length];
    delayed.push(state(nextPacket * .2, nextPacket), arrival);
    nextPacket++;
  }
  const position = delayed.sample(now)[0].position.z;
  if (now > 1_000) {
    assert.ok(position > lastPosition, 'independent network delay cannot produce repeating stalls or reverse movement');
    assert.ok(position - lastPosition < .3, 'delayed packet arrival cannot jump the render clock');
  }
  lastPosition = position;
}

const crew = new SnapshotPlayback();
const solo = new SnapshotPlayback();
let crewRevision = 0;
for (let now = 0; now <= 2_000; now += 1000 / 60) {
  if (Math.round(now / (1000 / 60)) % 12 === 0) {
    const own = state(now / 1000, crewRevision++);
    const other = { ...own.snapshots[0], id: 1 as const, recovering: now >= 1_000 && now < 1_200,
      recoveries: now >= 1_000 ? 1 : 0, position: { x: 3, y: 1, z: now >= 1_000 ? 100 : now / 100 } };
    solo.push(own, now);
    crew.push({ ...own, snapshots: [...own.snapshots, other], racerIds: [0, 1] }, now);
  }
  const soloPose = solo.sample(now)[0].position.z;
  const crewPose = crew.sample(now)[0].position.z;
  assert.equal(crewPose, soloPose, 'another racer recovering/teleporting cannot reset your playback');
}

const playback = new SnapshotPlayback();
playback.push(state(0, 0), 0);
playback.push(state(.2, 1), 200);
for (let now = 200; now < 2_000; now += 16) playback.sample(now);
assert.ok(playback.sample(2_000)[0].position.z <= 3.2 + 1e-8, 'prediction must stop at 120 ms');
assert.equal(playback.sample(20_000)[0].position.z, playback.sample(2_000)[0].position.z, 'no endless movement after a lost connection');

playback.push(state(.4, 2, { paused: true }), 21_000);
assert.equal(playback.sample(22_000)[0].position.z, 4, 'pause snaps to the authoritative pose');
playback.push(state(.4, 3), 23_000);
assert.equal(playback.sample(23_000)[0].position.z, 4, 'resume does not blend across the pause');
playback.push(state(.5, 4), 23_100);
playback.push(state(.6, 5, {}, { recovering: true, position: { x: 0, y: 1, z: 35 } }), 23_200);
assert.equal(playback.sample(23_200)[0].position.z, 35, 'recovery must snap immediately');
playback.push(state(.7, 6, {}, { recoveries: 1 }), 23_300);
assert.equal(playback.sample(23_300)[0].position.z, 7, 'end of recovery must snap');
playback.push(state(.8, 7, {}, { recoveries: 1, position: { x: 0, y: 1, z: 200 } }), 23_400);
assert.equal(playback.sample(23_400)[0].position.z, 200, 'teleport must not blend across the track');
playback.push(state(0, 8, { heat: 2, stage: 'garage' }), 23_500);
assert.equal(playback.sample(23_500)[0].position.z, 0, 'new heat clears prior poses');
playback.push(state(.9, 7, { heat: 1 }), 23_600);
assert.equal(playback.sample(23_600)[0].position.z, 0, 'stale prior-heat revision cannot rewind state');
playback.push(state(0, 9, { heat: 2, stage: 'countdown' }), 23_700);
playback.push(state(0, 10, { heat: 2 }), 23_800);
playback.push(state(.2, 11, { heat: 2 }), 24_000);
playback.push(state(.1, 12, { heat: 2 }, { charge: .1 }), 24_100);
assert.equal(playback.sample(24_200)[0].charge, .7);
assert.ok(playback.sample(24_200)[0].position.z >= 1, 'older simulation time must not be accepted');

const airborne = new SnapshotPlayback();
airborne.push(state(0, 0, {}, { grounded: false, jumps: 1 }), 0);
airborne.push(state(.2, 1, {}, { grounded: false, jumps: 1, position: { x: 0, y: 5, z: 2 } }), 200);
for (let now = 200; now <= 2_000; now += 16) airborne.sample(now);
assert.deepEqual(airborne.sample(3_000)[0].position, { x: 0, y: 5, z: 2 }, 'prediction cannot manufacture airborne movement');

const rotation = new SnapshotPlayback();
rotation.push(state(0, 0, {}, { quaternion: { x: 0, y: 0, z: 0, w: 2 } }), 0);
rotation.push(state(.2, 1, {}, { quaternion: { x: 0, y: -2, z: 0, w: 0 }, charge: .9, jumps: 3 }), 200);
const midpoint = rotation.sample(250)[0];
assert.ok(Math.abs(Math.hypot(...Object.values(midpoint.quaternion)) - 1) < 1e-9, 'interpolated quaternion is normalized');
assert.equal(midpoint.jumps, 3, 'jump count is authoritative, never delayed');
assert.equal(midpoint.charge, .9, 'charge is authoritative, never delayed');
const originalPosition = midpoint.position.z;
rotation.push(state(.3, 2), 150);
assert.equal(rotation.sample(250)[0].position.z, originalPosition, 'backwards arrival timestamp is rejected');

console.log('Snapshot playback checks passed: continuous direct/relay motion, adaptive delay, stale-frame rejection, pause/heat/recovery/teleport snaps, bounded ground prediction, no invented airborne movement, normalized rotations, authoritative HUD values.');
