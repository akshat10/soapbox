'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, Flag, RotateCcw, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Blueprint, VehicleSnapshot } from '@/game/types';
import { BODIES, WHEELS, buildCost, isLegalBuild, getBody, WHEELBASE_COST } from '@/game/catalogue';

export interface DerbyUIProps {
  stage: 'garage' | 'countdown' | 'racing' | 'results' | 'final';
  builds: Blueprint[];
  onBuildChange: (player: 0 | 1, blueprint: Blueprint) => void;
  onStart: () => void;
  onNext: () => void;
  onRematch: () => void;
  snapshots: VehicleSnapshot[];
  elapsed: number;
  countdown: number;
  heat: number;
  scores: number[];
  tips: string[];
  onHold: (player: 0 | 1, held: boolean) => void;
  onReset: () => void;
  onCancelInput?: (player: 0 | 1) => void;
  loaded: boolean;
}

const PLAYER_COLORS = ['#3254ee', '#f45a4e'];
const PLAYER_NAMES = ['BLUE CREW', 'RED RIOT'];
const PLAYER_KEYS = ['F', 'J'];
const SPACING: Blueprint['wheelbase'][] = ['short', 'standard', 'long'];
const BODY_NAMES: Record<string, string> = { bathtub: 'Bathtub', sofa: 'Sofa', dumpster: 'Dumpster', toaster: 'Toaster', suitcase: 'Suitcase', lunchbox: 'Lunchbox', canoe: 'Canoe', banana: 'Banana', ironingboard: 'Ironing board', shoppingcart: 'Shopping cart', fridge: 'Fridge', arcade: 'Arcade cabinet' };
const FAMILY_LABELS: Record<string, string> = { broad: 'Low & broad', compact: 'Small & mighty', long: 'Long & low', tall: 'Tall & tippy' };
const FAMILY_NOTES: Record<string, string> = {
  'Low and broad': 'Planted stance. A little more to lift.',
  Compact: 'Small body. Big hop energy.',
  'Long and low': 'Steady landings. Mind the bumps.',
  Tall: 'High clearance. Hold on tight.',
};

function timeLabel(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(2)}s`;
}

function BodyGlyph({ id, color = 'currentColor' }: { id: string; color?: string }) {
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
  const size = kind === 'casters' ? 8 : kind === 'monster' ? 14 : 11;
  return <svg viewBox="0 0 38 34" aria-hidden="true"><circle cx="19" cy="17" r={size} fill="#292e31" stroke="#292e31" strokeWidth={kind === 'monster' ? 3 : 1} strokeDasharray={kind === 'monster' ? '4 2' : undefined}/><circle cx="19" cy="17" r={size * .45} fill="#fcf9ed"/><circle cx="19" cy="17" r="2.7" fill="#292e31"/></svg>;
}

function GarageCard({ player, build, onChange }: { player: 0 | 1; build: Blueprint; onChange: (blueprint: Blueprint) => void }) {
  const body = getBody(build.bodyId);
  const cost = buildCost(build);
  const groups = [...new Set(BODIES.map((item) => item.family))];
  return <section className={`garage-card player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties} aria-label={`Player ${player + 1} garage`}>
    <div className="garage-card-title"><div className="player-badge">P{player + 1}</div><div><span className="eyebrow">PICK YOUR RIDE</span><h2>{PLAYER_NAMES[player]}</h2></div><div className={`bolt-budget ${cost > 10 ? 'over-budget' : ''}`} title="10 bolts per player"><Zap size={15} fill="currentColor"/><strong>{10 - cost}</strong><span>left</span></div></div>
    <div className="garage-card-content">
      <div className="roster">
        {groups.map((family) => <div className="roster-family" key={family}><div className="family-label">{FAMILY_LABELS[family] || family}</div><div className="body-options">{BODIES.filter((item) => item.family === family).map((item) => <Button key={item.id} variant="outline" className={`body-option ${item.id === build.bodyId ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, bodyId: item.id })} disabled={!isLegalBuild({ ...build, bodyId: item.id })} aria-pressed={item.id === build.bodyId} title={!isLegalBuild({ ...build, bodyId: item.id }) ? `Not enough bolts — ${item.cost} bolts for ${BODY_NAMES[item.id] || item.name}. Choose cheaper wheels or shorter spacing.` : `${item.name}: ${item.description}. ${item.cost} bolts.`}><BodyGlyph id={item.id} color={`#${item.color.toString(16).padStart(6, '0')}`}/><span>{BODY_NAMES[item.id] || item.name}</span><span className="option-cost">{item.cost}<Zap size={9} fill="currentColor"/></span>{item.id === build.bodyId && <Check className="selection-check" size={12}/>}</Button>)}</div></div>)}
      </div>
      <div className="ride-note"><strong>{body.name}</strong><span>{body.id === 'shoppingcart' ? 'Tall basket, short footprint. Mind the landings.' : body.description || FAMILY_NOTES[body.family] || 'A very questionable racing machine.'}</span></div>
      <fieldset className="part-group"><legend><span>02</span> WHEELS <small>Set of four</small></legend><div className="wheel-options">{WHEELS.map((wheel) => <Button key={wheel.id} variant="outline" className={`wheel-option ${build.wheelId === wheel.id ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, wheelId: wheel.id })} disabled={!isLegalBuild({ ...build, wheelId: wheel.id })} title={!isLegalBuild({ ...build, wheelId: wheel.id }) ? `Not enough bolts — ${wheel.cost} bolts for ${wheel.name}. Choose a cheaper body or shorter spacing.` : `${wheel.name}: ${wheel.cost} bolts for a set of four.`} aria-pressed={build.wheelId === wheel.id}><WheelGlyph kind={wheel.id}/><span>{wheel.name}</span><small>{wheel.cost}<Zap size={9} fill="currentColor"/></small></Button>)}</div></fieldset>
      <fieldset className="part-group spacing-group"><legend><span>03</span> WHEEL SPACING <small>Front to back</small></legend><div className="spacing-options">{SPACING.map((spacing) => <Button key={spacing} variant="outline" className={`spacing-option ${build.wheelbase === spacing ? 'is-selected' : ''}`} onClick={() => onChange({ ...build, wheelbase: spacing })} disabled={!isLegalBuild({ ...build, wheelbase: spacing })} title={!isLegalBuild({ ...build, wheelbase: spacing }) ? `Not enough bolts — ${WHEELBASE_COST[spacing]} bolts for ${spacing} spacing.` : `${spacing} spacing: ${WHEELBASE_COST[spacing]} bolts.`} aria-pressed={build.wheelbase === spacing}>{spacing === 'standard' ? 'Regular' : spacing}<small>{WHEELBASE_COST[spacing]}<Zap size={8} fill="currentColor"/></small></Button>)}</div></fieldset>
      {!isLegalBuild(build) && <p className="budget-warning" role="alert">Over budget! Choose a cheaper body or wheels.</p>}
    </div>
    <div className="garage-card-foot"><kbd>{PLAYER_KEYS[player]}</kbd><span>Hold to charge. Release to hop.</span></div>
  </section>;
}

function RacePlayer({ player, snapshot, score, onHold, onCancelInput }: { player: 0 | 1; snapshot?: VehicleSnapshot; score: number; onHold: (held: boolean) => void; onCancelInput?: (player: 0 | 1) => void }) {
  const pointerHeld = useRef(false);
  const cancelPointer = () => { if (pointerHeld.current) { pointerHeld.current = false; onCancelInput?.(player); } };
  const progress = Math.min(100, Math.max(0, (snapshot?.progress || 0) * 100));
  const charge = Math.min(100, Math.max(0, (snapshot?.charge || 0) * 100));
  const status = snapshot?.finished ? 'FINISHED!' : snapshot?.recovering ? 'BACK ON YOUR WHEELS…' : !snapshot?.grounded ? 'AIR TIME!' : charge > 6 ? 'RELEASE TO HOP!' : 'HOLD TO CHARGE';
  return <div className={`race-player player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties}>
    <div className="race-player-heading"><span className="player-badge">P{player + 1}</span><div><h2>{PLAYER_NAMES[player]}</h2><span>{snapshot ? getBody(snapshot.blueprint.bodyId).name : 'Ready to roll'}</span></div><span className="race-points">{score}<small>PTS</small></span></div>
    <div className="race-progress"><progress aria-label={`Player ${player + 1} course progress`} value={progress} max={100}/><Flag size={12}/></div>
    <div className="race-player-live"><span>{snapshot?.finished ? timeLabel(snapshot.finishTime) : `${Math.round((snapshot?.speed || 0) * 3.6)} km/h`}</span><span>{Math.round(progress)}% of hill</span></div>
    <button className={`hop-control ${charge > 6 ? 'is-charging' : ''} ${snapshot?.finished ? 'has-finished' : ''}`} disabled={snapshot?.finished} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointerHeld.current = true; onHold(true); }} onPointerUp={() => { pointerHeld.current = false; onHold(false); }} onPointerCancel={cancelPointer} onLostPointerCapture={cancelPointer} aria-label={`Player ${player + 1}: hold to charge, release to hop`}>
      <span className="charge-fill" style={{ transform: `scaleX(${charge / 100})` }}/><kbd>{PLAYER_KEYS[player]}</kbd><span><strong>{status}</strong><small>{snapshot?.finished ? 'Nicely, chaotically done.' : snapshot?.recovering ? 'The clock keeps ticking.' : 'Hold the key or press here'}</small></span><Zap size={23} fill={charge > 6 ? 'currentColor' : 'none'}/>
    </button>
  </div>;
}

export default function DerbyUI(props: DerbyUIProps) {
  const { stage, builds, onBuildChange, onStart, onNext, onRematch, snapshots, elapsed, countdown, heat, scores, tips, onHold, onReset, onCancelInput, loaded } = props;
  const [showRules, setShowRules] = useState(false);
  const canRace = builds.length >= 2 && builds.every(isLegalBuild) && loaded;
  const final = stage === 'final';
  const results = stage === 'results' || final;
  const winner = scores[0] === scores[1] ? null : (scores[0] || 0) > (scores[1] || 0) ? 0 : 1;
  return <div className={`derby-ui stage-${stage}`}>
    <header className="derby-header">
      <div className="derby-logo" aria-label="Doodle Derby"><span>DOODLE</span><strong>DERBY<span className="logo-wheel">✳</span></strong></div>
      <div className="event-chip"><span className="live-dot"/> SAN FRANCISCO <span className="chip-divider">/</span> LOCAL 2P</div>
      <Button variant="outline" className="rules-button" onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>{showRules ? 'Got it!' : 'How to play'}<span>?</span></Button>
    </header>
    {showRules && <aside className="rules-popover" aria-label="How to play"><h2>BUILD. BOUNCE. BRAG.</h2><p>Pick a body and wheels using <strong>10 bolts</strong>. Gravity does the driving.</p><p><kbd>F</kbd> Blue Crew · <kbd>J</kbd> Red Riot<br/><strong>Hold to charge, release to hop.</strong> Charge on the ground. Time a small hop over bumps and a bigger one for the jumps.</p><p>Three heats. The heat winner earns 3 points, second earns 1. Equal results share points. If you tumble, your crew puts you back on the hill.</p><Button className="small-action" onClick={() => setShowRules(false)}>Let’s roll <ArrowRight size={15}/></Button></aside>}
    {stage === 'garage' && <>
      <div className="garage-heading"><div className="section-kicker"><span className="mini-checker"/> THE VERY QUESTIONABLE GRAND PRIX</div><h1>BAD IDEAS.<br/><span>GREAT RACING.</span></h1><p>Build something ridiculous. Send it downhill.</p></div>
      <div className="garage-layout">{([0, 1] as const).map((player) => builds[player] && <GarageCard key={player} player={player} build={builds[player]} onChange={(build) => onBuildChange(player, build)}/>)}</div>
      <div className="preview-caption"><span className="preview-arrow">↙</span><span>12 everyday objects.<br/>Absolutely no racing pedigree.</span><span className="preview-arrow">↘</span></div>
      <footer className="garage-footer"><div className="course-teaser"><Flag size={21}/><div><strong>ONE HILL. THREE HEATS.</strong><span>Lombard → Golden Gate → the Bay</span></div></div><Button className="start-button" disabled={!canRace} onClick={onStart}>{!loaded ? 'BUILDING THE HILL…' : !builds.every(isLegalBuild) ? 'CHECK YOUR BOLTS' : heat > 1 ? `RACE HEAT ${heat}` : 'LET’S ROLL'}<ArrowRight size={24}/></Button><div className="garage-status"><span className={canRace ? 'status-dot ready' : 'status-dot'}/>{canRace ? 'BOTH BUILDS READY' : loaded ? '10 BOLTS PER PLAYER' : 'WARMING UP THE WHEELS'}<small>HEAT {heat} OF 3</small></div></footer>
    </>}
    {(stage === 'racing' || stage === 'countdown') && <>
      <div className="race-topline"><div className="heat-badge"><span>HEAT</span><strong>{heat}<small>/ 3</small></strong></div><div className="race-clock">{elapsed.toFixed(1)}<small>SEC</small></div><Button variant="outline" className="restart-button" onClick={onReset}><RotateCcw size={16}/><span>Restart heat</span></Button></div>
      <div className="lane-label lane-label-left">BLUE CREW <span>↓</span></div><div className="lane-label lane-label-right">RED RIOT <span>↓</span></div>
      <div className="race-bottom">{([0, 1] as const).map((player) => <RacePlayer key={player} player={player} snapshot={snapshots[player]} score={scores[player] || 0} onHold={(held) => onHold(player, held)} onCancelInput={onCancelInput}/>)}</div>
      {stage === 'countdown' && <div className="countdown-overlay"><span>GOOD LUCK, BAD IDEAS.</span><strong key={countdown}>{countdown > 0 ? countdown : 'GO!'}</strong><p>Wait for GO, then hold <kbd>F</kbd> / <kbd>J</kbd> · Release to hop</p></div>}
    </>}
    {results && <div className="results-backdrop"><section className={`results-card ${final ? 'final-card' : ''}`}>
      <div className="results-kicker"><span className="mini-checker"/>{final ? 'THE VERY QUESTIONABLE GRAND PRIX' : `SAN FRANCISCO / HEAT ${heat} COMPLETE`}<span className="mini-checker"/></div>
      <div className="results-headline">{final && <Trophy className="champion-icon" size={45}/>}<h1>{final ? winner === null ? 'DOUBLE TROUBLE!' : `${PLAYER_NAMES[winner]} WINS!` : 'WHAT A RIDE.'}</h1><p>{final ? winner === null ? 'Two equally questionable champions.' : 'An everyday object. An extraordinary victory.' : 'Brush off the hay. There’s room for improvement.'}</p></div>
      <div className="results-players">{([0, 1] as const).map((player) => { const snapshot = snapshots[player]; return <article key={player} className={`result-player player-${player}`} style={{ '--player-color': PLAYER_COLORS[player] } as CSSProperties}><div className="result-player-title"><span className="player-badge">P{player + 1}</span><strong>{PLAYER_NAMES[player]}</strong><div className="standing-score">{scores[player] || 0}<small>PTS TOTAL</small></div></div><div className="result-vehicle"><BodyGlyph id={builds[player]?.bodyId || 'bathtub'} color={PLAYER_COLORS[player]}/><span>{builds[player] ? getBody(builds[player].bodyId).name : 'Mystery machine'}</span></div><dl className="result-stats"><div><dt>{snapshot?.finished ? 'FINISH TIME' : 'DISTANCE'}</dt><dd>{snapshot?.finished ? timeLabel(snapshot.finishTime) : `${Math.round((snapshot?.progress || 0) * 100)}%`}</dd></div><div><dt>HOPS</dt><dd>{snapshot?.jumps || 0}</dd></div><div><dt>RECOVERIES</dt><dd>{snapshot?.recoveries || 0}</dd></div></dl>{!final && <div className="pit-tip"><span><Zap size={12} fill="currentColor"/> LOCAL PIT TIP</span><p>{tips[player] || 'Try a smaller hop over the rumble bumps. Save your big charge for the final kicker.'}</p></div>}</article>; })}</div>
      <div className="results-footer"><p>{final ? 'New builds. Same friends. Another very bad idea.' : 'Tweak your build in the garage before the next heat.'}<small>{final ? 'Three heats. Maximum nonsense.' : 'Winner: 3 pts · Second: 1 pt · Ties share points'}</small></p><Button className="start-button" onClick={final ? onRematch : onNext}>{final ? 'ONE MORE DERBY' : heat >= 3 ? 'SEE THE CHAMPION' : 'BACK TO THE GARAGE'}{final ? <RotateCcw size={21}/> : <ArrowRight size={22}/>}</Button></div>
    </section></div>}
  </div>;
}
