'use client';
import { Camera } from 'lucide-react';
import type { RaceCameraMode } from '@/game/race-camera';
import styles from './RaceCameraButton.module.css';

export default function RaceCameraButton({ mode, onToggle }: { mode: RaceCameraMode; onToggle: () => void }) {
  const next = mode === 'chase' ? 'Scenic' : 'Chase';
  return <button type="button" className={`icon-button ${styles.toggle}`} onClick={event => { event.currentTarget.blur(); onToggle(); }}
    aria-label={`Switch to ${next.toLowerCase()} camera (C)`} aria-pressed={mode === 'scenic'} title={`${next} camera · C`}>
    <Camera size={18}/><span>{mode === 'chase' ? 'Chase' : 'Scenic'}</span>
  </button>;
}
