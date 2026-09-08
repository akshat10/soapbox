'use client';
import { useEffect, useRef, useState } from 'react';

export default function LandingScene() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import('@/game/landing-scene').then(async ({ createLandingScene }) => {
      if (!host.current || cancelled) return;
      const scene = await createLandingScene(host.current);
      if (cancelled) scene?.();
      else { dispose = scene; if (scene) setReady(true); else setFailed(true); }
    }).catch(error => { if (!cancelled) setFailed(true); console.warn('Silicon Racer course preview could not load', error); });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className={`landing-scene ${ready ? 'scene-ready' : ''}`} aria-busy={!ready && !failed}>
    <div className="landing-scene-canvas" ref={host} aria-hidden="true"/>
    {!ready && <output className="landing-course-loading"><span>{failed ? 'The course preview is unavailable.' : 'Loading the live course…'}</span></output>}
    {ready && <span className="landing-explore-hint">Drag to orbit · Scroll to zoom</span>}
    <span className="sr-only">Live 3D overview of the complete Bay or Bust circuit with racers: Lombard Gardens, Lantern Quarter, Golden Gate Leap, Mission Market, SoMa Circuit, Pier Pressure and the Skyline Run return.</span>
  </div>;
}
