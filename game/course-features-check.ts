import assert from 'node:assert/strict';
import { Quaternion, Vec3, type Body } from 'cannon-es';
import { DEFAULT_BUILDS, wheelMounts } from './catalogue';
import { BAY_OR_BUST_COURSE as course } from './course';
import { BOOST_PADS, ROUGH_PATCHES, AERIAL_RINGS, BOOST_SPEED_GAIN, BOOST_SPEED_CAP, insideStrip } from './course-features';
import { DerbyPhysics } from './physics';
import { courseHopHeld, courseSteering } from './solo';
import type { Blueprint, PlayerId, VehicleSnapshot } from './types';

const STEP = 1 / 120;
const starter = DEFAULT_BUILDS[0];
type Policy = { lane: (s: VehicleSnapshot) => number; hop: (s: VehicleSnapshot) => boolean };
function steering(state: VehicleSnapshot, lateral: number) {
  const frame = course.frame(state.pathDistance! + Math.max(4, state.speed * .6));
  const target = frame.position.vadd(frame.right.scale(lateral));
  const q = state.quaternion;
  const local = new Quaternion(q.x, q.y, q.z, q.w).conjugate().vmult(target.vsub(new Vec3(state.position.x, state.position.y, state.position.z)));
  const mounts = wheelMounts(state.blueprint), length = Math.abs(mounts[0][2] - mounts[2][2]);
  return Math.atan2(2 * length * local.x, local.x ** 2 + local.z ** 2) / Math.atan(length / (8 + .2 * Math.min(state.speed, 10)));
}
function create(builds: Blueprint[] = [starter], classic = false) {
  const race = new DerbyPhysics();
  race.reset(builds, builds.map((_, i) => i as PlayerId), { course: classic ? 'classic' : 'bay-or-bust', steeringEnabled: !classic });
  race.start(); return race;
}
function bodies(race: DerbyPhysics): Body[] { return race.world.bodies.filter(body => body.mass > 0); }
function forward(body: Body, state: VehicleSnapshot) { return body.velocity.dot(course.frame(state.pathDistance!).tangent); }
function drive(race: DerbyPhysics, until: number, policy: Policy,
  inspect?: (before: VehicleSnapshot[], after: VehicleSnapshot[], bodies: Body[]) => void,
  beforeStep?: (states: VehicleSnapshot[], bodies: Body[]) => void) {
  const chassis = bodies(race);
  for (let tick = 0; tick < 90 * 120; tick++) {
    const before = race.getSnapshots();
    if (before.every(state => state.finished || state.pathDistance! >= until)) return;
    for (const state of before) {
      race.setSteering(state.id, steering(state, policy.lane(state)));
      race.setInput(state.id, policy.hop(state));
    }
    beforeStep?.(before, chassis);
    race.update(STEP);
    inspect?.(before, race.getSnapshots(), chassis);
  }
  assert.fail(`Public driver did not reach s${until} within 90 seconds`);
}

const summary: object[] = [];
const boostPolicy: Policy = { lane: s => s.pathDistance! > 240 && s.pathDistance! < 268 ? 3.5
  : s.pathDistance! > 357 && s.pathDistance! < 384 ? -3.5 : 0, hop: courseHopHeld };
const boostRace = create([starter, starter]);
const boostsMeasured = [0, 0];
const previousForwardSpeed = [0, 0];
const boostVisits = new Map<string, { groundedFrames: number; minimumSpeed: number; minimumLateral: number; maximumLateral: number }>();
drive(boostRace, 381, boostPolicy, (before, after, chassis) => {
  after.forEach((state, i) => {
    for (const pad of BOOST_PADS) if (state.pathDistance! >= pad.start && state.pathDistance! <= pad.end) {
      const lateral = course.project(state.position, { pathId: 'main', distance: state.pathDistance! }).lateral;
      const key = `${state.id}/${pad.id}`;
      const visit = boostVisits.get(key) ?? { groundedFrames: 0, minimumSpeed: Infinity, minimumLateral: Infinity, maximumLateral: -Infinity };
      visit.groundedFrames += Number(state.grounded); visit.minimumSpeed = Math.min(visit.minimumSpeed, forward(chassis[i], state));
      visit.minimumLateral = Math.min(visit.minimumLateral, lateral); visit.maximumLateral = Math.max(visit.maximumLateral, lateral);
      boostVisits.set(key, visit);
    }
    if (state.boosts! > before[i].boosts!) {
      boostsMeasured[i]++;
      const event = boostRace.events.filter(e => e.playerId === state.id && e.type === 'boost').at(-1)!;
      assert(event.value! > 0 && event.value! <= BOOST_SPEED_GAIN + 1e-8, 'Each pad gives a bounded positive physical impulse.');
      assert(forward(chassis[i], state) >= previousForwardSpeed[i] + event.value! - .15, 'Recorded boost gain must appear in actual rigid-body momentum, allowing one ordinary physics step.');
      assert(forward(chassis[i], state) <= BOOST_SPEED_CAP + 1e-5, 'Boost impulse cannot exceed its forward-speed cap.');
      assert(state.pathDistance! - before[i].pathDistance! < 1, 'Boost earns distance by actual movement, never an instant progress jump.');
      assert(state.boostRemaining! > 0, 'Actual boost produces feedback state.');
    }
  });
}, (states, chassis) => states.forEach((state, i) => { previousForwardSpeed[i] = forward(chassis[i], state); }));
const boosted = boostRace.getSnapshots();
assert.deepEqual(boosted.map(s => s.boosts), [2, 2], `Each player can independently use both optional pads: ${JSON.stringify([...boostVisits])}; events ${JSON.stringify(boostRace.events.filter(e => e.type === 'boost'))}`);
assert.deepEqual(boostsMeasured, [2, 2], 'A pad cannot retrigger every grounded frame during its crossing.');
assert(boosted.every(s => !s.onRough), 'Boost lines preserve smooth road elsewhere.');
summary.push({ scenario: 'both players / both boosts', counts: boosted.map(s => s.boosts).join(',') });
boostRace.reset([starter, starter], [0, 1]);
assert(boostRace.getSnapshots().every(s => s.boosts === 0 && s.rings === 0 && s.boostRemaining === 0 && !s.onRough && s.collectedRings?.length === 0), 'A new heat resets all per-player feature state.');
assert.equal(boostRace.events.length, 0);
boostRace.dispose();

// Reach the pad normally, then set only public rigid-body velocity to exercise
// its boundary. These fixtures never relocate a car or edit route/progress.
for (const speed of [BOOST_SPEED_CAP - .25, BOOST_SPEED_CAP + 1]) {
  const race = create(); let setVelocity = false;
  drive(race, 259, boostPolicy, undefined, (states, chassis) => {
    const s = states[0];
    if (!setVelocity && s.pathDistance! >= 251 && s.pathDistance! < 252) {
      chassis[0].velocity.copy(course.frame(s.pathDistance!).tangent.scale(speed)); setVelocity = true;
    }
  });
  assert(setVelocity, 'Speed fixture must approach the actual pad without skipping road.');
  const events = race.events.filter(event => event.type === 'boost');
  if (speed < BOOST_SPEED_CAP) {
    assert.equal(events.length, 1);
    assert(events[0].value! > 0 && events[0].value! < .5, 'Near-cap entry receives only the remaining headroom.');
  } else {
    assert.equal(events.length, 0, 'An already-fast car receives no boost impulse or false boost event.');
    assert.equal(race.getSnapshots()[0].boosts, 0);
  }
  summary.push({ scenario: `pad entry ${speed}m/s`, impulses: events.map(e => e.value?.toFixed(3)).join(',') || 'none' });
  race.dispose();
}

for (const strip of ROUGH_PATCHES) {
const roughOutcomes = new Map<string, number>();
for (const mode of ['smooth', 'roll rough', 'hop rough'] as const) {
  const race = create(); let airborneInside = 0, roughFrames = 0; const measured: { exitSpeed: number | null } = { exitSpeed: null };
  const lane = mode === 'smooth' ? 0 : strip.lateral;
  drive(race, strip.end + 4, { lane: s => s.pathDistance! > strip.start - 19 ? lane : 0,
    hop: s => mode === 'hop rough' && s.pathDistance! > strip.start - 9 && s.pathDistance! < strip.start - .75 }, (_before, after, chassis) => {
    const s = after[0], p = course.project(s.position, { pathId: 'main', distance: s.pathDistance! });
    if (insideStrip(strip, s.pathDistance!, p.lateral)) {
      if (!s.grounded) { airborneInside++; assert(!s.onRough, 'Airborne crossings cannot receive rolling resistance.'); }
      if (s.onRough) { roughFrames++; assert(s.grounded, 'Rough feedback requires actual wheel support.'); }
    }
    if (measured.exitSpeed === null && s.pathDistance! >= strip.end + .5) measured.exitSpeed = forward(chassis[0], s);
  });
  assert(measured.exitSpeed !== null);
  if (mode === 'smooth') assert.equal(race.events.filter(e => e.type === 'rough').length, 0, 'The smooth central lane avoids rough penalties.');
  if (mode === 'roll rough') assert(roughFrames > 20, 'Rolling line must actually traverse the rough strip on its wheels.');
  if (mode === 'hop rough') assert(airborneInside > 20, 'A real charged hop can bypass the rough strip through the air.');
  roughOutcomes.set(mode, measured.exitSpeed);
  summary.push({ scenario: `${strip.id} ${mode}`, exitForwardSpeed: measured.exitSpeed.toFixed(3), roughFrames, airborneInside });
  race.dispose();
}
assert(roughOutcomes.get('smooth')! > roughOutcomes.get('roll rough')! + .5, 'Grounded rough traversal loses measurable speed compared with the clear lane.');
assert(roughOutcomes.get('hop rough')! > roughOutcomes.get('roll rough')! + .5, 'Hopping the rough strip preserves more forward momentum than rolling through.');
}

// Existing human-achievable steering/hop schedule; no fixture transforms.
const ringBuilds: Blueprint[] = [starter,
  { bodyId: 'mission_burrito', wheelId: 'skate', wheelbase: 'standard' },
  { bodyId: 'painted_porch', wheelId: 'transit_disc', wheelbase: 'standard' }];
for (const build of ringBuilds) for (const timed of [false, true]) {
  const race = create([build]);
  const crossings: object[] = [];
  for (let tick = 0; tick < 90 * 120; tick++) {
    const s = race.getSnapshots()[0]; if (s.finished) break;
    race.setSteering(0, courseSteering(s)); race.setInput(0, timed && courseHopHeld(s)); race.update(STEP);
    const next = race.getSnapshots()[0];
    for (const ring of AERIAL_RINGS) {
      const frame = course.frame(ring.distance);
      const target = frame.position.vadd(frame.right.scale(ring.lateral)).vadd(frame.up.scale(ring.height));
      const prior = new Vec3(s.position.x, s.position.y, s.position.z), current = new Vec3(next.position.x, next.position.y, next.position.z);
      const a = prior.vsub(target).dot(frame.tangent), b = current.vsub(target).dot(frame.tangent);
      if (Math.abs(next.pathDistance! - ring.distance) < 20 && a <= 0 && b >= 0 && b > a) {
        const delta = prior.vadd(current.vsub(prior).scale(-a / (b - a))).vsub(target);
        crossings.push({ id: ring.id, lateral: delta.dot(frame.right), vertical: delta.dot(frame.up), radial: Math.hypot(delta.dot(frame.right), delta.dot(frame.up)), grounded: next.grounded, distance: next.pathDistance });
      }
    }
  }
  const result = race.getSnapshots()[0];
  assert(result.finished, `${build.bodyId}: ring test must complete with ordinary controls.`);
  assert.equal(result.rings, timed ? AERIAL_RINGS.length : 0, `${build.bodyId} ${timed ? 'timed' : 'coast'}: timed jumps collect both airborne rings and coasting misses; ${JSON.stringify(crossings)}; collected ${result.collectedRings?.join(',') ?? ''}`);
  assert.equal(new Set(result.collectedRings).size, result.rings, 'Each ring is collected only once per racer.');
  const ringEvents = race.events.filter(e => e.type === 'ring');
  assert.equal(ringEvents.length, result.rings, 'Ring events agree with collected state.');
  assert.equal(result.boosts, 0, 'The central ring line does not require optional boost pads.');
  summary.push({ scenario: `${build.bodyId} ${timed ? 'timed hops' : 'coast'}`, rings: result.rings, seconds: result.finishTime!.toFixed(2) });
  race.dispose();
}

const classic = create([starter], true);
for (let tick = 0; tick < 60 * 120 && !classic.getSnapshots()[0].finished; tick++) classic.update(STEP);
assert(classic.getSnapshots()[0].finished, 'Classic hop-only course remains completable.');
assert.equal(classic.getSnapshots()[0].boosts, undefined);
assert.equal(classic.getSnapshots()[0].rings, undefined);
assert.equal(classic.events.filter(e => ['boost', 'rough', 'ring'].includes(e.type)).length, 0, 'New course features do not leak into classic physics.');
classic.dispose();

console.table(summary);
console.log('Course feature checks passed: two independently usable boosts, bounded/capped impulses, no frame retrigger or progress shortcut, heat reset, grounded rough slowdown with smooth/airborne alternatives, reachable airborne rings for three builds, and unchanged classic mode.');
