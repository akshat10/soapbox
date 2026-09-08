'use client';
import { useEffect, useRef, useState } from 'react';
import DerbyUI from './DerbyUI';
import PhonePartyPanel from './PhonePartyPanel';
import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import { localTip } from '@/game/advice';
import { heatPoints, PLAYER_IDS } from '@/game/race';
import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from '@/game/types';
import type { DerbyPhysics } from '@/game/physics';
import type { DerbyRenderer } from '@/game/renderer';
import type { PartyHost } from '@/game/party-client';
import type { PartyPlayer, PartyState } from '@/game/party-types';

// Party rhythm: all joined racers ready → 2s settle → 3s grid → race → 4.5s podium.
const READY_SETTLE_SECONDS = 2;
const PODIUM_SECONDS = 4.5;
const HEAT_LIMIT_SECONDS = 60;
const FINISH_WINDOW_SECONDS = 12;
type Runtime = {
 physics: DerbyPhysics; renderer: DerbyRenderer; stage: Stage; elapsed: number; countdown: number;
 builds: Blueprint[]; racerIds: PlayerId[]; lastPublish: number; lastNetwork: number; animation: number;
 scores: number[]; heat: number; paused: boolean; readyTime: number; podiumTime: number; firstFinishAt: number | null;
};
const cloneBuilds = () => PLAYER_IDS.map(id => ({ ...DEFAULT_BUILDS[id % DEFAULT_BUILDS.length] }));

export default function DoodleDerby() {
 const canvasRef = useRef<HTMLDivElement>(null), runtime = useRef<Runtime | null>(null);
 const [stage, setStage] = useState<Stage>('garage'), [builds, setBuilds] = useState<Blueprint[]>(cloneBuilds), [snapshots, setSnapshots] = useState<VehicleSnapshot[]>([]);
 const [racerIds, setRacerIds] = useState<PlayerId[]>([0,1]);
 const [elapsed, setElapsed] = useState(0), [countdown, setCountdown] = useState(3), [heat, setHeat] = useState(1), [scores, setScores] = useState([0,0,0,0]);
 const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [paused, setPaused] = useState(false);
 const [partyOpen, setPartyOpen] = useState(false), [partyBusy, setPartyBusy] = useState(false), [partyError, setPartyError] = useState('');
 const [roomCode, setRoomCode] = useState(''), [players, setPlayers] = useState<PartyPlayer[]>([]);
 const [finishCountdown, setFinishCountdown] = useState<number | null>(null);
 const [muted, setMuted] = useState(false), mutedRef = useRef(false);
 const partyRef = useRef<PartyHost | null>(null), playersRef = useRef<PartyPlayer[]>([]);
 const audioRef = useRef<AudioContext | null>(null), heldKeys = useRef(new Set<string>());
 const connectedIds = () => playersRef.current.filter(p=>p.connected).map(p=>p.id).sort((a,b)=>a-b);
 const raceConnected = (r:Runtime) => r.racerIds.every(id=>playersRef.current.some(p=>p.id===id&&p.connected));
 const readiness = (targetHeat:number) => PLAYER_IDS.map(id=>playersRef.current.some(p=>p.id===id&&p.connected&&p.ready&&p.readyHeat===targetHeat));
 function partyState(r:Runtime):PartyState {
  return { stage:r.stage,builds:r.builds,racerIds:r.racerIds,snapshots:r.physics.getSnapshots(),elapsed:r.elapsed,countdown:Math.max(0,Math.ceil(r.countdown)),heat:r.heat,scores:r.scores,ready:readiness(r.stage==='final'?1:r.stage==='results'?r.heat+1:r.heat),paused:r.paused,finishCountdown:r.firstFinishAt===null?null:Math.max(0,Math.min(HEAT_LIMIT_SECONDS,r.firstFinishAt+FINISH_WINDOW_SECONDS)-r.elapsed) };
 }
 function sound(frequency:number,duration=.1) {
  if(mutedRef.current)return;
  try { const a=audioRef.current??(audioRef.current=new AudioContext()); if(a.state==='suspended')void a.resume();
   const o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.setValueAtTime(frequency,a.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.65,a.currentTime+duration);g.gain.setValueAtTime(.04,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration);
  }catch{}
 }
 function syncGarageRoster(r:Runtime) {
  const ids=partyRef.current?connectedIds():[0,1] as PlayerId[];
  if(partyRef.current) {
   for(const player of playersRef.current) if(isLegalBuild(player.build)) r.builds[player.id]={...player.build};
   setBuilds([...r.builds]);
  }
  r.racerIds=ids;r.readyTime=0;
  r.physics.reset(r.builds,ids);r.renderer.setBuilds(partyRef.current?r.builds:r.builds.slice(0,2));setRacerIds([...ids]);
 }
 function startHeat(r:Runtime) {
  heldKeys.current.clear();r.physics.reset(r.builds,r.racerIds);r.stage='countdown';r.countdown=3;r.elapsed=0;r.paused=false;r.readyTime=0;r.firstFinishAt=null;setFinishCountdown(null);
  setCountdown(3);setElapsed(0);setPaused(false);setStage('countdown');setPartyOpen(false);sound(440);
 }
 function nextHeat(r:Runtime) {
  if(r.heat>=3){r.stage='final';setStage('final');return;}
  r.heat++;r.stage='garage';r.physics.clearInputs();setHeat(r.heat);setStage('garage');syncGarageRoster(r);
 }
 function rematch(r:Runtime) {
  r.stage='garage';r.heat=1;r.scores=[0,0,0,0];r.elapsed=0;syncGarageRoster(r);
  setScores([...r.scores]);setHeat(1);setStage('garage');setElapsed(0);
 }
 useEffect(()=>{
  let cancelled=false,last=performance.now(),raf=0;
  async function initialize(){
   try {
    const [{DerbyPhysics},{DerbyRenderer},{preloadModels}]=await Promise.all([import('@/game/physics'),import('@/game/renderer'),import('@/game/assets')]);
    await preloadModels();if(cancelled||!canvasRef.current)return;
    const physics=new DerbyPhysics(),renderer=new DerbyRenderer(canvasRef.current),initial=cloneBuilds();physics.reset(initial,[0,1]);renderer.setBuilds(initial.slice(0,2));
    const r:Runtime={physics,renderer,stage:'garage',elapsed:0,countdown:3,builds:initial,racerIds:[0,1],lastPublish:0,lastNetwork:0,animation:0,scores:[0,0,0,0],heat:1,paused:false,readyTime:0,podiumTime:0,firstFinishAt:null};
    runtime.current=r;setLoaded(true);
    let previousSnapshots:VehicleSnapshot[]=[];
    function frame(now:number) {
     if(cancelled)return;const dt=Math.min((now-last)/1000,.05);last=now;r.animation+=dt;
     const shouldPause=!!partyRef.current&&(document.hidden||!raceConnected(r))&&(r.stage==='racing'||r.stage==='countdown');
     if(shouldPause!==r.paused){r.paused=shouldPause;r.physics.clearInputs();heldKeys.current.clear();setPaused(shouldPause);}
     if(partyRef.current&&(r.stage==='garage'||r.stage==='final')) {
      const ids=r.stage==='garage'?r.racerIds:connectedIds();
      const ready=readiness(r.stage==='final'?1:r.heat);
      const allReady=ids.length>=2&&ids.every(id=>ready[id])&&!document.hidden;
      r.readyTime=allReady?r.readyTime+dt:0;
      if(r.readyTime>=READY_SETTLE_SECONDS){if(r.stage==='final')rematch(r);startHeat(r);}
     }
     if(!r.paused&&r.stage==='countdown') {
      const before=Math.ceil(r.countdown);r.countdown-=dt;
      if(Math.ceil(r.countdown)!==before)sound(r.countdown<=0?880:440,.14);
      if(r.countdown<=0){r.stage='racing';r.elapsed=0;r.physics.start();previousSnapshots=[];if(!partyRef.current)for(const key of heldKeys.current)r.physics.setInput(key==='KeyF'?0:1,true);setStage('racing');}
     } else if(!r.paused&&r.stage==='racing') {
      r.elapsed+=dt;r.physics.update(dt);const result=r.physics.getSnapshots();
      for(const s of result){const prev=previousSnapshots.find(p=>p.id===s.id);if(!prev)continue;
       if(s.jumps>prev.jumps)sound(330+s.id*45,.16);
       else if(s.finished&&!prev.finished)sound(1000,.3);
       else if(s.recoveries>prev.recoveries)sound(110,.22);
       else if(s.grounded&&!prev.grounded&&s.jumps>0)sound(170,.05);
      }
      previousSnapshots=result;
      if(r.firstFinishAt===null&&result.some(s=>s.finished))r.firstFinishAt=r.elapsed;
      const deadline=r.firstFinishAt===null?HEAT_LIMIT_SECONDS:Math.min(HEAT_LIMIT_SECONDS,r.firstFinishAt+FINISH_WINDOW_SECONDS);
      if(result.every(s=>s.finished)||r.elapsed>=deadline) {
       r.physics.clearInputs();heldKeys.current.clear();r.stage='results';r.podiumTime=0;
       const awards=heatPoints(result);r.scores=r.scores.map((n,id)=>n+awards[id]);
       setScores([...r.scores]);setStage('results');setSnapshots(result);sound(660,.3);
      }
     } else if(partyRef.current&&r.stage==='results') {
      r.podiumTime+=dt;if(r.podiumTime>=PODIUM_SECONDS)nextHeat(r);
     }
     const current=r.physics.getSnapshots();
     if(r.renderer.parent.clientWidth>0)r.renderer.render(r.stage,current,dt,r.animation);
     const live=r.stage==='racing'||r.stage==='countdown';
     if(now-r.lastNetwork>(live?33:150)){r.lastNetwork=now;partyRef.current?.publish(partyState(r));}
     if(live&&now-r.lastPublish>70){r.lastPublish=now;setSnapshots(current);setElapsed(r.elapsed);setFinishCountdown(r.firstFinishAt===null?null:Math.max(0,Math.min(HEAT_LIMIT_SECONDS,r.firstFinishAt+FINISH_WINDOW_SECONDS)-r.elapsed));setCountdown(Math.max(0,Math.ceil(r.countdown)));}
     raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
   }catch(e){setError(e instanceof Error?e.message:'Could not start the game.');}
  }
  void initialize();const held=heldKeys.current;
  const keydown=(e:KeyboardEvent)=>{if(partyRef.current)return;const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null||e.repeat)return;const r=runtime.current;if(!r||!(r.stage==='racing'||r.stage==='countdown'))return;e.preventDefault();held.add(e.code);if(r.stage==='racing')r.physics.setInput(id,true);};
  const keyup=(e:KeyboardEvent)=>{const id=e.code==='KeyF'?0:e.code==='KeyJ'?1:null;if(id===null)return;e.preventDefault();if(held.delete(e.code)&&runtime.current?.stage==='racing'&&!partyRef.current)runtime.current.physics.setInput(id,false);};
  const clear=()=>{held.clear();runtime.current?.physics.clearInputs();};
  // Phones own their gestures. Merely clicking away from the TV must not cancel them.
  const blur=()=>{if(!partyRef.current)clear();};
  const visibility=()=>{clear();last=performance.now();const r=runtime.current;if(r&&partyRef.current){r.paused=document.hidden&&(r.stage==='racing'||r.stage==='countdown');setPaused(r.paused);partyRef.current.publish(partyState(r));}};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelled=true;cancelAnimationFrame(raf);clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);partyRef.current?.dispose();partyRef.current=null;runtime.current?.physics.dispose();runtime.current?.renderer.dispose();runtime.current=null;void audioRef.current?.close();audioRef.current=null;};
 },[]);
 function applyBuild(id:PlayerId,build:Blueprint) {
  const r=runtime.current;if(!r||r.stage!=='garage'||!isLegalBuild(build)||JSON.stringify(r.builds[id])===JSON.stringify(build))return;
  r.builds=r.builds.map((b,i)=>i===id?{...build}:b);setBuilds([...r.builds]);r.renderer.setBuilds(partyRef.current?r.builds:r.builds.slice(0,2));r.physics.reset(r.builds,r.racerIds);r.readyTime=0;
 }
 function onBuildChange(id:PlayerId,build:Blueprint){if(!partyRef.current){applyBuild(id,build);sound(330,.055);}}
 function onStart(){const r=runtime.current;if(!r||r.racerIds.length<2||!r.racerIds.every(id=>isLegalBuild(r.builds[id])))return;if(partyRef.current&&(!raceConnected(r)||(r.stage==='garage'&&!r.racerIds.every(id=>readiness(r.heat)[id]))))return;startHeat(r);}
 function onHold(id:PlayerId,held:boolean){const r=runtime.current;if(r?.stage==='racing'&&!partyRef.current)r.physics.setInput(id,held);}
 async function createParty() {
  const r=runtime.current;
  if(!r){setPartyError('The hill is still loading. Try again in a moment.');return;}
  if(partyBusy||partyRef.current)return;setPartyBusy(true);setPartyError('');sound(330,.05);
  try {
   const {createHostParty}=await import('@/game/party-client');
   r.stage='garage';r.physics.clearInputs();r.racerIds=[];r.heat=1;r.scores=[0,0,0,0];r.elapsed=0;r.firstFinishAt=null;
   setRacerIds([]);setStage('garage');setHeat(1);setScores([...r.scores]);setElapsed(0);setFinishCountdown(null);
   const party=await createHostParty({
    onPlayers:next=>{playersRef.current=next;setPlayers(next);const current=runtime.current;if(current?.stage==='garage'){
     next.forEach(p=>applyBuild(p.id,p.build));const ids=next.filter(p=>p.connected).map(p=>p.id).sort((a,b)=>a-b);
     if(ids.join()!==current.racerIds.join()){current.racerIds=ids;current.readyTime=0;current.physics.reset(current.builds,ids);setRacerIds([...ids]);}
    }},
    onInput:(id,kind)=>{const current=runtime.current;if(!current)return;if(kind==='cancel'){current.physics.cancelInput(id);return;}if(current.stage==='racing'&&!current.paused&&current.racerIds.includes(id)&&raceConnected(current)&&!document.hidden)current.physics.setInput(id,kind==='hold');},
    onError:message=>setPartyError(message),
   },partyState(r));
   if(!runtime.current){await party.close();return;}partyRef.current=party;r.renderer.setBuilds(r.builds);setRoomCode(party.code);
  }catch(e){r.racerIds=[0,1];setRacerIds([0,1]);setPartyError(e instanceof Error?e.message:'Could not open a room. Please try again.');}finally{setPartyBusy(false);}
 }
 async function closeParty(){const party=partyRef.current;partyRef.current=null;party?.dispose();playersRef.current=[];setPartyOpen(false);setPlayers([]);setRoomCode('');setPartyError('');const r=runtime.current;if(r){r.paused=false;rematch(r);setPaused(false);}try{await party?.close();}catch{}}
 const ready=PLAYER_IDS.map(id=>players.some(p=>p.id===id&&p.connected&&p.ready&&p.readyHeat===heat));
 return <main className="doodle-derby"><div ref={canvasRef} className="derby-canvas" style={{position:'fixed',inset:0}}/>
  <DerbyUI stage={stage} builds={builds} racerIds={racerIds} partyPlayers={players} onBuildChange={onBuildChange} onStart={onStart} onNext={()=>runtime.current&&nextHeat(runtime.current)} onRematch={()=>runtime.current&&rematch(runtime.current)} snapshots={snapshots} elapsed={elapsed} countdown={countdown} heat={heat} scores={scores} tips={PLAYER_IDS.map(id=>localTip(snapshots.find(s=>s.id===id)))} onHold={onHold} onReset={onStart} onCancelInput={id=>runtime.current?.physics.cancelInput(id)} loaded={loaded} phoneRoom={roomCode||undefined} phoneReady={ready} onPhoneParty={()=>setPartyOpen(true)} muted={muted} finishCountdown={finishCountdown} onToggleSound={()=>{mutedRef.current=!mutedRef.current;setMuted(mutedRef.current);if(!mutedRef.current)sound(440);}}/>
  {paused&&(stage==='racing'||stage==='countdown')&&<div className="party-pause"><strong>QUICK PIT STOP</strong><p>Keep this spectator screen open and reconnect the racers. The race resumes together.</p><button className="phone-party-button" onClick={()=>setPartyOpen(true)}>ROOM {roomCode}</button></div>}
  <PhonePartyPanel open={partyOpen} onOpenChange={setPartyOpen} code={roomCode||undefined} players={players} busy={partyBusy} error={partyError} onCreate={()=>void createParty()} onClose={()=>void closeParty()}/>
  {error&&<div role="alert" style={{position:'fixed',bottom:20,left:20,right:20,zIndex:50,background:'#fff',padding:24,border:'3px solid #222'}}>The game could not start: {error}. Try refreshing in a browser with WebGL enabled.</div>}
 </main>;
}
