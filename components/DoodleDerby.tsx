'use client';
import { useEffect, useRef, useState } from 'react';
import DerbyUI from './DerbyUI';
import PhonePartyPanel from './PhonePartyPanel';
import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import { localTip } from '@/game/advice';
import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from '@/game/types';
import type { DerbyPhysics } from '@/game/physics';
import type { DerbyRenderer } from '@/game/renderer';
import type { PartyHost } from '@/game/party-client';
import type { PartyPlayer, PartyState } from '@/game/party-types';

type Runtime = { physics: DerbyPhysics; renderer: DerbyRenderer; stage: Stage; elapsed: number; countdown: number; builds: Blueprint[]; lastPublish: number; animation: number; scores: number[]; heat: number; paused: boolean };
const cloneBuilds = () => DEFAULT_BUILDS.map(b => ({ ...b }));
export default function DoodleDerby() {
 const canvasRef = useRef<HTMLDivElement>(null), runtime = useRef<Runtime | null>(null);
 const [stage, setStage] = useState<Stage>('garage'), [builds, setBuilds] = useState<Blueprint[]>(cloneBuilds), [snapshots, setSnapshots] = useState<VehicleSnapshot[]>([]);
 const [elapsed, setElapsed] = useState(0), [countdown, setCountdown] = useState(3), [heat, setHeat] = useState(1), [scores, setScores] = useState([0, 0]);
 const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [paused, setPaused] = useState(false);
 const [partyOpen, setPartyOpen] = useState(false), [partyBusy, setPartyBusy] = useState(false), [partyError, setPartyError] = useState('');
 const [roomCode, setRoomCode] = useState(''), [players, setPlayers] = useState<PartyPlayer[]>([]);
 const partyRef = useRef<PartyHost | null>(null), playersRef = useRef<PartyPlayer[]>([]);
 const audioRef = useRef<AudioContext | null>(null), heldKeys = useRef(new Set<string>());
 const bothConnected = () => ([0, 1] as const).every(id => playersRef.current.some(p => p.id === id && p.connected));
 function readiness(r: Runtime) { return ([0, 1] as const).map(id => playersRef.current.some(p => p.id === id && p.connected && p.ready && p.readyHeat === r.heat)); }
 function partyState(r: Runtime): PartyState {
  return { stage:r.stage, builds:r.builds, snapshots:r.physics.getSnapshots().map(({id,charge,grounded,recovering,finished,finishTime,speed,progress,jumps,recoveries})=>({id,charge,grounded,recovering,finished,finishTime,speed,progress,jumps,recoveries})), elapsed:r.elapsed, countdown:Math.max(0,Math.ceil(r.countdown)), heat:r.heat, scores:r.scores, ready:readiness(r), paused:r.paused };
 }
 function sound(frequency:number,duration=.1){try{const a=audioRef.current??(audioRef.current=new AudioContext());if(a.state==='suspended')void a.resume();const o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.setValueAtTime(frequency,a.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.65,a.currentTime+duration);g.gain.setValueAtTime(.055,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration);}catch{}}
 useEffect(()=>{
  let cancelled=false,last=performance.now(),raf=0;
  async function initialize(){
   try{
    const [{DerbyPhysics},{DerbyRenderer},{preloadModels}]=await Promise.all([import('@/game/physics'),import('@/game/renderer'),import('@/game/assets')]);await preloadModels();if(cancelled||!canvasRef.current)return;
    const physics=new DerbyPhysics(),renderer=new DerbyRenderer(canvasRef.current),initial=cloneBuilds();physics.reset(initial);renderer.setBuilds(initial);
    const r:Runtime={physics,renderer,stage:'garage',elapsed:0,countdown:3,builds:initial,lastPublish:0,animation:0,scores:[0,0],heat:1,paused:false};runtime.current=r;setLoaded(true);
    const previousJumps=[0,0];let lastCount=3;
    function frame(now:number){
     if(cancelled)return;const dt=Math.min((now-last)/1000,.05);last=now;r.animation+=dt;
     const shouldPause=!!partyRef.current&&(document.hidden||!bothConnected())&&(r.stage==='racing'||r.stage==='countdown');
     if(shouldPause!==r.paused){r.paused=shouldPause;r.physics.clearInputs();heldKeys.current.clear();setPaused(shouldPause);}
     if(!r.paused&&r.stage==='countdown'){
      r.physics.update(dt);r.countdown-=dt;const digit=Math.ceil(r.countdown);if(digit!==lastCount){sound(digit===0?700:440);lastCount=digit;}
      if(r.countdown<=0){r.stage='racing';r.elapsed=0;r.physics.start();if(!partyRef.current)for(const key of heldKeys.current)r.physics.setInput(key==='KeyF'?0:1,true);setStage('racing');}
     }else if(!r.paused&&r.stage==='racing'){
      r.elapsed+=dt;r.physics.update(dt);const result=r.physics.getSnapshots();
      result.forEach(s=>{if(s.jumps>previousJumps[s.id])sound(s.id===0?330:410,.16);previousJumps[s.id]=s.jumps;});
      if(result.every(s=>s.finished)||r.elapsed>=60){
       r.physics.clearInputs();heldKeys.current.clear();r.stage='results';
       const rank=[...result].sort((a,b)=>a.finished&&b.finished?(a.finishTime??60)-(b.finishTime??60):a.finished?-1:b.finished?1:b.progress-a.progress);
       const tied=rank.length===2&&rank[0].finished===rank[1].finished&&(rank[0].finished?Math.abs((rank[0].finishTime??60)-(rank[1].finishTime??60))<.02:Math.abs(rank[0].progress-rank[1].progress)<.0001);
       if(tied)r.scores=r.scores.map(x=>x+2);else if(rank.length===2){r.scores[rank[0].id]+=3;r.scores[rank[1].id]+=1;}
       setScores([...r.scores]);setStage('results');setSnapshots(result);sound(660,.3);
      }
     }
     const current=r.physics.getSnapshots();r.renderer.render(r.stage,current,dt,r.animation);
     if(now-r.lastPublish>70){r.lastPublish=now;setSnapshots(current);setElapsed(r.elapsed);setCountdown(Math.max(0,Math.ceil(r.countdown)));partyRef.current?.publish(partyState(r));}
     raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
   }catch(e){setError(e instanceof Error?e.message:'Could not start the game.');}
  }
  void initialize();const held=heldKeys.current;
  const keydown=(e:KeyboardEvent)=>{if(partyRef.current)return;const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null||e.repeat)return;const r=runtime.current;if(!r||!(r.stage==='racing'||r.stage==='countdown'))return;e.preventDefault();held.add(e.code);if(r.stage==='racing')r.physics.setInput(id,true);};
  const keyup=(e:KeyboardEvent)=>{const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null)return;e.preventDefault();if(held.delete(e.code)&&runtime.current?.stage==='racing'&&!partyRef.current)runtime.current.physics.setInput(id,false);};
  const clear=()=>{held.clear();runtime.current?.physics.clearInputs();};
  const visibility=()=>{clear();last=performance.now();const r=runtime.current;if(r&&partyRef.current){r.paused=document.hidden||!bothConnected();setPaused(r.paused);partyRef.current.publish(partyState(r));}};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelled=true;cancelAnimationFrame(raf);clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);partyRef.current?.dispose();partyRef.current=null;runtime.current?.physics.dispose();runtime.current?.renderer.dispose();runtime.current=null;};
 },[]);
 function applyBuild(id:PlayerId,build:Blueprint){const r=runtime.current;if(!r||r.stage!=='garage'||!isLegalBuild(build)||JSON.stringify(r.builds[id])===JSON.stringify(build))return;r.builds=r.builds.map((b,i)=>i===id?{...build}:b);setBuilds([...r.builds]);r.renderer.setBuilds(r.builds);r.physics.reset(r.builds);}
 function onBuildChange(id:PlayerId,build:Blueprint){if(!partyRef.current){applyBuild(id,build);sound(330,.055);}}
 function onStart(){const r=runtime.current;if(!r||!r.builds.every(isLegalBuild)||(partyRef.current&&(!bothConnected()||(r.stage==='garage'&&!readiness(r).every(Boolean)))))return;heldKeys.current.clear();r.physics.reset(r.builds);r.stage='countdown';r.countdown=3;r.elapsed=0;r.paused=false;setCountdown(3);setElapsed(0);setPaused(false);setStage('countdown');setPartyOpen(false);sound(440);}
 function onNext(){const r=runtime.current;if(!r)return;if(r.heat>=3){r.stage='final';setStage('final');return;}r.heat++;r.stage='garage';r.physics.clearInputs();setHeat(r.heat);setStage('garage');}
 function onRematch(){const r=runtime.current;if(!r)return;r.stage='garage';r.heat=1;r.scores=[0,0];r.elapsed=0;r.physics.reset(r.builds);setScores([0,0]);setHeat(1);setStage('garage');setElapsed(0);}
 function onHold(id:PlayerId,held:boolean){const r=runtime.current;if(r?.stage==='racing'&&!partyRef.current)r.physics.setInput(id,held);}
 async function createParty(){
  const r=runtime.current;if(!r||partyBusy||partyRef.current)return;setPartyBusy(true);setPartyError('');
  try{
   const {createHostParty}=await import('@/game/party-client');r.stage='garage';r.physics.clearInputs();setStage('garage');
   const party=await createHostParty({
    onPlayers:next=>{playersRef.current=next;setPlayers(next);if(runtime.current?.stage==='garage')next.forEach(p=>applyBuild(p.id,p.build));},
    onInput:(id,kind)=>{const current=runtime.current;if(!current)return;if(kind==='cancel'){current.physics.cancelInput(id);return;}if(current.stage==='racing'&&!current.paused&&bothConnected()&&!document.hidden)current.physics.setInput(id,kind==='hold');},
    onError:message=>setPartyError(message),
   },partyState(r));
   if(!runtime.current){await party.close();return;}partyRef.current=party;setRoomCode(party.code);
  }catch(e){setPartyError(e instanceof Error?e.message:'Could not open a room. Please try again.');}finally{setPartyBusy(false);}
 }
 async function closeParty(){const party=partyRef.current;partyRef.current=null;party?.dispose();playersRef.current=[];setPlayers([]);setRoomCode('');setPartyError('');const r=runtime.current;if(r){r.physics.clearInputs();r.stage='garage';r.paused=false;setStage('garage');setPaused(false);}try{await party?.close();}catch{}}
 const ready=([0,1]as const).map(id=>players.some(p=>p.id===id&&p.connected&&p.ready&&p.readyHeat===heat));
 return <main className="doodle-derby"><div ref={canvasRef} className="derby-canvas" style={{position:'fixed',inset:0}}/>
  <DerbyUI stage={stage} builds={builds} onBuildChange={onBuildChange} onStart={onStart} onNext={onNext} onRematch={onRematch} snapshots={snapshots} elapsed={elapsed} countdown={countdown} heat={heat} scores={scores} tips={[localTip(snapshots[0]),localTip(snapshots[1])]} onHold={onHold} onReset={onStart} onCancelInput={id=>runtime.current?.physics.cancelInput(id)} loaded={loaded} phoneRoom={roomCode||undefined} phoneReady={ready} onPhoneParty={()=>setPartyOpen(true)}/>
  {paused&&(stage==='racing'||stage==='countdown')&&<div className="party-pause"><strong>PIT STOP. STAY TOGETHER.</strong><p>Reconnect both phones and keep this race screen open. Your race will resume here.</p><small>Your hop charge has been cleared safely.</small><button className="phone-party-button" onClick={()=>setPartyOpen(true)}>ROOM {roomCode}</button></div>}
  <PhonePartyPanel open={partyOpen} onOpenChange={setPartyOpen} code={roomCode||undefined} players={players} busy={partyBusy} error={partyError} onCreate={()=>void createParty()} onClose={()=>void closeParty()}/>
  {error&&<div role="alert" style={{position:'fixed',bottom:20,left:20,right:20,zIndex:50,background:'#fff',padding:24,border:'3px solid #222'}}>The game could not start: {error}. Try refreshing in a browser with WebGL enabled.</div>}
 </main>;
}
