'use client';
/* oxlint-disable next/no-html-link-for-pages -- Native navigation avoids Vinext production export mismatch. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Flag, Gauge, Grid2X2, LoaderCircle, Radio, Smartphone, Trophy, Wifi, WifiOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GarageCard } from '@/components/DerbyUI';
import PhoneRaceView from '@/components/PhoneRaceView';
import RaceDiagnostics from '@/components/RaceDiagnostics';
import { raceDiagnostics as diag } from '@/game/race-diagnostics';
import { SiliconBrand } from '@/components/SiliconBrand';
import { PLAYER_COLORS, PLAYER_NAMES, raceCue, racePlace } from '@/game/race';
import { BODIES, DEFAULT_BUILDS, getBody, isLegalBuild } from '@/game/catalogue';
import { connectController } from '@/game/party-client';
import type { PartyConnection, PartyState } from '@/game/party-types';
import type { Blueprint, PlayerId } from '@/game/types';

type Controller = Awaited<ReturnType<typeof connectController>>;
type ScreenLock = { release: () => Promise<void>; released: boolean };
const COLORS = PLAYER_COLORS;
const NAMES = PLAYER_NAMES;
const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const roomFromURL = () => cleanCode(new URLSearchParams(window.location.search).get('room') || '');
function subscribeURL(listener: () => void) { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }
const sameBuild = (a: Blueprint, b: Blueprint) => a.bodyId === b.bodyId && a.wheelId === b.wheelId && a.wheelbase === b.wheelbase;
const percentage = (value?: number) => Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
function tapFeedback(duration = 10) { try { navigator.vibrate?.(duration); } catch { /* Haptics are optional. */ } }

function tokenKey(code: string) { return `doodle-derby-controller:${code}`; }
function storedToken(code: string) { try { return sessionStorage.getItem(tokenKey(code)) || undefined; } catch { return undefined; } }
function rememberToken(code: string, token: string) { try { sessionStorage.setItem(tokenKey(code), token); } catch { /* Joining still works when storage is unavailable. */ } }
function friendlyError(message: string) {
  if (/full|four players|4 players|no.*slot/i.test(message)) return 'This derby already has four drivers. Join the next derby or open another room.';
  if (/expired|not found|unknown room|no room|closed/i.test(message)) return 'That room has closed or expired. Enter the new code shown on the big screen.';
  if (/fetch|network|failed to connect/i.test(message)) return 'We couldn’t reach the derby. Check your connection and try again.';
  return message || 'Something interrupted the connection. Try joining again.';
}

function PhoneLogo() {
  return <a className="phone-logo" href="/" aria-label="Silicon Racer home"><SiliconBrand compact/></a>;
}

export default function PhoneController() {
  const controller = useRef<Controller | null>(null);
  const surface = useRef<HTMLElement | null>(null);
  const stateRef = useRef<PartyState | null>(null);
  const lastHudUpdate = useRef(0);
  const pendingBuild = useRef<Blueprint | null>(null);
  const pendingReady = useRef<boolean | null>(null);
  const pendingReadyHeat = useRef(0);
  const attempt = useRef(0);
  const held = useRef(false);
  const pointer = useRef<number | null>(null);
  const wakeLock = useRef<ScreenLock | null>(null);
  const wakeAttempt = useRef<Promise<void> | null>(null);
  const urlCode = useSyncExternalStore(subscribeURL, roomFromURL, () => '');
  const [typedCode, setCode] = useState<string | null>(null);
  const code = typedCode ?? urlCode;
  const [roomCode, setRoomCode] = useState('');
  const [player, setPlayer] = useState<PlayerId | null>(null);
  const [connection, setConnection] = useState<PartyConnection>('disconnected');
  const [room, setRoom] = useState<PartyState | null>(null);
  const [build, setBuild] = useState<Blueprint>({ ...DEFAULT_BUILDS[0] });
  const [readyDraft, setReadyDraft] = useState<boolean | null>(null);
  const [joining, setJoining] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [error, setError] = useState('');
  const [garageStep, setGarageStep] = useState<'ride' | 'parts'>('ride');
  const [browseRides, setBrowseRides] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sharedScreen, setSharedScreen] = useState(false);
  const viewReady = sharedScreen || sceneReady;

  useEffect(() => {
    // Garage scrolling must never carry into the fixed race viewport.
    if (surface.current) surface.current.scrollTop = 0;
  }, [room?.stage, garageStep]);

  const cancelHold = useCallback(() => {
    const wasHeld = held.current;
    held.current = false;
    pointer.current = null;
    setPressed(false);
    if (wasHeld) controller.current?.input('cancel');
  }, []);

  const keepAwake = useCallback(async () => {
    if (!controller.current || document.visibilityState !== 'visible' || (wakeLock.current && !wakeLock.current.released)) return;
    if (wakeAttempt.current) return wakeAttempt.current;
    const wake = (navigator as Navigator & { wakeLock?: { request: (kind: 'screen') => Promise<ScreenLock> } }).wakeLock;
    if (!wake) return;
    wakeAttempt.current = (async () => {
      try {
        const lock = await wake.request('screen');
        if (!controller.current || document.visibilityState !== 'visible') await lock.release();
        else wakeLock.current = lock;
      } catch { /* The browser may decline a screen lock; controls remain usable. */ }
      finally { wakeAttempt.current = null; }
    })();
    return wakeAttempt.current;
  }, []);

  useEffect(() => {
    const visibility = () => { cancelHold(); if (document.visibilityState === 'visible') void keepAwake(); };
    window.addEventListener('blur', cancelHold);
    window.addEventListener('pagehide', cancelHold);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      attempt.current += 1;
      controller.current?.input('cancel');
      controller.current?.dispose();
      controller.current = null;
      void wakeLock.current?.release().catch(() => {});
      window.removeEventListener('blur', cancelHold);
      window.removeEventListener('pagehide', cancelHold);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancelHold, keepAwake]);

  async function join(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    const nextCode = cleanCode(code);
    if (nextCode.length !== 6 || joining) return;
    const thisAttempt = ++attempt.current;
    cancelHold();
    controller.current?.dispose();
    controller.current = null;
    stateRef.current = null;
    pendingBuild.current = null;
    pendingReady.current = null;
    setReadyDraft(null);
    setRoom(null);
    setPlayer(null);
    setSceneReady(false);
    setJoining(true);
    setConnection('connecting');
    setError('');
    try {
      const session = await connectController(nextCode, {
        onState: (next) => {
          if (attempt.current !== thisAttempt) return;
          const previous = stateRef.current;
          if (next.stage !== previous?.stage || next.paused) cancelHold();
          if (next.stage === 'garage' && previous?.stage !== 'garage') { setGarageStep('ride'); setBrowseRides(false); }
          stateRef.current = next;
          // Poses go straight to the scene ref. Reconcile the HUD at 10 Hz,
          // while phase, pause, readiness and results remain immediate.
          const now = performance.now();
          const immediate = !previous || next.stage !== previous.stage || next.heat !== previous.heat
            || next.paused !== previous.paused || next.ready.some((ready, id) => ready !== previous.ready[id])
            || next.scores.some((score, id) => score !== previous.scores[id]);
          if (immediate || now - lastHudUpdate.current >= 100) { lastHudUpdate.current = now; setRoom(next); }
          const own = controller.current?.playerId;
          diag.phase(next.stage, next.heat, next.paused, !document.hidden, own != null && !!next.snapshots.find(item => item.id === own)?.finished);
          if (own == null) return;
          if (held.current && next.snapshots.some((item) => item.id === own && item.finished)) cancelHold();
          const serverBuild = next.builds[own];
          if (serverBuild && (!pendingBuild.current || sameBuild(serverBuild, pendingBuild.current) || next.stage !== 'garage')) {
            pendingBuild.current = null;
            setBuild(current => sameBuild(current, serverBuild) ? current : serverBuild);
          }
          const readyHeat = next.stage === 'final' || next.stage === 'results' && next.heat === 3 ? 1 : next.stage === 'results' ? next.heat + 1 : next.heat;
          if (pendingReadyHeat.current === readyHeat && pendingReady.current === next.ready[own] || (next.stage === 'countdown' || next.stage === 'racing') && next.racerIds.includes(own)) {
            pendingReady.current = null;
            setReadyDraft(null);
          }
        },
        onConnection: (next) => {
          if (attempt.current !== thisAttempt) return;
          // Switching between two working transports must preserve the driver's hold.
          if (next === 'disconnected') cancelHold();
          setConnection(next);
          if (next === 'direct' || next === 'relay') setError('');
        },
        onError: (message) => { if (attempt.current === thisAttempt) setError(friendlyError(message)); },
      }, storedToken(nextCode));
      if (attempt.current !== thisAttempt) { session.dispose(); return; }
      controller.current = session;
      rememberToken(session.code, session.token);
      setRoomCode(session.code);
      setPlayer(session.playerId);
      const received = stateRef.current as PartyState | null;
      setBuild(received?.builds[session.playerId] || session.build);
      setJoining(false);
      void keepAwake();
    } catch (reason) {
      if (attempt.current !== thisAttempt) return;
      setError(friendlyError(reason instanceof Error ? reason.message : 'Could not join the room.'));
      setConnection('disconnected');
      setJoining(false);
    }
  }

  function leave() {
    attempt.current += 1;
    cancelHold();
    controller.current?.dispose();
    controller.current = null;
    stateRef.current = null;
    pendingBuild.current = null;
    pendingReady.current = null;
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    setRoom(null);
    setPlayer(null);
    setJoining(false);
    setConnection('disconnected');
    setError('');
    setReadyDraft(null);
  }

  const linked = connection === 'direct' || connection === 'relay';
  const stage = room?.stage;
  const snapshot = player == null ? undefined : room?.snapshots.find((item) => item.id === player);
  const ready = readyDraft ?? (player != null && Boolean(room?.ready[player]));
  const score = player == null ? 0 : room?.scores[player] || 0;
  const scoreLabel = Number(score.toFixed(2));
  const charge = percentage(snapshot?.charge);
  const progress = percentage(snapshot?.progress);
  const takingPart = player != null && Boolean(room?.racerIds.includes(player));
  const canHold = linked && stage === 'racing' && takingPart && !room?.paused && !snapshot?.finished;

  function startHold() {
    if (!canHold || held.current) return;
    held.current = true;
    setPressed(true);
    tapFeedback();
    controller.current?.input('hold');
    void keepAwake();
  }
  function releaseHold() {
    if (!held.current) return;
    held.current = false;
    pointer.current = null;
    setPressed(false);
    controller.current?.input('release');
    tapFeedback(16);
  }
  function changeBuild(next: Blueprint) {
    if (!linked || ready || stage !== 'garage' || !isLegalBuild(next)) return;
    pendingBuild.current = next;
    setBuild(next);
    controller.current?.setBuild(next);
    tapFeedback(8);
  }
  function cycleRide(direction: -1 | 1) {
    const current = BODIES.findIndex((item) => item.id === build.bodyId);
    for (let offset = 1; offset < BODIES.length; offset += 1) {
      const body = BODIES[(current + direction * offset + BODIES.length) % BODIES.length];
      const next = { ...build, bodyId: body.id };
      if (isLegalBuild(next)) { changeBuild(next); return; }
    }
  }
  function toggleRaceView() {
    cancelHold();
    setSceneReady(false);
    setSharedScreen(current => !current);
  }
  function toggleReady() {
    if (!linked || (!ready && !viewReady) || !room || !stage || !['garage', 'results', 'final'].includes(stage) || !isLegalBuild(build)) return;
    const next = !ready;
    const readyHeat = stage === 'final' || stage === 'results' && room.heat === 3 ? 1 : stage === 'results' ? room.heat + 1 : room.heat;
    pendingReady.current = next;
    pendingReadyHeat.current = readyHeat;
    setReadyDraft(next);
    controller.current?.setReady(next, readyHeat);
    tapFeedback(20);
    void keepAwake();
  }

  if (player == null) return <main ref={surface} className="phone-controller phone-join">
    <div className="phone-shell">
      <header className="phone-header"><PhoneLogo/><span className="phone-mode"><Smartphone size={14}/> YOUR OWN RACE VIEW</span></header>
      <section className="phone-join-content">
        <div className="phone-art" aria-hidden="true"><span className="phone-art-burst">✳</span><div className="phone-art-device"><Smartphone strokeWidth={1.6}/><Zap className="phone-art-zap" fill="currentColor" strokeWidth={2.2}/></div><Flag className="phone-art-flag" size={54}/><span className="phone-art-star">✦</span></div>
        <span className="phone-eyebrow">SMALL SCREEN. BIG NONSENSE.</span>
        <h1>YOUR PHONE.<br/><span>YOUR RIDE.</span></h1>
        <p>Your own race view. Up to four friends.<br/>One thumb. Absolutely no brakes.</p>
        <form className="phone-join-form" onSubmit={join}>
          <label htmlFor="derby-room-code">ENTER THE CODE ON THE BIG SCREEN</label>
          <Input id="derby-room-code" value={code} onChange={(event) => setCode(cleanCode(event.target.value))} maxLength={6} placeholder="ABC123" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" disabled={joining} aria-describedby={error ? 'phone-join-error' : 'phone-code-help'}/>
          <Button className="phone-primary" type="submit" disabled={code.length !== 6 || joining}>{joining ? <><LoaderCircle className="phone-spinner" size={20}/> FINDING YOUR RIDE…</> : <>Join the race <ArrowRight size={23}/></>}</Button>
          {error && <p id="phone-join-error" className="phone-error" role="alert">{error}</p>}
          <small id="phone-code-help">Open Silicon Racer on the shared screen<br/>and choose Start to get a code.</small>
        </form>
      </section>
      <footer className="phone-join-footer"><span className="mini-checker"/> SAN FRANCISCO’S MOST QUESTIONABLE GRAND PRIX</footer>
    </div>
  </main>;

  const isResults = stage === 'results' || stage === 'final';
  const racers = room?.racerIds || [];
  const opponents = racers.filter((id) => id !== player);
  const allReady = racers.length >= 2 && racers.every((id) => room?.ready[id]);
  const readyCount = racers.filter((id) => room?.ready[id]).length;
  const topScore = Math.max(0, ...racers.map((id) => room?.scores[id] || 0));
  const tied = score === topScore && racers.filter((id) => room?.scores[id] === topScore).length > 1;
  const champion = score === topScore && !tied;
  const position = stage === 'countdown' || !snapshot ? '—' : String(racePlace(snapshot, room?.snapshots || []));
  const positionSuffix = position === '1' ? 'ST' : position === '2' ? 'ND' : position === '3' ? 'RD' : position === '4' ? 'TH' : '';
  const waitingForHeat = (stage === 'countdown' || stage === 'racing') && !takingPart;
  const statusText = !linked ? 'RECONNECTING' : room?.paused ? 'PIT STOP' : snapshot?.finished ? 'FINISHED!' : snapshot?.recovering ? 'RESETTING…' : pressed ? 'RELEASE TO HOP' : charge > 5 ? 'RELEASE TO HOP' : 'HOLD TO CHARGE';

  return <main ref={surface} className={`phone-controller phone-player-${player} phone-stage-${waitingForHeat ? 'waiting' : stage || 'waiting'}${sharedScreen ? ' phone-shared-screen' : ''}`} style={{ '--player-color': COLORS[player] } as CSSProperties}>
    <RaceDiagnostics viewRole="player"/>
    {room && !sharedScreen && <PhoneRaceView state={room} stateSource={stateRef} player={player} onReady={setSceneReady}/>}
    <div className="phone-shell">
      <header className="phone-header phone-connected-header"><PhoneLogo/><div className="phone-room-id"><span>ROOM</span><strong>{roomCode}</strong></div><Button variant="ghost" className="phone-leave" onClick={leave}>Leave</Button></header>
      <div className="phone-view-controls">
        <output>{sharedScreen ? 'Watch the shared screen' : 'Race view on this phone'}</output>
        <Button type="button" variant="ghost" className="phone-view-toggle" onClick={toggleRaceView} title={sharedScreen ? 'Show the race on this phone' : 'Watch the race on the shared screen'}>{sharedScreen ? 'Show race view' : 'Use shared screen'}</Button>
      </div>
      <div className="phone-identity"><span className="player-badge">P{player + 1}</span><div><span>YOU’RE DRIVING FOR</span><strong>{NAMES[player]}</strong></div><output className={`phone-connection ${linked ? 'is-linked' : ''}`}>{linked ? <Wifi size={15}/> : <WifiOff size={15}/>}<span>{linked ? 'CONNECTED' : 'RECONNECTING'}</span></output></div>

      {(!linked || room?.paused) && <output className="phone-network-note"><Radio size={18}/><span><strong>{!linked ? 'Finding the big screen…' : 'Race paused. A quick pit stop.'}</strong><span>{!linked ? 'Keep this page open. Controls will return when you reconnect.' : 'Reconnect the missing drivers and keep the shared screen open.'}</span></span></output>}
      {error && <aside className="phone-error phone-session-error" role="alert"><p>{error}</p><Button variant="ghost" onClick={() => { leave(); }}>Back to room code <ArrowRight size={15}/></Button></aside>}

      {!room && <section className="phone-waiting"><LoaderCircle className="phone-spinner" size={34}/><h1>YOU’RE IN.</h1><p>Waiting for the big screen to send your garage…</p></section>}

      {stage === 'garage' && <>
        <section className="phone-garage-intro"><span className="phone-eyebrow">HEAT {room?.heat || 1} OF 3 <span>•</span> YOUR PERSONAL PIT</span><h1>{ready ? 'ON THE STARTING GRID.' : garageStep === 'ride' ? 'PICK YOUR RIDICULOUS.' : 'MAKE IT YOURS.'}</h1><p>{ready ? 'Race starts here when every driver is ready.' : garageStep === 'ride' ? 'Find your favorite. Four wheels. Zero dignity.' : 'Bigger wheels for bumps. Wider spacing for landings.'}</p></section>
        <nav className="phone-garage-steps" aria-label="Build your ride">
          <Button variant="ghost" className={garageStep === 'ride' ? 'is-current' : ''} onClick={() => setGarageStep('ride')} aria-current={garageStep === 'ride' ? 'step' : undefined}><span>01</span> RIDE {garageStep === 'parts' && <Check size={14}/>}</Button>
          <Button variant="ghost" className={garageStep === 'parts' ? 'is-current' : ''} onClick={() => setGarageStep('parts')} aria-current={garageStep === 'parts' ? 'step' : undefined}><span>02</span> PARTS</Button>
        </nav>
        <fieldset className={`phone-garage-fieldset phone-build-${garageStep} ${browseRides ? 'is-browsing' : ''} ${ready ? 'is-ready' : ''}`} disabled={ready || !linked} aria-label="Your vehicle parts">
          <GarageCard player={player} build={build} onChange={changeBuild}/>
          {garageStep === 'ride' && <div className="phone-ride-navigation">
            {!browseRides && <><Button variant="outline" aria-label="Previous ride" onClick={() => cycleRide(-1)}><ChevronLeft size={23}/></Button><span><strong>{BODIES.findIndex((item) => item.id === build.bodyId) + 1}</strong> / {BODIES.length} RIDES</span><Button variant="outline" aria-label="Next ride" onClick={() => cycleRide(1)}><ChevronRight size={23}/></Button></>}
            <Button variant="ghost" className="phone-browse-rides" onClick={() => setBrowseRides(!browseRides)} aria-expanded={browseRides}><Grid2X2 size={14}/>{browseRides ? 'FOCUS ON MY RIDE' : 'BROWSE RIDES'}</Button>
          </div>}
        </fieldset>
        <footer className="phone-ready-footer">
          <div className="phone-ready-note"><span className={`phone-ready-dot ${ready ? 'is-ready' : ''}`}/><span>{ready ? allReady ? 'Everyone ready. Here we go!' : `You’re ready · ${readyCount} of ${racers.length} drivers ready` : opponents.some((id) => room?.ready[id]) ? 'Your rivals are ready. Your call.' : racers.length < 2 ? 'Invite a friend. Racing starts with two drivers.' : `${racers.length} drivers on the grid · Ready up to start` }</span>{score > 0 && <strong>{scoreLabel} PTS</strong>}</div>
          {garageStep === 'ride' && !ready ? <Button className="phone-primary" disabled={!linked} onClick={() => { setGarageStep('parts'); setBrowseRides(false); }}>NEXT: WHEELS & STANCE <ArrowRight size={22}/></Button> : <Button className={`phone-primary ${ready ? 'phone-unready' : ''}`} disabled={!linked || (!ready && !viewReady) || !isLegalBuild(build)} onClick={toggleReady} aria-pressed={ready}>{!ready && !viewReady ? <><LoaderCircle className="phone-spinner" size={18}/> LOADING YOUR RACE…</> : ready ? <><Check size={20}/> READY! TAP TO TWEAK</> : <>READY TO ROLL <ArrowRight size={22}/></>}</Button>}
          {garageStep === 'parts' && !ready && <Button variant="ghost" className="phone-back-to-rides" onClick={() => setGarageStep('ride')}><ArrowLeft size={12}/> Change ride</Button>}
        </footer>
      </>}

      {waitingForHeat && <section className="phone-waiting phone-next-heat"><Flag size={48}/><span className="phone-eyebrow">YOU’RE IN, P{player + 1}</span><h1>NEXT RACE.<br/>YOUR MOMENT.</h1><p>Heat {room?.heat} is already underway. Your garage opens here as soon as it’s over.</p><span className="phone-waiting-pill">{NAMES[player]} · JOINED</span></section>}

      {(stage === 'racing' || stage === 'countdown') && takingPart && <section className="phone-race-content" aria-label="Race controller">
        <div className="phone-race-dashboard">
          <div className={`phone-race-position ${position === '1' ? 'is-leading' : ''}`}><strong>{position}<small>{positionSuffix}</small></strong><span>{snapshot?.finished ? 'FINISH POSITION' : `OF ${racers.length} DRIVERS`}</span></div>
          <div className="phone-race-dashboard-info"><div className="phone-race-heading"><span className="phone-eyebrow">HEAT {room?.heat || 1} <span>/ 3</span></span><span className="phone-score"><strong>{scoreLabel}</strong> PTS</span></div><h1>{getBody(build.bodyId).name}</h1><div className="phone-live-speed"><Gauge size={15}/><strong>{Math.round((snapshot?.speed || 0) * 3.6)}</strong><span>KM/H</span><span className="phone-race-state">{snapshot?.finished ? 'FINISHED' : snapshot?.recovering ? 'RECOVERING' : stage === 'countdown' ? 'ON THE GRID' : snapshot?.grounded ? 'ON THE HILL' : 'AIRBORNE'}</span></div></div>
        </div>
        <div className="phone-race-route"><div className="phone-progress-label"><span><Flag size={12}/> TO THE BAY</span><strong>{progress}%</strong></div><progress className="phone-race-progress" value={progress} max={100} aria-label="Your course progress"/>{room?.finishCountdown != null && !snapshot?.finished && <output className="phone-finish-countdown"><Flag size={13}/><span>FINISH IN</span><strong>{Math.ceil(room.finishCountdown)}<small>s</small></strong></output>}</div>
        <div className="phone-charge-meter"><div className="phone-charge-label"><span>{stage === 'countdown' ? 'GET YOUR THUMB READY' : 'HOP POWER'}</span><strong>{charge}%</strong></div><progress className="phone-charge-track" aria-label="Hop charge" value={charge} max={100}/></div>
        <button type="button" className={`phone-hop-button ${pressed ? 'is-pressed' : ''} ${charge >= 95 ? 'is-full-charge' : ''} ${snapshot?.finished ? 'is-finished' : ''}`} disabled={!canHold} aria-label="Hold to charge. Release to hop." aria-pressed={pressed}
          onPointerDown={(event) => { if (!canHold || pointer.current !== null || held.current) return; event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); startHold(); }}
          onPointerUp={(event) => { if (pointer.current !== event.pointerId) return; event.preventDefault(); releaseHold(); }}
          onPointerCancel={(event) => { if (pointer.current === event.pointerId) cancelHold(); }}
          onLostPointerCapture={(event) => { if (held.current && pointer.current === event.pointerId) cancelHold(); }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startHold(); } }}
          onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); releaseHold(); } }}
          onBlur={cancelHold}
        >
          <span className="phone-hop-fill" style={{ transform: `scaleY(${charge / 100})` }}/>
          <span className="phone-hop-rings" aria-hidden="true"/>
          <span className="phone-hop-content">
            <span className="phone-hop-prompt">{stage === 'countdown' ? 'THE HILL IS YOURS' : 'YOUR HOP BUTTON'}</span>
            {stage === 'countdown' ? <strong className="phone-countdown" aria-live="assertive">{room?.countdown ? Math.ceil(room.countdown) : 'GO!'}</strong> : snapshot?.finished ? <Flag className="phone-hop-bolt" size={76} strokeWidth={2.4}/> : <Zap className="phone-hop-bolt" size={96} fill="currentColor" strokeWidth={1.5}/>}
            <strong>{stage === 'countdown' ? 'WAIT FOR GO…' : statusText}</strong>
            <small>{stage === 'countdown' ? 'One button. All the glory.' : snapshot?.finished ? 'Let’s see how everyone finishes.' : room?.paused || !linked ? 'Controls return when everyone reconnects.' : snapshot?.recovering ? 'Your crew is getting you moving.' : pressed ? snapshot?.grounded ? 'Lift your thumb to send it.' : 'Charge starts when your wheels land.' : 'Hold on the ground. Let go before the jump.'}</small>
          </span>
        </button>
        <p className="phone-race-footnote">{snapshot?.finished ? `${snapshot.finishTime?.toFixed(2) || '—'}s · ${snapshot.jumps} hops · Nice driving.` : snapshot ? raceCue(snapshot) : 'HOLD → CHARGE · RELEASE → HOP'}</p>
      </section>}

      {isResults && <section className="phone-results-content">
        <div className="phone-results-stamp" aria-hidden="true">{stage === 'final' ? <Trophy size={59} strokeWidth={1.9}/> : <Flag size={55} strokeWidth={2}/>}</div>
        <span className="phone-eyebrow">{stage === 'final' ? 'THREE HEATS. MAXIMUM NONSENSE.' : `HEAT ${room?.heat || 1} COMPLETE`}</span>
        <h1>{stage === 'final' ? tied ? 'SHARED GLORY!' : champion ? 'YOU’RE THE CHAMP!' : 'WHAT A RIDE.' : !takingPart ? 'YOUR TURN IS NEXT.' : snapshot?.finished ? 'YOU SENT IT.' : 'WHAT A RIDE.'}</h1>
        <p>{stage === 'final' ? tied ? 'Equally questionable champions.' : champion ? 'The bragging rights are yours.' : 'A questionable machine. A very good time.' : getBody(build.bodyId).name}</p>
        <div className="phone-results-score"><strong>{scoreLabel}</strong><span>POINTS<br/>TOTAL</span></div>
        <dl className="phone-results-stats"><div><dt>{snapshot?.finished ? 'FINISH TIME' : 'DISTANCE'}</dt><dd>{snapshot?.finished ? `${snapshot.finishTime?.toFixed(2) || '—'}s` : `${progress}%`}</dd></div><div><dt>HOPS</dt><dd>{snapshot?.jumps || 0}</dd></div><div><dt>RECOVERIES</dt><dd>{snapshot?.recoveries || 0}</dd></div></dl>
        <div className="phone-results-next"><Smartphone size={23}/><p><strong>{stage === 'final' ? 'Another round?' : room?.heat === 3 ? 'The podium is coming…' : 'Next heat. Same rivals.'}</strong><span>{stage === 'final' ? 'Ready up here for a rematch. Everyone keeps their ride.' : room?.heat === 3 ? 'Three heats are done. Your final standings appear here shortly.' : 'Your garage opens in a moment. Keep this ride or change your setup.'}</span></p></div>
        {(stage === 'final' || (room?.heat || 1) < 3) && <Button className={`phone-primary phone-results-ready ${ready ? 'phone-unready' : ''}`} onClick={toggleReady} disabled={!linked || (!ready && !viewReady)} aria-pressed={ready}>{ready ? <><Check size={20}/> READY · WAITING FOR DRIVERS</> : <>{stage === 'final' ? 'READY FOR A REMATCH' : 'KEEP MY RIDE · READY'}<ArrowRight size={20}/></>}</Button>}
      </section>}
    </div>
  </main>;
}
