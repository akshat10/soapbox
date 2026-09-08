import assert from 'node:assert/strict';
import { DEFAULT_BUILDS } from './catalogue';
import { DerbyPhysics, HOP_BUFFER_SECONDS, HOP_GRACE_SECONDS, RECOVERY_SECONDS } from './physics';

const STEP = 1 / 120;
function advance(race: DerbyPhysics, seconds: number) {
  for (let frame = 0; frame < Math.round(seconds / STEP); frame++) race.update(STEP);
}
function readyRace() {
  const race = new DerbyPhysics();
  race.reset([DEFAULT_BUILDS[0]]);
  race.start();
  advance(race, 2);
  assert(race.getSnapshots()[0].grounded);
  return race;
}

// Losing contact just before release must preserve the spring the player charged.
const grace = readyRace();
grace.setInput(0, true);
advance(grace, 0.5);
const stored = grace.getSnapshots()[0].charge;
grace.world.bodies.find(body => body.mass > 0)!.position.y += 0.8;
advance(grace, HOP_GRACE_SECONDS / 2);
assert(!grace.getSnapshots()[0].grounded);
assert(Math.abs(grace.getSnapshots()[0].charge - stored) <= 0.02, 'Brief contact loss preserves charge without accumulating air power.');
grace.setInput(0, false);
assert.equal(grace.getSnapshots()[0].jumps, 1, 'A slightly late release must still launch.');
assert((grace.events.find(event => event.type === 'jump')?.value ?? 0) > 0.6, 'Coyote hop must use the stored spring, not a tiny fallback tap.');
grace.setInput(0, true);
advance(grace, 0.25);
grace.setInput(0, false);
assert.equal(grace.getSnapshots()[0].jumps, 1, 'Grace must not create a second midair hop.');
grace.dispose();

const expired = readyRace();
expired.setInput(0, true);
advance(expired, 0.5);
expired.world.bodies.find(body => body.mass > 0)!.position.y += 2;
advance(expired, HOP_GRACE_SECONDS + 0.05);
assert.equal(expired.getSnapshots()[0].charge, 0, 'Air charge expires outside the short grace window.');
expired.setInput(0, false);
advance(expired, HOP_BUFFER_SECONDS + 0.02);
assert.equal(expired.getSnapshots()[0].jumps, 0, 'A release well before landing must expire.');
expired.dispose();

// Measure a real landing, then replay the same trajectory with a thumb release
// eight simulation steps early. The buffered hop must wait for wheel contact.
const trajectory = readyRace();
trajectory.setInput(0, true);
advance(trajectory, 0.3);
trajectory.setInput(0, false);
let landingFrame = 0;
for (let frame = 1; frame < 600; frame++) {
  trajectory.update(STEP);
  if (trajectory.getSnapshots()[0].grounded) { landingFrame = frame; break; }
}
assert(landingFrame > 10, 'Reference hop must have a measurable airborne arc.');
trajectory.dispose();
for (const cancel of ['none', 'focus', 'controller'] as const) {
  const buffered = readyRace();
  buffered.setInput(0, true);
  advance(buffered, 0.3);
  buffered.setInput(0, false);
  advance(buffered, (landingFrame - 8) * STEP);
  assert(!buffered.getSnapshots()[0].grounded);
  buffered.setInput(0, true);
  buffered.setInput(0, false);
  assert.equal(buffered.getSnapshots()[0].jumps, 1, 'Landing buffer must never launch while airborne.');
  if (cancel === 'focus') buffered.clearInputs();
  if (cancel === 'controller') buffered.cancelInput(0);
  advance(buffered, 10 * STEP);
  assert.equal(buffered.getSnapshots()[0].jumps, cancel === 'none' ? 2 : 1, 'Landing tap should fire once at contact unless canceled.');
  buffered.dispose();
}

for (const action of ['held', 'cancel', 'release'] as const) {
  const recovery = readyRace();
  advance(recovery, 10);
  recovery.setInput(0, true);
  advance(recovery, 0.3);
  const beforeCrash = recovery.getSnapshots()[0];
  recovery.world.bodies.find(body => body.mass > 0)!.position.y -= 20;
  recovery.update(STEP);
  assert(recovery.getSnapshots()[0].recovering);
  assert(recovery.getSnapshots()[0].progress < beforeCrash.progress, 'Recovery standings immediately use the setback position.');
  assert.equal(recovery.getSnapshots()[0].charge, 0);
  if (action === 'cancel') recovery.cancelInput(0);
  if (action === 'release') recovery.setInput(0, false);
  advance(recovery, RECOVERY_SECONDS + 0.6);
  const recovered = recovery.getSnapshots()[0];
  assert(!recovered.recovering, 'Pit crew should restore play promptly.');
  assert.equal(recovered.jumps, 0, 'Recovery never launches without release.');
  assert(action === 'held' ? recovered.charge > 0.1 : recovered.charge === 0, 'Held thumb resumes ground charge after recovery; release/cancel remain authoritative.');
  recovery.setInput(0, false);
  assert.equal(recovery.getSnapshots()[0].jumps, action === 'held' ? 1 : 0, 'A thumb held through recovery must remain responsive.');
  if (action !== 'held') {
    recovery.setInput(0, true);
    advance(recovery, 0.2);
    recovery.setInput(0, false);
    assert.equal(recovery.getSnapshots()[0].jumps, 1, 'A fresh gesture must work after canceling or releasing during recovery.');
  }
  recovery.dispose();
}

console.log('Feel checks passed: 120ms takeoff grace, preserved spring charge, no double jump or air charging, landing-release buffer/expiry, focus cancellation, prompt recovery, safe progress, and held-through-recovery controls.');
