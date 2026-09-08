'use client';
import { useEffect,useRef,useState } from 'react';
import DerbyUI from './DerbyUI';
import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import { localTip } from '@/game/advice';
import type { Blueprint,PlayerId,Stage,VehicleSnapshot } from '@/game/types';
import type { DerbyPhysics } from '@/game/physics';
import type { DerbyRenderer } from '@/game/renderer';

type Runtime={physics:DerbyPhysics;renderer:DerbyRenderer;stage:Stage;elapsed:number;countdown:number;builds:Blueprint[];lastPublish:number;animation:number;scores:number[];heat:number};
export default function DoodleDerby(){
 const canvasRef=useRef<HTMLDivElement>(null),runtime=useRef<Runtime|null>(null);
 const [stage,setStage]=useState<Stage>('garage'),[builds,setBuilds]=useState<Blueprint[]>(DEFAULT_BUILDS.map(b=>({...b}))),[snapshots,setSnapshots]=useState<VehicleSnapshot[]>([]),[elapsed,setElapsed]=useState(0),[countdown,setCountdown]=useState(3),[heat,setHeat]=useState(1),[scores,setScores]=useState([0,0]),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const audioRef=useRef<AudioContext|null>(null);
 const heldKeys=useRef(new Set<string>());
 function sound(frequency:number,duration=.1){try{const a=audioRef.current??(audioRef.current=new AudioContext());if(a.state==='suspended')void a.resume();const o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.setValueAtTime(frequency,a.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.65,a.currentTime+duration);g.gain.setValueAtTime(.055,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.connect(g).connect(a.destination);o.start();o.stop(a.currentTime+duration);}catch{}}
 useEffect(()=>{
  let cancelled=false,last=performance.now(),raf=0;
  async function initialize(){
   try{const [{DerbyPhysics},{DerbyRenderer}]=await Promise.all([import('@/game/physics'),import('@/game/renderer')]);if(cancelled||!canvasRef.current)return;
    const physics=new DerbyPhysics(),renderer=new DerbyRenderer(canvasRef.current);const initial=DEFAULT_BUILDS.map(b=>({...b}));physics.reset(initial);renderer.setBuilds(initial);
    const r:Runtime={physics,renderer,stage:'garage',elapsed:0,countdown:3,builds:initial,lastPublish:0,animation:0,scores:[0,0],heat:1};runtime.current=r;setLoaded(true);
    const previousJumps=[0,0];let lastCount=3;
    function frame(now:number){if(cancelled)return;const dt=Math.min((now-last)/1000,.05);last=now;r.animation+=dt;
     if(r.stage==='countdown'){r.physics.update(dt);r.countdown-=dt;const digit=Math.ceil(r.countdown);if(digit!==lastCount){sound(digit===0?700:440);lastCount=digit;}if(r.countdown<=0){r.stage='racing';r.elapsed=0;r.physics.start();for(const key of heldKeys.current)r.physics.setInput(key==='KeyF'?0:1,true);setStage('racing');}}
     else if(r.stage==='racing'){
      r.elapsed+=dt;r.physics.update(dt);const result=r.physics.getSnapshots();
      result.forEach(s=>{if(s.jumps>previousJumps[s.id])sound(s.id===0?330:410,.16);previousJumps[s.id]=s.jumps;});
      if(result.every(s=>s.finished)||r.elapsed>=60){
       r.physics.clearInputs();r.stage='results';const rank=[...result].sort((a,b)=>a.finished&&b.finished?(a.finishTime??60)-(b.finishTime??60):a.finished?-1:b.finished?1:b.progress-a.progress);
       const tied=rank.length===2&&rank[0].finished===rank[1].finished&&(rank[0].finished?Math.abs((rank[0].finishTime??60)-(rank[1].finishTime??60))<.02:Math.abs(rank[0].progress-rank[1].progress)<.0001);
       if(tied){r.scores=r.scores.map(x=>x+2);}else if(rank.length===2){r.scores[rank[0].id]+=3;r.scores[rank[1].id]+=1;}
       setScores([...r.scores]);setStage('results');setSnapshots(result);sound(660,.3);
      }
     }
     const current=r.physics.getSnapshots();r.renderer.render(r.stage,current,dt,r.animation);
     if(now-r.lastPublish>70){r.lastPublish=now;setSnapshots(current);setElapsed(r.elapsed);setCountdown(Math.max(0,Math.ceil(r.countdown)));}
     raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
   }catch(e){setError(e instanceof Error?e.message:'Could not start the game.');}
  }
  void initialize();
  const held=heldKeys.current;
  const keydown=(e:KeyboardEvent)=>{const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null||e.repeat)return;const r=runtime.current;if(!r||!(r.stage==='racing'||r.stage==='countdown'))return;e.preventDefault();held.add(e.code);if(r.stage==='racing')r.physics.setInput(id,true);};
  const keyup=(e:KeyboardEvent)=>{const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null)return;e.preventDefault();if(held.delete(e.code)&&runtime.current?.stage==='racing')runtime.current.physics.setInput(id,false);};
  const clear=()=>{held.clear();runtime.current?.physics.clearInputs();};
  const visibility=()=>{clear();last=performance.now();};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelled=true;cancelAnimationFrame(raf);clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);runtime.current?.physics.dispose();runtime.current?.renderer.dispose();runtime.current=null;};
 },[]);
 function onBuildChange(id:PlayerId,build:Blueprint){const r=runtime.current;if(!r||r.stage!=='garage'||!isLegalBuild(build))return;r.builds=r.builds.map((b,i)=>i===id?build:b);setBuilds([...r.builds]);r.renderer.setBuilds(r.builds);r.physics.reset(r.builds);sound(330,.055);}
 function onStart(){const r=runtime.current;if(!r||!r.builds.every(isLegalBuild))return;r.physics.reset(r.builds);r.stage='countdown';r.countdown=3;r.elapsed=0;setCountdown(3);setElapsed(0);setStage('countdown');sound(440);}
 function onNext(){const r=runtime.current;if(!r)return;if(r.heat>=3){r.stage='final';setStage('final');return;}r.heat++;r.stage='garage';r.physics.clearInputs();setHeat(r.heat);setStage('garage');}
 function onRematch(){const r=runtime.current;if(!r)return;r.stage='garage';r.heat=1;r.scores=[0,0];r.physics.reset(r.builds);setScores([0,0]);setHeat(1);setStage('garage');setElapsed(0);}
 function onHold(id:PlayerId,held:boolean){const r=runtime.current;if(r?.stage==='racing')r.physics.setInput(id,held);}
 return <main className="doodle-derby"><div ref={canvasRef} className="derby-canvas" style={{position:'fixed',inset:0}}/><DerbyUI stage={stage} builds={builds} onBuildChange={onBuildChange} onStart={onStart} onNext={onNext} onRematch={onRematch} snapshots={snapshots} elapsed={elapsed} countdown={countdown} heat={heat} scores={scores} tips={[localTip(snapshots[0]),localTip(snapshots[1])]} onHold={onHold} onReset={onStart} onCancelInput={(id)=>runtime.current?.physics.cancelInput(id)} loaded={loaded}/>{error&&<div role="alert" style={{position:'fixed',bottom:20,left:20,right:20,zIndex:50,background:'#fff',padding:24,border:'3px solid #222'}}>The game could not start: {error}. Try refreshing in a browser with WebGL enabled.</div>}</main>;
}
