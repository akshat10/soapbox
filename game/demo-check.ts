import assert from 'node:assert/strict';
import { BODIES, DEFAULT_BUILDS, isLegalBuild } from './catalogue';
import { DerbyPhysics } from './physics';
import type { Blueprint, VehicleSnapshot, Wheelbase, WheelId } from './types';

function run(build: Blueprint, pattern: 'coast' | 'timed', releaseOffset = 0): VehicleSnapshot[] {
  const race = new DerbyPhysics();
  race.reset(Array.from({ length: 4 }, () => ({ ...build })));
  race.start();
  for (let frame = 0; frame < 60 * 120; frame++) {
    for (const state of race.getSnapshots()) {
      const z = state.position.z;
      race.setInput(state.id, pattern === 'timed' && ((z > 74 && z < 83.5 + releaseOffset) || (z > 213 && z < 226 + releaseOffset)));
    }
    race.update(1 / 120);
    if (race.getSnapshots().every(state => state.finished)) break;
  }
  const results = race.getSnapshots();
  race.dispose();
  for (const state of results) {
    assert(state.finished && state.finishTime !== null && state.finishTime < 45,
      `${build.bodyId}/${build.wheelId}/${build.wheelbase} ${pattern} ${releaseOffset}: should reach the finish without a crash loop.`);
    assert(state.recoveries <= 3, 'Mistakes should cost seconds without trapping a player in repeated recoveries.');
    assert(Math.abs(state.finishTime! - results[0].finishTime!) < 0.02, 'Control forgiveness and recoveries must behave the same in all four lanes.');
    assert(Object.values(state.position).every(Number.isFinite), 'Demo motion must stay finite.');
  }
  return results;
}

const summary = [];
for (const body of BODIES.filter(body => body.family === 'sf')) {
  for (const wheelId of ['skate', 'scooter', 'transit_disc'] as WheelId[]) {
    for (const wheelbase of ['short', 'standard', 'long'] as Wheelbase[]) {
      const build = { bodyId: body.id, wheelId, wheelbase };
      assert(isLegalBuild(build));
      const coast = run(build, 'coast')[0];
      const timed = run(build, 'timed')[0];
      assert(timed.finishTime! < coast.finishTime!, 'Clean timed hops should still be more rewarding than missing every jump.');
      summary.push({ build: `${body.id}/${wheelId}/${wheelbase}`, coast: coast.finishTime!.toFixed(2), timed: timed.finishTime!.toFixed(2), recoveries: `${coast.recoveries}/${timed.recoveries}` });
    }
  }
}
for (const build of DEFAULT_BUILDS) {
  for (const offset of [-4, -2, 2, 4]) run(build, 'timed', offset);
}
console.table(summary);
console.log('Demo checks passed: all 27 SF setups finish with no input, deliberate hops are faster, early/late default releases remain recoverable, and results match across all four lanes.');
console.log('These checks catch unplayable loops; the fun of the new timing and recovery behavior still needs human phone playtesting.');
