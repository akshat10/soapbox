'use client';
import { useEffect, useState } from 'react';
import { raceDiagnostics } from '@/game/race-diagnostics';

export default function RaceDiagnostics({ viewRole }: { viewRole: 'host' | 'player' }) {
  const [data, setData] = useState<ReturnType<typeof raceDiagnostics.snapshot> | null>(null);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    raceDiagnostics.enabled = true;
    const scope = window as Window & { __siliconRaceDiagnostics?: () => unknown };
    scope.__siliconRaceDiagnostics = () => raceDiagnostics.report();
    const tick = () => { raceDiagnostics.remember(); setData(raceDiagnostics.snapshot()); };
    tick(); const timer = setInterval(tick, 1000);
    return () => { clearInterval(timer); raceDiagnostics.enabled = false; delete scope.__siliconRaceDiagnostics; };
  }, []);
  if (!data) return null;
  const m = data.metrics;
  const hz = (name: string) => m[name]?.hz ?? 0;
  async function copy() {
    const report = JSON.stringify({ role: viewRole, ...raceDiagnostics.report() }, null, 2);
    try { await navigator.clipboard.writeText(report); setCopied(true); } catch { setText(report); }
  }
  return <aside aria-label="Race diagnostics" style={{ position: 'fixed', zIndex: 1000, right: 8, top: 72, maxWidth: 'calc(100vw - 16px)', width: 270, padding: 10, borderRadius: 8, background: 'rgba(9,25,22,.94)', color: '#fff', font: '12px/1.5 monospace', pointerEvents: 'auto' }}>
    <strong>{viewRole.toUpperCase()} · {data.stage} · HEAT {data.heat}</strong>
    <div>{data.paused ? 'PAUSED' : data.finished ? 'FINISHED' : data.visible ? 'VISIBLE' : 'HIDDEN'} · {data.route}</div>
    <div>Frames {hz('draw')}/s · rAF {hz('frame')}/s</div>
    <div>Simulation {data.simulationRate ?? '—'}× real time</div>
    {viewRole === 'host' ? <div>Publish {hz('publish')}/s · send {hz('send')}/s</div> : <><div>Fresh {hz('fresh')}/s · moving {hz('advancing')}/s</div><div>Gap p95 {m.freshGap?.p95 ?? '—'} ms · age {data.lastFreshAgeMs ?? '—'} ms</div><div>Motion holds {hz('motionHold')}/s</div></>}
    <div>Draw CPU p95 {m.draw?.p95 ?? '—'} ms</div>
    <button type="button" onClick={() => void copy()} style={{ marginTop: 6, background: '#f7f0df', color: '#163c32', border: 0, borderRadius: 4, padding: '5px 8px', cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy diagnostics'}</button>
    {text && <textarea aria-label="Diagnostics to copy" readOnly value={text} style={{ width: '100%', height: 100, color: '#163c32', background: '#fff' }}/>} 
  </aside>;
}
