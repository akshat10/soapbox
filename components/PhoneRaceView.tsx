'use client';

import { useEffect, useRef, useState } from 'react';
import type { PartyState } from '@/game/party-types';
import type { DerbyRenderer } from '@/game/renderer';
import type { PlayerId, Pose, Quat, Vec3, VehicleSnapshot } from '@/game/types';

const BLEND_MS = 85;
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const mixPoint = (a: Vec3, b: Vec3, amount: number): Vec3 => ({ x: mix(a.x, b.x, amount), y: mix(a.y, b.y, amount), z: mix(a.z, b.z, amount) });
function mixQuaternion(a: Quat, b: Quat, amount: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const value = { x: mix(a.x, b.x * sign, amount), y: mix(a.y, b.y * sign, amount), z: mix(a.z, b.z * sign, amount), w: mix(a.w, b.w * sign, amount) };
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;
  return { x: value.x / length, y: value.y / length, z: value.z / length, w: value.w / length };
}
const mixPose = (from: Pose, to: Pose, amount: number): Pose => ({ position: mixPoint(from.position, to.position, amount), quaternion: mixQuaternion(from.quaternion, to.quaternion, amount) });
function smoothSnapshots(from: VehicleSnapshot[], to: VehicleSnapshot[], amount: number): VehicleSnapshot[] {
  return to.map((next) => {
    const previous = from.find((item) => item.id === next.id);
    if (!previous || previous.recovering !== next.recovering || Math.abs(previous.position.z - next.position.z) > 12) return next;
    return { ...next, ...mixPose(previous, next, amount), wheels: next.wheels.map((wheel, index) => previous.wheels[index] ? mixPose(previous.wheels[index], wheel, amount) : wheel) };
  });
}

/** The shared screen owns physics. Phones only draw its poses between updates. */
export default function PhoneRaceView({ state, player, onReady }: { state: PartyState; player: PlayerId; onReady: (ready: boolean) => void }) {
  const parent = useRef<HTMLDivElement>(null);
  const renderer = useRef<DerbyRenderer | null>(null);
  const stateRef = useRef(state);
  const rendered = useRef<VehicleSnapshot[]>(state.snapshots);
  const blend = useRef({ from: state.snapshots, to: state.snapshots, at: 0 });
  const buildKey = useRef('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const previous = stateRef.current;
    const newRound = previous.heat !== state.heat || previous.stage === 'garage' && state.stage === 'countdown';
    blend.current = { from: newRound ? state.snapshots : rendered.current, to: state.snapshots, at: performance.now() };
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    let last = performance.now();
    async function start() {
      try {
        const [{ DerbyRenderer }, { preloadModels }] = await Promise.all([import('@/game/renderer'), import('@/game/assets')]);
        await preloadModels();
        if (cancelled || !parent.current) return;
        const scene = new DerbyRenderer(parent.current);
        scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        scene.renderer.shadowMap.enabled = false;
        scene.resize();
        renderer.current = scene;
        setLoading(false);
        onReady(true);
        function frame(now: number) {
          if (cancelled) return;
          const state = stateRef.current;
          const dt = Math.min((now - last) / 1000, .05);
          last = now;
          const key = JSON.stringify(state.builds);
          if (key !== buildKey.current) { scene.setBuilds(state.builds); buildKey.current = key; }
          const packet = blend.current;
          rendered.current = smoothSnapshots(packet.from, packet.to, Math.min(1, Math.max(0, (now - packet.at) / BLEND_MS)));
          if (!document.hidden && state.racerIds.includes(player) && (state.stage === 'countdown' || state.stage === 'racing')) scene.render(state.stage, rendered.current, dt, now / 1000, player);
          animation = requestAnimationFrame(frame);
        }
        animation = requestAnimationFrame(frame);
      } catch {
        if (!cancelled) { setLoading(false); onReady(true); setError('The 3D view couldn’t load. You can still race using the shared screen.'); }
      }
    }
    void start();
    return () => { cancelled = true; cancelAnimationFrame(animation); renderer.current?.dispose(); renderer.current = null; buildKey.current = ''; };
  }, [player, onReady]);

  return <div className="phone-race-viewport" aria-label="Your live 3D race view">
    <div ref={parent} className="phone-race-canvas"/>
    {(loading || error) && <output className="phone-scene-status">{error || 'Getting your ride on the hill…'}</output>}
  </div>;
}
