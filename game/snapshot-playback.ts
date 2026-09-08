import type { PartyState } from './party-types';
import type { PlayerId, Pose, Quat, Vec3, VehicleSnapshot } from './types';

type Frame = { time: number; snapshots: VehicleSnapshot[] };
const MIN_DELAY = .055;
const MAX_DELAY = .25;
const MAX_PREDICTION = .12;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;
const point = (a: Vec3, b: Vec3, amount: number): Vec3 => ({ x: mix(a.x, b.x, amount), y: mix(a.y, b.y, amount), z: mix(a.z, b.z, amount) });
function quaternion(a: Quat, b: Quat, amount: number): Quat {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const x = mix(a.x, b.x * sign, amount), y = mix(a.y, b.y * sign, amount);
  const z = mix(a.z, b.z * sign, amount), w = mix(a.w, b.w * sign, amount);
  const length = Math.hypot(x, y, z, w) || 1;
  return { x: x / length, y: y / length, z: z / length, w: w / length };
}
const pose = (a: Pose, b: Pose, amount: number): Pose => ({ position: point(a.position, b.position, amount), quaternion: quaternion(a.quaternion, b.quaternion, amount) });
function discontinuities(a: Frame, b: Frame): PlayerId[] {
  return b.snapshots.filter(next => {
    const previous = a.snapshots.find(item => item.id === next.id);
    if (!previous || previous.recovering !== next.recovering || previous.recoveries !== next.recoveries) return true;
    const distance = Math.hypot(next.position.x - previous.position.x, next.position.y - previous.position.y, next.position.z - previous.position.z);
    // A long relay interval can legitimately cover more than twelve world units.
    const plausible = Math.max(12, (b.time - a.time) * Math.max(previous.speed, next.speed) * 2 + 3);
    return distance > plausible;
  }).map(next => next.id);
}

/** A simulation-time buffer, independent of React and the network's arrival cadence. */
export class SnapshotPlayback {
  private frames: Frame[] = [];
  private latest: PartyState | null = null;
  private revision = -1;
  private received = 0;
  private lastSample = 0;
  private clock = 0;
  private offset = 0;
  private interval = 1 / 30;
  private jitter = 0;
  private measuredInterval = false;
  private playing = false;
  private poseFloors = new Map<PlayerId, number>();

  /** Extra visual delay; inputs and all non-pose values remain authoritative. */
  get delayMs() { return clamp(this.interval * 1.2 + this.jitter * 2, MIN_DELAY, MAX_DELAY) * 1000; }

  push(state: PartyState, now: number): void {
    if (!Number.isFinite(now) || !Number.isFinite(state.elapsed)) return;
    if (this.latest && (now < this.received || (state.revision === undefined ? this.revision >= 0 : state.revision <= this.revision))) return;
    const previous = this.latest;
    const contextChanged = !previous || previous.heat !== state.heat || previous.stage !== state.stage || previous.paused !== state.paused;
    if (!contextChanged && state.elapsed < previous.elapsed) return;
    const next: Frame = { time: state.elapsed, snapshots: state.snapshots };
    const last = this.frames[this.frames.length - 1];
    const rosterChanged = !!last && (last.snapshots.length !== next.snapshots.length || next.snapshots.some(item => !last.snapshots.some(old => old.id === item.id)));
    const reset = contextChanged || rosterChanged;
    if (state.revision !== undefined) this.revision = state.revision;
    this.latest = state;
    if (!reset && last) {
      // A single racer's recovery must never restart everyone else's playback.
      for (const id of discontinuities(last, next)) this.poseFloors.set(id, next.time);
    }

    if (reset) {
      this.frames = [next];
      this.clock = state.elapsed;
      this.lastSample = now;
      this.offset = state.elapsed - now / 1000;
      this.playing = false;
      this.poseFloors.clear();
      // Preserve learned cadence through heat transitions and recoveries.
    } else if (last && state.elapsed > last.time) {
      const arrivalInterval = (now - this.received) / 1000;
      if (arrivalInterval > 0 && arrivalInterval < 1) {
        if (!this.measuredInterval) { this.interval = arrivalInterval; this.measuredInterval = true; }
        else {
          this.jitter = mix(this.jitter, Math.abs(arrivalInterval - this.interval), .15);
          this.interval = mix(this.interval, arrivalInterval, .15);
        }
      }
      // Filter arrival jitter instead of resetting the render clock for every packet.
      this.offset = mix(this.offset, state.elapsed - now / 1000, .1);
      this.frames.push(next);
      if (!this.playing) {
        this.clock = Math.max(this.clock, state.elapsed - this.delayMs / 1000);
        this.lastSample = now;
        this.playing = true;
      }
      while (this.frames.length > 32 || this.frames.length > 2 && this.frames[1].time < this.clock - .5) this.frames.shift();
    } else if (last) {
      // A paused/duplicate simulation tick can still carry authoritative UI values.
      this.frames[this.frames.length - 1] = next;
    }
    this.received = now;
  }

  sample(now: number): VehicleSnapshot[] {
    const state = this.latest;
    if (!state) return [];
    if (state.paused || state.stage !== 'racing' || !this.playing) return state.snapshots;
    const dt = clamp((now - this.lastSample) / 1000, 0, .1);
    this.lastSample = Math.max(now, this.lastSample);
    const last = this.frames[this.frames.length - 1];
    const target = now / 1000 + this.offset - this.delayMs / 1000;
    // Modest speed correction absorbs changing network delay without backwards motion.
    const rate = clamp(1 + (target - this.clock) * 2, .8, 1.2);
    this.clock = Math.min(last.time + MAX_PREDICTION, this.clock + dt * rate);
    return state.snapshots.map(authoritative => {
      if (authoritative.finished || authoritative.recovering) return authoritative;
      const time = Math.max(this.clock, this.poseFloors.get(authoritative.id) ?? -Infinity);
      let right = this.frames.findIndex(frame => frame.time >= time);
      if (right < 0) right = this.frames.length;
      const before = this.frames[Math.max(0, right - 1)];
      const after = this.frames[Math.min(right, this.frames.length - 1)];
      const a = before.snapshots.find(item => item.id === authoritative.id);
      const b = after.snapshots.find(item => item.id === authoritative.id);
      if (!a || !b) return authoritative;
      if (right < this.frames.length) {
        const amount = after.time === before.time ? 1 : clamp((time - before.time) / (after.time - before.time), 0, 1);
        return { ...authoritative, ...pose(a, b, amount), wheels: b.wheels.map((wheel, index) => a.wheels[index] ? pose(a.wheels[index], wheel, amount) : wheel) };
      }
      const prior = this.frames[this.frames.length - 2];
      const old = prior?.snapshots.find(item => item.id === authoritative.id);
      // Never invent a jump, landing, or recovery while a packet is missing.
      if (!old || !old.grounded || !b.grounded || old.jumps !== b.jumps || prior.time < (this.poseFloors.get(authoritative.id) ?? -Infinity)) return authoritative;
      const span = last.time - prior.time;
      if (span <= 0) return authoritative;
      const ahead = clamp(time - last.time, 0, MAX_PREDICTION);
      const delta = { x: (b.position.x - old.position.x) / span * ahead, y: (b.position.y - old.position.y) / span * ahead, z: (b.position.z - old.position.z) / span * ahead };
      // Keep even malformed/outlying velocity estimates within a short road segment.
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      const scale = distance > 6 ? 6 / distance : 1;
      const translate = (position: Vec3): Vec3 => ({ x: position.x + delta.x * scale, y: position.y + delta.y * scale, z: position.z + delta.z * scale });
      return { ...authoritative, position: translate(b.position), wheels: b.wheels.map(wheel => ({ ...wheel, position: translate(wheel.position) })) };
    });
  }
}
