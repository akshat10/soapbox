import { buildCost, isLegalBuild } from './catalogue';
import { DerbyPhysics } from './physics';
import type { Blueprint, VehicleSnapshot, WheelId } from './types';

// Handoff observation, 2026-09-08: porch COM .15 / mass 140.
// First two lanes, Regular wheelbase, wheels skate/scooter/transit_disc:
// sourdough 32.033/33.550/37.767s (transit_disc requires one recovery);
// mission_burrito 33.783/31.883/31.908s; painted_porch 33.317/33.367/32.325s.
// All timed lane pairs match. This test does not exercise players 3 and 4.

type Pattern = 'timed' | 'coast' | 'maximum spam';
const failures: string[] = [];
const bodies = ['sourdough', 'mission_burrito', 'painted_porch'];
const wheels: WheelId[] = ['skate', 'scooter', 'transit_disc'];
const timedResults = new Map<string, VehicleSnapshot[]>();

function check(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function run(build: Blueprint, pattern: Pattern): VehicleSnapshot[] {
  const race = new DerbyPhysics();
  race.reset([{ ...build }, { ...build }]);
  race.start();
  let invalid = false;
  for (let frame = 0; frame < 60 * 120; frame++) {
    for (const state of race.getSnapshots()) {
      const z = state.position.z;
      const held = pattern === 'timed'
        ? (z > 74 && z < 83.5) || (z > 213 && z < 226)
        : pattern === 'maximum spam' ? state.charge < .99 : false;
      race.setInput(state.id, held);
      invalid ||= !Object.values(state.position).every(Number.isFinite)
        || !Object.values(state.quaternion).every(Number.isFinite)
        || !Number.isFinite(state.speed);
    }
    race.update(1 / 120);
    if (race.getSnapshots().every(state => state.finished)) break;
  }
  const results = race.getSnapshots();
  check(!invalid, `${build.bodyId}/${build.wheelId}/${pattern}: non-finite physics.`);
  check(results.every(result => result.wheels.length === 4), `${build.bodyId}/${build.wheelId}: needs four wheels.`);
  race.dispose();
  return results;
}

function score(result: VehicleSnapshot) {
  return result.finishTime ?? 60 + (1 - result.progress) * 60;
}

function row(build: Blueprint, pattern: Pattern, results: VehicleSnapshot[]) {
  return {
    body: build.bodyId, wheel: build.wheelId, pattern, bolts: buildCost(build),
    lane1: results[0].finishTime?.toFixed(3) ?? `DNF ${Math.round(results[0].progress * 100)}%`,
    lane2: results[1].finishTime?.toFixed(3) ?? `DNF ${Math.round(results[1].progress * 100)}%`,
    recoveries: results.map(result => result.recoveries).join('/'),
    jumps: results.map(result => result.jumps).join('/'),
    parity: Math.abs(score(results[0]) - score(results[1])).toFixed(6),
  };
}

const matrix = [];
for (const bodyId of bodies) {
  for (const wheelId of wheels) {
    const build: Blueprint = { bodyId, wheelId, wheelbase: 'standard' };
    check(isLegalBuild(build), `${bodyId}/${wheelId}: advertised SF combination must be legal.`);
    const results = run(build, 'timed');
    timedResults.set(`${bodyId}/${wheelId}`, results);
    check(results.every(result => result.finished), `${bodyId}/${wheelId}: timed run did not finish both lanes within 60 seconds.`);
    check(Math.abs(score(results[0]) - score(results[1])) < .02,
      `${bodyId}/${wheelId}: identical inputs have more than .02 seconds lane disparity.`);
    matrix.push(row(build, 'timed', results));
  }
}
console.log('SF chassis × wheel matrix, Regular wheelbase, identical two-lane inputs:');
console.table(matrix);

const starters: Blueprint[] = [
  { bodyId: 'sourdough', wheelId: 'scooter', wheelbase: 'standard' },
  { bodyId: 'mission_burrito', wheelId: 'skate', wheelbase: 'standard' },
  { bodyId: 'painted_porch', wheelId: 'scooter', wheelbase: 'standard' },
];
const patterns = [];
for (const build of starters) {
  const timed = timedResults.get(`${build.bodyId}/${build.wheelId}`)!;
  check(timed.every(result => result.recoveries === 0), `${build.bodyId}/${build.wheelId}: timed starter requires recovery.`);
  patterns.push(row(build, 'timed', timed));
  for (const pattern of ['coast', 'maximum spam'] as const) {
    const results = run(build, pattern);
    for (let lane = 0; lane < 2; lane++) {
      check(score(timed[lane]) < score(results[lane]),
        `${build.bodyId}/${build.wheelId} lane ${lane + 1}: deliberate timing does not outperform ${pattern}.`);
    }
    patterns.push(row(build, pattern, results));
  }
}
console.log('SF starter input-pattern comparison:');
console.table(patterns);
if (failures.length) {
  console.error(`SF physics checks: ${failures.length} failure(s):\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('SF physics checks passed: nine legal combinations finish both tested lanes, timed-run lane parity, finite motion, four wheels, clean starters, and timed hops beat coasting/full-charge spam.');
}
console.log('These scripts sample Regular wheelbase and fixed input patterns; they do not establish exhaustive balance or human play quality.');
