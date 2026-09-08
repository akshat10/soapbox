'use client';
import Image from 'next/image';
import Link from 'next/link';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Copy, Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { PartyPlayer } from '@/game/party-types';
import type { Blueprint } from '@/game/types';
import { PLAYER_IDS, PLAYER_COLORS, PLAYER_NAMES } from '@/game/race';
import { getBody } from '@/game/catalogue';
import { SiliconBrand } from './SiliconBrand';

const subscribeOrigin = () => () => {};
export function PartyJoinCode({ code }: { code: string }) {
  const [qr, setQr] = useState<{ code: string; data: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => '');
  const link = `${origin}/play?room=${encodeURIComponent(code)}`;
  useEffect(() => {
    let cancelled = false;
    void import('qrcode').then(q => q.toDataURL(`${window.location.origin}/play?room=${encodeURIComponent(code)}`, { width: 300, margin: 2, color: { dark: '#163C32', light: '#ffffff' } }))
      .then(data => { if (!cancelled) setQr({ code, data }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [code]);
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }
  return <div className="party-pairing"><div className="party-qr">{qr?.code === code ? <Image unoptimized src={qr.data} width={210} height={210} alt={`Scan to join room ${code}`}/> : <Smartphone size={64}/>}</div><div className="party-code"><span>SCAN TO JOIN · OR ENTER CODE</span><strong>{code}</strong><Link href="/play" target="_blank" rel="noreferrer">{origin.replace(/^https?:\/\//, '')}/play</Link><Button variant="outline" className="copy-link" onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Copied!' : 'Copy invite'}</Button></div></div>;
}
export function PartySeats({ players, builds, ready }: { players: PartyPlayer[]; builds?: Blueprint[]; ready?: boolean[] }) {
  return <div className="party-seats">{PLAYER_IDS.map(id => {
    const p = players.find(player => player.id === id);
    const build = builds?.[id] || p?.build;
    const isReady = p?.connected && (ready ? ready[id] : p.ready);
    const sf = build && ['sourdough', 'mission_burrito', 'painted_porch'].includes(build.bodyId);
    return <div className={`party-seat ${p?.connected ? 'connected' : 'empty'} ${isReady ? 'ready' : ''}`} style={{ '--player-color': PLAYER_COLORS[id] } as CSSProperties} key={id}><span className="player-badge">{id + 1}</span>{p?.connected && sf ? <Image unoptimized width={122} height={84} className="seat-racer" src={`/models/sf/${build.bodyId}.png`} alt=""/> : <Smartphone className="seat-phone" size={32}/>}<div><strong>{p?.connected ? PLAYER_NAMES[id] : 'Your friend here'}</strong><span>{p?.connected ? isReady ? 'Ready!' : build ? getBody(build.bodyId).name : 'Picking a racer…' : p?.lastSeen ? 'Reconnect your phone' : 'Scan to join'}</span></div>{isReady && <Check className="seat-check" size={21}/>}</div>;
  })}</div>;
}
export default function PhonePartyPanel({ open, onOpenChange, code, players, busy, error, onCreate, onClose }: {
  open: boolean; onOpenChange: (open: boolean) => void; code?: string; players: PartyPlayer[];
  busy: boolean; error: string; onCreate: () => void; onClose: () => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (!open) { requested.current = false; return; }
    if (code && requested.current) { requested.current = false; onOpenChange(false); return; }
    if (!code && !busy && !error && !requested.current) { requested.current = true; onCreate(); }
  }, [open, code, busy, error, onCreate, onOpenChange]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="phone-party-panel"><SiliconBrand compact/><DialogTitle className="party-title">{code ? 'Your friends. Your hill.' : 'Opening your room…'}</DialogTitle><DialogDescription className="party-description">{code ? '2–4 players join on their phones. Keep this screen open to watch the race.' : 'Your phone is your controller. No app needed.'}</DialogDescription>{code ? <><PartyJoinCode code={code}/><div className="party-actions"><Button variant="outline" onClick={onClose} disabled={busy}>End room</Button><Button className="start-button" onClick={() => onOpenChange(false)}>See the lobby <ArrowRightIcon/></Button></div><p className="party-note">{players.filter(p => p.connected).length} of 4 racers connected</p></> : <div className="party-opening">{error ? <><p role="alert" className="party-error">{error}</p><Button className="start-button" onClick={onCreate} disabled={busy}>{busy ? 'Trying again…' : 'Try again'}</Button></> : <output className="loading-dots">Getting the crew together…</output>}<Link href="/play" className="party-join-link">Have a code? Join a race</Link></div>}</DialogContent></Dialog>;
}
function ArrowRightIcon() { return <span aria-hidden="true">→</span>; }
