import assert from 'node:assert/strict';
import { SnapshotPlayback } from './snapshot-playback';
import type { PartyState } from './party-types';
const build = { bodyId: 'sourdough', wheelId: 'scooter', wheelbase: 'standard' } as const;
function state(elapsed: number, revision: number, changes: Partial<PartyState> = {}): PartyState {
  const pose = { position: { x: 0, y: 1, z: elapsed * 10 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
  return { revision, elapsed, snapshots: [{ ...pose, id: 0, wheels: [pose, pose, pose, pose], speed: 10, progress: 0, grounded: true, recovering: false, finished: false, finishTime: null, charge: 0, jumps: 0, recoveries: 0, flips: 0, maxRoll: 0, blueprint: build }], builds: [build, build], racerIds: [0], stage: 'racing', heat: 1, countdown: 0, paused: false, scores: [0, 0], ready: [true, true], ...changes };
}

for (const [name, Implementation] of [['patched', SnapshotPlayback]] as const) {
  const playback = new Implementation();
  let packet = 0, nextAt = 0, elapsed = 0, previousAt = 0, previousClock = -Infinity, previousPosition = 0;
  let frozenWhileSlow = 0, slowSamples = 0, maximumBackstep = 0;
  for (let now = 0; now < 12_000; now += 1000 / 60) {
    if (now >= nextAt - .001) {
      elapsed += (nextAt - previousAt) / 1000 * (nextAt < 3000 || nextAt >= 9000 ? 1 : .25);
      previousAt = nextAt;
      playback.push(state(elapsed, packet++), nextAt);
      nextAt += nextAt < 3000 || nextAt >= 9000 ? 1000 / 30 : 200;
    }
    const value = playback.sample(now)[0];
    const clock = (playback as unknown as { clock: number }).clock;
    maximumBackstep = Math.max(maximumBackstep, previousPosition - value.position.z);
    if (name === 'patched') assert.ok(clock >= previousClock, 'adaptive slope/horizon must not move playback clock backwards');
    if (now > 6000 && now < 9000) { slowSamples++; if (value.position.z <= previousPosition + 1e-6) frozenWhileSlow++; }
    previousClock = clock;
    previousPosition = value.position.z;
  }
  console.log({ name, scenario: '1x → .25x → 1x simulation rate', frozenWhileSlow, slowSamples, maximumBackstep });
  if (name === 'patched') assert.equal(frozenWhileSlow, 0, 'clock must settle to a changed host rate');
}

const p = new SnapshotPlayback();
p.push(state(0, 0), 0);
p.push(state(.05, 1), 200);
for (let at = 200; at < 10_000; at += 1000 / 60) p.sample(at);
assert.ok(p.sample(10_000)[0].position.z <= .8 + 1e-9, '120 ms wall-time prediction at .25x is at most .03 simulation seconds');
const frozen = p.sample(10_000)[0].position.z;
assert.equal(p.sample(100_000)[0].position.z, frozen, 'prediction cannot continue without fresh data');
p.push(state(.05, 2, { paused: true }), 101_000);
assert.equal(p.sample(102_000)[0].position.z, .5, 'pause snaps authoritatively');
p.push(state(0, 3, { heat: 2, stage: 'garage' }), 103_000);
assert.equal(p.sample(103_000)[0].position.z, 0, 'heat reset discards old timing anchors');
console.log('Rate transition, monotonic clock, rate-scaled prediction horizon, pause and heat checks passed.');
