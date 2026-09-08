import { courseForSnapshot } from './course';
import { racePlace } from './race';
import { SIGNATURE_JUMPS } from './course-features';
import type { VehicleSnapshot } from './types';

export type SoloSnapshot = VehicleSnapshot & { rings?: number; boosts?: number; onRough?: boolean; circuit?: boolean; lap?: number; laps?: number; lapTime?: number; bestLap?: number | null };
export type SoloMoment = { title: string; detail: string; kind: 'start' | 'sector' | 'pass' | 'land' | 'recover' | 'finish' | 'ring' | 'boost' | 'lap'; at: number; duration: number };
export const FEEDBACK_TIMING = { enter: .18, exit: .18, brief: 1.25, landmark: 1.65, finish: 2.4, passCooldown: 3 } as const;
const HOPS = SIGNATURE_JUMPS.map(jump => ({ distance: jump.release, chargeSeconds: jump.id === 'pier' ? .55 : .65, name: jump.id === 'pier' ? 'Pier' : 'Bridge' }));

/** Keep instructions ahead of the car, using the same timing as a useful hop. */
export function soloDrivingCue(player: SoloSnapshot): { label: string; kind: string } {
  if (player.finished) return { label: 'Across the line', kind: 'finish' };
  if (player.recovering) return { label: 'Getting you back on track', kind: 'recover' };
  const distance = player.pathDistance ?? 0;
  const course = courseForSnapshot(player);
  const speed = Math.max(4, player.speed);
  if (!player.grounded) return { label: 'Find your landing line', kind: 'air' };
  for (const hop of HOPS) {
    const remaining = hop.distance - distance;
    if (remaining < speed * 1.65 && remaining > -speed * .35) {
      if (remaining <= speed * .14) return { label: 'Release now · hop!', kind: 'hop' };
      if (remaining <= speed * hop.chargeSeconds) return { label: 'Hold Space · charge up', kind: 'charge' };
      return { label: `${hop.name} jump ahead`, kind: 'ahead' };
    }
  }
  if (player.charge > .95) return { label: 'Ready · release to hop', kind: 'charge' };
  if (player.onRough) return { label: 'Rough road · small hop', kind: 'rough' };
  if (distance > 412 && !player.circuit) return { label: 'Finish straight · send it', kind: 'finish' };
  const frame = course.frame(distance), ahead = course.lookFrame(distance + Math.max(7, speed * .95));
  const angle = Math.atan2(frame.tangent.z * ahead.tangent.x - frame.tangent.x * ahead.tangent.z,
    frame.tangent.x * ahead.tangent.x + frame.tangent.z * ahead.tangent.z);
  if (Math.abs(angle) > .16) {
    const left = angle > 0;
    return { label: `${Math.abs(angle) > .4 ? 'Tight ' : ''}${left ? 'left' : 'right'} bend ahead`, kind: left ? 'turn-left' : 'turn-right' };
  }
  return { label: distance < 18 ? 'Find your line · let’s race' : 'Keep it rolling', kind: 'cruise' };
}

/** Presentation only. Reads race events without changing the car or scoring. */
export class SoloFeedbackTracker {
  private previous: SoloSnapshot | null = null;
  private previousPlace = 4;
  private previousSector = '';
  private airborneAt = 0;
  private lastPass = -Infinity;
  private lastElapsed = 0;
  private moment: SoloMoment | null = null;

  reset() {
    this.previous = null; this.previousPlace = 4; this.previousSector = '';
    this.airborneAt = 0; this.lastPass = -Infinity; this.lastElapsed = 0; this.moment = null;
  }

  observe(snapshots: VehicleSnapshot[], elapsed: number): SoloMoment | null {
    if (elapsed < this.lastElapsed) this.reset();
    this.lastElapsed = elapsed;
    const player = snapshots.find(snapshot => snapshot.id === 0) as SoloSnapshot | undefined;
    if (!player) return null;
    const previous = this.previous;
    const place = racePlace(player, snapshots);
    const course = courseForSnapshot(player);
    const sector = course.frame(player.pathDistance ?? 0).sector;
    const announce = (kind: SoloMoment['kind'], title: string, detail: string, duration: number = FEEDBACK_TIMING.brief) => {
      this.moment = { kind, title, detail, at: elapsed, duration };
    };
    if (!previous) announce('start', 'GO!', 'Find your line');
    else if (player.finished && !previous.finished) announce('finish', 'Across the line!', `${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'} place · ${player.finishTime?.toFixed(2)}s`, FEEDBACK_TIMING.finish);
    else if ((player.lap ?? 1) > (previous.lap ?? 1)) announce('lap', player.lap === player.laps ? 'Final lap!' : `Lap ${player.lap} / ${player.laps}`, 'Make this one count', FEEDBACK_TIMING.landmark);
    else if (player.recovering && !previous.recovering) announce('recover', 'Quick pit stop', 'Back on the road in a moment');
    else if ((player.rings ?? 0) > (previous.rings ?? 0)) announce('ring', 'Got it!', `${player.rings} ${player.rings === 1 ? 'ring' : 'rings'} collected`);
    else if ((player.boosts ?? 0) > (previous.boosts ?? 0)) announce('boost', 'Here we go!', 'Boost strip');
    else if (!player.recovering && previous.recovering) announce('recover', 'Back in it', 'Keep going — there’s still road ahead');
    else if (!player.finished && !player.recovering && place < this.previousPlace && elapsed - this.lastPass > FEEDBACK_TIMING.passCooldown && elapsed > 3) {
      this.lastPass = elapsed;
      announce('pass', place === 1 ? 'You’re in front!' : `Up to ${place === 2 ? '2nd' : '3rd'}!`, 'Keep that line');
    } else if (player.grounded && !previous.grounded && !player.recovering && player.recoveries === previous.recoveries && elapsed - this.airborneAt > .4) {
      const upright = 1 - 2 * (player.quaternion.x ** 2 + player.quaternion.z ** 2);
      if (upright > .85 && player.speed > 3) announce('land', 'Wheels down', 'Keep it rolling');
    } else if (sector !== this.previousSector && elapsed > 3 && !player.recovering && (!this.moment || elapsed - this.moment.at > FEEDBACK_TIMING.brief)) {
      announce('sector', sector, 'Bay or Bust', FEEDBACK_TIMING.landmark);
    }
    if (player.recovering || previous?.recovering || (previous?.grounded && !player.grounded)) this.airborneAt = elapsed;
    this.previous = player; this.previousPlace = place; this.previousSector = sector;
    if (this.moment && elapsed - this.moment.at >= this.moment.duration) this.moment = null;
    return this.moment;
  }
}
