'use client';
import { useSyncExternalStore } from 'react';

const MUTE_KEY = 'silicon-racer.muted.v1';
const CHANGE_EVENT = 'silicon-racer:mute-change';
let sessionMuted: boolean | undefined;

function getMuted() {
  if (sessionMuted !== undefined) return sessionMuted;
  try { return localStorage.getItem(MUTE_KEY) === 'true'; }
  catch { return false; }
}
const getServerMuted = () => false;

function subscribe(changed: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === MUTE_KEY || event.key === null) changed();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, changed);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(CHANGE_EVENT, changed);
  };
}

function setMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, String(muted)); sessionMuted = undefined; }
  catch { sessionMuted = muted; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Match server markup during hydration, then subscribe to the browser preference. */
export function useMutePreference() {
  const muted = useSyncExternalStore(subscribe, getMuted, getServerMuted);
  return [muted, setMuted] as const;
}
