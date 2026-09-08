import type { CSSProperties } from 'react';
import { ArrowUp, Flag, Landmark, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { FEEDBACK_TIMING, type SoloMoment } from '@/game/solo-presentation';

/* ANIMATION STORYBOARD — time since the race event
 *    0ms  badge enters, 10px → 0px, scale .96 → 1
 *  180ms  hold the message
 *  last 180ms  badge fades out before the next event
 */
const BADGE = { offset: 10, scale: .96 } as const;
const ICONS = { start: Flag, finish: Flag, lap: Flag, sector: Landmark, pass: ArrowUp, land: Sparkles, recover: RotateCcw, ring: Sparkles, boost: Zap };

export default function SoloRaceMoment({ moment, elapsed }: { moment: SoloMoment | null; elapsed: number }) {
  if (!moment) return null;
  const age = elapsed - moment.at;
  const stage = age < FEEDBACK_TIMING.enter ? 1 : age < moment.duration - FEEDBACK_TIMING.exit ? 2 : 3;
  const Icon = ICONS[moment.kind];
  const style = { '--moment-enter': `${FEEDBACK_TIMING.enter}s`, '--moment-exit': `${FEEDBACK_TIMING.exit}s`, '--moment-offset': `${BADGE.offset}px`, '--moment-scale': BADGE.scale } as CSSProperties;
  return <output key={`${moment.kind}-${moment.at}`} className={`solo-race-moment moment-${moment.kind}`} data-stage={stage} style={style} aria-live="polite">
    <Icon size={19} aria-hidden="true"/><span><strong>{moment.title}</strong><span className="moment-detail">{moment.detail}</span></span>
  </output>;
}
