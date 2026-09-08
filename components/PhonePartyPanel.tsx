'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Copy, Smartphone, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { PartyPlayer } from '@/game/party-types';

export default function PhonePartyPanel({ open, onOpenChange, code, players, busy, error, onCreate, onClose }: {
  open: boolean; onOpenChange: (open: boolean) => void; code?: string; players: PartyPlayer[];
  busy: boolean; error: string; onCreate: () => void; onClose: () => void;
}) {
  const [qr, setQr] = useState<{ code: string; data: string } | null>(null);
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => '');
  const link = code ? `${origin}/play?room=${encodeURIComponent(code)}` : ''; 
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    const url = `${window.location.origin}/play?room=${encodeURIComponent(code)}`;
    void import('qrcode').then(q => q.toDataURL(url, { width: 280, margin: 2, color: { dark: '#20231d', light: '#ffffff' } }))
      .then(data => { if (!cancelled) setQr({ code, data }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [code]);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="phone-party-panel">
      <div className="party-kicker"><Tv size={18}/> BIG SCREEN. TINY CONTROLLERS.</div>
      <DialogTitle className="party-title">BRING YOUR PHONE.<br/>BRING A BAD IDEA.</DialogTitle>
      <DialogDescription className="party-description">Keep the race on this screen. Two players join on their phones, pick their own rides, and hold to hop.</DialogDescription>
      {code ? <>
        <div className="party-pairing">
          <div className="party-qr">{qr?.code === code ? <Image unoptimized src={qr.data} width={210} height={210} alt={`Scan to join room ${code}`}/> : <Smartphone size={64}/>}</div>
          <div className="party-code"><span>SCAN TO JOIN · OR ENTER CODE</span><strong>{code}</strong><Link href="/play" target="_blank" rel="noreferrer">{origin.replace(/^https?:\/\//, '')}/play</Link><Button variant="outline" onClick={copy}><Copy size={16}/>{copied ? 'Link copied!' : 'Copy join link'}</Button></div>
        </div>
        <div className="party-seats">{([0, 1] as const).map(id => {
          const p = players.find(player => player.id === id);
          return <div className={`party-seat player-${id}`} key={id}><span className="player-badge">P{id + 1}</span><div><strong>{id === 0 ? 'BLUE CREW' : 'RED RIOT'}</strong><span>{p?.connected ? p.ready ? 'Ready to roll' : 'Choosing a ride…' : p?.lastSeen ? 'Reconnect your phone' : 'Waiting for a phone…'}</span></div><span className={`party-light ${p?.connected ? 'connected' : ''}`}/></div>;
        })}</div>
        <p className="party-note">Use one phone per player. Keep this race screen open. A lost connection pauses the race.</p>
        <div className="party-actions"><Button variant="outline" onClick={onClose} disabled={busy}>End phone party</Button><Button className="start-button" onClick={() => onOpenChange(false)}>BACK TO THE GARAGE</Button></div>
      </> : <>
        <div className="party-steps"><p><b>01</b> Create a room on this screen.</p><p><b>02</b> Two phones scan the code.</p><p><b>03</b> Ready up. Race downhill.</p></div>
        <Button className="start-button" onClick={onCreate} disabled={busy}>{busy ? 'OPENING THE GARAGE…' : 'CREATE A PHONE PARTY'}<Smartphone size={20}/></Button>
        <Link className="party-join-link" href="/play">Already have a room code? Join on this device</Link>
      </>}
      {error && <p role="alert" className="party-error">{error}</p>}
    </DialogContent>
  </Dialog>;
}
