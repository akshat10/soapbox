import assert from 'node:assert/strict';
import { Quaternion, Vec3 } from 'cannon-es';
import { DerbyPhysics } from './physics';
import { DEFAULT_BUILDS, wheelMounts } from './catalogue';
import { courseHopHeld } from './solo';
import { BAY_CIRCUIT_COURSE as course } from './course';
import { AERIAL_RINGS, RESET_BOOST_SECONDS, RESET_SPEED_GAIN } from './course-features';

const race=new DerbyPhysics();
race.reset([DEFAULT_BUILDS[0]],[0],{course:'bay-or-bust',steeringEnabled:true,circuit:true,arcade:true,laps:2});race.start();
const mounts=wheelMounts(DEFAULT_BUILDS[0]),wheelbase=Math.abs(mounts[0][2]-mounts[2][2]);
const gains:number[]=[];let boosts=0;
let resets = 0, expiries = 0, resetDeadline: number | null = null, previousLap = 1;
const resetGains: number[] = [];
const body = race.world.bodies.find(candidate => candidate.mass > 0)!;
for(let tick=0;tick<150*120;tick++) {
  const state=race.getSnapshots()[0];if(state.finished)break;
  const distance=state.pathDistance!;
  const lane=distance>240&&distance<268?3.5:distance>357&&distance<384?-3.5:0;
  const frame=course.lookFrame(distance+Math.max(4,state.speed*.6));
  const target=frame.position.vadd(frame.right.scale(lane));
  const q=state.quaternion;
  const local=new Quaternion(q.x,q.y,q.z,q.w).conjugate().vmult(target.vsub(new Vec3(state.position.x,state.position.y,state.position.z)));
  race.setSteering(0,Math.atan2(2*wheelbase*local.x,local.x**2+local.z**2)/Math.atan(wheelbase/(8+.2*Math.min(state.speed,10))));
  const previousVelocity = body.velocity.clone();
  race.setInput(0,courseHopHeld(state));race.update(1/120);
  const after=race.getSnapshots()[0];
  if ((after.rings ?? 0) > resets) {
    const definition = AERIAL_RINGS.find(ring => Math.abs(ring.distance - after.pathDistance!) < 4)!;
    assert(definition, 'Pickup happens at an actual authored reset location.');
    const tangent = course.frame(definition.distance).tangent;
    const gain = body.velocity.vsub(previousVelocity).dot(tangent);
    assert(gain > .1 && gain <= RESET_SPEED_GAIN + .1, 'Each reset gives actual bounded forward momentum.');
    assert.equal(after.boostRemaining, RESET_BOOST_SECONDS, 'A collection opens exactly the temporary reset window.');
    assert(after.pathDistance! - state.pathDistance! < 1, 'Resets never teleport the racer or grant progress.');
    const event = race.events.filter(event => event.type === 'ring').at(-1)!;
    resetDeadline = event.time + RESET_BOOST_SECONDS;
    resetGains.push(gain); resets = after.rings!;
    race.update(0);
    assert.equal(race.getSnapshots()[0].boostRemaining, RESET_BOOST_SECONDS, 'Paused simulation does not consume boost time.');
  }
  if (resetDeadline !== null && tick / 120 > resetDeadline + .03) {
    assert.equal(after.boostRemaining, 0, 'The reset boost expires without a new pickup or pad.');
    expiries++; resetDeadline = null;
  }
  if (after.lap! > previousLap) {
    assert.equal(after.collectedRings!.length, 0, 'Both resets rearm only on a valid lap crossing.');
    previousLap = after.lap!;
  }
  if(after.boosts!>boosts){const gain=race.events.filter(event=>event.type==='boost').at(-1)!.value!;assert(gain>0&&gain<=6,'Each boost feedback event corresponds to real, bounded momentum.');gains.push(gain);boosts=after.boosts!;}
}
const final=race.getSnapshots()[0];
assert(final.finished&&final.recoveries===0,'Taking both boost lanes remains controllable over repeated laps.');
assert.equal(final.boosts,4,'Both pads rearm on the second lap without per-frame retrigger.');
assert.equal(final.rings,4,'Both real ring openings remain reachable at arcade speed on each lap.');
assert.equal(expiries, 4, 'All four temporary reset windows expire during the two-lap race.');
console.log({seconds:final.finishTime,boosts:final.boosts,resets:final.rings,resetGains,expiries,gains:gains.map(gain=>gain.toFixed(2)),recoveries:final.recoveries});
race.reset([DEFAULT_BUILDS[0]],[0]);
assert.equal(race.getSnapshots()[0].boostRemaining, 0);
assert.equal(race.getSnapshots()[0].rings, 0);
assert.equal(race.getSnapshots()[0].collectedRings!.length, 0);
race.dispose();
console.log('Arcade rewards passed: four real boosts and four airborne ring crossings over two continuous laps.');
