import assert from 'node:assert/strict';
import { RaycastResult, Vec3 } from 'cannon-es';
import { DerbyPhysics } from './physics';
import { DEFAULT_BUILDS, isLegalBuild } from './catalogue';
import { SOLO_RIVALS, SoloRaceDriver, aiHopHeld, courseHopHeld, courseSteering } from './solo';
import { PLAYER_IDS, racePlace, heatPoints } from './race';
import { BAY_OR_BUST_COURSE as course } from './course';
import type { PlayerId, VehicleSnapshot } from './types';

// Keep this four-car authored-road fixture explicit when the solo roster grows.
// Use powered handling, as the playable solo mode does; circuit-check covers laps.
const builds = PLAYER_IDS.map(id => ({ ...(id === 0 ? DEFAULT_BUILDS[0] : SOLO_RIVALS.find(rival => rival.id === id)!.build) }));
assert(builds.every(isLegalBuild));
const outcomes = (snapshots: VehicleSnapshot[]) => snapshots.map(({ id, finishTime, jumps, recoveries, progress }) => ({ id, finishTime, jumps, recoveries, progress }));

/** Test-only manual driver runs at the same fixed cadence as the real AI.
 * Outer render frames must not change the human input history: now that cars
 * collide, different manual input can legitimately change every racer's result. */
class ControlledRace extends DerbyPhysics {
  private humanInput = false;
  constructor(readonly controls: 'timed' | 'coast' | 'idle') { super(); }
  override setInput(id: PlayerId, held: boolean): void {
    assert(id !== 0 || this.humanInput, 'The AI must never send hop input to the human.');
    super.setInput(id, held);
  }
  override setSteering(id: PlayerId, value: number): void {
    assert(id !== 0 || this.humanInput, 'The AI must never send steering input to the human.');
    super.setSteering(id, value);
  }
  override update(dt: number): void {
    if (this.controls !== 'idle' && dt > 0) {
      const human = this.getSnapshots()[0];
      this.humanInput = true;
      try {
        this.setSteering(0, courseSteering(human));
        this.setInput(0, this.controls === 'timed' && courseHopHeld(human));
      } finally { this.humanInput = false; }
    }
    super.update(dt);
  }
}
function run(hz: number, controls: 'timed' | 'coast') {
  const physics = new ControlledRace(controls), driver = new SoloRaceDriver();
  physics.reset(builds, PLAYER_IDS, { course: 'bay-or-bust', steeringEnabled: true, arcade: true }); physics.start();
  for (let tick = 0; tick < hz * 90; tick++) {
    driver.update(physics, 1 / hz, 1);
    if (physics.getSnapshots().every(snapshot => snapshot.finished)) break;
  }
  const snapshots = physics.getSnapshots();
  assert(snapshots.every(snapshot => snapshot.finished && snapshot.finishTime! < 90), 'Manual and AI racers must finish despite ordinary physical contact.');
  assert(snapshots.every(snapshot => snapshot.recoveries <= 3), 'Collisions may cause a recovery, but must not trap a racer in a loop.');
  assert(snapshots.slice(1).every(snapshot => snapshot.jumps > 0), 'AI racers still use real hop inputs.');
  assert(snapshots.every(snapshot => Object.values(snapshot.position).every(Number.isFinite)));
  assert.deepEqual(snapshots.map(snapshot => snapshot.blueprint), builds, 'The AI cannot change garage builds.');
  assert.equal(snapshots[0].jumps > 0, controls === 'timed', 'Only the manual test driver decides whether the human hops.');
  const points = heatPoints(snapshots);
  assert.equal(points.reduce((a, b) => a + b, 0), 11, 'Physical contact does not change the normal four-racer points pool.');
  for (const a of snapshots) for (const b of snapshots) {
    if (racePlace(a, snapshots) < racePlace(b, snapshots)) assert(points[a.id] > points[b.id], 'Finishing order and awards must agree.');
  }
  const paused = physics.getSnapshots(); driver.update(physics, 0, 1);
  assert.deepEqual(physics.getSnapshots(), paused, 'A paused race cannot advance.');
  physics.clearInputs(); physics.reset(builds, [0, 1], { course: 'classic', steeringEnabled: false });
  assert(physics.getSnapshots().every(snapshot => snapshot.courseId === undefined && snapshot.jumps === 0), 'Classic reset must clear course and prior heat inputs.');
  physics.dispose(); return snapshots;
}
const reference = run(120, 'timed'), summary = [];
for (const hz of [30, 60]) {
  const result = run(hz, 'timed');
  assert.deepEqual(outcomes(result), outcomes(reference), 'Identical fixed-step inputs, including car contact, must replay identically across rendering rates.');
  summary.push({ hz, times: result.map(snapshot => snapshot.finishTime?.toFixed(2)).join(', '), recoveries: result.map(snapshot => snapshot.recoveries).join(', ') });
}
summary.push({ hz: 120, times: reference.map(snapshot => snapshot.finishTime?.toFixed(2)).join(', '), recoveries: reference.map(snapshot => snapshot.recoveries).join(', ') });
run(120, 'coast'); // Different human trajectories may now change the rivals too.

// Directly observe the AI's public inputs, without inferring control ownership
// from where a collision, downhill slope, or track boundary carries a car.
const fixture = new ControlledRace('idle');
fixture.reset(builds, PLAYER_IDS, { course: 'bay-or-bust', steeringEnabled: true, arcade: true }); fixture.start();
const driver = new SoloRaceDriver(), steer = fixture.setSteering.bind(fixture), hop = fixture.setInput.bind(fixture);
const calls = new Set<PlayerId>();
fixture.setSteering = (id, value) => {
  assert.notEqual(id, 0); calls.add(id);
  assert(Number.isFinite(value) && Math.abs(value) <= 1, 'AI steering must use normalized public input.');
  assert.equal(value, courseSteering(fixture.getSnapshots().find(snapshot => snapshot.id === id)!));
  steer(id, value);
};
fixture.setInput = (id, held) => {
  assert.notEqual(id, 0); calls.add(id);
  assert.equal(held, aiHopHeld(fixture.getSnapshots().find(snapshot => snapshot.id === id)!, 1));
  hop(id, held);
};
for (let tick = 0; tick < 120; tick++) driver.update(fixture, 1 / 120, 1);
assert.deepEqual([...calls].sort((a, b) => a - b), [1, 2, 3]);
assert.equal(fixture.getSnapshots()[0].jumps, 0);
for (const snapshot of fixture.getSnapshots()) {
  assert.equal(aiHopHeld({ ...snapshot, recovering: true }), false);
  assert.equal(aiHopHeld({ ...snapshot, finished: true }), false);
  assert.equal(courseSteering({ ...snapshot, recovering: true }), 0);
  assert.equal(courseSteering({ ...snapshot, finished: true }), 0);
}
const untouched = fixture.getSnapshots();
function commands(snapshots: VehicleSnapshot[]) {
  const transcript: unknown[][] = [];
  const ai = new SoloRaceDriver();
  // The same observed rival poses must produce the same public commands,
  // regardless of a separate change to the human's observed pose or placing.
  const observed = {
    getSnapshots: () => snapshots,
    setSteering: (id: PlayerId, value: number) => transcript.push(['steer', id, value]),
    setInput: (id: PlayerId, held: boolean) => transcript.push(['hop', id, held]),
    update: (dt: number) => { assert.equal(dt, 1 / 120); transcript.push(['step', dt]); },
  } as unknown as DerbyPhysics;
  ai.update(observed, 1 / 30, 1);
  return transcript;
}
const observed = structuredClone(untouched);
observed[1].finished = true; observed[2].recovering = true;
const beforeCommands = structuredClone(observed), expectedCommands = commands(observed);
const changedHuman = observed.map(snapshot => snapshot.id === 0 ? { ...snapshot, finished: true, progress: 1, position: { x: 1000, y: 100, z: 1000 } } : snapshot);
assert.deepEqual(commands(changedHuman), expectedCommands, 'With identical rival observations, the AI cannot change commands based on the human.');
assert.deepEqual(observed, beforeCommands, 'The AI must not mutate observed snapshots or builds.');
assert(expectedCommands.filter(([kind, id]) => kind === 'steer' && (id === 1 || id === 2)).every(([, , value]) => value === 0));
assert(expectedCommands.filter(([kind, id]) => kind === 'hop' && (id === 1 || id === 2)).every(([, , held]) => held === false));
const fractional = new SoloRaceDriver();
fractional.update(fixture, 1 / 240, 1); fractional.reset(); fractional.update(fixture, 1 / 240, 2);
assert.deepEqual(fixture.getSnapshots(), untouched, 'Rematch reset must discard fractional time from the previous heat.');
fixture.dispose();
assert(course.finishDistance > 420 && course.paths.length === 1);

// Chassis contact is intentional; suspension rays must still ignore rivals.
const rayFixture = new DerbyPhysics(); rayFixture.reset([DEFAULT_BUILDS[0], DEFAULT_BUILDS[0]], [0, 1]);
const cars = rayFixture.world.bodies.filter(body => body.mass > 0), target = cars[1];
assert(cars.every(car => (car.collisionFilterMask & target.collisionFilterGroup) !== 0), 'Racer bodies must participate in car-to-car contact.');
target.position.copy(cars[0].position); target.position.y += 2; target.aabbNeedsUpdate = true; rayFixture.world.broadphase.dirty = true;
const hit = new RaycastResult(); rayFixture.world.rayTest(new Vec3(target.position.x, target.position.y + 5, target.position.z), new Vec3(target.position.x, target.position.y - 15, target.position.z), hit);
assert(hit.hasHit && hit.body?.mass === 0, 'Suspension support rays must ignore other racers and hit the actual road.'); rayFixture.dispose();
console.table(summary);
console.log('Bay or Bust solo passed: physical contact, fixed-input replay at 30/60/120 Hz, direct AI/human input isolation, real hops, legal builds, scoring, pause, and classic reset.');
