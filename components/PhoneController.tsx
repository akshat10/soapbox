'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Flag, LoaderCircle, Radio, Smartphone, Trophy, Wifi, WifiOff, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GarageCard } from '@/components/DerbyUI';
import { DEFAULT_BUILDS, getBody, isLegalBuild } from '@/game/catalogue';
import { connectController } from '@/game/party-client';
import type { PartyConnection, PartyState } from '@/game/party-types';
import type { Blueprint, PlayerId } from '@/game/types';

type Controller = Awaited<ReturnType<typeof connectController>>;
type ScreenLock = { release: () => Promise<void>; released: boolean };
const COLORS = ['#3254ee', '#f45a4e'];
const NAMES = ['BLUE CREW', 'RED RIOT'];
const cleanCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const roomFromURL = () => cleanCode(new URLSearchParams(window.location.search).get('room') || '');
function subscribeURL(listener: () => void) { window.addEventListener('popstate', listener); return () => window.removeEventListener('popstate', listener); }
const sameBuild = (a: Blueprint, b: Blueprint) => a.bodyId === b.bodyId && a.wheelId === b.wheelId && a.wheelbase === b.wheelbase;
const percentage = (value?: number) => Math.round(Math.min(1, Math.max(0, value || 0)) * 100);

function tokenKey(code: string) { return `doodle-derby-controller:${code}`; }
function storedToken(code: string) { try { return sessionStorage.getItem(tokenKey(code)) || undefined; } catch { return undefined; } }
function rememberToken(code: string, token: string) { try { sessionStorage.setItem(tokenKey(code), token); } catch { /* Joining still works when storage is unavailable. */ } }
function friendlyError(message: string) {
  if (/full|two players|2 players|no.*slot/i.test(message)) return 'This derby already has two drivers. Ask the big screen to start a new room.';
  if (/expired|not found|unknown room|no room|closed/i.test(message)) return 'That room has closed or expired. Enter the new code shown on the big screen.';
  if (/fetch|network|failed to connect/i.test(message)) return 'We couldn’t reach the derby. Check your connection and try again.';
  return message || 'Something interrupted the connection. Try joining again.';
}

function PhoneLogo() {
  return <Link className="phone-logo" href="/" aria-label="Doodle Derby home"><span>DOODLE</span><strong>DERBY<span aria-hidden="true">✳</span></strong></Link>;
}

export default function PhoneController() {
  const controller = useRef<Controller | null>(null);
  const stateRef = useRef<PartyState | null>(null);
  const pendingBuild = useRef<Blueprint | null>(null);
  const pendingReady = useRef<boolean | null>(null);
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

  const cancelHold = useCallback(() => {
    held.current = false;
    pointer.current = null;
    setPressed(false);
    controller.current?.input('cancel');
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
    setJoining(true);
    setConnection('connecting');
    setError('');
    try {
      const session = await connectController(nextCode, {
        onState: (next) => {
          if (attempt.current !== thisAttempt) return;
          if (next.stage !== stateRef.current?.stage || next.paused) cancelHold();
          stateRef.current = next;
          setRoom(next);
          const own = controller.current?.playerId;
          if (own == null) return;
          if (held.current && next.snapshots.some((item) => item.id === own && item.finished)) cancelHold();
          const serverBuild = next.builds[own];
          if (serverBuild && (!pendingBuild.current || sameBuild(serverBuild, pendingBuild.current) || next.stage !== 'garage')) {
            pendingBuild.current = null;
            setBuild(serverBuild);
          }
          if (pendingReady.current === next.ready[own] || next.stage !== 'garage') {
            pendingReady.current = null;
            setReadyDraft(null);
          }
        },
        onConnection: (next) => { if (attempt.current === thisAttempt) { cancelHold(); setConnection(next); if (next === 'direct' || next === 'relay') setError(''); } },
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
  const charge = percentage(snapshot?.charge);
  const progress = percentage(snapshot?.progress);
  const canHold = linked && stage === 'racing' && !room?.paused && !snapshot?.finished;

  function startHold() {
    if (!canHold || held.current) return;
    held.current = true;
    setPressed(true);
    controller.current?.input('hold');
    void keepAwake();
  }
  function releaseHold() {
    if (!held.current) return;
    held.current = false;
    pointer.current = null;
    setPressed(false);
    controller.current?.input('release');
  }
  function changeBuild(next: Blueprint) {
    if (!linked || ready || stage !== 'garage' || !isLegalBuild(next)) return;
    pendingBuild.current = next;
    setBuild(next);
    controller.current?.setBuild(next);
  }
  function toggleReady() {
    if (!linked || !room || stage !== 'garage' || !isLegalBuild(build)) return;
    const next = !ready;
    pendingReady.current = next;
    setReadyDraft(next);
    controller.current?.setReady(next);
    void keepAwake();
  }

  if (player == null) return <main className="phone-controller phone-join">
    <div className="phone-shell">
      <header className="phone-header"><PhoneLogo/><span className="phone-mode"><Smartphone size={14}/> PHONE CONTROLLER</span></header>
      <section className="phone-join-content">
        <div className="phone-art" aria-hidden="true"><span className="phone-art-burst">✳</span><div className="phone-art-device"><Smartphone strokeWidth={1.6}/><Zap className="phone-art-zap" fill="currentColor" strokeWidth={2.2}/></div><Flag className="phone-art-flag" size={54}/><span className="phone-art-star">✦</span></div>
        <span className="phone-eyebrow">SMALL SCREEN. BIG NONSENSE.</span>
        <h1>YOUR PHONE.<br/><span>YOUR RIDE.</span></h1>
        <p>Build on your phone. Race on the big screen.<br/>One thumb. Absolutely no brakes.</p>
        <form className="phone-join-form" onSubmit={join}>
          <label htmlFor="derby-room-code">ENTER THE CODE ON THE BIG SCREEN</label>
          <Input id="derby-room-code" value={code} onChange={(event) => setCode(cleanCode(event.target.value))} maxLength={6} placeholder="ABC123" autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" disabled={joining} aria-describedby={error ? 'phone-join-error' : 'phone-code-help'}/>
          <Button className="phone-primary" type="submit" disabled={code.length !== 6 || joining}>{joining ? <><LoaderCircle className="phone-spinner" size={20}/> FINDING YOUR RIDE…</> : <>JOIN THE DERBY <ArrowRight size={23}/></>}</Button>
          {error && <p id="phone-join-error" className="phone-error" role="alert">{error}</p>}
          <small id="phone-code-help">Open Doodle Derby on a computer or TV<br/>and choose phone controllers to get a code.</small>
        </form>
      </section>
      <footer className="phone-join-footer"><span className="mini-checker"/> SAN FRANCISCO’S MOST QUESTIONABLE GRAND PRIX</footer>
    </div>
  </main>;

  const isResults = stage === 'results' || stage === 'final';
  const opponent = player === 0 ? 1 : 0;
  const tied = room?.scores[player] === room?.scores[opponent];
  const champion = !tied && score > (room?.scores[opponent] || 0);
  const statusText = !linked ? 'RECONNECTING…' : room?.paused ? 'RACE PAUSED' : snapshot?.finished ? 'NICELY DONE!' : snapshot?.recovering ? 'BACK ON YOUR WHEELS…' : !snapshot?.grounded ? 'AIR TIME!' : pressed || charge > 5 ? 'RELEASE TO HOP!' : 'HOLD TO CHARGE';

  return <main className={`phone-controller phone-player-${player} phone-stage-${stage || 'waiting'}`} style={{ '--player-color': COLORS[player] } as CSSProperties}>
    <div className="phone-shell">
      <header className="phone-header phone-connected-header"><PhoneLogo/><div className="phone-room-id"><span>ROOM</span><strong>{roomCode}</strong></div><Button variant="ghost" className="phone-leave" onClick={leave}>Leave</Button></header>
      <div className="phone-identity"><span className="player-badge">P{player + 1}</span><div><span>YOU’RE DRIVING FOR</span><strong>{NAMES[player]}</strong></div><output className={`phone-connection ${linked ? 'is-linked' : ''}`}>{linked ? <Wifi size={15}/> : <WifiOff size={15}/>}<span>{linked ? 'CONNECTED' : 'RECONNECTING'}</span></output></div>

      {(!linked || room?.paused) && <output className="phone-network-note"><Radio size={18}/><span><strong>{!linked ? 'Finding the big screen…' : 'Race paused. A quick pit stop.'}</strong><span>{!linked ? 'Keep this page open. Controls will return when you reconnect.' : 'Reconnect both phones and keep the race screen open.'}</span></span></output>}
      {error && <aside className="phone-error phone-session-error" role="alert"><p>{error}</p><Button variant="ghost" onClick={() => { leave(); }}>Back to room code <ArrowRight size={15}/></Button></aside>}

      {!room && <section className="phone-waiting"><LoaderCircle className="phone-spinner" size={34}/><h1>YOU’RE IN.</h1><p>Waiting for the big screen to send your garage…</p></section>}

      {stage === 'garage' && <>
        <section className="phone-garage-intro"><span className="phone-eyebrow">HEAT {room?.heat || 1} OF 3 <span>•</span> YOUR PERSONAL PIT</span><h1>MAKE IT QUESTIONABLE.</h1><p>Pick your parts. Your ride updates on the big screen.</p></section>
        <fieldset className={`phone-garage-fieldset ${ready ? 'is-ready' : ''}`} disabled={ready || !linked} aria-label="Your vehicle parts">
          <GarageCard player={player} build={build} onChange={changeBuild}/>
        </fieldset>
        <footer className="phone-ready-footer">
          <div className="phone-ready-note"><span className={`phone-ready-dot ${ready ? 'is-ready' : ''}`}/><span>{ready ? room?.ready[opponent] ? 'Both drivers ready. Look at the big screen!' : 'You’re ready. Waiting for the other driver…' : '10 bolts. One very bad idea.'}</span>{score > 0 && <strong>{score} PTS</strong>}</div>
          <Button className={`phone-primary ${ready ? 'phone-unready' : ''}`} disabled={!linked || !isLegalBuild(build)} onClick={toggleReady} aria-pressed={ready}>{ready ? <><Check size={20}/> READY! TAP TO TWEAK</> : <>READY TO ROLL <ArrowRight size={22}/></>}</Button>
        </footer>
      </>}

      {(stage === 'racing' || stage === 'countdown') && <section className="phone-race-content">
        <div className="phone-race-heading"><span className="phone-eyebrow">HEAT {room?.heat || 1} <span>/ 3</span></span><span className="phone-score"><strong>{score}</strong> PTS</span></div>
        <div className="phone-race-copy"><span className="phone-eyebrow">{stage === 'countdown' ? 'GET YOUR THUMB READY' : 'EYES ON THE BIG SCREEN'}</span><h1>{stage === 'countdown' ? 'LET’S ROLL.' : 'SEND IT.'}</h1><p>{getBody(build.bodyId).name}</p></div>
        <div className="phone-progress-label"><span><Flag size={14}/> YOUR RACE</span><strong>{progress}%</strong></div>
        <progress className="phone-race-progress" value={progress} max={100} aria-label="Your course progress"/>
        <div className="phone-charge-label"><span>HOP CHARGE</span><strong>{charge}%</strong></div>
        <progress className="phone-charge-track" aria-label="Hop charge" value={charge} max={100}/>
        <button type="button" className={`phone-hop-button ${pressed ? 'is-pressed' : ''} ${snapshot?.finished ? 'is-finished' : ''}`} disabled={!canHold} aria-label="Hold to charge. Release to hop." aria-pressed={pressed}
          onPointerDown={(event) => { if (!canHold || pointer.current !== null || held.current) return; event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); startHold(); }}
          onPointerUp={(event) => { if (pointer.current !== event.pointerId) return; event.preventDefault(); releaseHold(); }}
          onPointerCancel={cancelHold}
          onLostPointerCapture={() => { if (held.current) cancelHold(); }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startHold(); } }}
          onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); releaseHold(); } }}
          onBlur={cancelHold}
        >
          <span className="phone-hop-fill" style={{ transform: `scaleY(${charge / 100})` }}/>
          <span className="phone-hop-content">
            {stage === 'countdown' ? <strong className="phone-countdown" aria-live="assertive">{room?.countdown ? Math.ceil(room.countdown) : 'GO!'}</strong> : snapshot?.finished ? <Flag size={67} strokeWidth={2.4}/> : <Zap className="phone-hop-bolt" size={80} fill="currentColor" strokeWidth={1.5}/>}
            <strong>{stage === 'countdown' ? 'WAIT FOR GO…' : statusText}</strong>
            <small>{stage === 'countdown' ? 'Then hold. Release to hop.' : snapshot?.finished ? 'Watch the finish on the big screen.' : room?.paused || !linked ? 'Your thumb can take a breather.' : pressed ? 'Bigger charge. Bigger hop.' : 'Press and hold anywhere here.'}</small>
          </span>
        </button>
        <p className="phone-race-footnote">{snapshot?.recovering ? 'Your crew is putting you back on the hill.' : snapshot?.finished ? `${snapshot.finishTime?.toFixed(2) || '—'} seconds of excellent nonsense.` : 'Charge on the ground. Release just before a jump.'}</p>
      </section>}

      {isResults && <section className="phone-results-content">
        <div className="phone-results-stamp" aria-hidden="true">{stage === 'final' ? <Trophy size={59} strokeWidth={1.9}/> : <Flag size={55} strokeWidth={2}/>}</div>
        <span className="phone-eyebrow">{stage === 'final' ? 'THREE HEATS. MAXIMUM NONSENSE.' : `HEAT ${room?.heat || 1} COMPLETE`}</span>
        <h1>{stage === 'final' ? tied ? 'DOUBLE TROUBLE!' : champion ? 'YOU’RE THE CHAMP!' : 'WHAT A DERBY.' : snapshot?.finished ? 'YOU SENT IT.' : 'WHAT A RIDE.'}</h1>
        <p>{stage === 'final' ? tied ? 'Two equally questionable champions.' : champion ? 'The bragging rights are yours.' : 'A questionable machine. A very good time.' : getBody(build.bodyId).name}</p>
        <div className="phone-results-score"><strong>{score}</strong><span>POINTS<br/>TOTAL</span></div>
        <dl className="phone-results-stats"><div><dt>{snapshot?.finished ? 'FINISH TIME' : 'DISTANCE'}</dt><dd>{snapshot?.finished ? `${snapshot.finishTime?.toFixed(2) || '—'}s` : `${progress}%`}</dd></div><div><dt>HOPS</dt><dd>{snapshot?.jumps || 0}</dd></div><div><dt>RECOVERIES</dt><dd>{snapshot?.recoveries || 0}</dd></div></dl>
        <div className="phone-results-next"><Smartphone size={23}/><p><strong>Stay right here.</strong><span>{stage === 'final' ? 'Start another derby on the big screen. Your controller is ready for a rematch.' : room?.heat === 3 ? 'The final standings are coming on the big screen.' : 'Continue on the big screen. Your garage will open here for the next heat.'}</span></p></div>
      </section>}
    </div>
  </main>;
}
