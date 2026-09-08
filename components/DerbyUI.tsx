'use client';
import Image from 'next/image';


import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Flag, Gauge, HelpCircle, Pause, RotateCcw, Smartphone, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Blueprint, PlayerId, VehicleSnapshot, Stage } from '@/game/types';
import type { PartyPlayer } from '@/game/party-types';
import { BODIES, WHEELS, buildCost, isLegalBuild, getBody, WHEELBASE_COST } from '@/game/catalogue';
import { PLAYER_COLORS, PLAYER_NAMES, racePlace, rankRace, heatPoints, raceCue } from '@/game/race';
import { SiliconBrand } from './SiliconBrand';
import { PartyJoinCode, PartySeats } from './PhonePartyPanel';
import LandingScene from './LandingScene';
import SoloGarageScreen from './SoloGarageScreen';
import { soloName, type LocalMode } from '@/game/solo';
import { courseForSnapshot } from '@/game/course';
import { soloDrivingCue, type SoloMoment, type SoloSnapshot } from '@/game/solo-presentation';
import SoloRaceMoment from './SoloRaceMoment';
import RaceCameraButton from './RaceCameraButton';
import type { RaceCameraMode } from '@/game/race-camera';

export interface DerbyUIProps {
  soundControls: ReactNode;
  cameraMode: RaceCameraMode; onToggleCamera: () => void;
  onLandingChange: (visible: boolean) => void;
  raceMoment: SoloMoment | null;
  reverseArrows: boolean; onReverseArrowsChange: (reverse: boolean) => void;
  mode: LocalMode; onModeChange: (mode: LocalMode) => void; onPause: () => void; onSteer: (player: PlayerId, value: number) => void;
  stage: Stage; builds: Blueprint[]; racerIds: PlayerId[]; partyPlayers: PartyPlayer[];
  onBuildChange: (player: PlayerId, blueprint: Blueprint) => void;
  onStart: () => void; onNext: () => void; onRematch: () => void;
  snapshots: VehicleSnapshot[]; elapsed: number; countdown: number; heat: number;
  scores: number[]; tips: string[]; onHold: (player: PlayerId, held: boolean) => void;
  onReset: () => void; onCancelInput?: (player: PlayerId) => void; loaded: boolean;
  phoneRoom?: string; phoneReady?: boolean[]; onPhoneParty?: () => void;
  muted: boolean; onToggleSound: () => void; finishCountdown?: number | null;
}
const PLAYER_KEYS = ['F', 'J', '', ''];
const SPACING: Blueprint['wheelbase'][] = ['short', 'standard', 'long'];
const BODY_NAMES: Record<string, string> = { sourdough: 'Sourdough', mission_burrito: 'Burrito', painted_porch: 'Victorian porch', bathtub: 'Bathtub', sofa: 'Sofa', dumpster: 'Dumpster', toaster: 'Toaster', suitcase: 'Suitcase', lunchbox: 'Lunchbox', canoe: 'Canoe', banana: 'Banana', ironingboard: 'Ironing board', shoppingcart: 'Shopping cart', fridge: 'Fridge', arcade: 'Arcade cabinet' };
const pointsLabel = (value: number) => Number((value || 0).toFixed(2));
const timeLabel = (seconds: number | null | undefined) => seconds == null || !Number.isFinite(seconds) ? '—' : `${seconds.toFixed(2)}s`;

function BodyGlyph({ id, color = 'currentColor' }: { id: string; color?: string }) {
  if (['sourdough', 'mission_burrito', 'painted_porch'].includes(id)) return <Image unoptimized width={86} height={72} className="body-glyph authored-part" src={`/models/sf/${id}.png`} alt=""/>;
  const line = { stroke: '#20231d', strokeWidth: 2.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  let shape;
  if (id.includes('bath')) shape = <><path d="M12 20h40l-4 17H19z" fill={color} {...line}/><path d="M16 20v-6q0-5 5-5h3v6" fill="none" {...line}/><path d="M11 20h43" {...line}/></>;
  else if (id.includes('sofa')) shape = <><rect x="16" y="13" width="32" height="22" rx="5" fill={color} {...line}/><path d="M11 25h8v8h26v-8h8v15H11z" fill={color} {...line}/><path d="M32 15v16" {...line}/></>;
  else if (id.includes('dump')) shape = <><path d="M13 16h39l-4 24H17z" fill={color} {...line}/><path d="M10 14h45v6H10zM25 24v10M38 24v10" fill={color} {...line}/></>;
  else if (id.includes('toast')) shape = <><path d="M17 17h31a5 5 0 0 1 5 5v16H12V22a5 5 0 0 1 5-5Z" fill={color} {...line}/><path d="M21 17V10q0-4 6-4h11q6 0 6 4v7" fill="#ffe3ac" {...line}/><path d="M22 25h17m9 0v7" {...line}/></>;
  else if (id.includes('suit')) shape = <><rect x="14" y="15" width="36" height="25" rx="4" fill={color} {...line}/><path d="M25 15V9h14v6M21 16v23m22-23v23" fill="none" {...line}/></>;
  else if (id.includes('lunch')) shape = <><rect x="14" y="18" width="36" height="23" rx="4" fill={color} {...line}/><path d="M25 18v-7h14v7M15 28h34M30 26v5h5v-5" fill="none" {...line}/></>;
  else if (id.includes('canoe')) shape = <><path d="M5 21q26 8 54-2L47 38H20z" fill={color} {...line}/><path d="M12 24q22 5 40 0M23 27v9m18-11v10" fill="none" {...line}/></>;
  else if (id.includes('banana')) shape = <><path d="M8 14q15 29 45 8L58 8q-2 29-25 31Q15 38 8 14Z" fill="#ffdc4b" {...line}/><path d="M17 25q15 17 35-1M8 14l-3-4m53-2 2-5" fill="none" {...line}/></>;
  else if (id.includes('iron')) shape = <><path d="M7 18q-5-4 5-5h41l4 7H8Z" fill={color} {...line}/><path d="m19 21 26 19m0-19L21 40" {...line}/></>;
  else if (id.includes('cart') || id.includes('shop')) shape = <><path d="M7 9h7l7 25h29l6-19H17" fill={color} {...line}/><path d="M23 16l4 16m8-16v17m11-17-3 17M20 24h33M21 35v5h29" fill="none" {...line}/></>;
  else if (id.includes('fridge')) shape = <><rect x="21" y="4" width="26" height="38" rx="3" fill={color} {...line}/><path d="M22 18h24M27 10v4m0 9v8" {...line}/></>;
  else shape = <><path d="M20 5h25v15l7 10v12H17V29l5-8z" fill={color} {...line}/><path d="M25 10h15v12H25z" fill="#282d38" {...line}/><path d="M23 31h20m-17-4v4m12-3h2" {...line}/></>;
  return <svg className="body-glyph" viewBox="0 0 64 52" aria-hidden="true">{shape}<circle cx="21" cy="43" r="5" fill="#292e31"/><circle cx="47" cy="43" r="5" fill="#292e31"/><circle cx="21" cy="43" r="1.5" fill="#faf7eb"/><circle cx="47" cy="43" r="1.5" fill="#faf7eb"/></svg>;
}

function WheelGlyph({ kind }: { kind: string }) {
  if (['skate', 'scooter', 'transit_disc'].includes(kind)) return <Image unoptimized width={39} height={34} className="wheel-glyph authored-part" src={`/models/sf/${kind}.png`} alt=""/>;
  const size = kind === 'casters' ? 8 : kind === 'monster' ? 14 : 11;
  return <svg viewBox="0 0 38 34" aria-hidden="true"><circle cx="19" cy="17" r={size} fill="#292e31" stroke="#292e31" strokeWidth={kind === 'monster' ? 3 : 1} strokeDasharray={kind === 'monster' ? '4 2' : undefined}/><circle cx="19" cy="17" r={size * .45} fill="#fcf9ed"/><circle cx="19" cy="17" r="2.7" fill="#292e31"/></svg>;
}

export function GarageCard({ player, build, onChange, controllerDriven = false, solo = false }: { solo?: boolean; player: PlayerId; build: Blueprint; onChange: (blueprint: Blueprint) => void; controllerDriven?: boolean }) {
  const body = getBody(build.bodyId);
  const [showClassics, setShowClassics] = useState(body.family !== 'sf');
  const cost = buildCost(build);
  const groups = [...new Set(BODIES.map(item => item.family))].filter(family => family === 'sf' || showClassics || family === body.family);
  return <section className={`garage-card player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties} aria-label={`Player ${player + 1} garage`}>
    <div className="garage-card-title"><span className="player-badge">{player + 1}</span><div><span className="eyebrow">YOUR RACER</span><h2>{solo ? "Your race build" : PLAYER_NAMES[player]}</h2></div><div className={`bolt-budget ${cost > 10 ? 'over-budget' : ''}`} title="Build with up to 10 bolts"><Zap size={15}/><strong>{10 - cost}</strong><span>left</span></div></div>
    <div className="garage-card-content">
      <div className="roster">
        {groups.map(family => <div className="roster-family" key={family}><div className="family-label">{family === 'sf' ? 'Pick a chassis' : 'The Classics'}</div><div className="body-options">{BODIES.filter(item => item.family === family).map(item => <Button key={item.id} variant="outline" className={`body-option ${item.id === build.bodyId ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, bodyId: item.id })} disabled={!isLegalBuild({ ...build, bodyId: item.id })} aria-pressed={item.id === build.bodyId} title={`${item.description} · ${item.cost} bolts${!isLegalBuild({ ...build, bodyId: item.id }) ? ' · Choose cheaper wheels or shorter spacing first' : ''}`}><BodyGlyph id={item.id} color={`#${item.color.toString(16).padStart(6, '0')}`}/><span>{BODY_NAMES[item.id] || item.name}</span><span className="option-cost">{item.cost}<Zap size={10}/></span>{item.id === build.bodyId && <Check className="selection-check" size={15}/>}</Button>)}</div></div>)}
        <button type="button" className="classics-toggle" onClick={() => setShowClassics(!showClassics)} aria-expanded={showClassics}>{showClassics ? 'Hide Classics' : 'Browse 12 Classics'}</button>
      </div>
      <div className="ride-note"><strong>{body.name}</strong><span>{body.description}</span></div>
      <fieldset className="part-group"><legend>Pick your wheels</legend><div className="wheel-options">{WHEELS.filter(wheel => showClassics || ['skate', 'scooter', 'transit_disc'].includes(wheel.id) || wheel.id === build.wheelId).map(wheel => <Button key={wheel.id} variant="outline" className={`wheel-option ${build.wheelId === wheel.id ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, wheelId: wheel.id })} disabled={!isLegalBuild({ ...build, wheelId: wheel.id })} title={`${wheel.name} · ${wheel.cost} bolts for four${!isLegalBuild({ ...build, wheelId: wheel.id }) ? ' · Choose a cheaper chassis first' : ''}`} aria-pressed={build.wheelId === wheel.id}><WheelGlyph kind={wheel.id}/><span>{wheel.name}</span><small>{wheel.cost}<Zap size={10}/></small></Button>)}</div></fieldset>
      <details className="part-group tune-details"><summary>Fine-tune wheel spacing <span>Optional</span></summary><fieldset className="spacing-group"><legend className="sr-only">Wheel spacing</legend><div className="spacing-options">{SPACING.map(spacing => <Button key={spacing} variant="outline" className={`spacing-option ${build.wheelbase === spacing ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, wheelbase: spacing })} disabled={!isLegalBuild({ ...build, wheelbase: spacing })} aria-pressed={build.wheelbase === spacing}>{spacing === 'standard' ? 'Regular' : spacing}<small>{WHEELBASE_COST[spacing]}<Zap size={9}/></small></Button>)}</div></fieldset></details>
      {!isLegalBuild(build) && <p className="budget-warning" role="alert">Choose a cheaper part to stay within 10 bolts.</p>}
    </div>
    <div className="garage-card-foot">{controllerDriven || solo ? <><kbd>{controllerDriven ? `P${player + 1}` : 'SPACE'}</kbd><span>{controllerDriven ? 'Choose your ride on your phone' : 'Hold to charge. Release to hop.'}</span></> : <div className="local-garage-controls"><span><kbd>{player === 0 ? 'A' : '←'}</kbd> <kbd>{player === 0 ? 'D' : '→'}</kbd> steer</span><span><kbd>{PLAYER_KEYS[player]}</kbd> Hold to charge. Release to hop.</span></div>}</div>
  </section>;
}

function RaceLane({ player, snapshot, snapshots, spectator, onHold, onSteer, onCancelInput, countdown }: { player: PlayerId; snapshot?: VehicleSnapshot; snapshots: VehicleSnapshot[]; spectator: boolean; onHold: (held: boolean) => void; onSteer: (value: number) => void; onCancelInput?: (player: PlayerId) => void; countdown: boolean }) {
  const hopPointer = useRef<number | null>(null);
  const steerPointers = useRef(new Map<number, number>());
  const callbacks = useRef({ player, onHold, onSteer, onCancelInput });
  useLayoutEffect(() => {
    callbacks.current = { player, onHold, onSteer, onCancelInput };
  }, [player, onHold, onSteer, onCancelInput]);
  const cancelHop = useCallback((pointerId?: number) => {
    if (hopPointer.current === null || (pointerId !== undefined && hopPointer.current !== pointerId)) return;
    hopPointer.current = null;
    callbacks.current.onCancelInput?.(callbacks.current.player);
  }, []);
  const releaseSteer = (pointerId: number) => {
    if (!steerPointers.current.delete(pointerId)) return;
    onSteer(Math.sign([...steerPointers.current.values()].reduce((sum, value) => sum + value, 0)));
  };
  const cancelTouches = useCallback(() => {
    if (steerPointers.current.size) {
      steerPointers.current.clear();
      callbacks.current.onSteer(0);
    }
    cancelHop();
  }, [cancelHop]);
  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) cancelTouches(); };
    window.addEventListener('blur', cancelTouches);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', cancelTouches);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelTouches();
    };
  }, [cancelTouches]);
  const controlsDisabled = countdown || !!snapshot?.finished || spectator;
  useEffect(() => { if (controlsDisabled) cancelTouches(); }, [controlsDisabled, cancelTouches]);
  const charge = Math.min(100, Math.max(0, (snapshot?.charge || 0) * 100));
  const baseCue = countdown ? 'Ready for the hill' : snapshot ? snapshot.circuit ? `LAP ${snapshot.lap} / ${snapshot.laps} · ${soloDrivingCue(snapshot).label.toUpperCase()}` : raceCue(snapshot) : 'On the starting line';
  const laneCue = spectator ? baseCue : baseCue.replace('← → STEER', player === 0 ? 'A / D STEER' : '← / → STEER').replace('SPACE', PLAYER_KEYS[player]);
  return <section className={`race-lane player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties} aria-label={`${PLAYER_NAMES[player]} race`}>
    <div className="lane-status"><span className="player-badge">{player + 1}</span><strong>{PLAYER_NAMES[player]}</strong><span className="lane-place">{snapshot && !countdown ? racePlace(snapshot, snapshots) : '—'}<small>/{snapshots.length || 2}</small></span></div>
    <div className="lane-bottom"><span className="lane-cue">{laneCue}</span>{!spectator && <><div className="local-lane-controls">
      {[-1, 1].map(direction => <button type="button" key={direction} className={`local-steer-button steer-${direction < 0 ? 'left' : 'right'}`} disabled={controlsDisabled} aria-label={`Player ${player + 1}: steer ${direction < 0 ? 'left' : 'right'}`} onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        steerPointers.current.set(event.pointerId, direction);
        onSteer(Math.sign([...steerPointers.current.values()].reduce((sum, value) => sum + value, 0)));
      }} onPointerUp={event => releaseSteer(event.pointerId)} onPointerCancel={event => releaseSteer(event.pointerId)} onLostPointerCapture={event => releaseSteer(event.pointerId)}>
        {direction < 0 ? <ArrowLeft size={22}/> : <ArrowRight size={22}/>}<kbd>{player === 0 ? direction < 0 ? 'A' : 'D' : direction < 0 ? '←' : '→'}</kbd>
      </button>)}
      <button type="button" className={`hop-control ${charge > 6 ? 'is-charging' : ''}`} disabled={controlsDisabled} onPointerDown={event => {
        if (event.button !== 0 || hopPointer.current !== null) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); hopPointer.current = event.pointerId; onHold(true);
      }} onPointerUp={event => { if (hopPointer.current !== event.pointerId) return; hopPointer.current = null; onHold(false); }} onPointerCancel={event => cancelHop(event.pointerId)} onLostPointerCapture={event => cancelHop(event.pointerId)} aria-label={`Player ${player + 1}: hold to charge, release to hop`}><span className="charge-fill" style={{ transform: `scaleX(${charge / 100})` }}/><kbd>{PLAYER_KEYS[player]}</kbd><strong>{snapshot?.finished ? 'Finished!' : charge > 6 ? 'Release to hop' : 'Hold to hop'}</strong><Zap size={20}/></button>
    </div><span className="local-lane-keyhint">{player === 0 ? 'A / D steer · F hop' : '← / → steer · J hop'}</span></>}</div>
  </section>;
}

function SoloRaceHUD({ snapshots, onHold, onCancelInput, onSteer, countdown, moment, elapsed }: { moment: SoloMoment | null; elapsed: number; onSteer: (value: number) => void; snapshots: VehicleSnapshot[]; onHold: (held: boolean) => void; onCancelInput?: () => void; countdown: boolean }) {
  const player = snapshots.find(snapshot => snapshot.id === 0) as SoloSnapshot | undefined;
  const cue = player ? soloDrivingCue(player) : { label: 'Ready on the grid', kind: 'cruise' };
  const held = useRef(false);
  const steerPointers = useRef(new Map<number, number>());
  const releaseSteer = (id:number) => { steerPointers.current.delete(id); onSteer(Math.sign([...steerPointers.current.values()].reduce((sum,value)=>sum+value,0))); };
  const cancel = () => { if (held.current) { held.current = false; onCancelInput?.(); } };
  const charge = Math.min(1, Math.max(0, player?.charge || 0));
  const progress = player?.progress || 0;
  const distance = player?.pathDistance || 0;
  const sector = (player ? courseForSnapshot(player).frame(distance).sector : 'Lombard Gardens').toUpperCase();
  const standings = rankRace(snapshots);
  return <div className="solo-race-hud">
    {!countdown && <SoloRaceMoment moment={moment} elapsed={elapsed}/>}
    {player?.circuit && <div className="solo-lap"><span>LAP</span><strong>{player.lap ?? 1}<small> / {player.laps ?? 3}</small></strong></div>}
    <div className="solo-ring-count" aria-label={`${player?.rings ?? 0} rings collected`}><span aria-hidden="true">◉</span><strong>{player?.rings ?? 0}</strong><small>RINGS</small></div>
    <div className="solo-position"><span>POSITION</span><strong>{player && !countdown ? racePlace(player, snapshots) : '—'}<small>/ 4</small></strong><div><span className="live-dot"/> YOU · BLUE CREW</div></div>
    <div className="solo-standings" aria-label="Live race standings"><span className="hud-label">THE PACK</span>{standings.map((snapshot, index) => <div key={snapshot.id} className={snapshot.id === 0 ? 'is-you' : ''}><b>{index + 1}</b><i style={{ background: PLAYER_COLORS[snapshot.id] }}/><span>{soloName(snapshot.id)}</span><small>{snapshot.id === 0 ? 'YOU' : 'AI'}</small>{snapshot.finished && <Flag size={12}/>}</div>)}</div>
    <div className="solo-course"><div><span>{sector}</span><span>{Math.round(progress * 100)}%</span></div><div className="course-progress"><span style={{ width: `${progress * 100}%` }}/>{snapshots.map(snapshot => <i key={snapshot.id} title={soloName(snapshot.id)} style={{ left: `${Math.min(99, snapshot.progress * 100)}%`, background: PLAYER_COLORS[snapshot.id] }}/>)}</div></div>
    <div className="solo-steering" aria-label="Steer your racer">{[-1, 1].map(direction => <button key={direction} aria-label={direction < 0 ? 'Steer left' : 'Steer right'} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); steerPointers.current.set(event.pointerId,direction); onSteer(Math.sign([...steerPointers.current.values()].reduce((sum,value)=>sum+value,0))); }} onPointerUp={event=>releaseSteer(event.pointerId)} onPointerCancel={event=>releaseSteer(event.pointerId)} onLostPointerCapture={event=>releaseSteer(event.pointerId)}>{direction < 0 ? <ArrowLeft size={23}/> : <ArrowRight size={23}/>}</button>)}</div><div className="solo-speed"><Gauge size={21}/><strong>{Math.round((player?.speed || 0) * 3.6)}<small>KM/H</small></strong></div>
    <div className="solo-hop"><div className={`solo-cue ${charge > .9 ? 'charged' : ''}`} data-kind={cue.kind}>{!countdown && cue.kind === 'turn-left' && <ArrowLeft size={16}/>} {!countdown && cue.kind === 'turn-right' && <ArrowRight size={16}/>} {countdown ? 'The hill is yours' : cue.label}</div><button className={`hop-control ${charge > .06 ? 'is-charging' : ''}`} disabled={countdown || player?.finished} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); held.current = true; onHold(true); }} onPointerUp={() => { held.current = false; onHold(false); }} onPointerCancel={cancel} onLostPointerCapture={cancel} aria-label="Hold to charge, release to hop"><span className="charge-fill" style={{ transform: `scaleX(${charge})` }}/><kbd>SPACE</kbd><strong>{player?.finished ? 'Across the line!' : charge > .06 ? 'Release to fly' : 'Hold to charge'}</strong><Zap size={23}/></button><span className="solo-control-hint">← → STEER · SPACE / F HOP</span></div>
  </div>;
}

export default function DerbyUI(props: DerbyUIProps) {
  const { stage, builds, racerIds, onBuildChange, onStart, onNext, onRematch, snapshots, elapsed, countdown, heat, scores, onHold, onReset, onCancelInput, loaded } = props;
  const [entered, setEntered] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const solo = props.mode === 'solo' && !props.phoneRoom;
  const localKeyboard = props.mode === 'local' && !props.phoneRoom;
  const name = (id: PlayerId) => solo ? soloName(id) : PLAYER_NAMES[id];
  const landing = stage === 'garage' && !props.phoneRoom && !entered;
  const onLandingChange = props.onLandingChange;
  useEffect(()=>{onLandingChange(landing);},[landing,onLandingChange]);
  const race = stage === 'racing' || stage === 'countdown';
  const final = stage === 'final';
  const results = stage === 'results' || final;
  const active = racerIds.length ? racerIds : [0, 1] as PlayerId[];
  const canRace = active.length >= 2 && active.every(id => builds[id] && isLegalBuild(builds[id])) && loaded;
  const readyCount = racerIds.filter(id => props.phoneReady?.[id]).length;
  const maxScore = Math.max(...active.map(id => scores[id] || 0));
  const winners = active.filter(id => (scores[id] || 0) === maxScore);
  const ranked = final ? [...active].sort((a, b) => (scores[b] || 0) - (scores[a] || 0)) : rankRace(snapshots).map(s => s.id);
  const points = heatPoints(snapshots);
  return <div className={`derby-ui stage-${stage} ${landing ? 'is-landing' : ''} ${props.phoneRoom ? 'phone-mode' : ''} ${solo ? 'solo-mode' : ''} ${localKeyboard ? 'local-keyboard-mode' : ''}`}>
    {!landing && !(solo && stage === 'garage') && <header className="derby-header"><button className="brand-home" aria-label="Silicon Racer home" onClick={() => { if (stage === 'garage' && !props.phoneRoom) setEntered(false); }}><SiliconBrand compact/></button><span className="event-chip">{props.phoneRoom ? `ROOM ${props.phoneRoom}` : solo ? 'SOLO GRAND PRIX · SAN FRANCISCO' : 'BAY OR BUST · LOCAL DUEL'}</span><div className="derby-header-actions">{props.phoneRoom && props.onPhoneParty && <Button variant="outline" className="phone-party-button" onClick={props.onPhoneParty}><Smartphone size={16}/>{props.phoneRoom ? 'Invite friends' : 'Play with phones'}</Button>}{race && solo && <RaceCameraButton mode={props.cameraMode} onToggle={props.onToggleCamera}/>}{props.soundControls}<button className="icon-button" onClick={() => setShowRules(!showRules)} aria-label="How to play" aria-expanded={showRules}><HelpCircle size={20}/></button></div></header>}
    {showRules && <aside className="rules-popover"><h2>{props.phoneRoom ? "One button. All the glory." : "Build. Steer. Send it."}</h2><p>Pick a chassis and wheels. Your ride accelerates for you.</p><p><strong>Hold to charge. Release to hop.</strong><br/>{props.phoneRoom ? 'Use the big button on your phone.' : solo ? 'Arrow keys steer. Hold Space or F to charge; release to hop. Or use the on-screen controls. Escape pauses.' : 'Player 1: A / D steer, F hops. Player 2: ← / → steer, J hops. Hold your hop key to charge, then release. You can also use each player’s on-screen controls. Escape pauses.'}</p>{solo && <label className="steering-preference"><input type="checkbox" checked={props.reverseArrows} onChange={event=>props.onReverseArrowsChange(event.target.checked)}/><span>Reverse arrow keys</span></label>}{solo && <p>Tap the camera button or press C to switch between Chase and Scenic views.</p>}<p>Three heats. Finish ahead to earn more points: 5, 3, 2, 1. Ties share the points.</p><Button className="small-action" onClick={() => setShowRules(false)}>Got it <Check size={17}/></Button></aside>}
    {landing && <section className="landing-screen landing-solo-track">
      <div className="landing-copy">
        <div className="landing-brand-row"><SiliconBrand compact/><div className="landing-actions">{props.soundControls}<button className="icon-button" onClick={() => setShowRules(!showRules)} aria-label="How to play" aria-expanded={showRules}><HelpCircle size={18}/></button></div></div>
        <h1>Big ideas.<br/>Bad brakes.</h1>
        <p>Build your ride. Race three rivals.<br/>Three laps around the bay.</p>
        <Button className="start-button landing-start" disabled={!loaded} onClick={() => { props.onModeChange('solo'); setEntered(true); }}>{loaded ? 'Race solo' : 'Loading…'} <ArrowRight size={28}/></Button>
        <div className="landing-controls"><span><kbd>←</kbd> <kbd>→</kbd> Steer</span><span><kbd>SPACE</kbd> Hold & release to hop</span></div>
      </div>
      <section className="landing-world" aria-label="Live Bay or Bust circuit preview">
        <LandingScene/>
      </section>
    </section>}
    {stage === 'garage' && !landing && (props.phoneRoom ? <section className="lobby-screen"><div className="screen-heading"><span className="eyebrow">HEAT {heat} OF 3</span><h1>Grab your phone.</h1><p>Scan. Pick a racer. Get ready.</p></div><div className="lobby-content"><PartyJoinCode code={props.phoneRoom}/><div className="lobby-crew"><PartySeats players={props.partyPlayers} builds={builds} ready={props.phoneReady}/><output className="lobby-status"><span className="live-dot"/>{racerIds.length < 2 ? 'Waiting for at least 2 racers' : readyCount === racerIds.length ? 'Everyone’s ready. Here we go!' : `${readyCount} of ${racerIds.length} ready`}</output></div></div><p className="lobby-note">The race starts when everyone is ready. Keep this screen open to watch.</p></section> : solo ? <SoloGarageScreen soundControls={props.soundControls} build={builds[0]} onChange={build => onBuildChange(0, build)} onBack={() => setEntered(false)} onStart={onStart} canRace={canRace} loaded={loaded} heat={heat} muted={props.muted} onToggleSound={props.onToggleSound} showRules={showRules} onToggleRules={() => setShowRules(!showRules)} reverseArrows={props.reverseArrows} onReverseArrowsChange={props.onReverseArrowsChange}/> : <section className="local-garage"><div className="screen-heading"><button className="text-button" onClick={() => setEntered(false)}><ArrowLeft size={16}/> Back</button><h1>Pick your racer.</h1><p>Choose a chassis. Add wheels. Send it.</p></div><div className="garage-layout">{([0, 1] as PlayerId[]).map(player => builds[player] && <GarageCard key={player} player={player} build={builds[player]} onChange={build => onBuildChange(player, build)}/>)}</div><footer className="garage-footer"><span>HEAT {heat} / 3</span><Button className="start-button" disabled={!canRace} onClick={onStart}>{loaded ? 'Race!' : 'Loading the hill…'}<ArrowRight size={23}/></Button><span className="local-keyboard-summary"><span>P1: <kbd>A</kbd> <kbd>D</kbd> steer · <kbd>F</kbd> hop</span><span>P2: <kbd>←</kbd> <kbd>→</kbd> steer · <kbd>J</kbd> hop</span></span></footer></section>)}
    {race && <><div className="race-topline"><span>HEAT {heat} / 3</span><strong className={props.finishCountdown != null ? 'finish-clock' : ''}>{props.finishCountdown != null ? `FINISH IN ${Math.ceil(props.finishCountdown)}s` : `${elapsed.toFixed(1)}s`}</strong>{!props.phoneRoom && <><button className="icon-button" onClick={props.onPause} aria-label="Pause race"><Pause size={16}/></button><button className="icon-button" onClick={event=>{event.currentTarget.blur();onReset();}} aria-label="Restart heat"><RotateCcw size={16}/></button></>}</div>{solo ? <SoloRaceHUD moment={props.raceMoment} elapsed={elapsed} snapshots={snapshots} onHold={held => onHold(0, held)} onCancelInput={() => onCancelInput?.(0)} onSteer={value => props.onSteer(0, value)} countdown={stage === 'countdown'}/> : <div className={`race-lanes ${active.length > 2 ? 'four-lanes' : ''}`}>{active.map(player => <RaceLane key={player} player={player} snapshot={snapshots.find(s => s.id === player)} snapshots={snapshots} spectator={!!props.phoneRoom} onHold={held => onHold(player, held)} onSteer={value => props.onSteer(player, value)} onCancelInput={onCancelInput} countdown={stage === 'countdown'}/>)}</div>}{stage === 'countdown' && <div className="countdown-overlay"><span>SEE YOU AT THE BOTTOM.</span><strong key={countdown}>{countdown > 0 ? countdown : 'GO!'}</strong><p>{localKeyboard ? 'Wait for GO. P1: A/D steer, F hop. P2: ←/→ steer, J hop.' : 'Wait for GO. Hold to charge. Release to hop.'}</p></div>}</>}
    {results && <div className="results-backdrop"><section className="results-card"><span className="eyebrow">{final ? 'THE BRAGGING RIGHTS ARE IN' : `HEAT ${heat} COMPLETE`}</span><div className="results-headline">{final ? <Trophy size={38}/> : <Flag size={32}/>}<h1>{final ? winners.length > 1 ? 'Shared glory!' : solo && winners[0] === 0 ? 'The hill is yours!' : `${name(winners[0])} wins!` : solo && ranked[0] === 0 ? 'You sent it.' : 'What a ride.'}</h1><p>{final ? 'Big ideas. Extremely questionable driving.' : 'One hill closer to glory.'}</p></div>{solo && <div className="podium-spotlight"><BodyGlyph id={builds[ranked[0] ?? 0]?.bodyId || 'sourdough'} color={PLAYER_COLORS[ranked[0] ?? 0]}/><span>{name(ranked[0] ?? 0)}<small>{final ? 'GRAND PRIX WINNER' : 'HEAT WINNER'}</small></span></div>}<div className="results-players">{ranked.map(player => { const snapshot = snapshots.find(s => s.id === player); const place = final ? 1 + active.filter(id => (scores[id] || 0) > (scores[player] || 0)).length : snapshot ? racePlace(snapshot, snapshots) : '—'; return <article className={`result-player ${solo && player === 0 ? 'is-you' : ''}`} key={player} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties}><span className="result-place">{place}</span><BodyGlyph id={builds[player]?.bodyId || 'sourdough'} color={PLAYER_COLORS[player]}/><div className="result-name"><strong>{name(player)}{solo && <small className="driver-type">{player === 0 ? "YOU" : "AI"}</small>}</strong><span>{snapshot?.finished ? timeLabel(snapshot.finishTime) : `${Math.round((snapshot?.progress || 0) * 100)}% of the race`}{!final && ` · +${pointsLabel(points[player])} pts`}</span></div><div className="standing-score">{pointsLabel(scores[player])}<small>PTS</small></div></article>; })}</div><footer className="results-footer">{props.phoneRoom ? <output>{final ? 'Ready up on your phones for a rematch.' : heat < 3 ? 'Your garages open in a moment…' : 'The final podium is coming…'}</output> : <Button className="start-button" onClick={final ? onRematch : onNext}>{final ? 'Play again' : heat < 3 ? 'Next heat' : 'See the podium'}<ArrowRight size={23}/></Button>}</footer></section></div>}
  </div>;
}
