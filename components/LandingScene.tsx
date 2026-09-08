'use client';
import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';

export default function LandingScene() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import('@/game/landing-scene').then(async ({ createLandingScene }) => {
      if (!host.current || cancelled) return;
      const scene = await createLandingScene(host.current);
      if (cancelled) scene?.();
      else { dispose = scene; if (scene) setReady(true); }
    }).catch(error => { console.warn('Silicon Racer landing scene could not load', error); });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className={`landing-scene ${ready ? 'scene-ready' : ''}`}><div className="landing-scene-canvas" ref={host} aria-hidden="true"/>{!ready && <Image unoptimized width={512} height={512} className="landing-poster" src="/models/sf/sourdough.png" alt="A sourdough soapbox racer"/>}<span className="sr-only">Sourdough and burrito racers roll through a miniature San Francisco street.</span></div>;
}
