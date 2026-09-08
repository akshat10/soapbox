'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import DerbyUI from './DerbyUI';
import SoundControls from './SoundControls';
import { useSoundtrack } from '@/hooks/use-soundtrack';
import { useMutePreference } from '@/hooks/use-mute-preference';
import PhonePartyPanel from './PhonePartyPanel';
import { DEFAULT_BUILDS, isLegalBuild } from '@/game/catalogue';
import { localTip } from '@/game/advice';
import { heatPoints, PLAYER_IDS } from '@/game/race';
import { SOLO_RIVALS, SoloRaceDriver } from '@/game/solo';
import { sessionCourse, heatDeadline, finishWindow, hopPlayer, steeringPlayer, keyboardSteering, manualSteering } from '@/game/session-rules';
import { SoloFeedbackTracker, FEEDBACK_TIMING, type SoloMoment, type SoloSnapshot } from '@/game/solo-presentation';
import type { LocalMode } from '@/game/solo';
import type { Blueprint, PlayerId, Stage, VehicleSnapshot } from '@/game/types';
import type { DerbyPhysics } from '@/game/physics';
import type { DerbyRenderer } from '@/game/renderer';
import type { RaceCameraMode } from '@/game/race-camera';
import type { PartyHost } from '@/game/party-client';
import type { PartyPlayer, PartyState } from '@/game/party-types';

// Party rhythm: all joined racers ready → 2s settle → 3s grid → race → 4.5s podium.
const READY_SETTLE_SECONDS = 2;
const PODIUM_SECONDS = 4.5;
type Runtime = {
 feedback: SoloFeedbackTracker; moment: SoloMoment | null;
 ai: SoloRaceDriver; mode: LocalMode; manualPaused: boolean; physics: DerbyPhysics; renderer: DerbyRenderer; stage: Stage; elapsed: number; countdown: number;
 builds: Blueprint[]; racerIds: PlayerId[]; lastPublish: number; lastNetwork: number; animation: number;
 scores: number[]; heat: number; paused: boolean; readyTime: number; podiumTime: number; firstFinishAt: number | null;
};
const cloneBuilds = () => [{ ...DEFAULT_BUILDS[0] }, ...SOLO_RIVALS.map(rival => ({ ...rival.build }))];

export default function DoodleDerby() {
 const canvasRef = useRef<HTMLDivElement>(null), runtime = useRef<Runtime | null>(null);
 const landingVisible = useRef(true);
 const onLandingChange = useCallback((visible:boolean)=>{landingVisible.current=visible;},[]);
 const [stage, setStage] = useState<Stage>('garage'), [builds, setBuilds] = useState<Blueprint[]>(cloneBuilds), [snapshots, setSnapshots] = useState<VehicleSnapshot[]>([]);
 const [racerIds, setRacerIds] = useState<PlayerId[]>([...PLAYER_IDS]);
 const [mode, setMode] = useState<LocalMode>('solo');
 const [elapsed, setElapsed] = useState(0), [countdown, setCountdown] = useState(3), [heat, setHeat] = useState(1), [scores, setScores] = useState([0,0,0,0]);
 const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [paused, setPaused] = useState(false);
 const [partyOpen, setPartyOpen] = useState(false), [partyBusy, setPartyBusy] = useState(false), [partyError, setPartyError] = useState('');
 const [roomCode, setRoomCode] = useState(''), [players, setPlayers] = useState<PartyPlayer[]>([]);
 const [finishCountdown, setFinishCountdown] = useState<number | null>(null);
 const [muted, setMuted] = useMutePreference(), mutedRef = useRef(false);
 const soundtrack = useSoundtrack(muted, paused && (stage === 'racing' || stage === 'countdown'));
 useEffect(() => {
  mutedRef.current = muted;
  if (muted) for (const audio of trackSounds.current.values()) audio.pause();
 }, [muted]);
 const [reverseArrows, setReverseArrows] = useState(true), reverseArrowsRef = useRef(true);
 const [raceMoment, setRaceMoment] = useState<SoloMoment | null>(null);
 const [cameraMode, setCameraMode] = useState<RaceCameraMode>('chase'), cameraModeRef = useRef<RaceCameraMode>('chase');
 function toggleCamera() {
  cameraModeRef.current = cameraModeRef.current === 'chase' ? 'scenic' : 'chase';
  runtime.current?.renderer.setCameraMode(cameraModeRef.current);
  setCameraMode(cameraModeRef.current);
 }
 const trackSounds = useRef(new Map<string, HTMLAudioElement>());
 const partyRef = useRef<PartyHost | null>(null), playersRef = useRef<PartyPlayer[]>([]);
 const pointerHops = useRef(new Set<PlayerId>()), pointerSteering = useRef(new Map<PlayerId, number>());
 const audioRef = useRef<AudioContext | null>(null), heldKeys = useRef(new Set<string>());
 const connectedIds = () => playersRef.current.filter(p=>p.connected).map(p=>p.id).sort((a,b)=>a-b);
 const raceConnected = (r:Runtime) => r.racerIds.every(id=>playersRef.current.some(p=>p.id===id&&p.connected));
 const readiness = (targetHeat:number) => PLAYER_IDS.map(id=>playersRef.current.some(p=>p.id===id&&p.connected&&p.ready&&p.readyHeat===targetHeat));
 function steerPlayer(r:Runtime,id:PlayerId){r.physics.setSteering(id,pointerSteering.current.get(id)||keyboardSteering(r.mode,id,heldKeys.current,reverseArrowsRef.current));}
 function changeArrowDirection(reverse:boolean){
  reverseArrowsRef.current=reverse;setReverseArrows(reverse);
  try{localStorage.setItem('silicon-racer.reverse-arrows.v1',String(reverse));}catch{}
  heldKeys.current.delete('ArrowLeft');heldKeys.current.delete('ArrowRight');
  const r=runtime.current;if(r?.mode==='solo')steerPlayer(r,0);
 }
 function partyState(r:Runtime):PartyState {
  return { stage:r.stage,builds:r.builds,racerIds:r.racerIds,snapshots:r.physics.getSnapshots(),elapsed:r.elapsed,countdown:Math.max(0,Math.ceil(r.countdown)),heat:r.heat,scores:r.scores,ready:readiness(r.stage==='final'?1:r.stage==='results'?r.heat+1:r.heat),paused:r.paused,finishCountdown:finishWindow(r.mode,!!partyRef.current,r.firstFinishAt,r.elapsed) };
 }
 function sound(frequency:number,duration=.1) {
  if(mutedRef.current)return;
  try { const a=audioRef.current??(audioRef.current=new AudioContext()); if(a.state==='suspended')void a.resume();
   const o=a.createOscillator(),g=a.createGain();o.type='triangle';o.frequency.setValueAtTime(frequency,a.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.65,a.currentTime+duration);g.gain.setValueAtTime(.04,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+duration);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+duration);
  }catch{}
 }
 function trackSound(kind:'ring'|'boost') {
  if(mutedRef.current)return;
  let audio=trackSounds.current.get(kind);
  if(!audio){audio=new Audio(`/audio/track/${kind==='ring'?'ring-collect':'boost-whoosh'}.wav`);audio.volume=.3;trackSounds.current.set(kind,audio);}
  audio.currentTime=0;void audio.play().catch(()=>sound(kind==='ring'?1320:560,.15));
 }
 function toggleSound() {
  mutedRef.current=!mutedRef.current;setMuted(mutedRef.current);
  if(mutedRef.current){for(const audio of trackSounds.current.values())audio.pause();}
  else sound(440);
 }
 function syncGarageRoster(r:Runtime) {
  const ids=partyRef.current?connectedIds():r.mode==='solo'?[...PLAYER_IDS]:[0,1] as PlayerId[];
  if(partyRef.current) {
   for(const player of playersRef.current) if(isLegalBuild(player.build)) r.builds[player.id]={...player.build};
   setBuilds([...r.builds]);
  }
  if(!partyRef.current&&r.mode==='solo'){for(const rival of SOLO_RIVALS)r.builds[rival.id]={...rival.build};setBuilds([...r.builds]);}
  r.racerIds=ids;r.readyTime=0;
  r.physics.reset(r.builds,ids,sessionCourse(!!partyRef.current));r.renderer.setBuilds(partyRef.current||r.mode==='solo'?r.builds:r.builds.slice(0,2));setRacerIds([...ids]);
 }
 function startHeat(r:Runtime) {
  r.feedback.reset();r.moment=null;setRaceMoment(null);
  heldKeys.current.clear();pointerHops.current.clear();pointerSteering.current.clear();r.ai.reset();r.physics.reset(r.builds,r.racerIds);r.stage='countdown';r.manualPaused=false;r.countdown=3;r.elapsed=0;r.paused=false;r.readyTime=0;r.firstFinishAt=null;setFinishCountdown(null);
  setCountdown(3);setElapsed(0);setPaused(false);setStage('countdown');setPartyOpen(false);sound(440);
 }
 function nextHeat(r:Runtime) {
  if(r.heat>=3){r.stage='final';setStage('final');return;}
  r.heat++;r.stage='garage';r.physics.clearInputs();setHeat(r.heat);setStage('garage');syncGarageRoster(r);
 }
 function rematch(r:Runtime) {
  r.stage='garage';r.manualPaused=false;r.paused=false;r.heat=1;r.scores=[0,0,0,0];r.elapsed=0;syncGarageRoster(r);
  setScores([...r.scores]);setHeat(1);setStage('garage');setElapsed(0);
 }
 useEffect(()=>{
  try{const saved=localStorage.getItem('silicon-racer.reverse-arrows.v1');reverseArrowsRef.current=saved===null||saved==='true';}catch{}
  const sounds=trackSounds.current;
  let cancelled=false,last=performance.now(),raf=0;
  async function initialize(){
   try {
    const [{DerbyPhysics},{DerbyRenderer},{preloadModels},{loadCourseScene,disposeCourseScene}]=await Promise.all([import('@/game/physics'),import('@/game/renderer'),import('@/game/assets'),import('@/game/course-scene')]);
    const [,courseScene]=await Promise.all([preloadModels(),loadCourseScene()]);if(cancelled||!canvasRef.current){disposeCourseScene(courseScene);return;}
    const physics=new DerbyPhysics(),renderer=new DerbyRenderer(canvasRef.current,{courseScene}),initial=cloneBuilds();physics.reset(initial,PLAYER_IDS,sessionCourse(false));renderer.setBuilds(initial);
    const r:Runtime={feedback:new SoloFeedbackTracker(),moment:null,ai:new SoloRaceDriver(),mode:'solo',manualPaused:false,physics,renderer,stage:'garage',elapsed:0,countdown:3,builds:initial,racerIds:[...PLAYER_IDS],lastPublish:0,lastNetwork:0,animation:0,scores:[0,0,0,0],heat:1,paused:false,readyTime:0,podiumTime:0,firstFinishAt:null};
    runtime.current=r;setReverseArrows(reverseArrowsRef.current);setRaceMoment(null);setStage('garage');setMode('solo');setRacerIds([...PLAYER_IDS]);setBuilds([...initial]);setSnapshots([]);setHeat(1);setScores([...r.scores]);setElapsed(0);setPaused(false);setRoomCode('');setPlayers([]);playersRef.current=[];setPartyOpen(false);setLoaded(true);
    let previousSnapshots:VehicleSnapshot[]=[];
    function frame(now:number) {
     if(cancelled)return;const dt=Math.min((now-last)/1000,.05);last=now;r.animation+=dt;
     const shouldPause=(partyRef.current?(document.hidden||!raceConnected(r)):(document.hidden||r.manualPaused))&&(r.stage==='racing'||r.stage==='countdown');
     if(shouldPause!==r.paused){r.paused=shouldPause;r.physics.clearInputs();heldKeys.current.clear();pointerHops.current.clear();pointerSteering.current.clear();setPaused(shouldPause);}
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
      if(r.countdown<=0){
       r.stage='racing';r.elapsed=0;r.physics.start();previousSnapshots=[];
       if(!partyRef.current){
        for(const id of r.racerIds){
         if(r.mode==='solo'&&id!==0)continue;
         if(pointerHops.current.has(id)||[...heldKeys.current].some(key=>hopPlayer(r.mode,key)===id))r.physics.setInput(id,true);
         steerPlayer(r,id);
        }
       }
       setStage('racing');
      }
     } else if(!r.paused&&r.stage==='racing') {
      if(!partyRef.current&&r.mode==='solo')r.elapsed+=r.ai.update(r.physics,dt,r.heat);
      else {r.elapsed+=dt;r.physics.update(dt);}
      const result=r.physics.getSnapshots();
      if(!partyRef.current&&r.mode==='solo')r.moment=r.feedback.observe(result,r.elapsed);
      for(const raw of result){const s=raw as SoloSnapshot;if(!partyRef.current&&r.mode==='solo'&&s.id!==0)continue;const prev=previousSnapshots.find(p=>p.id===s.id) as SoloSnapshot|undefined;if(!prev)continue;
       if((s.rings??0)>(prev.rings??0))trackSound('ring');
       else if((s.boosts??0)>(prev.boosts??0))trackSound('boost');
       else if(s.jumps>prev.jumps)sound(330+s.id*45,.16);
       else if(s.finished&&!prev.finished)sound(1000,.3);
       else if(s.recoveries>prev.recoveries)sound(110,.22);
       else if(s.grounded&&!prev.grounded&&s.jumps>0)sound(170,.05);
      }
      previousSnapshots=result;
      if(r.firstFinishAt===null&&result.some(s=>s.finished))r.firstFinishAt=r.elapsed;
      const deadline=heatDeadline(r.mode,!!partyRef.current,r.firstFinishAt);
      const human=result.find(s=>s.id===0);
      const finishBeatDone=partyRef.current||r.mode!=='solo'||!human?.finished||r.elapsed-(human.finishTime??r.elapsed)>=FEEDBACK_TIMING.brief;
      if((result.every(s=>s.finished)&&finishBeatDone)||r.elapsed>=deadline) {
       r.physics.clearInputs();heldKeys.current.clear();r.stage='results';r.podiumTime=0;
       const awards=heatPoints(result);r.scores=r.scores.map((n,id)=>n+awards[id]);
       setScores([...r.scores]);setStage('results');setSnapshots(result);sound(660,.3);
      }
     } else if(partyRef.current&&r.stage==='results') {
      r.podiumTime+=dt;if(r.podiumTime>=PODIUM_SECONDS)nextHeat(r);
     }
     const current=r.physics.getSnapshots();
     // The homepage has its own overview renderer; only draw the visible scene.
     if(!landingVisible.current&&r.renderer.parent.clientWidth>0)r.renderer.render(r.stage,current,dt,r.animation,!partyRef.current&&r.mode==='solo'?0:undefined);
     const live=r.stage==='racing'||r.stage==='countdown';
     if(now-r.lastNetwork>(live?33:150)){r.lastNetwork=now;partyRef.current?.publish(partyState(r));}
     if(live&&now-r.lastPublish>70){r.lastPublish=now;setSnapshots(current);setElapsed(r.elapsed);setRaceMoment(r.moment);setFinishCountdown(finishWindow(r.mode,!!partyRef.current,r.firstFinishAt,r.elapsed));setCountdown(Math.max(0,Math.ceil(r.countdown)));}
     raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
   }catch(e){setError(e instanceof Error?e.message:'Could not start the game.');}
  }
  void initialize();const held=heldKeys.current;
  const inputId=(code:string):PlayerId|null=>runtime.current?hopPlayer(runtime.current.mode,code):null;
  const ignoredTarget=(target:EventTarget|null,code:string)=>target instanceof HTMLElement&&(!!target.closest('input,textarea,select,[contenteditable]')||(code==='Space'&&!!target.closest('button:not(.hop-control),a')));
  const keydown=(e:KeyboardEvent)=>{
   if(ignoredTarget(e.target,e.code))return;
   const r=runtime.current;if(!r||!(r.stage==='racing'||r.stage==='countdown'))return;
   if(r.mode==='solo'&&!partyRef.current&&e.code==='KeyC'&&!e.repeat&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();toggleCamera();return;}
   if(partyRef.current)return;
   if(e.code==='Escape'&&!e.repeat){r.manualPaused=!r.manualPaused;return;}
   if(r.paused)return;
   const steeringId=steeringPlayer(r.mode,e.code);
   if(steeringId!==null){e.preventDefault();held.add(e.code);steerPlayer(r,steeringId);return;}
   const id=inputId(e.code);if(id===null||e.repeat)return;e.preventDefault();held.add(e.code);if(r.stage==='racing')r.physics.setInput(id,true);
  };
  const keyup=(e:KeyboardEvent)=>{
   if(!held.delete(e.code))return;e.preventDefault();
   const r=runtime.current,steeringId=r?steeringPlayer(r.mode,e.code):null;
   if(r&&steeringId!==null){if(!partyRef.current&&!r.paused)steerPlayer(r,steeringId);return;}
   const id=inputId(e.code);
   if(id!==null&&r?.stage==='racing'&&!r.paused&&!partyRef.current&&!pointerHops.current.has(id)&&![...held].some(code=>inputId(code)===id))r.physics.setInput(id,false);
  };
  const clear=()=>{held.clear();pointerHops.current.clear();pointerSteering.current.clear();runtime.current?.physics.clearInputs();};
  // A local race pauses when focus leaves; phone gestures remain phone-owned.
  const blur=()=>{if(!partyRef.current){clear();const r=runtime.current;if(r&&(r.stage==='racing'||r.stage==='countdown'))r.manualPaused=true;}};
  const visibility=()=>{clear();last=performance.now();const r=runtime.current;if(r&&partyRef.current){r.paused=document.hidden&&(r.stage==='racing'||r.stage==='countdown');setPaused(r.paused);partyRef.current.publish(partyState(r));}};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);document.addEventListener('visibilitychange',visibility);
  return()=>{cancelled=true;cancelAnimationFrame(raf);clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);partyRef.current?.dispose();partyRef.current=null;runtime.current?.physics.dispose();runtime.current?.renderer.dispose();runtime.current=null;void audioRef.current?.close();audioRef.current=null;for(const audio of sounds.values())audio.pause();sounds.clear();};
 },[]);
 function applyBuild(id:PlayerId,build:Blueprint) {
  const r=runtime.current;if(!r||r.stage!=='garage'||!isLegalBuild(build)||JSON.stringify(r.builds[id])===JSON.stringify(build))return;
  r.builds=r.builds.map((b,i)=>i===id?{...build}:b);setBuilds([...r.builds]);r.renderer.setBuilds(partyRef.current||r.mode==='solo'?r.builds:r.builds.slice(0,2));r.physics.reset(r.builds,r.racerIds);r.readyTime=0;
 }
 function onBuildChange(id:PlayerId,build:Blueprint){if(!partyRef.current&&(runtime.current?.mode!=='solo'||id===0)){applyBuild(id,build);sound(330,.055);}}
 function onStart(){const r=runtime.current;if(!r||r.racerIds.length<2||!r.racerIds.every(id=>isLegalBuild(r.builds[id])))return;if(partyRef.current&&(!raceConnected(r)||(r.stage==='garage'&&!r.racerIds.every(id=>readiness(r.heat)[id]))))return;startHeat(r);}
 function keyboardHop(id:PlayerId){const r=runtime.current;return !!r&&[...heldKeys.current].some(key=>hopPlayer(r.mode,key)===id);}
 function onHold(id:PlayerId,held:boolean){const r=runtime.current;if(r?.stage!=='racing'||r.paused||partyRef.current||(r.mode==='solo'&&id!==0))return;if(held)pointerHops.current.add(id);else pointerHops.current.delete(id);r.physics.setInput(id,held||keyboardHop(id));}
 function onCancelInput(id:PlayerId){pointerHops.current.delete(id);if(!keyboardHop(id))runtime.current?.physics.cancelInput(id);}
 function onSteer(id:PlayerId,value:number){const r=runtime.current;if(!r||id>(r.mode==='solo'?0:1)||r.paused||partyRef.current||!(r.stage==='racing'||r.stage==='countdown'))return;pointerSteering.current.set(id,manualSteering(value));steerPlayer(r,id);}
 function onModeChange(next:LocalMode){const r=runtime.current;if(!r||r.stage!=='garage'||partyRef.current)return;r.mode=next;setMode(next);rematch(r);setSnapshots([]);}
 function onPause(){const r=runtime.current;if(r&&!partyRef.current)r.manualPaused=!r.manualPaused;}
 async function createParty() {
  const r=runtime.current;
  if(!r){setPartyError('The hill is still loading. Try again in a moment.');return;}
  if(partyBusy||partyRef.current)return;setPartyBusy(true);setPartyError('');sound(330,.05);
  try {
   const {createHostParty}=await import('@/game/party-client');
   r.stage='garage';r.physics.clearInputs();r.racerIds=[];r.physics.reset(r.builds,[],sessionCourse(true));r.heat=1;r.scores=[0,0,0,0];r.elapsed=0;r.firstFinishAt=null;
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
  }catch(e){syncGarageRoster(r);setPartyError(e instanceof Error?e.message:'Could not open a room. Please try again.');}finally{setPartyBusy(false);}
 }
 async function closeParty(){const party=partyRef.current;partyRef.current=null;party?.dispose();playersRef.current=[];setPartyOpen(false);setPlayers([]);setRoomCode('');setPartyError('');const r=runtime.current;if(r){r.paused=false;rematch(r);setPaused(false);}try{await party?.close();}catch{}}
 const ready=PLAYER_IDS.map(id=>players.some(p=>p.id===id&&p.connected&&p.ready&&p.readyHeat===heat));
 return <main className="doodle-derby"><div ref={canvasRef} className="derby-canvas"/>
  <DerbyUI soundControls={<SoundControls soundtrack={soundtrack} muted={muted} onToggleSound={toggleSound}/>} cameraMode={cameraMode} onToggleCamera={toggleCamera} onLandingChange={onLandingChange} raceMoment={raceMoment} reverseArrows={reverseArrows} onReverseArrowsChange={changeArrowDirection} mode={mode} onModeChange={onModeChange} onPause={onPause} onSteer={onSteer} stage={stage} builds={builds} racerIds={racerIds} partyPlayers={players} onBuildChange={onBuildChange} onStart={onStart} onNext={()=>runtime.current&&nextHeat(runtime.current)} onRematch={()=>runtime.current&&rematch(runtime.current)} snapshots={snapshots} elapsed={elapsed} countdown={countdown} heat={heat} scores={scores} tips={PLAYER_IDS.map(id=>localTip(snapshots.find(s=>s.id===id)))} onHold={onHold} onReset={onStart} onCancelInput={onCancelInput} loaded={loaded} phoneRoom={roomCode||undefined} phoneReady={ready} onPhoneParty={()=>setPartyOpen(true)} muted={muted} finishCountdown={finishCountdown} onToggleSound={toggleSound}/>
  {paused&&(stage==='racing'||stage==='countdown')&&<div className="party-pause"><strong>QUICK PIT STOP</strong><p>{roomCode?'Keep this spectator screen open and reconnect the racers. The race resumes together.':'Take a breath. The hill can wait.'}</p>{!roomCode&&mode==='solo'&&<label className="steering-preference"><input type="checkbox" checked={reverseArrows} onChange={event=>changeArrowDirection(event.target.checked)}/><span>Reverse arrow keys</span></label>}<button className="phone-party-button" onClick={()=>roomCode?setPartyOpen(true):onPause()}>{roomCode?`ROOM ${roomCode}`:'Resume race'}</button></div>}
  <PhonePartyPanel open={partyOpen} onOpenChange={setPartyOpen} code={roomCode||undefined} players={players} busy={partyBusy} error={partyError} onCreate={()=>void createParty()} onClose={()=>void closeParty()}/>
  {error&&<div role="alert" style={{position:'fixed',bottom:20,left:20,right:20,zIndex:50,background:'#fff',padding:24,border:'3px solid #222'}}>The game could not start: {error}. Try refreshing in a browser with WebGL enabled.</div>}
 </main>;
}
