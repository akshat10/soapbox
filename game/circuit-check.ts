import assert from 'node:assert/strict';
import { Vec3 } from 'cannon-es';
import { DEFAULT_BUILDS } from './catalogue';
import { BAY_CIRCUIT_COURSE as course } from './course';
import { DerbyPhysics } from './physics';
import { SOLO_RIVALS, SoloRaceDriver, courseSteering, courseHopHeld } from './solo';
import { createCircuitScene } from './circuit-scene';
import { BOOST_PADS } from './course-features';

const builds = [DEFAULT_BUILDS[0],...SOLO_RIVALS.map(rival=>rival.build)];
const options = { course:'bay-or-bust',steeringEnabled:true,circuit:true,arcade:true,laps:3 } as const;
const samples=course.paths[0].samples, length=samples.at(-1)!.s;
assert.deepEqual(samples[0].position,samples.at(-1)!.position,'Road closes exactly at the start.');
assert.deepEqual(samples[0].tangent,samples.at(-1)!.tangent,'Road heading is continuous across the seam.');
assert(length>750&&length<800);
const geometry=createCircuitScene();
geometry.traverse(node=>{if('geometry' in node){const position=(node as import('three').Mesh).geometry.getAttribute('position');assert(Array.from(position.array).every(Number.isFinite),'Rendered return geometry is finite.');}});
for(let s=433;s<length-2;s+=2){
  const a=course.frame(s-1),b=course.frame(s+1);
  const angle=Math.acos(Math.max(-1,Math.min(1,a.tangent.dot(b.tangent))));
  assert(2/Math.max(.0001,angle)>15,'The return must not fold its inside road edge.');
}

const summaries=[];
for(const hz of [120,30]) {
  const physics=new DerbyPhysics(),driver=new SoloRaceDriver();
  physics.reset(builds,[0,1,2,3],options);physics.start();
  const priorLaps=[1,1,1,1],lapEvents=[0,0,0,0];
  let peak=0,launchTime=0;
  for(let tick=0;tick<240*hz;tick++) {
    const state=physics.getSnapshots()[0];
    const steer=courseSteering(state);
    physics.setSteering(0,hz===30?(Math.abs(steer)<.2?0:Math.sign(steer)):steer);
    physics.setInput(0,courseHopHeld(state));
    driver.update(physics,1/hz,1);
    for(const snapshot of physics.getSnapshots()) {
      peak=Math.max(peak,snapshot.speed);
      assert(snapshot.lap!>=priorLaps[snapshot.id]&&snapshot.lap!<=3);
      if(snapshot.lap!>priorLaps[snapshot.id]) {
        lapEvents[snapshot.id]++;
        assert(snapshot.pathDistance!<2,'A new lap crosses the connected start seam.');
        assert(snapshot.speed>1,'Crossing a lap never respawns or stops the car.');
        assert(snapshot.lastLap!>30,'A lap requires driving the whole course.');
      }
      priorLaps[snapshot.id]=snapshot.lap!;
    }
    if(!launchTime&&state.pathDistance!>86)launchTime=tick/hz;
    if(physics.getSnapshots().every(snapshot=>snapshot.finished))break;
  }
  const final=physics.getSnapshots();
  for(const snapshot of final) {
    assert(snapshot.finished&&snapshot.lap===3,'Every racer can complete all three laps.');
    assert.equal(snapshot.progress,1);
    assert(snapshot.recoveries<=(snapshot.id===0&&hz===30?9:3),'A racer must not get stuck in repeated recoveries.');
    assert.equal(lapEvents[snapshot.id],2);
    assert(snapshot.bestLap!>30&&snapshot.bestLap!<75);
    summaries.push({hz,player:snapshot.id,seconds:snapshot.finishTime!.toFixed(2),recoveries:snapshot.recoveries,rings:snapshot.rings,bestLap:snapshot.bestLap!.toFixed(2)});
  }
  assert(peak>22&&peak<34,'The straight reaches a useful, bounded arcade speed.');
  assert(launchTime<14,'The opening is appreciably faster than the previous ~18s.');
  physics.update(0);assert.deepEqual(physics.getSnapshots(),final,'Pausing freezes the complete lap state.');
  physics.update(.1);assert.deepEqual(physics.getSnapshots(),final,'Finished poses and lap timers remain frozen.');
  physics.reset(builds,[0,1,2,3]);assert(physics.getSnapshots().every(s=>s.lap===1&&s.rings===0&&s.bestLap===null),'A new heat resets all lap rewards and timings.');
  physics.reset(builds,[0],{course:'classic',steeringEnabled:false});assert.equal(physics.getSnapshots()[0].circuit,undefined);
  physics.dispose();
  console.log(`Completed ${hz}Hz circuit run.`);
}

// A moved car cannot award laps or skip to the end of the return.
const invalid=new DerbyPhysics();invalid.reset(builds,[0],options);invalid.start();
const before=invalid.getSnapshots()[0],body=invalid.world.bodies.find(body=>body.mass>0)!;
body.position.copy(course.frame(length-1).position.vadd(new Vec3(0,1,0)));body.aabbNeedsUpdate=true;
for(let tick=0;tick<50;tick++)invalid.update(1/120);
assert.equal(invalid.getSnapshots()[0].lap,1);
assert(!invalid.getSnapshots()[0].finished);
assert(invalid.getSnapshots()[0].progress<=before.progress);
invalid.dispose();
assert(BOOST_PADS.length>=2);
console.table(summaries);
console.log('Circuit passed: continuous road, three real laps, human binary steering, four racers, speed envelope, pause/reset, frozen finish and shortcut rejection.');
