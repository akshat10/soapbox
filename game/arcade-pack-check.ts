import assert from 'node:assert/strict';
import { DEFAULT_BUILDS, isLegalBuild } from './catalogue';
import { DerbyPhysics } from './physics';
import { SOLO_PLAYER_IDS, SOLO_RIVALS, SoloRaceDriver, courseSteering, courseHopHeld } from './solo';
import { heatPoints } from './race';
import { boostRechargeRate } from './manual-boost';

const builds = [DEFAULT_BUILDS[0], ...SOLO_RIVALS.map(rival => rival.build)];
const options = { course:'bay-or-bust', steeringEnabled:true, circuit:true, arcade:true, laps:3 } as const;
assert.equal(builds.length, 8); assert(builds.every(isLegalBuild));
assert(boostRechargeRate(.2, .25) > boostRechargeRate(.25, .25), 'Trailing racers recharge faster.');
const summaries = [];
for (const boosted of (process.env.ARCADE_BOOST_ONLY ? [true] : [false, true])) {
  const physics = new DerbyPhysics(), driver = new SoloRaceDriver();
  physics.reset(builds, SOLO_PLAYER_IDS, options);
  const grid = physics.getSnapshots();
  assert.equal(grid.length, 8);
  for (const car of grid) {
    assert(Object.values(car.position).every(Number.isFinite));
    for (const other of grid) if (car.id !== other.id) assert(Math.hypot(car.position.x-other.position.x, car.position.z-other.position.z) > 2.5, 'Grid cars must not overlap.');
  }
  assert.equal(physics.activateBoost(0), false, 'Garage boost is disabled.');
  physics.start();
  let activations = 0;
  const hz = boosted ? 30 : 120;
  const speeds: number[] = [];
  for (let tick = 0; tick < 240 * hz; tick++) {
    const human = physics.getSnapshots()[0];
    const steer = courseSteering(human);
    physics.setSteering(0, boosted ? (Math.abs(steer) < .15 ? 0 : Math.sign(steer)) : steer);
    physics.setInput(0, courseHopHeld(human));
    // Delay the first burst so this exercises catching up, not just the grid.
    if (boosted && tick / hz > 12 && physics.activateBoost(0)) {
      activations++;
      assert.equal(physics.activateBoost(0), false, 'A held key cannot stack bursts.');
    }
    driver.update(physics, 1 / hz, 1);
    if (human.grounded && !human.recovering && !human.finished && tick > hz * 4 && !(human.boostRemaining! > 0)) speeds.push(human.speed);
    if (physics.getSnapshots().every(car => car.finished)) break;
  }
  const final = physics.getSnapshots();
  console.table(final.map(car => ({boosted, id:car.id, finish:car.finishTime?.toFixed(2), progress:car.progress.toFixed(3), flips:car.flips, recoveries:car.recoveries, boosts:car.manualBoosts})));
  for (const car of final) {
    assert(car.finished, `Racer ${car.id} must complete three full laps.`);
    assert(car.flips <= 1, `Racer ${car.id} should stay upright.`);
    assert(car.recoveries <= 4, `Racer ${car.id} must avoid recovery loops.`);
  }
  speeds.sort((a,b) => a-b);
  const median=speeds[Math.floor(speeds.length*.5)], low=speeds[Math.floor(speeds.length*.1)], high=speeds[Math.floor(speeds.length*.9)];
  assert(median > 10 && median < 18, 'Cruise remains in a useful, steady range.');
  console.log({boosted,low,median,high});
  assert(high-low < 8, 'Most cruising avoids the old large speed swings.');
  if (boosted) assert(activations > 5 && final[0].manualBoosts === activations, 'Repeated taps work after recharge.');
  assert.equal(physics.activateBoost(0), false, 'Finished cars cannot boost.');
  physics.update(0); assert.deepEqual(physics.getSnapshots(), final, 'Pause freezes boost and lap state.');
  const points=heatPoints(final); assert.equal(points.length,8); assert.equal(points.reduce((sum,n)=>sum+n,0),39); assert(points.slice(4).every(n=>n>0));
  physics.reset(builds,SOLO_PLAYER_IDS); assert(physics.getSnapshots().every(car=>car.boostCharge===1&&car.manualBoosts===0));
  summaries.push({boosted, seconds:final[0].finishTime, activations, low:low.toFixed(1), median:median.toFixed(1), high:high.toFixed(1)});
  physics.dispose();
}
console.table(summaries);
console.log('Eight-car arcade checks passed: full three-lap races, analog and binary steering, upright handling, steady cruise, repeated Z boosts, recharge, scoring, pause and restart.');
