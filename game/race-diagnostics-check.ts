import assert from 'node:assert/strict';
import { RaceDiagnostics } from './race-diagnostics';
import type { PartyState } from './party-types';
const state = (revision: number, elapsed = revision / 30) => ({ revision, elapsed, stage: 'racing' }) as PartyState;
const off = new RaceDiagnostics();
off.mark('draw', 999, 1000); off.receive(state(10), true, 1000);
assert.deepEqual(off.snapshot(2000).metrics, {}, 'Disabled diagnostics must retain no measurements.');

const d = new RaceDiagnostics(); d.enabled = true;
d.phase('racing', 1, false, true, false, 1000);
d.receive(state(10), true, 1010); d.receive(state(10), false, 1100);
d.receive(state(9), true, 1200); d.receive(state(11), true, 1300);
const received = d.snapshot(1400);
assert.equal(received.metrics.fresh.count, 2);
assert.equal(received.metrics.duplicate.count, 1);
assert.equal(received.metrics.older.count, 1);
assert.equal(received.metrics.freshGap.max, 290, 'Duplicate/old messages must not reset freshness timing.');
assert.equal(received.lastFreshAgeMs, 100);

const rendering = new RaceDiagnostics(); rendering.enabled = true;
rendering.phase('racing', 1, false, true, false, 1000);
for (let n = 0; n < 300; n++) {
  const at = 1000 + n * 1000 / 60;
  rendering.mark('draw', 2, at);
  if (n % 12 === 0) rendering.receive(state(n), true, at);
}
const slowDelivery = rendering.snapshot(6000);
assert.equal(slowDelivery.metrics.draw.hz, 60);
assert.equal(slowDelivery.metrics.fresh.hz, 5);
assert.equal(slowDelivery.metrics.freshGap.p95, 200);
rendering.phase('garage', 2, false, true, false, 6000);
assert.deepEqual(rendering.snapshot(7000).metrics, {}, 'Garage must not display old racing rates.');
rendering.session(); rendering.receive(state(0), false, 7010);
assert.equal(rendering.snapshot(7100).metrics.fresh.count, 1, 'A new room may restart its revision counter.');
rendering.remember(8000); rendering.enabled = false; rendering.session();
assert.deepEqual(rendering.report().history, [], 'A new room must not retain the previous diagnostic history.');
rendering.enabled = true; rendering.receive(state(0), false, 8010);
assert.equal(rendering.snapshot(8100).metrics.fresh.count, 1, 'A session begun before opt-in mounts must reset revisions too.');
console.log('Diagnostics: off by default, fresh/duplicate/old distinction, cadence separation, phase and session resets passed.');
