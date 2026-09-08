import assert from 'node:assert/strict';
import { Quaternion, Vec3 } from 'cannon-es';
import { DEFAULT_BUILDS } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { DerbyPhysics } from './physics';
import { sessionCourse, heatDeadline, finishWindow, hopPlayer, steeringPlayer, keyboardSteering } from './session-rules';
import { SOLO_RIVALS, type LocalMode } from './solo';
import type { VehicleSnapshot } from './types';

const STEP = 1 / 120;
function advance(race: DerbyPhysics, seconds: number) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) race.update(STEP);
}
function localRace(phoneParty = false) {
  const race = new DerbyPhysics();
  race.reset(DEFAULT_BUILDS, [0, 1], sessionCourse(phoneParty));
  race.start(); advance(race, 4);
  assert(race.getSnapshots().every(state => state.grounded && !state.recovering), 'Both cars must settle on their selected road before the control checks.');
  return race;
}
function lateral(state: VehicleSnapshot) {
  return course.project(state.position, { pathId: state.pathId!, distance: state.pathDistance! }).lateral;
}
function frontSteering(state: VehicleSnapshot) {
  // Tire axle direction ignores tire spin; compare it with the public chassis pose.
  const q = state.quaternion, wheel = state.wheels[0].quaternion;
  const axle = new Quaternion(wheel.x, wheel.y, wheel.z, wheel.w).vmult(new Vec3(1, 0, 0));
  const local = new Quaternion(q.x, q.y, q.z, q.w).conjugate().vmult(axle);
  return Math.atan2(-local.z, local.x);
}
function keyboard(race: DerbyPhysics, mode: LocalMode = 'local') {
  const keys = new Set<string>();
  return {
    keys,
    down(code: string) {
      const steer = steeringPlayer(mode, code), hop = hopPlayer(mode, code);
      if (steer === null && hop === null) return;
      const repeat = keys.has(code); keys.add(code);
      if (steer !== null) race.setSteering(steer, keyboardSteering(mode, steer, keys));
      else if (!repeat && hop !== null) race.setInput(hop, true);
    },
    up(code: string) {
      if (!keys.delete(code)) return;
      const steer = steeringPlayer(mode, code), hop = hopPlayer(mode, code);
      if (steer !== null) race.setSteering(steer, keyboardSteering(mode, steer, keys));
      else if (hop !== null && ![...keys].some(key => hopPlayer(mode, key) === hop)) race.setInput(hop, false);
    },
    clear() { keys.clear(); race.clearInputs(); },
  };
}

assert.deepEqual(sessionCourse(false), { course: 'bay-or-bust', steeringEnabled: true, circuit: true, arcade: true, laps: 3 }, 'Both keyboard modes select the authored steering course.');
assert.deepEqual(sessionCourse(true), { course: 'classic', steeringEnabled: false }, 'Phone parties retain their hop-only course.');
for (const [key, id] of [['KeyA', 0], ['KeyD', 0], ['ArrowLeft', 1], ['ArrowRight', 1]] as const) {
  assert.equal(steeringPlayer('local', key), id, `${key} belongs to the correct local driver.`);
}
assert.equal(hopPlayer('local', 'KeyF'), 0); assert.equal(hopPlayer('local', 'KeyJ'), 1);
assert.equal(hopPlayer('local', 'Space'), null, 'Space must not become an unintended shared local hop.');
for (const key of ['ArrowLeft', 'ArrowRight']) assert.equal(steeringPlayer('solo', key), 0);
for (const key of ['KeyF', 'Space']) assert.equal(hopPlayer('solo', key), 0);
assert.equal(steeringPlayer('solo', 'KeyA'), null); assert.equal(steeringPlayer('solo', 'KeyD'), null);
assert.equal(hopPlayer('solo', 'KeyJ'), null);
assert.equal(keyboardSteering('local', 0, new Set(['KeyA', 'KeyD', 'ArrowRight'])), 0, 'Opposing P1 keys cancel without reading P2 keys.');
assert.equal(keyboardSteering('local', 1, new Set(['KeyD', 'ArrowLeft'])), keyboardSteering('local', 1, new Set(['ArrowLeft'])), 'P1 keys do not alter P2 steering.');
assert.equal(keyboardSteering('local', 2, new Set(['KeyD', 'ArrowRight'])), 0, 'No keyboard input leaks into an absent third player.');

// Differential real simulations prove that one driver's keys move that car only.
const coast = localRace(), p1Turn = localRace(), p2Turn = localRace();
const p1Keys = keyboard(p1Turn), p2Keys = keyboard(p2Turn);
p1Keys.down('KeyD'); p2Keys.down('ArrowLeft');
for (const race of [coast, p1Turn, p2Turn]) advance(race, .65);
const neutral = coast.getSnapshots(), p1 = p1Turn.getSnapshots(), p2 = p2Turn.getSnapshots();
assert.deepEqual(p1.map(state => state.id), [0, 1], 'Local physics has exactly the two requested drivers.');
assert(p1.every(state => state.courseId === 'bay-or-bust' && state.pathId === 'main' && state.wheels.length === 4));
const p1Delta = lateral(p1[0]) - lateral(neutral[0]), p2Delta = lateral(p2[1]) - lateral(neutral[1]);
assert(Math.abs(p1Delta) > .02, `D must physically steer P1 (measured ${p1Delta}m).`);
assert(Math.abs(p2Delta) > .02, `ArrowLeft must physically steer P2 (measured ${p2Delta}m).`);
assert(p1Delta * p2Delta < 0, 'Opposite directional keys must produce opposite road-relative turns; camera-direction calibration is checked at the UI boundary.');
assert.deepEqual(p1[1], neutral[1], 'P1 steering must not change any P2 pose, wheel, hop, or progress state.');
assert.deepEqual(p2[0], neutral[0], 'P2 steering must not change any P1 state.');
for (const race of [coast, p1Turn, p2Turn]) race.dispose();

const mixed = localRace(), keys = keyboard(mixed);
for (const key of ['KeyD', 'KeyF', 'ArrowLeft', 'KeyJ']) keys.down(key);
advance(mixed, .25);
const charged = mixed.getSnapshots();
assert(charged.every(state => state.charge > .15 && state.jumps === 0), 'Both drivers can charge while steering.');
assert(charged.every(state => Math.abs(frontSteering(state)) > .03), 'Both front axles physically steer.');
keys.up('KeyF');
assert.equal(mixed.getSnapshots()[0].jumps, 1, 'Releasing F launches P1.');
assert.equal(mixed.getSnapshots()[1].jumps, 0, 'P1 release cannot launch P2.');
assert(Math.abs(frontSteering(mixed.getSnapshots()[0])) > .03, 'Releasing hop preserves the steering angle.');
keys.up('ArrowLeft'); advance(mixed, .15);
const afterSteeringRelease = mixed.getSnapshots();
assert(afterSteeringRelease[1].charge > charged[1].charge, 'Releasing P2 steering preserves and continues its held hop charge.');
assert(Math.abs(frontSteering(afterSteeringRelease[1])) < .00001, 'Released P2 steering returns its front axle to neutral.');
assert(Math.abs(frontSteering(afterSteeringRelease[0])) > .03, 'P2 steering release leaves P1 steering active.');
keys.up('KeyJ');
assert.deepEqual(mixed.getSnapshots().map(state => state.jumps), [1, 1], 'F and J each release exactly their own charged hop.');
keys.up('KeyJ'); keys.up('KeyF');
assert.deepEqual(mixed.getSnapshots().map(state => state.jumps), [1, 1], 'Duplicate keyup events do not add hops.');
mixed.dispose();

const cleared = localRace(), clearKeys = keyboard(cleared);
for (const key of ['KeyA', 'KeyF', 'ArrowRight', 'KeyJ']) clearKeys.down(key);
advance(cleared, .25); clearKeys.clear(); advance(cleared, .2);
assert.equal(clearKeys.keys.size, 0);
assert(cleared.getSnapshots().every(state => state.charge === 0 && state.jumps === 0 && Math.abs(frontSteering(state)) < .00001), 'Focus/pause clearing neutralizes both controls without treating cancellation as a hop.');
for (const key of ['KeyA', 'KeyF', 'ArrowRight', 'KeyJ']) clearKeys.up(key);
assert(cleared.getSnapshots().every(state => state.jumps === 0), 'Stale releases after clear cannot launch either car.');
cleared.dispose();

const phone = localRace(true);
phone.setSteering(0, 1); phone.setSteering(1, -1); advance(phone, .2);
assert(phone.getSnapshots().every(state => state.courseId === undefined && Math.abs(frontSteering(state)) < .00001), 'Phone fallback stays classic and ignores steering.');
const soloBuilds = [DEFAULT_BUILDS[0], ...SOLO_RIVALS.map(rival => rival.build)];
phone.reset(soloBuilds, [0, 1, 2, 3], sessionCourse(false));
assert.deepEqual(phone.getSnapshots().map(state => state.id), [0, 1, 2, 3], 'Returning to solo restores its four-racer roster.');
assert(phone.getSnapshots().every(state => state.courseId === 'bay-or-bust'));
assert.deepEqual(phone.getSnapshots().map(state => state.blueprint), soloBuilds, 'Mode switching preserves the chosen solo builds.');
phone.dispose();

for (const firstFinish of [null, 0, 20, 55, 88]) {
  assert.equal(heatDeadline('solo', false, firstFinish), 240, 'A fast rival cannot shorten the human solo run.');
  assert.equal(finishWindow('solo', false, firstFinish, 60), null, 'Solo never shows a rival-triggered grace countdown.');
}
assert.equal(heatDeadline('local', false, null), 240);
assert.equal(finishWindow('local', false, null, 85), null);
assert.equal(heatDeadline('local', false, 20), 32, 'Local racers receive 12 seconds after the first finish.');
assert.equal(finishWindow('local', false, 20, 25), 7);
assert.equal(finishWindow('local', false, 20, 33), 0);
assert.equal(heatDeadline('local', false, 235), 240, 'Late local finishes cannot exceed the circuit heat maximum.');
assert.equal(finishWindow('local', false, 235, 237), 3);
assert.equal(heatDeadline('local', true, null), 60);
assert.equal(heatDeadline('local', true, 20), 32);
assert.equal(heatDeadline('solo', true, 55), 60, 'Phone timing wins over any retained local mode flag.');

console.table([{ check: 'P1 D steering', lateralChangeM: p1Delta.toFixed(4) },
  { check: 'P2 ArrowLeft steering', lateralChangeM: p2Delta.toFixed(4) }]);
console.log('Local race checks passed: Bay or Bust for both keyboard modes; two independent physical drivers; A/D/F and arrows/J; isolated hop/steer release; neutral focus clearing; preserved solo controls/roster and classic phones; solo 240 seconds without bot cutoff; local 240-second cap with 12-second finish grace.');
