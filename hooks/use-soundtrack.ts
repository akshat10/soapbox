'use client';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_MUSIC_VOLUME, MusicPlayer, type MusicState } from '@/game/music-player';
import { MUSIC_TRACKS } from '@/game/music-tracks';

const VOLUME_KEY = 'silicon-racer.music-volume.v1';

export function useSoundtrack(muted: boolean, paused: boolean) {
  const player = useRef<MusicPlayer | null>(null);
  const [state, setState] = useState<MusicState>({ index: 0, volume: DEFAULT_MUSIC_VOLUME, status: 'ready' });
  useEffect(() => {
    const music = new MusicPlayer(MUSIC_TRACKS.map(track => track.src), setState);
    player.current = music;
    // Restore before attaching gesture listeners, including an intentionally silent volume.
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved !== null) music.setVolume(Number(saved));
      music.setMuted(localStorage.getItem('silicon-racer.muted.v1') === 'true');
    } catch { /* Storage can be unavailable in private browsing. */ }
    const unlock = (event: Event) => {
      if (event instanceof KeyboardEvent && (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.key === 'Tab' || event.key === 'Escape')) return;
      music.unlock();
    };
    const visibility = () => music.setHidden(document.hidden);
    visibility();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
      music.dispose(); player.current = null;
    };
  }, []);
  useEffect(() => { player.current?.setMuted(muted); }, [muted]);
  useEffect(() => { player.current?.setPaused(paused); }, [paused]);
  return {
    ...state,
    track: MUSIC_TRACKS[state.index],
    setVolume(volume: number) {
      player.current?.setVolume(volume);
      try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Optional preference. */ }
    },
    next() { player.current?.next(); player.current?.unlock(); },
    retry() { player.current?.retry(); },
  };
}
export type Soundtrack = ReturnType<typeof useSoundtrack>;
