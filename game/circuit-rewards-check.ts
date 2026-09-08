import assert from 'node:assert/strict';
import { Quaternion, Vec3 } from 'cannon-es';
import { DerbyPhysics } from './physics';
import { DEFAULT_BUILDS, wheelMounts } from './catalogue';
import { courseHopHeld } from './solo';
import { BAY_CIRCUIT_COURSE as course } from './course';

const race=new DerbyPhysics();
race.reset([DEFAULT_BUILDS[0]],[0],{course:'bay-or-bust',steeringEnabled:true,circuit:true,arcade:true,laps:2});race.start();
const mounts=wheelMounts(DEFAULT_BUILDS[0]),wheelbase=Math.abs(mounts[0][2]-mounts[2][2]);
const gains:number[]=[];let boosts=0;
for(let tick=0;tick<150*120;tick++) {
  const state=race.getSnapshots()[0];if(state.finished)break;
  const distance=state.pathDistance!;
  const lane=distance>240&&distance<268?3.5:distance>357&&distance<384?-3.5:0;
  const frame=course.lookFrame(distance+Math.max(4,state.speed*.6));
  const target=frame.position.vadd(frame.right.scale(lane));
  const q=state.quaternion;
  const local=new Quaternion(q.x,q.y,q.z,q.w).conjugate().vmult(target.vsub(new Vec3(state.position.x,state.position.y,state.position.z)));
  race.setSteering(0,Math.atan2(2*wheelbase*local.x,local.x**2+local.z**2)/Math.atan(wheelbase/(8+.2*Math.min(state.speed,10))));
  race.setInput(0,courseHopHeld(state));race.update(1/120);
  const after=race.getSnapshots()[0];
  if(after.boosts!>boosts){const gain=race.events.filter(event=>event.type==='boost').at(-1)!.value!;assert(gain>0&&gain<=6,'Each boost feedback event corresponds to real, bounded momentum.');gains.push(gain);boosts=after.boosts!;}
}
const final=race.getSnapshots()[0];
assert(final.finished&&final.recoveries===0,'Taking both boost lanes remains controllable over repeated laps.');
assert.equal(final.boosts,4,'Both pads rearm on the second lap without per-frame retrigger.');
assert.equal(final.rings,4,'Both real ring openings remain reachable at arcade speed on each lap.');
console.log({seconds:final.finishTime,boosts:final.boosts,rings:final.rings,gains:gains.map(gain=>gain.toFixed(2)),recoveries:final.recoveries});
race.dispose();
console.log('Arcade rewards passed: four real boosts and four airborne ring crossings over two continuous laps.');
