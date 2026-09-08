'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PartyState } from '@/game/party-types';
import type { DerbyRenderer } from '@/game/renderer';
import type { PlayerId } from '@/game/types';
import { SnapshotPlayback } from '@/game/snapshot-playback';

const FRAME_MS = 1000 / 60;

/** Physics stays on the host. The scene reads poses directly, independent of HUD renders. */
export default function PhoneRaceView({ state, stateSource, player, onReady }: {
  state: PartyState; stateSource?: RefObject<PartyState | null>; player: PlayerId; onReady: (ready: boolean) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const renderer = useRef<DerbyRenderer | null>(null);
  const fallbackState = useRef(state);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fallbackState.current = state; }, [state]);

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    let lastDraw = 0, lastFrame = 0, frameCredit = 0;
    let qualityTime = 0, qualityFrames = 0;
    let buildKey = '';
    let lastPacket: PartyState | null = null;
    const playback = new SnapshotPlayback();
    async function start() {
      try {
        const [{ DerbyRenderer }, { preloadModels }] = await Promise.all([import('@/game/renderer'), import('@/game/assets')]);
        await preloadModels();
        if (cancelled || !parent.current) return;
        const scene = new DerbyRenderer(parent.current, { profile: 'phone' });
        renderer.current = scene;
        setLoading(false);
        onReady(true);
        function frame(now: number) {
          if (cancelled) return;
          animation = requestAnimationFrame(frame);
          const frameElapsed = lastFrame ? now - lastFrame : FRAME_MS;
          lastFrame = now;
          const current = stateSource?.current ?? fallbackState.current;
          if (document.hidden) { lastDraw = now; frameCredit = 0; qualityTime = 0; qualityFrames = 0; return; }
          if (lastPacket !== current) {
            playback.push(current, now);
            lastPacket = current;
            const key = JSON.stringify(current.builds);
            if (key !== buildKey) { scene.setBuilds(current.builds); buildKey = key; }
          }
          const active = current.racerIds.includes(player) && (current.stage === 'countdown' || current.stage === 'racing');
          if (!active) { lastDraw = now; frameCredit = 0; qualityTime = 0; qualityFrames = 0; return; }
          const elapsed = now - lastDraw;
          // ProMotion displays need no more than 60 scene frames per second.
          frameCredit += Math.min(frameElapsed, 250);
          if (frameCredit < FRAME_MS - .25) return;
          frameCredit %= FRAME_MS;
          const dt = lastDraw ? Math.min(elapsed / 1000, .05) : 1 / 60;
          lastDraw = now;
          scene.render(current.stage, playback.sample(now), dt, now / 1000, player);
          // Reduce fill cost only when sustained frame delivery is slow. Never
          // rebuild a scene or increase resolution mid-race on a warm phone.
          if (elapsed > 0) { qualityTime += Math.min(elapsed, 250); qualityFrames++; }
          if (qualityTime >= 2000) {
            if (qualityTime / qualityFrames > 25 && scene.renderer.getPixelRatio() > .7) {
              scene.renderer.setPixelRatio(Math.max(.7, scene.renderer.getPixelRatio() - .15));
              scene.resize();
            }
            qualityTime = 0; qualityFrames = 0;
          }
        }
        animation = requestAnimationFrame(frame);
      } catch {
        if (!cancelled) { setLoading(false); onReady(true); setError('The 3D view couldn’t load. You can still race using the shared screen.'); }
      }
    }
    void start();
    return () => { cancelled = true; cancelAnimationFrame(animation); renderer.current?.dispose(); renderer.current = null; };
  }, [player, onReady, stateSource]);

  return <div className="phone-race-viewport" aria-label="Your live 3D race view">
    <div ref={parent} className="phone-race-canvas"/>
    {(loading || error) && <output className="phone-scene-status">{error || 'Getting your ride on the hill…'}</output>}
  </div>;
}
