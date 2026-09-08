'use client';
/* oxlint-disable next/no-html-link-for-pages -- Native navigation avoids Vinext production export mismatch. */
import Image from 'next/image';


import { useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, Flag, HelpCircle, RotateCcw, Smartphone, Trophy, Volume2, VolumeX, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Blueprint, PlayerId, VehicleSnapshot, Stage } from '@/game/types';
import type { PartyPlayer } from '@/game/party-types';
import { BODIES, WHEELS, buildCost, isLegalBuild, getBody, WHEELBASE_COST } from '@/game/catalogue';
import { PLAYER_COLORS, PLAYER_NAMES, racePlace, rankRace, heatPoints, raceCue } from '@/game/race';
import { SiliconBrand } from './SiliconBrand';
import { PartyJoinCode, PartySeats } from './PhonePartyPanel';
import LandingScene from './LandingScene';

export interface DerbyUIProps {
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

export function GarageCard({ player, build, onChange, controllerDriven = false }: { player: PlayerId; build: Blueprint; onChange: (blueprint: Blueprint) => void; controllerDriven?: boolean }) {
  const body = getBody(build.bodyId);
  const [showClassics, setShowClassics] = useState(body.family !== 'sf');
  const cost = buildCost(build);
  const groups = [...new Set(BODIES.map(item => item.family))].filter(family => family === 'sf' || showClassics || family === body.family);
  return <section className={`garage-card player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties} aria-label={`Player ${player + 1} garage`}>
    <div className="garage-card-title"><span className="player-badge">{player + 1}</span><div><span className="eyebrow">YOUR RACER</span><h2>{PLAYER_NAMES[player]}</h2></div><div className={`bolt-budget ${cost > 10 ? 'over-budget' : ''}`} title="Build with up to 10 bolts"><Zap size={15}/><strong>{10 - cost}</strong><span>left</span></div></div>
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
    <div className="garage-card-foot"><kbd>{controllerDriven ? `P${player + 1}` : PLAYER_KEYS[player]}</kbd><span>{controllerDriven ? 'Choose your ride on your phone' : 'Hold to charge. Release to hop.'}</span></div>
  </section>;
}

function RaceLane({ player, snapshot, snapshots, spectator, onHold, onCancelInput, countdown }: { player: PlayerId; snapshot?: VehicleSnapshot; snapshots: VehicleSnapshot[]; spectator: boolean; onHold: (held: boolean) => void; onCancelInput?: (player: PlayerId) => void; countdown: boolean }) {
  const pointerHeld = useRef(false);
  const cancel = () => { if (pointerHeld.current) { pointerHeld.current = false; onCancelInput?.(player); } };
  const charge = Math.min(100, Math.max(0, (snapshot?.charge || 0) * 100));
  return <section className={`race-lane player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties} aria-label={`${PLAYER_NAMES[player]} race`}>
    <div className="lane-status"><span className="player-badge">{player + 1}</span><strong>{PLAYER_NAMES[player]}</strong><span className="lane-place">{snapshot && !countdown ? racePlace(snapshot, snapshots) : '—'}<small>/{snapshots.length || 2}</small></span></div>
    <div className="lane-bottom"><span className="lane-cue">{countdown ? 'Ready for the hill' : snapshot ? raceCue(snapshot) : 'On the starting line'}</span>{!spectator && <button className={`hop-control ${charge > 6 ? 'is-charging' : ''}`} disabled={countdown || snapshot?.finished} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointerHeld.current = true; onHold(true); }} onPointerUp={() => { pointerHeld.current = false; onHold(false); }} onPointerCancel={cancel} onLostPointerCapture={cancel} aria-label={`Player ${player + 1}: hold to charge, release to hop`}><span className="charge-fill" style={{ transform: `scaleX(${charge / 100})` }}/><kbd>{PLAYER_KEYS[player]}</kbd><strong>{snapshot?.finished ? 'Finished!' : charge > 6 ? 'Release to hop' : 'Hold to hop'}</strong><Zap size={20}/></button>}</div>
  </section>;
}

export default function DerbyUI(props: DerbyUIProps) {
  const { stage, builds, racerIds, onBuildChange, onStart, onNext, onRematch, snapshots, elapsed, countdown, heat, scores, onHold, onReset, onCancelInput, loaded } = props;
  const [entered, setEntered] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const landing = stage === 'garage' && !props.phoneRoom && !entered;
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
  return <div className={`derby-ui stage-${stage} ${landing ? 'is-landing' : ''} ${props.phoneRoom ? 'phone-mode' : ''}`}>
    <header className="derby-header"><button className="brand-home" aria-label="Silicon Racer home" onClick={() => { if (stage === 'garage' && !props.phoneRoom) setEntered(false); }}><SiliconBrand compact/></button><span className="event-chip">{props.phoneRoom ? `ROOM ${props.phoneRoom}` : 'SAN FRANCISCO SOAPBOX CLUB'}</span><div className="derby-header-actions">{!landing && props.onPhoneParty && <Button variant="outline" className="phone-party-button" onClick={props.onPhoneParty}><Smartphone size={16}/>{props.phoneRoom ? 'Invite friends' : 'Play with phones'}</Button>}<button className="icon-button" onClick={props.onToggleSound} aria-label={props.muted ? 'Turn sound on' : 'Mute sound'}>{props.muted ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button><button className="icon-button" onClick={() => setShowRules(!showRules)} aria-label="How to play" aria-expanded={showRules}><HelpCircle size={20}/></button></div></header>
    {showRules && <aside className="rules-popover"><h2>One button. All the glory.</h2><p>Pick a chassis and wheels. Gravity does the driving.</p><p><strong>Hold to charge. Release to hop.</strong><br/>{props.phoneRoom ? 'Use the big button on your phone.' : 'On a keyboard: player 1 uses F, player 2 uses J.'}</p><p>Three heats. Finish ahead to earn more points: 5, 3, 2, 1. Ties share the points.</p><Button className="small-action" onClick={() => setShowRules(false)}>Got it <Check size={17}/></Button></aside>}
    {landing && <section className="landing-screen"><div className="landing-copy"><SiliconBrand/><h1>Big ideas. Bad brakes.</h1><p>A downhill party game.<br/>Bring your friends. Build something ridiculous.</p><Button className="start-button landing-start" disabled={!loaded} onClick={() => props.onPhoneParty ? props.onPhoneParty() : setEntered(true)}>{loaded ? 'Start' : 'Warming up…'} <ArrowRight size={26}/></Button><a className="landing-join" href="/play">Join a race <Smartphone size={16}/></a><button className="keyboard-link" onClick={() => setEntered(true)}>2 players on this keyboard</button></div><div className="landing-world"><LandingScene/><div className="landing-caption"><span className="live-dot"/> BUILT IN SF. BARELY STREET LEGAL.</div></div><div className="landing-footnote">2–4 friends <span>•</span> Your phone is your controller <span>•</span> No downloads</div></section>}
    {stage === 'garage' && !landing && (props.phoneRoom ? <section className="lobby-screen"><div className="screen-heading"><span className="eyebrow">HEAT {heat} OF 3</span><h1>Grab your phone.</h1><p>Scan. Pick a racer. Get ready.</p></div><div className="lobby-content"><PartyJoinCode code={props.phoneRoom}/><div className="lobby-crew"><PartySeats players={props.partyPlayers} builds={builds} ready={props.phoneReady}/><output className="lobby-status"><span className="live-dot"/>{racerIds.length < 2 ? 'Waiting for at least 2 racers' : readyCount === racerIds.length ? 'Everyone’s ready. Here we go!' : `${readyCount} of ${racerIds.length} ready`}</output></div></div><p className="lobby-note">The race starts when everyone is ready. Keep this screen open to watch.</p></section> : <section className="local-garage"><div className="screen-heading"><button className="text-button" onClick={() => setEntered(false)}><ArrowLeft size={16}/> Back</button><h1>Pick your racer.</h1><p>Choose a chassis. Add wheels. Send it.</p></div><div className="garage-layout">{([0, 1] as PlayerId[]).map(player => builds[player] && <GarageCard key={player} player={player} build={builds[player]} onChange={build => onBuildChange(player, build)}/>)}</div><footer className="garage-footer"><span>HEAT {heat} / 3</span><Button className="start-button" disabled={!canRace} onClick={onStart}>{loaded ? 'Race!' : 'Loading the hill…'}<ArrowRight size={23}/></Button><span><kbd>F</kbd> + <kbd>J</kbd> to hop</span></footer></section>)}
    {race && <><div className="race-topline"><span>HEAT {heat} / 3</span><strong className={props.finishCountdown != null ? 'finish-clock' : ''}>{props.finishCountdown != null ? `FINISH IN ${Math.ceil(props.finishCountdown)}s` : `${elapsed.toFixed(1)}s`}</strong>{!props.phoneRoom && <button className="icon-button" onClick={onReset} aria-label="Restart heat"><RotateCcw size={16}/></button>}</div><div className={`race-lanes ${active.length > 2 ? 'four-lanes' : ''}`}>{active.map(player => <RaceLane key={player} player={player} snapshot={snapshots.find(s => s.id === player)} snapshots={snapshots} spectator={!!props.phoneRoom} onHold={held => onHold(player, held)} onCancelInput={onCancelInput} countdown={stage === 'countdown'}/>)}</div>{stage === 'countdown' && <div className="countdown-overlay"><span>SEE YOU AT THE BOTTOM.</span><strong key={countdown}>{countdown > 0 ? countdown : 'GO!'}</strong><p>Wait for GO. Hold to charge. Release to hop.</p></div>}</>}
    {results && <div className="results-backdrop"><section className="results-card"><span className="eyebrow">{final ? 'THE BRAGGING RIGHTS ARE IN' : `HEAT ${heat} COMPLETE`}</span><div className="results-headline">{final ? <Trophy size={38}/> : <Flag size={32}/>}<h1>{final ? winners.length > 1 ? 'Shared glory!' : `${PLAYER_NAMES[winners[0]]} wins!` : 'What a ride.'}</h1><p>{final ? 'Big ideas. Extremely questionable driving.' : 'One hill closer to glory.'}</p></div><div className="results-players">{ranked.map(player => { const snapshot = snapshots.find(s => s.id === player); const place = final ? 1 + active.filter(id => (scores[id] || 0) > (scores[player] || 0)).length : snapshot ? racePlace(snapshot, snapshots) : '—'; return <article className="result-player" key={player} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties}><span className="result-place">{place}</span><BodyGlyph id={builds[player]?.bodyId || 'sourdough'} color={PLAYER_COLORS[player]}/><div className="result-name"><strong>{PLAYER_NAMES[player]}</strong><span>{snapshot?.finished ? timeLabel(snapshot.finishTime) : `${Math.round((snapshot?.progress || 0) * 100)}% of the hill`}{!final && ` · +${pointsLabel(points[player])} pts`}</span></div><div className="standing-score">{pointsLabel(scores[player])}<small>PTS</small></div></article>; })}</div><footer className="results-footer">{props.phoneRoom ? <output>{final ? 'Ready up on your phones for a rematch.' : heat < 3 ? 'Your garages open in a moment…' : 'The final podium is coming…'}</output> : <Button className="start-button" onClick={final ? onRematch : onNext}>{final ? 'Play again' : heat < 3 ? 'Next heat' : 'See the podium'}<ArrowRight size={23}/></Button>}</footer></section></div>}
  </div>;
}
