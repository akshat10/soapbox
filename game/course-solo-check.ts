import assert from 'node:assert/strict';
import { RaycastResult, Vec3 } from 'cannon-es';
import { DerbyPhysics } from './physics';
import { DEFAULT_BUILDS, isLegalBuild } from './catalogue';
import { SOLO_RIVALS, SoloRaceDriver, courseHopHeld, courseSteering } from './solo';
import { PLAYER_IDS, racePlace, heatPoints } from './race';
import { BAY_OR_BUST_COURSE as course } from './course';
import type { VehicleSnapshot } from './types';

const outcomes = (snapshots: VehicleSnapshot[]) => snapshots.map(({ id, finishTime, jumps, recoveries, progress })=>({id,finishTime,jumps,recoveries,progress}));
function run(hz:number, timed:boolean, humanControls=true) {
 const physics=new DerbyPhysics(),driver=new SoloRaceDriver();
 const builds=[{...DEFAULT_BUILDS[0]},...SOLO_RIVALS.map(rival=>({...rival.build}))];
 assert(builds.every(isLegalBuild));
 physics.reset(builds,PLAYER_IDS,{course:'bay-or-bust',steeringEnabled:true});physics.start();
 for(let tick=0;tick<hz*90;tick++) {
  const human=physics.getSnapshots()[0];
  if(humanControls){physics.setSteering(0,courseSteering(human));physics.setInput(0,timed&&courseHopHeld(human));}
  driver.update(physics,1/hz,1);
  if(physics.getSnapshots().every(snapshot=>snapshot.finished))break;
 }
 const snapshots=physics.getSnapshots();
 assert(snapshots.slice(1).every(snapshot=>snapshot.finished&&snapshot.finishTime!<55&&snapshot.recoveries===0),'Each rival must steer and hop through the complete authored course without recovery loops.');
 assert(snapshots.every(snapshot=>Object.values(snapshot.position).every(Number.isFinite)));
 assert.deepEqual(snapshots.map(snapshot=>snapshot.blueprint),builds);
 if(humanControls){assert(snapshots[0].finished,'An ordinary control sequence can complete the course.');if(timed&&hz===120)assert.equal(racePlace(snapshots[0],snapshots),1,'A precisely driven starter has a winning line.');assert.equal(heatPoints(snapshots).reduce((a,b)=>a+b,0),11);}
 else {assert.equal(snapshots[0].jumps,0,'The AI never hops for the human.');assert(!snapshots[0].finished,'The AI never steers for the human.');}
 const paused=physics.getSnapshots();driver.update(physics,0,1);assert.deepEqual(physics.getSnapshots(),paused);
 physics.clearInputs();physics.reset(builds,[0,1],{course:'classic',steeringEnabled:false});
 assert(physics.getSnapshots().every(snapshot=>snapshot.courseId===undefined),'Switching to keyboard multiplayer restores the classic course.');
 physics.dispose();return snapshots;
}
const reference=run(120,true),summary=[];
for(const hz of [30,60,120]) {
 const result=run(hz,true);
 assert.deepEqual(outcomes(result.slice(1)),outcomes(reference.slice(1)),'Rival outcomes are independent of rendering rate and human trajectory.');
 summary.push({hz,human:result[0].finishTime?.toFixed(2),rivals:result.slice(1).map(snapshot=>snapshot.finishTime?.toFixed(2)).join(', '),recoveries:result.map(snapshot=>snapshot.recoveries).join(', ')});
}
const coasting=run(120,false),idle=run(30,false,false),idleReference=run(120,false,false);
assert(coasting[0].finishTime!>reference[0].finishTime!,'Well-timed hops improve the demonstrated driving line.');
assert.deepEqual(outcomes(idle.slice(1)),outcomes(idleReference.slice(1)),'Identical input histories produce identical bots across frame rates.');
assert.deepEqual(outcomes(coasting.slice(1)),outcomes(reference.slice(1)),'Rivals do not interact with the human through hidden tire contacts.');
assert(course.finishDistance>420&&course.paths.length===1);
const rayFixture=new DerbyPhysics();rayFixture.reset([DEFAULT_BUILDS[0],DEFAULT_BUILDS[0]],[0,1]);
const cars=rayFixture.world.bodies.filter(body=>body.mass>0),target=cars[1];
target.position.copy(cars[0].position);target.position.y+=2;target.aabbNeedsUpdate=true;rayFixture.world.broadphase.dirty=true;
const hit=new RaycastResult();rayFixture.world.rayTest(new Vec3(target.position.x,target.position.y+5,target.position.z),new Vec3(target.position.x,target.position.y-15,target.position.z),hit);
assert(hit.hasHit&&hit.body?.mass===0,'Suspension support rays must ignore other racers and hit the actual road.');rayFixture.dispose();
console.table(summary);
console.log('Bay or Bust solo passed: authored course, physical steering, real hops, three clean rivals, control isolation, normal points, a winning manual reference line, 30/60/120 Hz determinism, pause and classic multiplayer reset.');
